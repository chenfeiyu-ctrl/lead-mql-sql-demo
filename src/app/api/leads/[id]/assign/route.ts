import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { closeOpenTasksTx } from "@/lib/leadService";
import { ok, fail, handleRouteError, ApiError } from "@/lib/apiResponse";

const schema = z.object({
  ownerId: z.string().min(1, "负责人必填"),
  operatorId: z.string().optional().nullable(),
  expectedVersion: z.number().int().optional(),
});

// POST /api/leads/:id/assign —— 分配/变更负责人（不改主状态）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await req.json());

    const owner = await prisma.salesUser.findUnique({ where: { id: body.ownerId } });
    if (!owner) return fail("VALIDATION_ERROR", "负责人不存在");

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: params.id } });
      if (!lead) throw new ApiError("NOT_FOUND", "线索不存在");

      if (body.expectedVersion !== undefined && body.expectedVersion !== lead.version) {
        throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", "线索已被更新，请刷新后重试");
      }

      const ownerChanged = body.ownerId !== lead.ownerId;

      const res = await tx.lead.updateMany({
        where: { id: lead.id, version: lead.version },
        data: {
          ownerId: body.ownerId,
          // 首次分配或更换负责人时刷新 assigned_at（48h 起算点）
          assignedAt: ownerChanged || !lead.assignedAt ? new Date() : lead.assignedAt,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) {
        throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", "并发更新冲突，请刷新后重试");
      }

      // 分配仅更新 owner/assignedAt，不写 lead_status_logs（非主状态变更）

      // 分配后关闭未分配异常任务
      await closeOpenTasksTx(tx, lead.id, "UNASSIGNED", body.operatorId ?? null);

      return tx.lead.findUnique({ where: { id: lead.id } });
    });

    return ok(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
