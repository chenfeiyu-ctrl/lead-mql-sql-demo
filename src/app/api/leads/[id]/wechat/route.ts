import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { changeStatusTx } from "@/lib/leadService";
import { ok, handleRouteError, ApiError } from "@/lib/apiResponse";
import { WECHAT_STATUS_VALUES } from "@/lib/enums";

const schema = z.object({
  wechatStatus: z.enum(WECHAT_STATUS_VALUES),
  operatorId: z.string().optional().nullable(),
  remark: z.string().trim().optional().nullable(),
  expectedVersion: z.number().int().optional(),
});

// POST /api/leads/:id/wechat —— 加微结果（docs/02 §3.1/§3.3）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await req.json());
    const ws = body.wechatStatus;

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: params.id } });
      if (!lead) throw new ApiError("NOT_FOUND", "线索不存在");

      if (body.expectedVersion !== undefined && body.expectedVersion !== lead.version) {
        throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", "线索已被更新，请刷新后重试");
      }

      if (ws === "ADDED") {
        if (lead.mainStatus !== "TO_ADD_WECHAT") {
          throw new ApiError(
            "INVALID_TRANSITION",
            `仅「待加微」可标记加微成功，当前为 ${lead.mainStatus}`
          );
        }
        await changeStatusTx(tx, {
          leadId: lead.id,
          to: "WECHAT_ADDED",
          operatorId: body.operatorId ?? null,
          triggerSource: "MANUAL",
          leadData: { wechatStatus: "ADDED" },
        });
        return tx.lead.findUnique({ where: { id: lead.id } });
      }

      // FAILED / REJECTED：主状态保持 TO_ADD_WECHAT，生成 WECHAT_FAILED 任务，禁止 CLOSED
      if (ws === "FAILED" || ws === "REJECTED") {
        if (lead.mainStatus !== "TO_ADD_WECHAT") {
          throw new ApiError(
            "INVALID_TRANSITION",
            `仅「待加微」可记录加微失败/拒绝，当前为 ${lead.mainStatus}`
          );
        }
        await tx.lead.update({
          where: { id: lead.id },
          data: { wechatStatus: ws, version: { increment: 1 } },
        });
        const existing = await tx.task.findFirst({
          where: { leadId: lead.id, taskType: "WECHAT_FAILED", status: "OPEN" },
        });
        if (!existing) {
          await tx.task.create({
            data: {
              leadId: lead.id,
              taskType: "WECHAT_FAILED",
              title: ws === "REJECTED" ? "客户拒绝加微，需重试或复核" : "加微失败，需重试",
              status: "OPEN",
              remark: body.remark ?? null,
            },
          });
        }
        return tx.lead.findUnique({ where: { id: lead.id } });
      }

      // NOT_STARTED / PENDING：仅更新子状态
      await tx.lead.update({
        where: { id: lead.id },
        data: { wechatStatus: ws, version: { increment: 1 } },
      });
      return tx.lead.findUnique({ where: { id: lead.id } });
    });

    return ok(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
