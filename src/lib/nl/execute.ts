import { prisma } from "../prisma";
import { computeFunnel, computeFunnelByChannel, type ChannelFunnelRow } from "../metrics";
import { queryLeads, buildLeadWhere } from "../leadQuery";
import { maskPhone } from "../format";
import { MAIN_STATUS_LABEL } from "../enums";
import { evaluateOverdue, OVERDUE_SCOPE } from "../overdueRules";
import {
  resolveTimeRange,
  type Intent,
  type NlFilters,
  type SingleMetric,
  type ChannelRankMetric,
  EXAMPLE_QUESTIONS,
} from "./intents";
import { SINGLE_METRIC_LABELS, RATE_METRICS, CHANNEL_RANK_METRIC_LABELS } from "./labels";

// 意图分发 —— 只调用白名单化的 metrics/leadQuery/参数化 Prisma 查询。
// 产出：answer(自然语言) + data(结构化) + intent(回显) + formula(可选)。

export interface ExecuteResult {
  answer: string;
  data: unknown;
  intent: Intent;
  formula?: string;
  notes?: string[];
}

function toFunnelFilters(filters: NlFilters | undefined) {
  const tr = resolveTimeRange(filters?.timeRange);
  return {
    filters: {
      channel: filters?.channel,
      source: filters?.source,
      ownerId: filters?.ownerId,
      dateFrom: tr.dateFrom,
      dateTo: tr.dateTo,
    },
    timeLabel: tr.label,
  };
}

function fmtMetricValue(metric: SingleMetric, value: number | null): string {
  if (value === null) return "无数据";
  if (RATE_METRICS.includes(metric)) return `${value}%`;
  if (metric === "avgResponseHours") return `${value} 小时`;
  return String(value);
}

function sortChannelsByMetric(rows: ChannelFunnelRow[], metric: ChannelRankMetric): ChannelFunnelRow[] {
  return [...rows].sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1));
}

