import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { applyCallResultTx } from "@/lib/leadService";
import { handleIntegrationEvent } from "@/lib/integration";
import { requireWebhookAuth } from "@/lib/integrationAuth";
import { ok, fail, handleRouteError, ApiError } from "@/lib/apiResponse";
import { CALL_STATUS_VALUES, INVALID_REASON_VALUES } from "@/lib/enums";
import type { CallStatus } from "@/lib/types";

// POST /api/integrations/call-callback —— 外呼系统回调（幂等，docs/07 §4）
const schema = z.object({
  source_system: z.string().default("call_center"),
  external_event_id: z.string().min(1, "external_event_id 必填"),
  lead_id: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  call_time: z.string().optional().nullable(),
  call_status: z.enum(CALL_STATUS_VALUES),
  connected: z.boolean().optional(),
  result: z.string().optional().nullable(),
  invalid_reason: z.enum(INVALID_REASON_VALUES).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await requireWebhookAuth(req);
    const body = schema.parse(JSON.parse(raw));

    const result = await handleIntegrationEvent({
      sourceSystem: body.source_system,
      externalEventId: body.external_event_id,
      eventType: "call_callback",
      payload: body,
      handle: async () => {
        return prisma.$transaction(async (tx) => {
          const lead = body.lead_id
            ? await tx.lead.findUnique({ where: { id: body.lead_id } })
            : body.phone
            ? await tx.lead.findFirst({ where: { phone: body.phone }, orderBy: { createdAt: "desc" } })
            : null;
          if (!lead) throw new ApiError("VALIDATION_ERROR", "回调无法定位线索（lead_id/phone 无效）");

          await applyCallResultTx(tx, lead.id, {
            callStatus: body.call_status as CallStatus,
            connected: body.connected,
            result: body.result,
            invalidReason: body.invalid_reason,
            sourceSystem: body.source_system,
            externalEventId: body.external_event_id,
            calledAt: body.call_time ? new Date(body.call_time) : undefined,
            triggerSource: "CALL_CALLBACK",
          });
          return { leadId: lead.id };
        });
      },
    });

    if (result.outcome === "FAILED") {
      return fail("PRECONDITION_FAILED", result.message ?? "回调处理失败", { eventLogId: result.eventLogId }, 200);
    }
    return ok(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
