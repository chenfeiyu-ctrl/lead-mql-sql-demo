import { describe, it, expect } from "vitest";
import { tryRuleParse } from "../ruleParser";

describe("tryRuleParse", () => {
  it("帮助 → HELP", () => {
    const r = tryRuleParse("帮助");
    expect(r?.intent).toEqual({ intent: "HELP" });
    expect(r?.confidence).toBe("high");
  });

  it("手机号查找 → LEAD_LOOKUP", () => {
    const r = tryRuleParse("13800000001 是谁");
    expect(r?.intent).toMatchObject({ intent: "LEAD_LOOKUP", phone: "13800000001" });
  });

  it("超时数量 → METRIC_SINGLE overdueCount", () => {
    const r = tryRuleParse("现在有多少超时未跟进的线索");
    expect(r?.intent).toMatchObject({ intent: "METRIC_SINGLE", metric: "overdueCount" });
  });

  it("各状态 → STATUS_BREAKDOWN", () => {
    const r = tryRuleParse("各状态线索分别有多少");
    expect(r?.intent.intent).toBe("STATUS_BREAKDOWN");
  });

  it("渠道 SQL 排名 → CHANNEL_SQL_RATE_RANK", () => {
    const r = tryRuleParse("本周哪个渠道 SQL 转化率最高");
    expect(r?.intent).toMatchObject({
      intent: "CHANNEL_SQL_RATE_RANK",
      timeRange: "this_week",
    });
  });

  it("加微率排名 → CHANNEL_METRIC_RANK", () => {
    const r = tryRuleParse("哪个渠道加微率最好");
    expect(r?.intent).toMatchObject({
      intent: "CHANNEL_METRIC_RANK",
      metric: "wechatRate",
    });
  });

  it("无关问题 → null", () => {
    expect(tryRuleParse("今天天气怎么样")).toBeNull();
  });
});
