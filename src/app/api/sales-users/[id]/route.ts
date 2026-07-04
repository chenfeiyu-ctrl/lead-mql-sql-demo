import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleRouteError } from "@/lib/apiResponse";
import { SALES_ROLE_VALUES } from "@/lib/enums";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  role: z.enum(SALES_ROLE_VALUES).optional(),
  department: z.string().trim().max(50).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(20).optional().nullable(),
  isActive: z.boolean().optional(),
});

// PATCH /api/sales-users/:id —— 编辑成员（含停用/启用）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = patchSchema.parse(await req.json());
    const existing = await prisma.salesUser.findUnique({ where: { id: params.id } });
    if (!existing) return fail("NOT_FOUND", "成员不存在");

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.role !== undefined) data.role = body.role;
    if (body.department !== undefined) data.department = body.department?.trim() || null;
    if (body.email !== undefined) data.email = body.email?.trim() || null;
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const user = await prisma.salesUser.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        name: true,
        role: true,
        department: true,
        email: true,
        phone: true,
        isActive: true,
      },
    });
    return ok(user);
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return fail("CONFLICT", "该邮箱已被其他成员使用");
    }
    return handleRouteError(err);
  }
}

export const dynamic = "force-dynamic";
