import { normalizePhone, isValidPhone, suggestAction, type DuplicateSuggestion } from "./duplicateRules";
import type { PrismaClient, Lead } from "@prisma/client";
import type { TriggerSource } from "./types";
import { changeStatusTx, resolveAllOpenTasksTx } from "./leadService";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface IntakeInput {
  name?: string | null;
  phone: string;
  source: string;
  channel: string;
  leadLevel?: string;
  ownerId?: string | null;
  importBatchId?: string | null;
  triggerSource: TriggerSource;
  operatorId?: string | null;
}

export type IntakeResult =
  | { outcome: "invalid"; reason: string }
  | {
      outcome: "duplicate";
      existing: Lead;
      suggestion: DuplicateSuggestion;
      message: string;
    }
  | {
      outcome: "reactivated";
      lead: Lead;
      previousStatus: Lead["mainStatus"];
      suggestion: DuplicateSuggestion;
      message: string;
    }
  | { outcome: "created"; lead: Lead };

// 单条线索入库（含手机号校验 + 去重）。手动新增与 CSV 导入共用。
// 重复：不新建；写 duplicate_record。
// 活跃线索合并 latestSource/latestChannel；终止线索重新激活至 TO_CALL。
export async function intakeLeadTx(
  tx: TxClient,
  input: IntakeInput
): Promise<IntakeResult> {
  const phone = normalizePhone(input.phone);
  if (!input.phone || !isValidPhone(phone)) {
    return { outcome: "invalid", reason: "手机号缺失或格式不正确（应为 11 位手机号）" };
  }
  if (!input.source?.trim() || !input.channel?.trim()) {
    return { outcome: "invalid", reason: "来源(source)与渠道(channel)必填" };
  }

  const existing = await tx.lead.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const { suggestion, message } = suggestAction(existing.mainStatus as Lead["mainStatus"]);
    // 记录重复来源
    const duplicate = await tx.duplicateRecord.create({
      data: {
        leadId: existing.id,
        phone,
        newSource: input.source,
        newChannel: input.channel,
        action: suggestion,
        importBatchId: input.importBatchId ?? null,
        remark: message,
      },
    });
    if (suggestion === "REACTIVATE") {
      const reactivated = await changeStatusTx(tx, {
        leadId: existing.id,
        to: "TO_CALL",
        operatorId: input.operatorId ?? null,
        triggerSource: input.triggerSource,
        reason: "重复线索重新进入，重新激活至待外呼",
        relatedRecordType: "duplicate_record",
        relatedRecordId: duplicate.id,
        leadData: {
          latestSource: input.source,
          latestChannel: input.channel,
          callStatus: "NOT_CALLED",
          callAttemptCount: 0,
          wechatStatus: "NOT_STARTED",
          followStatus: "NOT_FOLLOWED",
          invalidReason: null,
          ownerId: null,
          assignedAt: null,
          lastFollowUpAt: null,
          firstFollowUpAt: null,
        },
      });
      await resolveAllOpenTasksTx(tx, existing.id, input.operatorId ?? null);
      return {
        outcome: "reactivated",
        lead: reactivated as Lead,
        previousStatus: existing.mainStatus,
        suggestion,
        message,
      };
    }

    // 活跃线索：合并最新来源/渠道（不覆盖 owner_id）
    if (existing.mainStatus !== "INVALID" && suggestion === "MERGE_SOURCE") {
      await tx.lead.update({
        where: { id: existing.id },
        data: { latestSource: input.source, latestChannel: input.channel },
      });
    }
    return { outcome: "duplicate", existing, suggestion, message };
  }

  // 新建：手动/导入直接进入 TO_CALL（docs/02 §2）
  const lead = await tx.lead.create({
    data: {
      name: input.name ?? null,
      phone,
      source: input.source,
      channel: input.channel,
      firstSource: input.source,
      firstChannel: input.channel,
      latestSource: input.source,
      latestChannel: input.channel,
      leadLevel: input.leadLevel ?? "C",
      mainStatus: "TO_CALL",
      ownerId: input.ownerId ?? null,
      assignedAt: input.ownerId ? new Date() : null,
      importBatchId: input.importBatchId ?? null,
    },
  });

  await tx.leadStatusLog.create({
    data: {
      leadId: lead.id,
      fromStatus: "NEW",
      toStatus: "TO_CALL",
      operatorId: input.operatorId ?? null,
      triggerSource: input.triggerSource,
      reason: "线索录入并通过基础校验",
    },
  });

  return { outcome: "created", lead };
}
