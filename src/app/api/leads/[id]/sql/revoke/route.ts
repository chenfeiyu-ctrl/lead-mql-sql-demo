import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { changeStatusTx } from "@/lib/leadService";
import { MIN_REASON_LEN } from "@/lib/mqlSqlRules";
import { ok, handleRouteError, ApiError } from "@/lib/apiResponse";

const schema = z.object({
  sqlRevokeReason: z
    .string()
    .trim()
    .min(MIN_REASON_LEN, `撤销原因至少 ${MIN_REASON_LEN} 字`),
  operatorId: z.string().optional().nullable(),
  expectedVersion: z.number().int().optional(),
});

// POST /api/leads/:id/sql/revoke —— SQL 误标退回 → MQL（docs/02 §6.4）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await req.json());

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: params.id } });
      if (!lead) throw new ApiError("NOT_FOUND", "线索不存在");
      if (lead.mainStatus !== "SQL") {
        throw new ApiError("PRECONDITION_FAILED", "仅 SQL 状态可执行误标退回");
      }

      return changeStatusTx(tx, {
        leadId: lead.id,
        to: "MQL",
        operatorId: body.operatorId ?? null,
        triggerSource: "MANUAL",
        reason: body.sqlRevokeReason,
        expectedVersion: body.expectedVersion,
        leadData: {
          sqlRevokedAt: new Date(),
          sqlRevokeReason: body.sqlRevokeReason,
          // sqlReason 保留原值；mqlAt 不回滚
        },
      });
    });

    return ok(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
