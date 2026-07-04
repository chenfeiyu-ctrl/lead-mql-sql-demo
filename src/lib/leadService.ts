import { prisma } from "./prisma";
import { ApiError } from "./apiResponse";
import { isTransitionAllowed, isReasonRequired, isOwnerRequired } from "./statusMachine";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { MainStatus, TriggerSource, TaskType, CallStatus } from "./types";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface ChangeStatusInput {
  leadId: string;
  to: MainStatus;
  operatorId?: string | null;
  triggerSource: TriggerSource;
  reason?: string | null;
  relatedRecordType?: string | null;
  relatedRecordId?: string | null;
  expectedVersion?: number; // 客户端乐观锁（可选）
  leadData?: Prisma.LeadUncheckedUpdateInput; // 附带写入的 Lead 字段
  allowWechatFailedClose?: boolean; // 仅专用加微失败处理动作可绕过直接关闭保护
}

// 在事务内执行主状态变更（乐观锁 + 写日志）。
export async function changeStatusTx(tx: TxClient, input: ChangeStatusInput) {
  const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new ApiError("NOT_FOUND", "线索不存在");

  const from = lead.mainStatus as MainStatus;
  const to = input.to;

  // 乐观锁：客户端传入版本时先比对
  if (
    input.expectedVersion !== undefined &&
    input.expectedVersion !== lead.version
  ) {
    throw new ApiError(
      "OPTIMISTIC_LOCK_CONFLICT",
      "线索已被他人更新，请刷新后重试",
      { expected: input.expectedVersion, actual: lead.version }
    );
  }

  // 流转白名单校验（同状态不校验，用于纯字段更新场景）
  if (to !== from && !isTransitionAllowed(from, to)) {
    throw new ApiError(
      "INVALID_TRANSITION",
      `不允许的状态流转：${from} → ${to}`,
      { from, to }
    );
  }

  // 加微失败/拒绝禁止直接关闭（docs/02 §3.3）：应重试加微或走专用 resolve
  if (
    to === "CLOSED" &&
    from === "TO_ADD_WECHAT" &&
    ["FAILED", "REJECTED"].includes(lead.wechatStatus) &&
    !input.allowWechatFailedClose
  ) {
    throw new ApiError(
      "INVALID_TRANSITION",
      "加微失败不可直接关闭线索，请重试加微或先处理加微失败待办",
      { from, to, wechatStatus: lead.wechatStatus }
    );
  }

  // INVALID / CLOSED 必须填原因
  if (isReasonRequired(to) && !(input.reason ?? "").trim()) {
    throw new ApiError("PRECONDITION_FAILED", `状态变更为 ${to} 必须填写原因`);
  }

  // owner 必填校验（TO_ADD_WECHAT 及之后）
  const finalOwnerId =
    (input.leadData?.ownerId as string | null | undefined) ?? lead.ownerId;
  if (isOwnerRequired(to) && !finalOwnerId) {
    throw new ApiError(
      "OWNER_REQUIRED",
      `状态 ${to} 要求已分配负责人（owner_id）`
    );
  }

  // 乐观锁更新：WHERE id AND version
  const result = await tx.lead.updateMany({
    where: { id: lead.id, version: lead.version },
    data: {
      ...input.leadData,
      mainStatus: to,
      version: { increment: 1 },
    },
  });
  if (result.count === 0) {
    throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", "并发更新冲突，请刷新后重试");
  }

  // 写状态日志（仅真实主状态变更；同状态字段更新不落库）
  if (to !== from) {
    await tx.leadStatusLog.create({
      data: {
        leadId: lead.id,
        fromStatus: from,
        toStatus: to,
        operatorId: input.operatorId ?? null,
        triggerSource: input.triggerSource,
        reason: input.reason ?? null,
        relatedRecordType: input.relatedRecordType ?? null,
        relatedRecordId: input.relatedRecordId ?? null,
      },
    });
  }

  return tx.lead.findUnique({ where: { id: lead.id } });
}

export async function changeStatus(input: ChangeStatusInput) {
  return prisma.$transaction((tx) => changeStatusTx(tx, input));
}

