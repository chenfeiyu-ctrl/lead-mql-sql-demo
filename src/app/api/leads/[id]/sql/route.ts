import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { changeStatusTx } from "@/lib/leadService";
import { validateSql, MIN_REASON_LEN } from "@/lib/mqlSqlRules";
import { ok, handleRouteError, ApiError } from "@/lib/apiResponse";

const schema = z.object({
  sqlReason: z.string().trim().min(MIN_REASON_LEN, `SQL 原因至少 ${MIN_REASON_LEN} 字`),
  operatorId: z.string().optional().nullable(),
  expectedVersion: z.number().int().optional(),
});

// POST /api/leads/:id/sql —— 仅 MQL → SQL（docs/02 §6）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await req.json());

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: params.id } });
      if (!lead) throw new ApiError("NOT_FOUND", "线索不存在");

      const check = validateSql(lead, body.sqlReason);
      if (!check.ok) {
        throw new ApiError("SQL_PRECONDITION_FAILED", "不满足 SQL 转化条件", {
          reasons: check.reasons,
          checklist: check.checklist,
        });
      }

      return changeStatusTx(tx, {
        leadId: lead.id,
        to: "SQL",
        operatorId: body.operatorId ?? null,
        triggerSource: "MANUAL",
        reason: "销售认可（SQL）",
        expectedVersion: body.expectedVersion,
        leadData: {
          sqlAt: new Date(),
          sqlReason: body.sqlReason,
          sqlRevokedAt: null, // 再次标记时清除撤销标记
          sqlRevokeReason: null,
        },
      });
    });

    return ok(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
