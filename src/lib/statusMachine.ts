import type { MainStatus } from "./types";

// 主状态流转白名单 —— 与 docs/02 §3 / docs/13 §5 字面一致。
export const ALLOWED_TRANSITIONS: Record<MainStatus, MainStatus[]> = {
  NEW: ["TO_CALL", "INVALID"],
  TO_CALL: ["CALLING", "INVALID"],
  CALLING: ["VALID", "INVALID", "TO_CALL"],
  VALID: ["TO_ADD_WECHAT", "INVALID"],
  INVALID: ["TO_CALL", "CLOSED"],
  TO_ADD_WECHAT: ["WECHAT_ADDED", "CLOSED"],
  WECHAT_ADDED: ["FOLLOWING", "CLOSED"],
  FOLLOWING: ["MQL", "CLOSED"],
  MQL: ["SQL", "FOLLOWING", "CLOSED"],
  SQL: ["CLOSED", "MQL"],
  CLOSED: ["TO_CALL"],
};

export function isTransitionAllowed(from: MainStatus, to: MainStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedNextStatuses(from: MainStatus): MainStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

// 需要在 status_log.reason 填写原因的目标状态
export const REASON_REQUIRED_TARGETS: MainStatus[] = ["INVALID", "CLOSED"];

export function isReasonRequired(to: MainStatus): boolean {
  return REASON_REQUIRED_TARGETS.includes(to);
}

// docs/02 §7：TO_ADD_WECHAT 及之后阶段 owner 必填
export const OWNER_REQUIRED_STATUSES: MainStatus[] = [
  "TO_ADD_WECHAT",
  "WECHAT_ADDED",
  "FOLLOWING",
  "MQL",
  "SQL",
];

export function isOwnerRequired(status: MainStatus): boolean {
  return OWNER_REQUIRED_STATUSES.includes(status);
}
