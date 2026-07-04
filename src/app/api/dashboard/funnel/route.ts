import { NextRequest } from "next/server";
import { computeFunnel, computeFunnelByChannel, type FunnelFilters } from "@/lib/metrics";
import { ok, handleRouteError } from "@/lib/apiResponse";

// GET /api/dashboard/funnel —— 漏斗指标（docs/06）；?groupBy=channel 下钻
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const filters: FunnelFilters = {};
    if (sp.get("channel")) filters.channel = sp.get("channel")!;
    if (sp.get("source")) filters.source = sp.get("source")!;
    if (sp.get("ownerId")) filters.ownerId = sp.get("ownerId")!;
    if (sp.get("dateFrom")) filters.dateFrom = new Date(sp.get("dateFrom")!);
    if (sp.get("dateTo")) filters.dateTo = new Date(sp.get("dateTo")!);

    const funnel = await computeFunnel(filters);
    const byChannel =
      sp.get("groupBy") === "channel" ? await computeFunnelByChannel(filters) : undefined;

    return ok({ funnel, byChannel });
  } catch (err) {
    return handleRouteError(err);
  }
}

export const dynamic = "force-dynamic";
