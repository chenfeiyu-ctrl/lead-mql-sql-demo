import type { Intent, NlFilters, TimeRange } from "./intents";
import type { NlCatalog } from "./catalog";
import { matchCatalogValue, matchOwner } from "./catalog";
import { inferMainStatusFromText } from "./statusPhrases";
import { MAIN_STATUS_VALUES } from "../enums";
import type { MainStatus } from "../types";

export interface ResolveResult {
  intent: Intent;
  notes: string[];
}

type FiltersWithOwnerName = NlFilters & { ownerName?: string };

function resolveFilters(
  filters: FiltersWithOwnerName | undefined,
  catalog: NlCatalog,
  notes: string[]
): NlFilters | undefined {
  if (!filters) return undefined;
  const next: FiltersWithOwnerName = { ...filters };

  if (next.channel) {
    const matched = matchCatalogValue(next.channel, catalog.channels);
    if (matched && matched !== next.channel) {
      notes.push(`渠道「${next.channel}」已匹配为「${matched}」。`);
      next.channel = matched;
    } else if (!matched && catalog.channels.length > 0) {
      notes.push(`未识别渠道「${next.channel}」，已忽略该筛选。`);
      delete next.channel;
    }
  }

  if (next.source) {
    const matched = matchCatalogValue(next.source, catalog.sources);
    if (matched && matched !== next.source) {
      notes.push(`来源「${next.source}」已匹配为「${matched}」。`);
      next.source = matched;
    } else if (!matched && catalog.sources.length > 0) {
      notes.push(`未识别来源「${next.source}」，已忽略该筛选。`);
      delete next.source;
    }
  }

  const ownerKey = next.ownerName ?? next.ownerId;
  if (ownerKey && !next.ownerId?.startsWith("cm")) {
    const owner = matchOwner(ownerKey, catalog.owners);
    if (owner) {
      if (owner.id !== next.ownerId) {
        notes.push(`负责人「${ownerKey}」已匹配为「${owner.name}」。`);
      }
      next.ownerId = owner.id;
    } else {
      notes.push(`未找到负责人「${ownerKey}」，已忽略该筛选。`);
      delete next.ownerId;
    }
  }
  delete next.ownerName;

  return next;
}

/** 服务端二次解析：词表对齐、负责人/渠道纠错（仍不执行任意 SQL） */
export function resolveIntent(intent: Intent, catalog: NlCatalog, question?: string): ResolveResult {
  const notes: string[] = [];
  const q = question ?? "";

  switch (intent.intent) {
    case "FUNNEL_OVERALL":
      return {
        intent: { ...intent, filters: resolveFilters(intent.filters, catalog, notes) },
        notes,
      };

    case "METRIC_SINGLE":
      return {
        intent: { ...intent, filters: resolveFilters(intent.filters, catalog, notes) },
        notes,
      };

    case "CHANNEL_SQL_RATE_RANK":
    case "CHANNEL_METRIC_RANK":
      return { intent, notes };

    case "LEAD_LIST": {
      let mainStatus = intent.mainStatus;
      if (!mainStatus && q) {
        const inferred = inferMainStatusFromText(q);
        if (inferred) {
          mainStatus = inferred;
          notes.push(`已从问题中识别状态「${inferred}」。`);
        }
      }

      let channel: string | undefined = intent.channel;
      if (intent.channel) {
        const matched = matchCatalogValue(intent.channel, catalog.channels);
        if (matched) {
          if (matched !== intent.channel) notes.push(`渠道「${intent.channel}」已匹配为「${matched}」。`);
          channel = matched;
        } else if (catalog.channels.length > 0) {
          notes.push(`未识别渠道「${intent.channel}」，已忽略渠道筛选。`);
          channel = undefined;
        }
      }

      let source: string | undefined = intent.source;
      if (intent.source) {
        const matched = matchCatalogValue(intent.source, catalog.sources);
        if (matched) {
          if (matched !== intent.source) notes.push(`来源「${intent.source}」已匹配为「${matched}」。`);
          source = matched;
        } else if (catalog.sources.length > 0) {
          notes.push(`未识别来源「${intent.source}」，已忽略来源筛选。`);
          source = undefined;
        }
      }

      let ownerId = intent.ownerId;
      if (intent.ownerId) {
        const owner = matchOwner(intent.ownerId, catalog.owners);
        if (owner) {
          if (owner.id !== intent.ownerId && owner.name !== intent.ownerId) {
            notes.push(`负责人「${intent.ownerId}」已匹配为「${owner.name}」。`);
          }
          ownerId = owner.id;
        } else {
          notes.push(`未找到负责人「${intent.ownerId}」，已忽略负责人筛选。`);
          ownerId = undefined;
        }
      }

      const overdue =
        intent.overdue ||
        /超时|48\s*小时|未跟进/.test(q) ||
        (/异常/.test(q) && /跟进/.test(q));

      return {
        intent: { ...intent, mainStatus, channel, source, ownerId, overdue },
        notes,
      };
    }

    case "LEAD_LOOKUP":
      return { intent, notes };

    case "STATUS_BREAKDOWN":
      return {
        intent: { ...intent, filters: resolveFilters(intent.filters, catalog, notes) },
        notes,
      };

    case "HELP":
    case "UNSUPPORTED":
      return { intent, notes };
  }
}

export function inferTimeRangeFromQuestion(q: string): TimeRange | undefined {
  if (/今天|今日/.test(q)) return "today";
  if (/本周|这周/.test(q)) return "this_week";
  if (/近\s*7\s*天|最近\s*7\s*天|过去\s*7\s*天/.test(q)) return "last_7_days";
  if (/本月|这个月/.test(q)) return "this_month";
  return undefined;
}

/** 若 LLM 未填 timeRange，从原问题补全 */
export function enrichTimeRange(intent: Intent, question: string): Intent {
  const tr = inferTimeRangeFromQuestion(question);
  if (!tr) return intent;

  switch (intent.intent) {
    case "FUNNEL_OVERALL":
      if (!intent.filters?.timeRange) {
        return { ...intent, filters: { ...intent.filters, timeRange: tr } };
      }
      break;
    case "METRIC_SINGLE":
      if (!intent.filters?.timeRange) {
        return { ...intent, filters: { ...intent.filters, timeRange: tr } };
      }
      break;
    case "CHANNEL_SQL_RATE_RANK":
    case "CHANNEL_METRIC_RANK":
      if (!intent.timeRange) return { ...intent, timeRange: tr };
      break;
    case "STATUS_BREAKDOWN":
      if (!intent.filters?.timeRange) {
        return { ...intent, filters: { ...intent.filters, timeRange: tr } };
      }
      break;
  }
  return intent;
}

export function isValidMainStatus(s: string): s is MainStatus {
  return (MAIN_STATUS_VALUES as readonly string[]).includes(s);
}
