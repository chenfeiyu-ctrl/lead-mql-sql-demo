import { prisma } from "@/lib/prisma";
import { ok, handleRouteError } from "@/lib/apiResponse";
import { evaluateOverdue, OVERDUE_SCOPE } from "@/lib/overdueRules";

// GET /api/exceptions —— 48h 未跟进（实时规则）+ 未分配 + 未解决任务
export async function GET() {
  try {
    const now = new Date();

    // 实时评估：范围内线索
    const scopedLeads = await prisma.lead.findMany({
      where: { mainStatus: { in: OVERDUE_SCOPE } },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { assignedAt: "asc" },
    });

    const overdue: any[] = [];
    const unassigned: any[] = [];
    for (const lead of scopedLeads) {
      const info = evaluateOverdue(lead, now);
      if (info.isOverdue) {
        overdue.push({
          lead,
          startAt: info.startAt,
          hoursElapsed: info.hoursElapsed ? Math.round(info.hoursElapsed) : null,
        });
      } else if (info.isUnassigned) {
        unassigned.push({ lead });
      }
    }

    // 未解决任务（含回传失败/加微失败/重复冲突等）
    const openTasks = await prisma.task.findMany({
      where: { status: "OPEN" },
      include: { lead: { select: { id: true, name: true, phone: true, mainStatus: true, ownerId: true } } },
      orderBy: { createdAt: "desc" },
    });

    return ok({
      counts: {
        overdue: overdue.length,
        unassigned: unassigned.length,
        openTasks: openTasks.length,
      },
      overdue,
      unassigned,
      tasks: openTasks,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export const dynamic = "force-dynamic";
