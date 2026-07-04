import { describe, it, expect, vi, beforeEach } from "vitest";

const computeFunnel = vi.fn();
const computeFunnelByChannel = vi.fn();
const queryLeads = vi.fn();
const findFirst = vi.fn();
const leadFindMany = vi.fn();
const groupBy = vi.fn();

vi.mock("../../metrics", () => ({
  computeFunnel: (...a: unknown[]) => computeFunnel(...a),
  computeFunnelByChannel: (...a: unknown[]) => computeFunnelByChannel(...a),
}));
vi.mock("../../leadQuery", () => ({
  queryLeads: (...a: unknown[]) => queryLeads(...a),
  buildLeadWhere: (f: Record<string, unknown>) => {
    const w: Record<string, unknown> = {};
    if (f.mainStatus) w.mainStatus = f.mainStatus;
    if (f.channel) w.channel = f.channel;
    if (f.source) w.source = f.source;
    if (f.ownerId) w.ownerId = f.ownerId;
    return w;
  },
}));
vi.mock("../../prisma", () => ({
  prisma: {
    lead: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      findMany: (...a: unknown[]) => leadFindMany(...a),
      groupBy: (...a: unknown[]) => groupBy(...a),
    },
  },
}));

import { executeIntent } from "../execute";

const funnelFixture = {
  counts: { total: 100, called: 80, valid: 60, wechatAdded: 40, mql: 20, sql: 10 },
  rates: {
    calledRate: 80,
    validRate: 75,
    wechatRate: 66.7,
    mqlRate: 50,
    sqlRate: 50,
    overallSqlRate: 10,
  },
  avgResponseHours: 5.2,
  exceptions: { overdue: 3, unassigned: 2 },
  formulas: {
    wechatRate: "加微率 = 已加微线索数 ÷ 有效线索数",
    overallSqlRate: "整体 SQL 转化率 = 有效 SQL 数 ÷ 总线索数",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  computeFunnel.mockResolvedValue(funnelFixture);
});

describe("executeIntent", () => {
  it("METRIC_SINGLE wechatRate → 百分比回答", async () => {
    const r = await executeIntent({ intent: "METRIC_SINGLE", metric: "wechatRate", filters: { channel: "抖音" } });
    expect(r.data).toMatchObject({ metric: "wechatRate", value: 66.7 });
    expect(r.answer).toContain("66.7%");
    expect(computeFunnel).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "抖音" })
    );
  });

  it("METRIC_SINGLE overdueCount → 计数", async () => {
    const r = await executeIntent({ intent: "METRIC_SINGLE", metric: "overdueCount" });
    expect(r.data).toMatchObject({ value: 3 });
  });

  it("CHANNEL_SQL_RATE_RANK → 返回排名第一", async () => {
    computeFunnelByChannel.mockResolvedValue([
      { channel: "抖音", totalLeads: 50, mqlCount: 10, sqlCount: 8, overallSqlRate: 16, mqlToSqlRate: 80 },
      { channel: "百度", totalLeads: 50, mqlCount: 5, sqlCount: 2, overallSqlRate: 4, mqlToSqlRate: 40 },
    ]);
    const r = await executeIntent({ intent: "CHANNEL_SQL_RATE_RANK", timeRange: "this_week" });
    expect(r.answer).toContain("抖音");
    expect(r.answer).toContain("16%");
  });

  it("CHANNEL_METRIC_RANK → 按加微率排名", async () => {
    computeFunnelByChannel.mockResolvedValue([
      {
        channel: "抖音",
        totalLeads: 50,
        valid: 40,
        wechatAdded: 30,
        mqlCount: 10,
        sqlCount: 8,
        overallSqlRate: 16,
        wechatRate: 75,
        mqlRate: 33,
        mqlToSqlRate: 80,
        validRate: 80,
      },
      {
        channel: "百度",
        totalLeads: 50,
        valid: 30,
        wechatAdded: 10,
        mqlCount: 5,
        sqlCount: 2,
        overallSqlRate: 4,
        wechatRate: 33,
        mqlRate: 50,
        mqlToSqlRate: 40,
        validRate: 60,
      },
    ]);
    const r = await executeIntent({
      intent: "CHANNEL_METRIC_RANK",
      metric: "wechatRate",
      timeRange: "this_week",
    });
    expect(r.answer).toContain("抖音");
    expect(r.answer).toContain("75%");
  });

  it("STATUS_BREAKDOWN → 状态分布", async () => {
    groupBy.mockResolvedValue([
      { mainStatus: "FOLLOWING", _count: { _all: 5 } },
      { mainStatus: "MQL", _count: { _all: 3 } },
    ]);
    const r = await executeIntent({ intent: "STATUS_BREAKDOWN" });
    expect(r.answer).toContain("跟进中");
    expect(r.data).toMatchObject({ total: 8 });
  });

  it("HELP → 返回示例", async () => {
    const r = await executeIntent({ intent: "HELP" });
    expect(r.answer).toContain("漏斗");
  });

  it("LEAD_LIST → 映射到 queryLeads 并脱敏", async () => {
    queryLeads.mockResolvedValue({
      total: 1,
      page: 1,
      pageSize: 20,
      items: [
        { id: "l1", name: "张三", phone: "13800000001", mainStatus: "FOLLOWING", channel: "抖音", source: "广告投放", owner: { name: "李销售" } },
      ],
    });
    const r = await executeIntent({ intent: "LEAD_LIST", mainStatus: "FOLLOWING", channel: "抖音" });
    expect(queryLeads).toHaveBeenCalledWith(
      expect.objectContaining({ mainStatus: "FOLLOWING", channel: "抖音" })
    );
    const data = r.data as { items: { phone: string; owner: string | null }[] };
    expect(data.items[0].phone).not.toBe("13800000001"); // 已脱敏
    expect(data.items[0].owner).toBe("李销售");
  });

  it("LEAD_LOOKUP 命中 → 返回单线索", async () => {
    findFirst.mockResolvedValue({
      id: "l1",
      name: "张三",
      phone: "13800000001",
      mainStatus: "MQL",
      channel: "抖音",
      source: "广告投放",
      owner: { name: "李销售" },
    });
    const r = await executeIntent({ intent: "LEAD_LOOKUP", phone: "13800000001" });
    expect(r.answer).toContain("张三");
    expect(r.answer).toContain("营销认可(MQL)");
  });

  it("LEAD_LOOKUP 未命中 → 提示", async () => {
    findFirst.mockResolvedValue(null);
    const r = await executeIntent({ intent: "LEAD_LOOKUP", phone: "00000000000" });
    expect(r.answer).toContain("未找到");
  });

  it("UNSUPPORTED → 引导示例", async () => {
    const r = await executeIntent({ intent: "UNSUPPORTED", reason: "无关" });
    expect(r.data).toBeNull();
    expect(r.answer).toContain("无法理解");
  });
});
