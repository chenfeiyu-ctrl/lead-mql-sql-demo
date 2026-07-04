import type { SingleMetric, ChannelRankMetric } from "./intents";

export { MAIN_STATUS_VALUES } from "../enums";

// 单一指标的中文标签（提示词说明 + 前端回显）
export const SINGLE_METRIC_LABELS: Record<SingleMetric, string> = {
  total: "总线索数",
  called: "已外呼数",
  valid: "有效线索数",
  wechatAdded: "已加微数",
  mqlCount: "MQL 数",
  sqlCount: "SQL 数",
  calledRate: "外呼率",
  validRate: "有效率",
  wechatRate: "加微率",
  mqlRate: "MQL 率",
  sqlRate: "SQL 率",
  overallSqlRate: "总体 SQL 转化率",
  avgResponseHours: "平均响应时长(小时)",
  overdueCount: "超时未跟进数",
  unassignedCount: "未分配数",
};

// 比率类指标（渲染为百分比）
export const RATE_METRICS: SingleMetric[] = [
  "calledRate",
  "validRate",
  "wechatRate",
  "mqlRate",
  "sqlRate",
  "overallSqlRate",
];

export const CHANNEL_RANK_METRIC_LABELS: Record<ChannelRankMetric, string> = {
  overallSqlRate: "总体 SQL 转化率",
  wechatRate: "加微率",
  mqlRate: "MQL 率",
  mqlToSqlRate: "MQL→SQL 转化率",
  validRate: "有效率",
};
