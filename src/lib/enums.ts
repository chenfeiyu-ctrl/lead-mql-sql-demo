// Enum labels — aligned with prisma/schema.prisma and src/lib/types.ts
// 禁止在前端另起一套枚举字符串。

export const MAIN_STATUS_LABEL: Record<string, string> = {
  NEW: "新线索",
  TO_CALL: "待外呼",
  CALLING: "外呼中",
  VALID: "有效线索",
  INVALID: "无效线索",
  TO_ADD_WECHAT: "待加微",
  WECHAT_ADDED: "已加微",
  FOLLOWING: "跟进中",
  MQL: "营销认可(MQL)",
  SQL: "销售商机(SQL)",
  CLOSED: "已关闭",
};

// 漏斗展示顺序
export const MAIN_STATUS_ORDER = [
  "NEW",
  "TO_CALL",
  "CALLING",
  "VALID",
  "INVALID",
  "TO_ADD_WECHAT",
  "WECHAT_ADDED",
  "FOLLOWING",
  "MQL",
  "SQL",
  "CLOSED",
] as const;

export const CALL_STATUS_LABEL: Record<string, string> = {
  NOT_CALLED: "未外呼",
  CALLING: "外呼中",
  CONNECTED: "已接通",
  NOT_CONNECTED: "未接通",
  INVALID_PHONE: "空号/错号",
  REJECTED: "明确拒绝",
  CALLBACK_FAILED: "回传失败",
};

export const WECHAT_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "未开始",
  PENDING: "加微中",
  ADDED: "已加微",
  FAILED: "加微失败",
  REJECTED: "被拒绝",
};

export const FOLLOW_STATUS_LABEL: Record<string, string> = {
  NOT_FOLLOWED: "未跟进",
  FOLLOWING: "跟进中",
  FOLLOWED: "已跟进",
  NURTURING: "长期培育",
  CLOSED: "已关闭",
};

export const INVALID_REASON_LABEL: Record<string, string> = {
  INVALID_PHONE: "空号/号码错误",
  NO_DEMAND: "无需求",
  REJECTED: "明确拒绝",
  NOT_TARGET_CUSTOMER: "非目标客户",
  DUPLICATE: "重复线索",
  SPAM: "垃圾/骚扰",
  UNREACHABLE: "长期无法联系",
};

export const LEAD_LEVEL_LABEL: Record<string, string> = {
  A: "A 高意向",
  B: "B 中高意向",
  C: "C 一般",
  D: "D 低意向",
};

export const SALES_ROLE_VALUES = ["SALES", "SUPERVISOR", "OPERATOR"] as const;

export const SALES_ROLE_LABEL: Record<string, string> = {
  SALES: "销售",
  SUPERVISOR: "主管",
  OPERATOR: "运营",
};

export const INTENTION_LEVEL_LABEL: Record<string, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
};

export const TASK_TYPE_LABEL: Record<string, string> = {
  OVERDUE_FOLLOW_UP: "48h 未跟进",
  UNASSIGNED: "未分配",
  CALLBACK_FAILED: "回传失败",
  WECHAT_FAILED: "加微失败",
  DUPLICATE_CONFLICT: "重复归属冲突",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  OPEN: "待处理",
  RESOLVED: "已解决",
  CLOSED: "已关闭",
};

export const TRIGGER_SOURCE_LABEL: Record<string, string> = {
  MANUAL: "人工",
  SYSTEM: "系统",
  IMPORT: "导入",
  CALL_CALLBACK: "外呼回调",
  WECHAT_CALLBACK: "加微回调",
};

export const DUPLICATE_ACTION_LABEL: Record<string, string> = {
  MERGE_SOURCE: "合并来源",
  IGNORE: "忽略",
  REACTIVATE: "重新激活",
};

export const CLOSE_REASON_LABEL: Record<string, string> = {
  CUSTOMER_REJECTED: "客户明确拒绝",
  NO_DEMAND_CONFIRMED: "确认无需求",
  MISTAKE_ENTRY: "误录入/测试",
  UNREACHABLE: "长期无法联系",
  LOST: "已流失/竞品",
};

// 枚举值数组（用于 Zod 校验与前端下拉）
export const MAIN_STATUS_VALUES = Object.keys(MAIN_STATUS_LABEL) as [string, ...string[]];
export const CALL_STATUS_VALUES = Object.keys(CALL_STATUS_LABEL) as [string, ...string[]];
export const WECHAT_STATUS_VALUES = Object.keys(WECHAT_STATUS_LABEL) as [string, ...string[]];
export const INVALID_REASON_VALUES = Object.keys(INVALID_REASON_LABEL) as [string, ...string[]];
export const LEAD_LEVEL_VALUES = Object.keys(LEAD_LEVEL_LABEL) as [string, ...string[]];
export const INTENTION_LEVEL_VALUES = Object.keys(INTENTION_LEVEL_LABEL) as [string, ...string[]];
export const DUPLICATE_ACTION_VALUES = Object.keys(DUPLICATE_ACTION_LABEL) as [string, ...string[]];

export function labelOf(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "-";
  return map[key] ?? key;
}
