import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleRouteError } from "@/lib/apiResponse";
import { allowedNextStatuses } from "@/lib/statusMachine";
import { validateMqlEligibility, validateSqlEligibility } from "@/lib/mqlSqlRules";
import { evaluateOverdue } from "@/lib/overdueRules";
import { LEAD_LEVEL_VALUES } from "@/lib/enums";
import type { MainStatus } from "@/lib/types";

// GET /api/leads/:id —— 详情（含允许流转、MQL/SQL 资格、超时信息、时间线）
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: params.id },
      include: {
        owner: { select: { id: true, name: true, role: true } },
        callRecords: { orderBy: { calledAt: "desc" } },
        followUpRecords: {
          orderBy: { createdAt: "desc" },
          include: { owner: { select: { id: true, name: true } } },
        },
        statusLogs: {
          orderBy: { createdAt: "desc" },
          include: { operator: { select: { id: true, name: true } } },
        },
        tasks: { orderBy: { createdAt: "desc" } },
        duplicateRecords: { orderBy: { detectedAt: "desc" } },
      },
    });

    if (!lead) return fail("NOT_FOUND", "线索不存在");

    const mqlEligibility = validateMqlEligibility(lead);
    const sqlEligibility = validateSqlEligibility(lead);

    return ok({
      lead,
      allowedTransitions: allowedNextStatuses(lead.mainStatus as MainStatus),
      mqlEligibility,
      sqlEligibility,
      overdue: evaluateOverdue(lead),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

const patchSchema = z
  .object({
    name: z.string().trim().max(50).optional().nullable(),
    leadLevel: z.enum(LEAD_LEVEL_VALUES).optional(),
    source: z.string().min(1).optional(),
    channel: z.string().min(1).optional(),
    expectedVersion: z.number().int().optional(),
  })
  .strict();

// PATCH /api/leads/:id —— 仅更新基础信息，禁止改 main_status
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const raw = await req.json();
    if ("mainStatus" in raw || "main_status" in raw || "status" in raw) {
      return fail(
        "VALIDATION_ERROR",
        "禁止通过 PATCH 修改主状态，请使用 /status、/mql、/sql 等专用接口"
      );
    }
    const body = patchSchema.parse(raw);
    const { expectedVersion, ...data } = body;

    const lead = await prisma.lead.findUnique({ where: { id: params.id } });
    if (!lead) return fail("NOT_FOUND", "线索不存在");

    if (expectedVersion !== undefined && expectedVersion !== lead.version) {
      return fail("OPTIMISTIC_LOCK_CONFLICT", "线索已被更新，请刷新后重试");
    }

    const res = await prisma.lead.updateMany({
      where: { id: params.id, version: lead.version },
      data: { ...data, version: { increment: 1 } },
    });
    if (res.count === 0) return fail("OPTIMISTIC_LOCK_CONFLICT", "并发更新冲突，请刷新后重试");

    const updated = await prisma.lead.findUnique({ where: { id: params.id } });
    return ok(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}
