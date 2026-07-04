import { NextRequest } from "next/server";
import { z } from "zod";
import { changeStatus } from "@/lib/leadService";
import { ok, fail, handleRouteError } from "@/lib/apiResponse";
import { MAIN_STATUS_VALUES, INVALID_REASON_VALUES } from "@/lib/enums";
import { resolveInvalidStatusReason } from "@/lib/statusReason";
import type { MainStatus, InvalidReason } from "@/lib/types";

const schema = z.object({
  to: z.enum(MAIN_STATUS_VALUES),
  reason: z.string().trim().optional().nullable(),
  invalidReason: z.enum(INVALID_REASON_VALUES).optional().nullable(),
  operatorId: z.string().optional().nullable(),
  expectedVersion: z.number().int().optional(),
});

// POST /api/leads/:id/status —— 通用主状态变更（走白名单）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await req.json());
    const to = body.to as MainStatus;

    if (to === "INVALID" && !body.invalidReason) {
      return fail("PRECONDITION_FAILED", "转为无效线索必须选择 invalid_reason");
    }
    // 禁止用通用接口做 MQL/SQL 转化（应走专用接口写时间字段）
    if (to === "MQL" || to === "SQL") {
      return fail(
        "VALIDATION_ERROR",
        `请使用专用接口进行 ${to} 转化（/mql 或 /sql），以正确写入时间字段`
      );
    }

    const leadData: Record<string, unknown> = {};
    if (to === "INVALID") {
      leadData.invalidReason = body.invalidReason as InvalidReason;
    }

    let reason = body.reason ?? null;
    if (to === "INVALID" && body.invalidReason) {
      reason = resolveInvalidStatusReason(reason, body.invalidReason as InvalidReason);
    }

    const updated = await changeStatus({
      leadId: params.id,
      to,
      operatorId: body.operatorId ?? null,
      triggerSource: "MANUAL",
      reason,
      expectedVersion: body.expectedVersion,
      leadData,
    });

    return ok(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}