export async function executeIntent(intent: Intent): Promise<ExecuteResult> {
  switch (intent.intent) {
    case "FUNNEL_OVERALL": {
      const { filters, timeLabel } = toFunnelFilters(intent.filters);
      const funnel = await computeFunnel(filters);
      const seg: string[] = [];
      if (intent.filters?.channel) seg.push(`渠道=${intent.filters.channel}`);
      if (intent.filters?.source) seg.push(`来源=${intent.filters.source}`);
      const scope = seg.length ? `（${seg.join("，")}）` : "";
      return {
        intent,
        data: funnel,
        answer: `${timeLabel}${scope}漏斗：总线索 ${funnel.counts.total}，有效 ${funnel.counts.valid}，已加微 ${funnel.counts.wechatAdded}，MQL ${funnel.counts.mql}，SQL ${funnel.counts.sql}；总体 SQL 转化率 ${
          funnel.rates.overallSqlRate ?? "无数据"
        }%。`,
        formula: funnel.formulas.overallSqlRate,
      };
    }

    case "CHANNEL_SQL_RATE_RANK": {
      const tr = resolveTimeRange(intent.timeRange);
      const rows = await computeFunnelByChannel({ dateFrom: tr.dateFrom, dateTo: tr.dateTo });
      if (rows.length === 0) {
        return { intent, data: [], answer: `${tr.label}没有可统计的渠道数据。` };
      }
      const top = rows[0];
      return {
        intent,
        data: rows,
        answer: `${tr.label} SQL 转化率最高的渠道是「${top.channel}」，转化率 ${
          top.overallSqlRate ?? "无数据"
        }%（有效 SQL ${top.sqlCount} ÷ 总线索 ${top.totalLeads}）。`,
        formula: `渠道整体 SQL 转化率 = 该渠道有效 SQL 数 ÷ 该渠道总线索数`,
      };
    }

    case "CHANNEL_METRIC_RANK": {
      const tr = resolveTimeRange(intent.timeRange);
      const metric = intent.metric;
      const label = CHANNEL_RANK_METRIC_LABELS[metric];
      const rows = sortChannelsByMetric(
        await computeFunnelByChannel({ dateFrom: tr.dateFrom, dateTo: tr.dateTo }),
        metric
      );
      if (rows.length === 0) {
        return { intent, data: [], answer: `${tr.label}没有可统计的渠道数据。` };
      }
      const top = rows[0];
      const value = top[metric];
      return {
        intent,
        data: rows,
        answer: `${tr.label}${label}最高的渠道是「${top.channel}」，${label} ${
          value ?? "无数据"
        }%。`,
        formula: `渠道${label} = 按漏斗口径在该渠道内计算`,
      };
    }

    case "METRIC_SINGLE": {
      const { filters, timeLabel } = toFunnelFilters(intent.filters);
      const funnel = await computeFunnel(filters);
      const metric = intent.metric;
      const valueMap: Record<SingleMetric, number | null> = {
        total: funnel.counts.total,
        called: funnel.counts.called,
        valid: funnel.counts.valid,
        wechatAdded: funnel.counts.wechatAdded,
        mqlCount: funnel.counts.mql,
        sqlCount: funnel.counts.sql,
        calledRate: funnel.rates.calledRate,
        validRate: funnel.rates.validRate,
        wechatRate: funnel.rates.wechatRate,
        mqlRate: funnel.rates.mqlRate,
        sqlRate: funnel.rates.sqlRate,
        overallSqlRate: funnel.rates.overallSqlRate,
        avgResponseHours: funnel.avgResponseHours,
        overdueCount: funnel.exceptions.overdue,
        unassignedCount: funnel.exceptions.unassigned,
      };
      const value = valueMap[metric];
      const label = SINGLE_METRIC_LABELS[metric];
      const seg: string[] = [];
      if (intent.filters?.channel) seg.push(`渠道=${intent.filters.channel}`);
      if (intent.filters?.source) seg.push(`来源=${intent.filters.source}`);
      const scope = seg.length ? `（${seg.join("，")}）` : "";
      const notes: string[] = [];
      if (
        (metric === "overdueCount" || metric === "unassignedCount") &&
        (intent.filters?.channel || intent.filters?.source)
      ) {
        notes.push("异常计数为全局口径，暂不按渠道/来源细分。");
      }
      return {
        intent,
        data: { metric, label, value },
        answer: `${timeLabel}${scope}${label}：${fmtMetricValue(metric, value)}。`,
        formula: funnel.formulas[metric],
        notes: notes.length ? notes : undefined,
      };
    }

    case "LEAD_LIST": {
      const limit = intent.limit ?? 20;
      const notes: string[] = [];

      if (intent.overdue) {
        const where = buildLeadWhere({
          mainStatus: intent.mainStatus,
          channel: intent.channel,
          source: intent.source,
          ownerId: intent.ownerId,
        });
        where.mainStatus = intent.mainStatus
          ? intent.mainStatus
          : { in: OVERDUE_SCOPE };

        const candidates = await prisma.lead.findMany({
          where,
          include: { owner: { select: { id: true, name: true } } },
          orderBy: { assignedAt: "asc" },
          take: 200,
        });
        const now = new Date();
        const overdueLeads = candidates.filter((l) => evaluateOverdue(l, now).isOverdue);
        const items = overdueLeads.slice(0, limit);
        notes.push("已按「48 小时超时未跟进」实时规则过滤。");

        const segs: string[] = ["超时未跟进"];
        if (intent.mainStatus) segs.push(MAIN_STATUS_LABEL[intent.mainStatus] ?? intent.mainStatus);
        if (intent.channel) segs.push(`渠道 ${intent.channel}`);
        if (intent.source) segs.push(`来源 ${intent.source}`);

        return {
          intent,
          data: {
            total: overdueLeads.length,
            items: items.map((l) => ({
              id: l.id,
              name: l.name,
              phone: maskPhone(l.phone),
              mainStatus: l.mainStatus,
              channel: l.channel,
              source: l.source,
              owner: l.owner?.name ?? null,
            })),
          },
          answer: `符合条件（${segs.join(" / ")}）的线索共 ${overdueLeads.length} 条${
            items.length ? "，已列出前若干条。" : "。"
          }`,
          notes,
        };
      }

      const result = await queryLeads({
        mainStatus: intent.mainStatus,
        channel: intent.channel,
        source: intent.source,
        ownerId: intent.ownerId,
        pageSize: limit,
      });
      const segs: string[] = [];
      if (intent.mainStatus) segs.push(MAIN_STATUS_LABEL[intent.mainStatus] ?? intent.mainStatus);
      if (intent.channel) segs.push(`渠道 ${intent.channel}`);
      if (intent.source) segs.push(`来源 ${intent.source}`);
      const scope = segs.length ? segs.join(" / ") : "全部";
      return {
        intent,
        data: {
          total: result.total,
          items: result.items.map((l) => ({
            id: l.id,
            name: l.name,
            phone: maskPhone(l.phone),
            mainStatus: l.mainStatus,
            channel: l.channel,
            source: l.source,
            owner: (l as { owner?: { name: string } | null }).owner?.name ?? null,
          })),
        },
        answer: `符合条件（${scope}）的线索共 ${result.total} 条${
          result.items.length ? "，已列出前若干条。" : "。"
        }`,
        notes: notes.length ? notes : undefined,
      };
    }

    case "LEAD_LOOKUP": {
      if (!intent.phone && !intent.name) {
        return { intent, data: null, answer: "请提供手机号或姓名以查找线索。" };
      }
      const lead = await prisma.lead.findFirst({
        where: intent.phone
          ? { phone: { contains: intent.phone } }
          : { name: { contains: intent.name } },
        include: { owner: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      if (!lead) {
        return { intent, data: null, answer: "未找到匹配的线索。" };
      }
      return {
        intent,
        data: {
          id: lead.id,
          name: lead.name,
          phone: maskPhone(lead.phone),
          mainStatus: lead.mainStatus,
          channel: lead.channel,
          source: lead.source,
          owner: lead.owner?.name ?? null,
        },
        answer: `找到线索：${lead.name ?? "未命名"}（${maskPhone(lead.phone)}），当前状态「${
          MAIN_STATUS_LABEL[lead.mainStatus] ?? lead.mainStatus
        }」，渠道 ${lead.channel}，负责人 ${lead.owner?.name ?? "未分配"}。`,
      };
    }

    case "STATUS_BREAKDOWN": {
      const { filters, timeLabel } = toFunnelFilters(intent.filters);
      const where = buildLeadWhere({
        channel: filters.channel,
        source: filters.source,
        ownerId: filters.ownerId,
      });
      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }
      const groups = await prisma.lead.groupBy({
        by: ["mainStatus"],
        where,
        _count: { _all: true },
        orderBy: { _count: { mainStatus: "desc" } },
      });
      const rows = groups.map((g) => ({
        mainStatus: g.mainStatus,
        label: MAIN_STATUS_LABEL[g.mainStatus] ?? g.mainStatus,
        count: g._count._all,
      }));
      const total = rows.reduce((s, r) => s + r.count, 0);
      const seg: string[] = [];
      if (intent.filters?.channel) seg.push(`渠道=${intent.filters.channel}`);
      if (intent.filters?.source) seg.push(`来源=${intent.filters.source}`);
      const scope = seg.length ? `（${seg.join("，")}）` : "";
      const top = rows[0];
      return {
        intent,
        data: { total, rows },
        answer: top
          ? `${timeLabel}${scope}共 ${total} 条线索；最多的是「${top.label}」${top.count} 条。`
          : `${timeLabel}${scope}暂无线索数据。`,
      };
    }

    case "HELP":
      return {
        intent,
        data: { examples: EXAMPLE_QUESTIONS },
        answer: `我可以帮你查漏斗指标、渠道排名、线索列表与单条查找。试试：${EXAMPLE_QUESTIONS.slice(0, 3).join("；")}。`,
      };

    case "UNSUPPORTED":
    default: {
      return {
        intent,
        data: null,
        answer: `暂时无法理解这个问题。你可以试试：${EXAMPLE_QUESTIONS.slice(0, 4).join("；")}。`,
      };
    }
  }
}
