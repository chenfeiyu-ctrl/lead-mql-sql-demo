import type { Lead } from "@prisma/client";
import type { MainStatus } from "./types";

// 48h 未跟进异常规则 —— docs/02 §9。

export const OVERDUE_HOURS = 48;
export const OVERDUE_MS = OVERDUE_HOURS * 60 * 60 * 1000;

// 生效范围：待加微 / 已加微 / 跟进中
export const OVERDUE_SCOPE: MainStatus[] = [
  "TO_ADD_WECHAT",
  "WECHAT_ADDED",
  "FOLLOWING",
];

export function inOverdueScope(status: string): boolean {
  return (OVERDUE_SCOPE as string[]).includes(status);
}

export interface OverdueInfo {
  inScope: boolean;
  hasOwner: boolean;
  startAt: Date | null; // 起算时间
  hoursElapsed: number | null;
  isOverdue: boolean; // 超 48h 未跟进
  isUnassigned: boolean; // 应分配阶段但无 owner
}

// 起算：有 owner 从未跟进 → assigned_at；已有跟进 → last_follow_up_at
export function evaluateOverdue(lead: Lead, now: Date = new Date()): OverdueInfo {
  const inScope = inOverdueScope(lead.mainStatus);
  const hasOwner = !!lead.ownerId;

  if (!inScope) {
    return {
      inScope: false,
      hasOwner,
      startAt: null,
      hoursElapsed: null,
      isOverdue: false,
      isUnassigned: false,
    };
  }

  if (!hasOwner) {
    return {
      inScope: true,
      hasOwner: false,
      startAt: null,
      hoursElapsed: null,
      isOverdue: false,
      isUnassigned: true,
    };
  }

  const startAt = lead.lastFollowUpAt ?? lead.assignedAt ?? null;
  if (!startAt) {
    return {
      inScope: true,
      hasOwner: true,
      startAt: null,
      hoursElapsed: null,
      isOverdue: false,
      isUnassigned: false,
    };
  }

  const elapsedMs = now.getTime() - new Date(startAt).getTime();
  const hoursElapsed = elapsedMs / (60 * 60 * 1000);
  return {
    inScope: true,
    hasOwner: true,
    startAt: new Date(startAt),
    hoursElapsed,
    isOverdue: elapsedMs > OVERDUE_MS,
    isUnassigned: false,
  };
}
