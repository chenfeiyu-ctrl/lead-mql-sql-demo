import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleRouteError } from "@/lib/apiResponse";
import { SALES_ROLE_VALUES } from "@/lib/enums";

const createSchema = z.object({
  name: z.string().trim().min(1, "姓名必填").max(50),
  role: z.enum(SALES_ROLE_VALUES),
  department: z.string().trim().max(50).optional().nullable(),
  email: z.string().trim().email("邮箱格式不正确").optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(20).optional().nullable(),
});

// GET /api/sales-users —— 销售/运营/主管列表（分配、操作人选择）
// ?all=1 时包含已停用成员（团队管理页）
export async function GET(req: NextRequest) {
  try {
    const all = req.nextUrl.searchParams.get("all") === "1";
    const users = await prisma.salesUser.findMany({
      where: all ? undefined : { isActive: true },
      orderBy: { createdAt: "asc" },
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
    return ok(users);
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/sales-users —— 新增团队成员
export async function POST(req: NextRequest) {
  try {
    const body = createSchema.parse(await req.json());
    const email = body.email?.trim() || null;

    const user = await prisma.salesUser.create({
      data: {
        name: body.name,
        role: body.role,
        department: body.department?.trim() || null,
        email,
        phone: body.phone?.trim() || null,
        isActive: true,
      },
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
    return ok(user, 201);
  } catch (err) {
    if (err instanceof z.ZodError) return handleRouteError(err);
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