// 允许录入外呼结果的前置主状态
export const CALLABLE_STATUSES: MainStatus[] = ["TO_CALL", "CALLING", "NEW"];

export interface ApplyCallInput {
  callStatus: CallStatus;
  connected?: boolean;
  result?: string | null;
  invalidReason?: string | null;
  operatorId?: string | null;
  remark?: string | null;
  sourceSystem?: string | null;
  externalEventId?: string | null;
  calledAt?: Date;
  triggerSource: TriggerSource;
  expectedVersion?: number;
}

// 录入一次外呼结果并联动主状态（docs/02 §4）。
// 手动录入(/calls)与外呼回调(/integrations/call-callback)共用，避免规则漂移。
// 状态不可录入时抛 PRECONDITION_FAILED（details.leadId 便于回调侧生成待办）。
export async function applyCallResultTx(
  tx: TxClient,
  leadId: string,
  input: ApplyCallInput
) {
  const lead = await tx.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new ApiError("NOT_FOUND", "线索不存在");

  if (!CALLABLE_STATUSES.includes(lead.mainStatus as MainStatus)) {
    throw new ApiError(
      "PRECONDITION_FAILED",
      `当前状态 ${lead.mainStatus} 不可录入外呼结果（应为待外呼/外呼中）`,
      { leadId: lead.id }
    );
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== lead.version) {
    throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", "线索已被更新，请刷新后重试");
  }

  const cs = input.callStatus;
  const connected = input.connected ?? cs === "CONNECTED";

  const call = await tx.callRecord.create({
    data: {
      leadId: lead.id,
      callAttemptNo: lead.callAttemptCount + 1,
      callStatus: cs,
      connected,
      result: input.result ?? null,
      invalidReason: input.invalidReason ?? null,
      sourceSystem: input.sourceSystem ?? null,
      externalEventId: input.externalEventId ?? null,
      calledAt: input.calledAt ?? new Date(),
      operatorId: input.operatorId ?? null,
      remark: input.remark ?? null,
    },
  });

  // 回传失败：主状态不变，生成待办
  if (cs === "CALLBACK_FAILED") {
    await tx.lead.update({
      where: { id: lead.id },
      data: { callStatus: cs, version: { increment: 1 } },
    });
    await tx.task.create({
      data: {
        leadId: lead.id,
        taskType: "CALLBACK_FAILED",
        title: "外呼结果回传失败，需复核",
        status: "OPEN",
      },
    });
    return { call, lead: await tx.lead.findUnique({ where: { id: lead.id } }) };
  }

  // 计算目标主状态
  let target: MainStatus | null = null;
  let invalidReason: string | null = null;
  let incAttempt = false;

  if (cs === "CALLING") {
    target = "CALLING";
  } else if (cs === "CONNECTED") {
    // 接通但无意向(NO_DEMAND) 亦判无效（docs/07 §4.3）
    const noDemand =
      input.invalidReason === "NO_DEMAND" || input.result === "NO_DEMAND";
    if (input.invalidReason) {
      target = "INVALID";
      invalidReason = input.invalidReason;
    } else if (noDemand) {
      target = "INVALID";
      invalidReason = "NO_DEMAND";
    } else {
      target = "VALID";
    }
  } else if (cs === "INVALID_PHONE") {
    target = "INVALID";
    invalidReason = "INVALID_PHONE";
  } else if (cs === "REJECTED") {
    target = "INVALID";
    invalidReason = "REJECTED";
  } else if (cs === "NOT_CONNECTED") {
    target = "TO_CALL";
    incAttempt = true;
  }

  // NEW 需先进 TO_CALL
  let effectiveStatus = lead.mainStatus as MainStatus;
  if (effectiveStatus === "NEW") {
    await changeStatusTx(tx, {
      leadId: lead.id,
      to: "TO_CALL",
      triggerSource: input.triggerSource,
      reason: "外呼前置流转",
    });
    effectiveStatus = "TO_CALL";
  }

  // 仅当目标主状态相对当前态有实质变化时才经 CALLING 桥接（避免未接通仍回到待外呼时产生冗余日志）
  const needBridge =
    effectiveStatus === "TO_CALL" &&
    target !== null &&
    target !== "CALLING" &&
    target !== effectiveStatus;
  if (needBridge) {
    await changeStatusTx(tx, {
      leadId: lead.id,
      to: "CALLING",
      operatorId: input.operatorId ?? null,
      triggerSource: input.triggerSource,
      relatedRecordType: "call_record",
      relatedRecordId: call.id,
    });
  }

  if (target) {
    await changeStatusTx(tx, {
      leadId: lead.id,
      to: target,
      operatorId: input.operatorId ?? null,
      triggerSource: input.triggerSource,
      reason: target === "INVALID" ? input.result ?? "外呼判定无效" : null,
      relatedRecordType: "call_record",
      relatedRecordId: call.id,
      leadData: {
        callStatus: cs,
        ...(invalidReason ? { invalidReason } : {}),
        ...(incAttempt ? { callAttemptCount: { increment: 1 } } : {}),
      },
    });
  }

  return { call, lead: await tx.lead.findUnique({ where: { id: lead.id } }) };
}

