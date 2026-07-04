import { INVALID_REASON_LABEL } from "./enums";
import type { InvalidReason } from "./types";

// 标记无效时：补充说明可选；无文本则用 invalid_reason 中文标签写入 status_log.reason
export function resolveInvalidStatusReason(
  reason: string | null | undefined,
  invalidReason: InvalidReason
): string {
  const trimmed = (reason ?? "").trim();
  if (trimmed) return trimmed;
  return INVALID_REASON_LABEL[invalidReason] ?? invalidReason;
}
