import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError } from "./apiResponse";

// 三方回调幂等处理 —— docs/07 §2。
// 唯一键 (source_system, external_event_id)：先写事件日志，再处理业务；
// 重复 event_id 直接返回 DUPLICATE（不二次改状态）；处理失败标 FAILED 并生成待办。

export type IntegrationOutcome = "PROCESSED" | "DUPLICATE" | "FAILED";

interface HandleParams {
  sourceSystem: string;
  externalEventId: string;
  eventType: string;
  payload: unknown;
  // 返回受影响的 leadId（用于回写日志）
  handle: () => Promise<{ leadId?: string | null }>;
}

export interface IntegrationResult {
  outcome: IntegrationOutcome;
  eventLogId: string;
  leadId?: string | null;
  message?: string;
}

export async function handleIntegrationEvent(
  params: HandleParams
): Promise<IntegrationResult> {
  // 1. 幂等：尝试写入事件日志（唯一约束）
  let logId: string;
  try {
    const log = await prisma.integrationEventLog.create({
      data: {
        sourceSystem: params.sourceSystem,
        externalEventId: params.externalEventId,
        eventType: params.eventType,
        payload: JSON.stringify(params.payload),
        processStatus: "RECEIVED",
      },
    });
    logId = log.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.integrationEventLog.findUnique({
        where: {
          sourceSystem_externalEventId: {
            sourceSystem: params.sourceSystem,
            externalEventId: params.externalEventId,
          },
        },
      });
      return {
        outcome: "DUPLICATE",
        eventLogId: existing?.id ?? "",
        leadId: existing?.leadId ?? null,
        message: "重复回调，已幂等忽略",
      };
    }
    throw e;
  }

  // 2. 处理业务
  try {
    const { leadId } = await params.handle();
    await prisma.integrationEventLog.update({
      where: { id: logId },
      data: { processStatus: "PROCESSED", processedAt: new Date(), leadId: leadId ?? null },
    });
    return { outcome: "PROCESSED", eventLogId: logId, leadId: leadId ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "回调处理失败";
    const leadId =
      err instanceof ApiError && err.details && typeof err.details === "object"
        ? (err.details as { leadId?: string }).leadId ?? null
        : null;

    await prisma.integrationEventLog.update({
      where: { id: logId },
      data: { processStatus: "FAILED", errorMessage: message, processedAt: new Date(), leadId },
    });

    // 能定位到线索则生成回传失败待办（主状态不变）
    if (leadId) {
      await prisma.task.create({
        data: {
          leadId,
          taskType: "CALLBACK_FAILED",
          title: `回调处理失败：${message}`,
          status: "OPEN",
        },
      });
    }
    return { outcome: "FAILED", eventLogId: logId, leadId, message };
  }
}
