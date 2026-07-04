import { z } from "zod";
import { MAIN_STATUS_VALUES } from "../enums";

// NL 查询意图注册表（白名单）—— DeepSeek 只能输出以下结构之一。
// 服务端用本 schema 严格校验 LLM 输出，再分发到白名单函数，绝不生成/执行任意 SQL。

// 相对时间枚举：LLM 只输出枚举，具体日期由服务端 resolveTimeRange 换算。
export const TIME_RANGE_VALUES = [
  "today",
  "this_week",
  "last_7_days",
  "this_month",
  "all",
] as const;
export type TimeRange = (typeof TIME_RANGE_VALUES)[number];

// 单一指标枚举
export const SINGLE_METRIC_VALUES = [
  "total",
  "called",
  "valid",
  "wechatAdded",
  "mqlCount",
  "sqlCount",
  "calledRate",
  "validRate",
  "wechatRate",
  "mqlRate",
  "sqlRate",
  "overallSqlRate",
  "avgResponseHours",
  "overdueCount",
  "unassignedCount",
] as const;
export type SingleMetric = (typeof SINGLE_METRIC_VALUES)[number];

// 渠道排名可用指标
export const CHANNEL_RANK_METRIC_VALUES = [
  "overallSqlRate",
  "wechatRate",
  "mqlRate",
  "mqlToSqlRate",
  "validRate",
] as const;
export type ChannelRankMetric = (typeof CHANNEL_RANK_METRIC_VALUES)[number];

const filtersSchema = z
  .object({
    channel: z.string().min(1).max(50).optional(),
    source: z.string().min(1).max(50).optional(),
    ownerId: z.string().min(1).max(50).optional(),
    ownerName: z.string().min(1).max(50).optional(),
    timeRange: z.enum(TIME_RANGE_VALUES).optional(),
  })
  .strict();

export type NlFilters = z.infer<typeof filtersSchema>;

export const intentSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("FUNNEL_OVERALL"),
    filters: filtersSchema.optional(),
  }),
  z.object({
    intent: z.literal("CHANNEL_SQL_RATE_RANK"),
    timeRange: z.enum(TIME_RANGE_VALUES).optional(),
  }),
  z.object({
    intent: z.literal("CHANNEL_METRIC_RANK"),
    metric: z.enum(CHANNEL_RANK_METRIC_VALUES),
    timeRange: z.enum(TIME_RANGE_VALUES).optional(),
  }),
  z.object({
    intent: z.literal("STATUS_BREAKDOWN"),
    filters: filtersSchema.optional(),
  }),
  z.object({
    intent: z.literal("HELP"),
  }),
  z.object({
    intent: z.literal("METRIC_SINGLE"),
    metric: z.enum(SINGLE_METRIC_VALUES),
    filters: filtersSchema.optional(),
  }),
  z.object({
    intent: z.literal("LEAD_LIST"),
    mainStatus: z.enum(MAIN_STATUS_VALUES).optional(),
    channel: z.string().min(1).max(50).optional(),
    source: z.string().min(1).max(50).optional(),
    ownerId: z.string().min(1).max(50).optional(),
    overdue: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  z.object({
    intent: z.literal("LEAD_LOOKUP"),
    phone: z.string().min(1).max(20).optional(),
    name: z.string().min(1).max(50).optional(),
  }),
  z.object({
    intent: z.literal("UNSUPPORTED"),
    reason: z.string().max(200).optional(),
  }),
]);

export type Intent = z.infer<typeof intentSchema>;
export type IntentName = Intent["intent"];

export interface ResolvedTimeRange {
  dateFrom?: Date;
  dateTo?: Date;
  label: string;
}

// 相对时间 -> 具体区间（不信任 LLM 做日期运算）。周一为一周起点。
export function resolveTimeRange(
  range: TimeRange | undefined,
  now: Date = new Date()
): ResolvedTimeRange {
  if (!range || range === "all") return { label: "全部时间" };

  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  switch (range) {
    case "today": {
      return { dateFrom: startOfDay(now), dateTo: now, label: "今天" };
    }
    case "this_week": {
      const day = now.getDay(); // 0=周日
      const diffToMonday = (day + 6) % 7;
      const monday = startOfDay(now);
      monday.setDate(monday.getDate() - diffToMonday);
      return { dateFrom: monday, dateTo: now, label: "本周" };
    }
    case "last_7_days": {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 6);
      return { dateFrom: from, dateTo: now, label: "近 7 天" };
    }
    case "this_month": {
      const from = startOfDay(now);
      from.setDate(1);
      return { dateFrom: from, dateTo: now, label: "本月" };
    }
    default:
      return { label: "全部时间" };
  }
}

export const INTENT_NAMES: IntentName[] = [
  "FUNNEL_OVERALL",
  "CHANNEL_SQL_RATE_RANK",
  "CHANNEL_METRIC_RANK",
  "METRIC_SINGLE",
  "LEAD_LIST",
  "LEAD_LOOKUP",
  "STATUS_BREAKDOWN",
  "HELP",
  "UNSUPPORTED",
];

export const EXAMPLE_QUESTIONS = [
  "本周哪个渠道 SQL 转化率最高",
  "哪个渠道加微率最好",
  "抖音渠道的加微率是多少",
  "现在有多少超时未跟进的线索",
  "列出抖音所有跟进中的线索",
  "各状态线索分别有多少",
  "本月新增了多少 MQL",
  "李销售负责多少条 MQL 线索",
];
