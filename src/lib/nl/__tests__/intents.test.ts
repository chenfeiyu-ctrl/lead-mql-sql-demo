import { describe, it, expect } from "vitest";
import { intentSchema, resolveTimeRange } from "../intents";
import { parseIntentContent } from "../deepseek";

describe("intentSchema 校验", () => {
  it("接受合法 CHANNEL_SQL_RATE_RANK", () => {
    const r = intentSchema.safeParse({ intent: "CHANNEL_SQL_RATE_RANK", timeRange: "this_week" });
    expect(r.success).toBe(true);
  });

  it("接受 METRIC_SINGLE + 合法 metric", () => {
    const r = intentSchema.safeParse({ intent: "METRIC_SINGLE", metric: "wechatRate", filters: { channel: "抖音" } });
    expect(r.success).toBe(true);
  });

  it("拒绝未知 metric", () => {
    const r = intentSchema.safeParse({ intent: "METRIC_SINGLE", metric: "unknownMetric" });
    expect(r.success).toBe(false);
  });

  it("拒绝未知 intent", () => {
    const r = intentSchema.safeParse({ intent: "DROP_TABLE" });
    expect(r.success).toBe(false);
  });

  it("拒绝 LEAD_LIST 中非法 mainStatus", () => {
    const r = intentSchema.safeParse({ intent: "LEAD_LIST", mainStatus: "HACK" });
    expect(r.success).toBe(false);
  });

  it("LEAD_LIST limit 上限 50", () => {
    expect(intentSchema.safeParse({ intent: "LEAD_LIST", limit: 50 }).success).toBe(true);
    expect(intentSchema.safeParse({ intent: "LEAD_LIST", limit: 500 }).success).toBe(false);
  });
});

describe("parseIntentContent", () => {
  it("解析合法 JSON 意图", () => {
    const r = parseIntentContent('{"intent":"METRIC_SINGLE","metric":"mqlCount"}');
    expect(r.ok).toBe(true);
  });

  it("非法 JSON → invalid_output", () => {
    const r = parseIntentContent("not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_output");
  });

  it("不符合规范的 JSON → invalid_output", () => {
    const r = parseIntentContent('{"intent":"EVIL"}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_output");
  });
});

describe("resolveTimeRange", () => {
  const now = new Date("2026-07-01T12:00:00"); // 周三

  it("all/未定义 → 无区间", () => {
    expect(resolveTimeRange(undefined, now).dateFrom).toBeUndefined();
    expect(resolveTimeRange("all", now).dateFrom).toBeUndefined();
  });

  it("today → 当天 0 点起", () => {
    const r = resolveTimeRange("today", now);
    expect(r.dateFrom?.getHours()).toBe(0);
    expect(r.dateFrom?.getDate()).toBe(1);
  });

  it("this_week → 周一起", () => {
    const r = resolveTimeRange("this_week", now);
    expect(r.dateFrom?.getDay()).toBe(1); // 周一
    expect(r.dateFrom?.getDate()).toBe(29); // 6/29 周一
  });

  it("last_7_days → 6 天前 0 点", () => {
    const r = resolveTimeRange("last_7_days", now);
    expect(r.dateFrom?.getDate()).toBe(25);
  });

  it("this_month → 1 号", () => {
    const r = resolveTimeRange("this_month", now);
    expect(r.dateFrom?.getDate()).toBe(1);
  });
});
