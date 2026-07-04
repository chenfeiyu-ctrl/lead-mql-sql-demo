import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleIntegrationEvent } from "@/lib/integration";
import { requireWebhookAuth } from "@/lib/integrationAuth";
import { intakeLeadTx } from "@/lib/leadIntake";
import { ok, fail, handleRouteError, ApiError } from "@/lib/apiResponse";

// POST /api/integrations/ad-leads —— 投放平台线索回调（幂等 + 去重，docs/07 §3）
const schema = z.object({
  source_system: z.string().default("ad_platform"),
  external_event_id: z.string().min(1, "external_event_id 必填"),
  name: z.string().optional().nullable(),
  phone: z.string().min(1, "phone 必填"),
  source: z.string().default("广告投放"),
  channel: z.string().min(1, "channel 必填"),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await requireWebhookAuth(req);
    const body = schema.parse(JSON.parse(raw));

    const result = await handleIntegrationEvent({
      sourceSystem: body.source_system,
      externalEventId: body.external_event_id,
      eventType: "ad_lead",
      payload: body,
      handle: async () => {
        return prisma.$transaction(async (tx) => {
          const res = await intakeLeadTx(tx, {
            name: body.name ?? null,
            phone: body.phone,
            source: body.source,
            channel: body.channel,
            triggerSource: "SYSTEM",
          });
          if (res.outcome === "invalid") throw new ApiError("VALIDATION_ERROR", res.reason);
          if (res.outcome === "duplicate") return { leadId: res.existing.id };
          return { leadId: res.lead.id };
        });
      },
    });

    if (result.outcome === "FAILED") {
      return fail("INTEGRATION_INVALID_PAYLOAD", result.message ?? "回调处理失败", { eventLogId: result.eventLogId });
    }
    return ok(result, result.outcome === "PROCESSED" ? 201 : 200);
  } catch (err) {
    return handleRouteError(err);
  }
}
