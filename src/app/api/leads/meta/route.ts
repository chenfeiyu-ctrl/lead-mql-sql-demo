import { prisma } from "@/lib/prisma";
import { ok, handleRouteError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/leads/meta —— 列表筛选项（来源/渠道 distinct）
export async function GET() {
  try {
    const [sources, channels] = await Promise.all([
      prisma.lead.findMany({ select: { source: true }, distinct: ["source"], orderBy: { source: "asc" } }),
      prisma.lead.findMany({ select: { channel: true }, distinct: ["channel"], orderBy: { channel: "asc" } }),
    ]);
    return ok({
      sources: sources.map((r) => r.source),
      channels: channels.map((r) => r.channel),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
