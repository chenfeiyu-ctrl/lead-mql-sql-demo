import { prisma } from "../prisma";

// NL 查询动态词表 —— 从 DB 加载渠道/来源/负责人，供提示词注入与实体解析。

export interface NlCatalog {
  channels: string[];
  sources: string[];
  owners: { id: string; name: string }[];
}

export async function getNlCatalog(): Promise<NlCatalog> {
  const [channelRows, sourceRows, owners] = await Promise.all([
    prisma.lead.findMany({ select: { channel: true }, distinct: ["channel"], orderBy: { channel: "asc" } }),
    prisma.lead.findMany({ select: { source: true }, distinct: ["source"], orderBy: { source: "asc" } }),
    prisma.salesUser.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    channels: channelRows.map((r) => r.channel),
    sources: sourceRows.map((r) => r.source),
    owners,
  };
}

/** 模糊匹配词表项（LLM 可能输出简称/错字） */
export function matchCatalogValue(input: string | undefined, options: string[]): string | null {
  if (!input?.trim()) return null;
  const raw = input.trim();
  if (options.includes(raw)) return raw;
  const lower = raw.toLowerCase();
  const exactCi = options.find((o) => o.toLowerCase() === lower);
  if (exactCi) return exactCi;
  const contained = options.find((o) => o.includes(raw) || raw.includes(o));
  return contained ?? null;
}

export function matchOwner(
  nameOrId: string | undefined,
  owners: NlCatalog["owners"]
): { id: string; name: string } | null {
  if (!nameOrId?.trim()) return null;
  const raw = nameOrId.trim();
  const byId = owners.find((o) => o.id === raw);
  if (byId) return byId;
  const byName = owners.find((o) => o.name === raw);
  if (byName) return byName;
  const fuzzy = owners.find((o) => o.name.includes(raw) || raw.includes(o.name));
  return fuzzy ?? null;
}
