import type { Intent, TimeRange } from "./intents";
import { inferMainStatusFromText } from "./statusPhrases";
import { inferTimeRangeFromQuestion } from "./resolveIntent";

// 规则快路径 —— 常见问法不调用 LLM，更快更稳。

export interface RuleParseResult {
  intent: Intent;
  confidence: "high" | "medium";
}

const CHANNEL_WORDS = ["抖音", "百度", "公众号", "线下", "快手", "小红书"];

function extractChannel(q: string): string | undefined {
  return CHANNEL_WORDS.find((c) => q.includes(c));
}

function extractTimeRange(q: string): TimeRange | undefined {
  return inferTimeRangeFromQuestion(q);
}

function extractPhone(q: string): string | undefined {
  const m = q.match(/1[3-9]\d{9}/);
  return m?.[0];
}

export function tryRuleParse(question: string): RuleParseResult | null {
  const q = question.trim();
  if (!q) return null;

  if (/^(帮助|能问什么|怎么用|使用说明|help)$/i.test(q) || /可以问什么|支持哪些问题/.test(q)) {
    return { intent: { intent: "HELP" }, confidence: "high" };
  }

  const phone = extractPhone(q);
  if (phone && /(是谁|哪位|查找|哪条|有没有|查询)/.test(q)) {
    return { intent: { intent: "LEAD_LOOKUP", phone }, confidence: "high" };
  }

  if (/超时|48\s*小时/.test(q) && /(多少|几条|几个|数量|数)/.test(q)) {
    return {
      intent: { intent: "METRIC_SINGLE", metric: "overdueCount", filters: { timeRange: extractTimeRange(q) } },
      confidence: "high",
    };
  }

  if (/未分配/.test(q) && /(多少|几条|几个|数量)/.test(q)) {
    return { intent: { intent: "METRIC_SINGLE", metric: "unassignedCount" }, confidence: "high" };
  }

  if (/各状态|状态分布|状态构成|分别有多少/.test(q)) {
    return {
      intent: {
        intent: "STATUS_BREAKDOWN",
        filters: { channel: extractChannel(q), timeRange: extractTimeRange(q) },
      },
      confidence: "medium",
    };
  }

  if (/哪个渠道|哪条渠道|哪种渠道/.test(q) && /(最高|最好|最多|排名|第一)/.test(q)) {
    const tr = extractTimeRange(q);
    if (/加微率/.test(q)) {
      return {
        intent: { intent: "CHANNEL_METRIC_RANK", metric: "wechatRate", timeRange: tr },
        confidence: "high",
      };
    }
    if (/MQL/.test(q) || /营销/.test(q)) {
      return {
        intent: { intent: "CHANNEL_METRIC_RANK", metric: "mqlRate", timeRange: tr },
        confidence: "medium",
      };
    }
    if (/SQL/.test(q) || /转化/.test(q)) {
      return {
        intent: { intent: "CHANNEL_SQL_RATE_RANK", timeRange: tr },
        confidence: "high",
      };
    }
  }

  const channel = extractChannel(q);
  if (channel && /加微率/.test(q)) {
    return {
      intent: {
        intent: "METRIC_SINGLE",
        metric: "wechatRate",
        filters: { channel, timeRange: extractTimeRange(q) },
      },
      confidence: "high",
    };
  }

  if (/MQL/.test(q) && /(多少|几个|几条|数量)/.test(q)) {
    return {
      intent: {
        intent: "METRIC_SINGLE",
        metric: "mqlCount",
        filters: { channel, timeRange: extractTimeRange(q) ?? "this_month" },
      },
      confidence: "medium",
    };
  }

  if (/(列出|有哪些|查询|看看|显示)/.test(q) && /线索/.test(q)) {
    const mainStatus = inferMainStatusFromText(q);
    const overdue = /超时|48\s*小时|未跟进/.test(q);
    return {
      intent: {
        intent: "LEAD_LIST",
        mainStatus,
        channel,
        overdue,
        limit: /前\s*(\d+)/.test(q) ? Math.min(50, parseInt(q.match(/前\s*(\d+)/)![1], 10)) : 20,
      },
      confidence: "medium",
    };
  }

  if (/整体|漏斗|概况|转化情况/.test(q)) {
    return {
      intent: {
        intent: "FUNNEL_OVERALL",
        filters: { channel, timeRange: extractTimeRange(q) },
      },
      confidence: "medium",
    };
  }

  return null;
}
