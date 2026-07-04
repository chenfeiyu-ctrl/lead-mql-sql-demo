import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { changeStatusTx, closeOpenTasksTx } from "@/lib/leadService";
import { ok, handleRouteError, ApiError } from "@/lib/apiResponse";
import { INTENTION_LEVEL_VALUES } from "@/lib/enums";

const schema = z.object({
  content: z.string().trim().min(1, "跟进内容必填"),
  intentionLevel: z.enum(INTENTION_LEVEL_VALUES),
  nextAction: z.string().trim().optional().nullable(),
  nextFollowUpAt: z.string().datetime().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  operatorId: z.string().optional().nullable(),
  expectedVersion: z.number().int().optional(),
});

// POST /api/leads/:id/followups —— 新增跟进（联动 last/first_follow_up_at + WECHAT_ADDED→FOLLOWING + 关闭超时任务）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await req.json());

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: params.id } });
      if (!lead) throw new ApiError("NOT_FOUND", "线索不存在");

      if (body.expectedVersion !== undefined && body.expectedVersion !== lead.version) {
        throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", "线索已被更新，请刷新后重试");
      }

      const ownerId = body.ownerId ?? lead.ownerId;
      if (!ownerId) {
        throw new ApiError("OWNER_REQUIRED", "跟进前必须先分配负责人");
      }
      if (!["WECHAT_ADDED", "FOLLOWING"].includes(lead.mainStatus)) {
        throw new ApiError(
          "PRECONDITION_FAILED",
          `当前状态 ${lead.mainStatus} 不可新增跟进（应为已加微/跟进中）`
        );
      }

      const now = new Date();
      const follow = await tx.followUpRecord.create({
        data: {
          leadId: lead.id,
          ownerId,
          content: body.content,
          intentionLevel: body.intentionLevel,
          nextAction: body.nextAction ?? null,
          nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null,
          createdAt: now,
        },
      });

      // 已加微 → 跟进中（首次跟进触发）
      if (lead.mainStatus === "WECHAT_ADDED") {
        await changeStatusTx(tx, {
          leadId: lead.id,
          to: "FOLLOWING",
          operatorId: body.operatorId ?? ownerId,
          triggerSource: "MANUAL",
          relatedRecordType: "follow_up",
          relatedRecordId: follow.id,
          leadData: {
            followStatus: "FOLLOWING",
            lastFollowUpAt: now,
            firstFollowUpAt: lead.firstFollowUpAt ?? now,
          },
        });
      } else {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            followStatus: "FOLLOWING",
            lastFollowUpAt: now,
            firstFollowUpAt: lead.firstFollowUpAt ?? now,
            version: { increment: 1 },
          },
        });
      }

      // 关闭超时未跟进任务
      await closeOpenTasksTx(tx, lead.id, "OVERDUE_FOLLOW_UP", body.operatorId ?? ownerId);

      return { follow, lead: await tx.lead.findUnique({ where: { id: lead.id } }) };
    });

    return ok(result, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
