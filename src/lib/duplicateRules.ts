import type { Lead } from "@prisma/client";

// 手机号去重规则 —— docs/02 §8。

export function normalizePhone(raw: string): string {
  return (raw ?? "").replace(/[\s\-()]/g, "").trim();
}

export function isValidPhone(phone: string): boolean {
  const p = normalizePhone(phone);
  return /^1\d{10}$/.test(p);
}

export type DuplicateSuggestion =
  | "MERGE_SOURCE" // 原线索活跃：合并来源，不新建
  | "REACTIVATE" // 原线索 INVALID/CLOSED：可重新激活
  | "IGNORE"; // 原线索高价值 MQL/SQL：不抢归属

export interface DuplicateCheck {
  isDuplicate: boolean;
  existing?: Pick<
    Lead,
    "id" | "name" | "phone" | "mainStatus" | "ownerId" | "channel" | "source"
  >;
  suggestion?: DuplicateSuggestion;
  message?: string;
}

export function suggestAction(mainStatus: Lead["mainStatus"]): {
  suggestion: DuplicateSuggestion;
  message: string;
} {
  if (mainStatus === "INVALID" || mainStatus === "CLOSED") {
    return { suggestion: "REACTIVATE", message: "原线索已终止推进，本次重新进线后可重新激活" };
  }
  if (mainStatus === "MQL" || mainStatus === "SQL") {
    return {
      suggestion: "IGNORE",
      message: "原线索为高价值（MQL/SQL），仅记录重复来源，不抢占归属",
    };
  }
  return {
    suggestion: "MERGE_SOURCE",
    message: "原线索处理中，合并最新来源/渠道，不覆盖负责人",
  };
}
