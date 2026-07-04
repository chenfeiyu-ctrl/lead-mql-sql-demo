import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { applyCallResultTx } from "@/lib/leadService";
import { ok, handleRouteError } from "@/lib/apiResponse";
import { CALL_STATUS_VALUES, INVALID_REASON_VALUES } from "@/lib/enums";
import type { CallStatus } from "@/lib/types";

// callStatus 不接受 NO_DEMAND（NO_DEMAND 属 InvalidReason）
const schema = z.object({
  callStatus: z.enum(CALL_STATUS_VALUES),
  connected: z.boolean().optional(),
  result: z.string().trim().optional().nullable(),
  invalidReason: z.enum(INVALID_REASON_VALUES).optional().nullable(),
  operatorId: z.string().optional().nullable(),
  remark: z.string().trim().optional().nullable(),
  expectedVersion: z.number().int().optional(),
});

// POST /api/leads/:id/calls —— 录入外呼结果 + 自动状态联动（docs/02 §4）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await req.json());

    const result = await prisma.$transaction((tx) =>
      applyCallResultTx(tx, params.id, {
        callStatus: body.callStatus as CallStatus,
        connected: body.connected,
        result: body.result,
        invalidReason: body.invalidReason,
        operatorId: body.operatorId,
        remark: body.remark,
        expectedVersion: body.expectedVersion,
        triggerSource: "MANUAL",
      })
    );

    return ok(result, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
