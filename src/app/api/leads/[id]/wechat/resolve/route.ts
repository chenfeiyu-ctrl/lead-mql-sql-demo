import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveWechatIssue } from "@/lib/leadService";
import { ok, handleRouteError } from "@/lib/apiResponse";

const schema = z.object({
  action: z.enum(["RETRY", "CLOSE"]),
  closeReason: z.string().trim().optional().nullable(),
  remark: z.string().trim().optional().nullable(),
  operatorId: z.string().optional().nullable(),
  expectedVersion: z.number().int().optional(),
});

// POST /api/leads/:id/wechat/resolve
// 处理加微失败/拒绝待办：重试，或人工复核后确认关闭。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await req.json());
    const result = await resolveWechatIssue({
      leadId: params.id,
      action: body.action,
      closeReason: body.closeReason ?? null,
      remark: body.remark ?? null,
      operatorId: body.operatorId ?? null,
      expectedVersion: body.expectedVersion,
    });
    return ok(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
