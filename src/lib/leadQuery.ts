import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

// 线索列表查询 —— 供 GET /api/leads 与 NL 查询复用（参数化，无任意 SQL）。

export interface LeadQueryFilters {
  mainStatus?: string;
  channel?: string;
  source?: string;
  ownerId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface LeadQueryResult {
  total: number;
  page: number;
  pageSize: number;
  items: Awaited<ReturnType<typeof prisma.lead.findMany>>;
}

export function buildLeadWhere(filters: LeadQueryFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (filters.mainStatus) where.mainStatus = filters.mainStatus;
  if (filters.channel) where.channel = filters.channel;
  if (filters.source) where.source = filters.source;
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.q) {
    where.OR = [{ name: { contains: filters.q } }, { phone: { contains: filters.q } }];
  }
  return where;
}

export async function queryLeads(filters: LeadQueryFilters): Promise<LeadQueryResult> {
  const rawPage = filters.page ?? 1;
  const rawPageSize = filters.pageSize ?? 20;
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(100, Math.max(1, Math.floor(rawPageSize)))
    : 20;
  const where = buildLeadWhere(filters);

  const [total, items] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        statusLogs: {
          // 多取几条，在内存中筛出最近一次「真实状态流转」（排除历史分配等非流转日志）
          orderBy: { createdAt: "desc" },
          take: 15,
          select: { createdAt: true, fromStatus: true, toStatus: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const normalizedItems = items.map((item) => {
    const lastTransition = item.statusLogs.find((log) => log.fromStatus !== log.toStatus);
    return { ...item, statusLogs: lastTransition ? [lastTransition] : [] };
  });

  return { total, page, pageSize, items: normalizedItems };
}
