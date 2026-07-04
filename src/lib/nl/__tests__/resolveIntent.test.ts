import { describe, it, expect } from "vitest";
import { resolveIntent, enrichTimeRange } from "../resolveIntent";
import type { NlCatalog } from "../catalog";

const catalog: NlCatalog = {
  channels: ["抖音", "百度", "公众号"],
  sources: ["广告投放", "表单提交"],
  owners: [{ id: "u1", name: "李销售" }, { id: "u2", name: "王销售" }],
};

describe("resolveIntent", () => {
  it("渠道模糊匹配并写 notes", () => {
    const { intent, notes } = resolveIntent(
      { intent: "METRIC_SINGLE", metric: "wechatRate", filters: { channel: "抖" } },
      catalog
    );
    expect(intent).toMatchObject({ filters: { channel: "抖音" } });
    expect(notes.some((n) => n.includes("抖音"))).toBe(true);
  });

  it("负责人姓名 → ownerId", () => {
    const { intent, notes } = resolveIntent(
      { intent: "METRIC_SINGLE", metric: "mqlCount", filters: { ownerName: "李销售" } },
      catalog
    );
    expect(intent).toMatchObject({ filters: { ownerId: "u1" } });
    expect(notes.some((n) => n.includes("李销售"))).toBe(true);
  });

  it("LEAD_LIST 从问题推断跟进中", () => {
    const { intent } = resolveIntent(
      { intent: "LEAD_LIST", channel: "抖音" },
      catalog,
      "列出抖音跟进中的线索"
    );
    expect(intent).toMatchObject({ mainStatus: "FOLLOWING", channel: "抖音" });
  });
});

describe("enrichTimeRange", () => {
  it("补全本周 timeRange", () => {
    const intent = enrichTimeRange(
      { intent: "CHANNEL_SQL_RATE_RANK" },
      "本周哪个渠道 SQL 转化率最高"
    );
    expect(intent).toMatchObject({ timeRange: "this_week" });
  });
});
