import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

// 漏斗与转化率口径 —— docs/06。
// 关键：MQL 用 mql_at；SQL 用 sql_at AND sql_revoked_at IS NULL；不用 main_status。

export interface FunnelFilters {
  channel?: string;
  source?: string;
  ownerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

function buildWhere(filters: FunnelFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (filters.channel) where.channel = filters.channel;
  if (filters.source) where.source = filters.source;
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
    if (filters.dateTo) where.createdAt.lte = filters.dateTo;
  }
  return where;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // 一位小数百分比
}

export interface FunnelResult {
  counts: {
    total: number; // A
    called: number; // B
    valid: number; // C
    wechatAdded: number; // D
    mql: number; // E
    sql: number; // F
  };
  rates: {
    calledRate: number | null; // B/A
    validRate: number | null; // C/B
    wechatRate: number | null; // D/C
    mqlRate: number | null; // E/D
    sqlRate: number | null; // F/E
    overallSqlRate: number | null; // F/A
  };
  avgResponseHours: number | null;
  exceptions: {
    overdue: number; // G
    unassigned: number; // H
  };
  formulas: Record<string, string>;
}

export async function computeFunnel(
  filters: FunnelFilters = {}
): Promise<FunnelResult> {
  const where = buildWhere(filters);

  const [total, called, valid, wechatAdded, mql, sql] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.count({ where: { ...where, callRecords: { some: {} } } }),
    prisma.lead.count({
      where: {
        ...where,
        OR: [
          {
            mainStatus: {
              in: ["VALID", "TO_ADD_WECHAT", "WECHAT_ADDED", "FOLLOWING", "MQL", "SQL"],
            },
          },
          { callRecords: { some: { connected: true } } },
        ],
      },
    }),
    prisma.lead.count({ where: { ...where, wechatStatus: "ADDED" } }),
    prisma.lead.count({ where: { ...where, mqlAt: { not: null } } }),
    prisma.lead.count({
      where: { ...where, sqlAt: { not: null }, sqlRevokedAt: null },
    }),
  ]);

  // 平均响应时长：first_follow_up_at - assigned_at（小时）
  const responded = await prisma.lead.findMany({
    where: {
      ...where,
      assignedAt: { not: null },
      firstFollowUpAt: { not: null },
    },
    select: { assignedAt: true, firstFollowUpAt: true },
  });
  let avgResponseHours: number | null = null;
  if (responded.length > 0) {
    const totalHours = responded.reduce((acc, r) => {
      const diff =
        new Date(r.firstFollowUpAt!).getTime() - new Date(r.assignedAt!).getTime();
      return acc + diff / (60 * 60 * 1000);
    }, 0);
    avgResponseHours = Math.round((totalHours / responded.length) * 10) / 10;
  }

  const [overdue, unassigned] = await Promise.all([
    prisma.task.count({ where: { taskType: "OVERDUE_FOLLOW_UP", status: "OPEN" } }),
    prisma.task.count({ where: { taskType: "UNASSIGNED", status: "OPEN" } }),
  ]);

  return {
    counts: { total, called, valid, wechatAdded, mql, sql },
    rates: {
      calledRate: rate(called, total),
      validRate: rate(valid, called),
      wechatRate: rate(wechatAdded, valid),
      mqlRate: rate(mql, wechatAdded),
      sqlRate: rate(sql, mql),
      overallSqlRate: rate(sql, total),
    },
    avgResponseHours,
    exceptions: { overdue, unassigned },
    formulas: {
      calledRate: "外呼覆盖率 = 至少外呼过一次的线索数 ÷ 总线索数",
      validRate: "有效率 = 有效线索数 ÷ 已外呼线索数",
      wechatRate: "加微率 = 已加微线索数 ÷ 有效线索数",
      mqlRate: "MQL 转化率 = 曾标记 MQL 的线索数（mql_at 有值）÷ 已加微线索数",
      sqlRate: "SQL 转化率 = 有效 SQL 数（sql_at 有值且未撤销）÷ MQL 数",
      overallSqlRate: "整体 SQL 转化率 = 有效 SQL 数 ÷ 总线索数",
    },
  };
}

export interface ChannelFunnelRow {
  channel: string;
  totalLeads: number;
  valid: number;
  wechatAdded: number;
  mqlCount: number;
  sqlCount: number;
  overallSqlRate: number | null;
  wechatRate: number | null;
  mqlRate: number | null;
  mqlToSqlRate: number | null;
  validRate: number | null;
}

export async function computeFunnelByChannel(
  filters: Omit<FunnelFilters, "channel"> = {}
): Promise<ChannelFunnelRow[]> {
  const base = buildWhere(filters);
  const channels = await prisma.lead.findMany({
    where: base,
    select: { channel: true },
    distinct: ["channel"],
  });

  const rows = await Promise.all(
    channels.map(async ({ channel }) => {
      const chWhere = { ...base, channel };
      const [totalLeads, valid, wechatAdded, mqlCount, sqlCount, called] = await Promise.all([
        prisma.lead.count({ where: chWhere }),
        prisma.lead.count({
          where: {
            ...chWhere,
            OR: [
              {
                mainStatus: {
                  in: ["VALID", "TO_ADD_WECHAT", "WECHAT_ADDED", "FOLLOWING", "MQL", "SQL"],
                },
              },
              { callRecords: { some: { connected: true } } },
            ],
          },
        }),
        prisma.lead.count({ where: { ...chWhere, wechatStatus: "ADDED" } }),
        prisma.lead.count({ where: { ...chWhere, mqlAt: { not: null } } }),
        prisma.lead.count({
          where: { ...chWhere, sqlAt: { not: null }, sqlRevokedAt: null },
        }),
        prisma.lead.count({ where: { ...chWhere, callRecords: { some: {} } } }),
      ]);
      return {
        channel,
        totalLeads,
        valid,
        wechatAdded,
        mqlCount,
        sqlCount,
        called,
        overallSqlRate: rate(sqlCount, totalLeads),
        wechatRate: rate(wechatAdded, valid),
        mqlRate: rate(mqlCount, wechatAdded),
        mqlToSqlRate: rate(sqlCount, mqlCount),
        validRate: rate(valid, called),
      };
    })
  );

  return rows
    .map(({ called, ...row }) => row)
    .sort((a, b) => (b.overallSqlRate ?? -1) - (a.overallSqlRate ?? -1));
}
