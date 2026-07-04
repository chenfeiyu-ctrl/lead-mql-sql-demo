import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { changeStatusTx } from "@/lib/leadService";
import { validateMql } from "@/lib/mqlSqlRules";
import { ok, handleRouteError, ApiError } from "@/lib/apiResponse";
import { MIN_REASON_LEN } from "@/lib/mqlSqlRules";

const schema = z.object({
  mqlReason: z.string().trim().min(MIN_REASON_LEN, `MQL 原因至少 ${MIN_REASON_LEN} 字`),
  operatorId: z.string().optional().nullable(),
  expectedVersion: z.number().int().optional(),
});

// POST /api/leads/:id/mql —— 仅 FOLLOWING → MQL（docs/02 §5）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await req.json());

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id: params.id },
        include: { followUpRecords: true, callRecords: true, statusLogs: true },
      });
      if (!lead) throw new ApiError("NOT_FOUND", "线索不存在");

      const check = validateMql(lead, body.mqlReason);
      if (!check.ok) {
        throw new ApiError("MQL_PRECONDITION_FAILED", "不满足 MQL 转化条件", {
          reasons: check.reasons,
          checklist: check.checklist,
        });
      }

      return changeStatusTx(tx, {
        leadId: lead.id,
        to: "MQL",
        operatorId: body.operatorId ?? null,
        triggerSource: "MANUAL",
        reason: "市场认可（MQL）",
        expectedVersion: body.expectedVersion,
        leadData: {
          mqlAt: new Date(),
          mqlReason: body.mqlReason,
          followStatus: "FOLLOWED",
        },
      });
    });

    return ok(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
