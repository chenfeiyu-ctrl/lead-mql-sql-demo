import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { changeStatusTx } from "@/lib/leadService";
import { handleIntegrationEvent } from "@/lib/integration";
import { requireWebhookAuth } from "@/lib/integrationAuth";
import { ok, fail, handleRouteError, ApiError } from "@/lib/apiResponse";
import { WECHAT_STATUS_VALUES } from "@/lib/enums";

// POST /api/integrations/wechat-callback —— 企微/SCRM 回调（幂等，docs/07 §5）
const schema = z.object({
  source_system: z.string().default("wechat_scrm"),
  external_event_id: z.string().min(1, "external_event_id 必填"),
  lead_id: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  wechat_status: z.enum(WECHAT_STATUS_VALUES),
  add_time: z.string().optional().nullable(),
  fail_reason: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await requireWebhookAuth(req);
    const body = schema.parse(JSON.parse(raw));

    const result = await handleIntegrationEvent({
      sourceSystem: body.source_system,
      externalEventId: body.external_event_id,
      eventType: "wechat_callback",
      payload: body,
      handle: async () => {
        return prisma.$transaction(async (tx) => {
          const lead = body.lead_id
            ? await tx.lead.findUnique({ where: { id: body.lead_id } })
            : body.phone
            ? await tx.lead.findFirst({ where: { phone: body.phone }, orderBy: { createdAt: "desc" } })
            : null;
          if (!lead) throw new ApiError("VALIDATION_ERROR", "回调无法定位线索（lead_id/phone 无效）");

          const ws = body.wechat_status;
          if (ws === "ADDED") {
            if (lead.mainStatus !== "TO_ADD_WECHAT") {
              throw new ApiError("INVALID_TRANSITION", `线索当前 ${lead.mainStatus} 不接受加微成功回调`, { leadId: lead.id });
            }
            await changeStatusTx(tx, {
              leadId: lead.id,
              to: "WECHAT_ADDED",
              triggerSource: "WECHAT_CALLBACK",
              leadData: { wechatStatus: "ADDED" },
            });
          } else if (ws === "FAILED" || ws === "REJECTED") {
            if (lead.mainStatus !== "TO_ADD_WECHAT") {
              throw new ApiError("INVALID_TRANSITION", `线索当前 ${lead.mainStatus} 不接受加微失败/拒绝回调`, { leadId: lead.id });
            }
            await tx.lead.update({ where: { id: lead.id }, data: { wechatStatus: ws, version: { increment: 1 } } });
            const existing = await tx.task.findFirst({ where: { leadId: lead.id, taskType: "WECHAT_FAILED", status: "OPEN" } });
            if (!existing) {
              await tx.task.create({
                data: { leadId: lead.id, taskType: "WECHAT_FAILED", title: "加微失败（回调）", status: "OPEN", remark: body.fail_reason ?? null },
              });
            }
          } else {
            await tx.lead.update({ where: { id: lead.id }, data: { wechatStatus: ws, version: { increment: 1 } } });
          }
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
