import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, handleRouteError } from "@/lib/apiResponse";
import { normalizePhone, isValidPhone, suggestAction } from "@/lib/duplicateRules";
import type { Lead } from "@prisma/client";

const schema = z.object({ phone: z.string().min(1) });

// POST /api/leads/check-duplicate —— 录入前查重
export async function POST(req: NextRequest) {
  try {
    const { phone: raw } = schema.parse(await req.json());
    const phone = normalizePhone(raw);

    if (!isValidPhone(phone)) {
      return ok({ valid: false, isDuplicate: false, message: "手机号格式不正确" });
    }

    const existing = await prisma.lead.findFirst({
      where: { phone },
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { id: true, name: true } } },
    });

    if (!existing) {
      return ok({ valid: true, isDuplicate: false });
    }

    const { suggestion, message } = suggestAction(existing.mainStatus as Lead["mainStatus"]);
    return ok({
      valid: true,
      isDuplicate: true,
      existing,
      suggestion,
      message,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
