import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleRouteError } from "@/lib/apiResponse";
import { intakeLeadTx } from "@/lib/leadIntake";
import { queryLeads } from "@/lib/leadQuery";
import { LEAD_LEVEL_VALUES } from "@/lib/enums";

// GET /api/leads —— 列表 + 筛选 + 分页
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const result = await queryLeads({
      mainStatus: sp.get("mainStatus") || undefined,
      channel: sp.get("channel") || undefined,
      source: sp.get("source") || undefined,
      ownerId: sp.get("ownerId") || undefined,
      q: sp.get("q")?.trim() || undefined,
      page: parseInt(sp.get("page") || "1", 10),
      pageSize: parseInt(sp.get("pageSize") || "20", 10),
    });
    return ok(result);
  } catch (err) {
    return handleRouteError(err);
  }
}

const createSchema = z.object({
  name: z.string().trim().max(50).optional().nullable(),
  phone: z.string().min(1, "手机号必填"),
  source: z.string().min(1, "来源必填"),
  channel: z.string().min(1, "渠道必填"),
  leadLevel: z.enum(LEAD_LEVEL_VALUES).optional(),
  ownerId: z.string().optional().nullable(),
  operatorId: z.string().optional().nullable(),
});

// POST /api/leads —— 手动新增（含去重）
export async function POST(req: NextRequest) {
  try {
    const body = createSchema.parse(await req.json());
    const result = await prisma.$transaction((tx) =>
      intakeLeadTx(tx, {
        ...body,
        triggerSource: "MANUAL",
      })
    );

    if (result.outcome === "invalid") {
      return fail("VALIDATION_ERROR", result.reason);
    }
    if (result.outcome === "duplicate") {
      return fail(
        "DUPLICATE_PHONE",
        `手机号已存在（${result.existing.name ?? "未命名"} / ${result.existing.mainStatus}），已记录重复来源，未新建线索`,
        { existing: result.existing, suggestion: result.suggestion, message: result.message }
      );
    }
    if (result.outcome === "reactivated") {
      return ok({
        lead: result.lead,
        previousStatus: result.previousStatus,
        suggestion: result.suggestion,
        message: result.message,
      });
    }
    return ok(result.lead, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}

export const dynamic = "force-dynamic";