// 关闭指定类型的 OPEN 任务（如新增跟进后关闭 OVERDUE_FOLLOW_UP）
export async function closeOpenTasksTx(
  tx: TxClient,
  leadId: string,
  taskType: TaskType,
  resolvedBy?: string | null
) {
  await tx.task.updateMany({
    where: { leadId, taskType, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: resolvedBy ?? null },
  });
}

export interface ResolveWechatIssueInput {
  leadId: string;
  action: "RETRY" | "CLOSE";
  operatorId?: string | null;
  expectedVersion?: number;
  closeReason?: string | null;
  remark?: string | null;
}

export async function resolveWechatIssueTx(tx: TxClient, input: ResolveWechatIssueInput) {
  const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new ApiError("NOT_FOUND", "线索不存在");

  if (lead.mainStatus !== "TO_ADD_WECHAT") {
    throw new ApiError("PRECONDITION_FAILED", "仅待加微线索可处理加微失败待办");
  }
  if (!["FAILED", "REJECTED"].includes(lead.wechatStatus)) {
    throw new ApiError("PRECONDITION_FAILED", "当前线索没有待处理的加微失败/拒绝状态");
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== lead.version) {
    throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", "线索已被更新，请刷新后重试");
  }

  if (input.action === "RETRY") {
    const res = await tx.lead.updateMany({
      where: { id: lead.id, version: lead.version },
      data: { wechatStatus: "PENDING", version: { increment: 1 } },
    });
    if (res.count === 0) {
      throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", "并发更新冲突，请刷新后重试");
    }
    await closeOpenTasksTx(tx, lead.id, "WECHAT_FAILED", input.operatorId ?? null);
    return tx.lead.findUnique({ where: { id: lead.id } });
  }

  const closeReason = (input.closeReason ?? "").trim();
  const remark = (input.remark ?? "").trim();
  if (!closeReason) {
    throw new ApiError("PRECONDITION_FAILED", "确认关闭必须填写关闭原因");
  }
  if (!remark) {
    throw new ApiError("PRECONDITION_FAILED", "确认关闭必须填写人工复核说明");
  }

  const reason = `加微失败人工关闭：${closeReason}；${remark}`;
  const closed = await changeStatusTx(tx, {
    leadId: lead.id,
    to: "CLOSED",
    operatorId: input.operatorId ?? null,
    triggerSource: "MANUAL",
    reason,
    expectedVersion: input.expectedVersion,
    leadData: { followStatus: "CLOSED" },
    allowWechatFailedClose: true,
  });
  await closeOpenTasksTx(tx, lead.id, "WECHAT_FAILED", input.operatorId ?? null);
  return closed;
}

export async function resolveWechatIssue(input: ResolveWechatIssueInput) {
  return prisma.$transaction((tx) => resolveWechatIssueTx(tx, input));
}

/** 重新激活等场景：关闭该线索全部 OPEN 待办 */
export async function resolveAllOpenTasksTx(
  tx: TxClient,
  leadId: string,
  resolvedBy?: string | null
) {
  await tx.task.updateMany({
    where: { leadId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: resolvedBy ?? null },
  });
}

export { prisma };
