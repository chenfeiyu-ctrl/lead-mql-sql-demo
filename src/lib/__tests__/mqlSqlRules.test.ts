import { describe, it, expect } from "vitest";
import { validateMql, validateSql, validateMqlEligibility, validateSqlEligibility, MIN_REASON_LEN } from "../mqlSqlRules";
import type { LeadWithRuleContext } from "../mqlSqlRules";
import type { FollowUpRecord, CallRecord, LeadStatusLog } from "@prisma/client";

function lead(over: Partial<LeadWithRuleContext> = {}): LeadWithRuleContext {
  const followUp: FollowUpRecord = {
    id: "f1",
    leadId: "l1",
    ownerId: "s1",
    content: "跟进",
    intentionLevel: "HIGH",
    nextAction: null,
    nextFollowUpAt: null,
    createdAt: new Date(),
  };
  const call: CallRecord = {
    id: "c1",
    leadId: "l1",
    callAttemptNo: 1,
    callStatus: "CONNECTED",
    connected: true,
    result: null,
    invalidReason: null,
    sourceSystem: null,
    externalEventId: null,
    calledAt: new Date(),
    operatorId: null,
    remark: null,
    createdAt: new Date(),
  };
  const log: LeadStatusLog = {
    id: "log1",
    leadId: "l1",
    fromStatus: "CALLING",
    toStatus: "VALID",
    operatorId: null,
    triggerSource: "MANUAL",
    reason: null,
    relatedRecordType: null,
    relatedRecordId: null,
    createdAt: new Date(),
  };
  return {
    id: "l1",
    mainStatus: "FOLLOWING",
    wechatStatus: "ADDED",
    ownerId: "s1",
    followUpRecords: [followUp],
    callRecords: [call],
    statusLogs: [log],
    ...over,
  } as LeadWithRuleContext;
}

const goodReason = "客户明确预算与时间，需求匹配"; // ≥10 字

describe("validateMql 7 条硬校验", () => {
  it("满足全部条件 → ok", () => {
    const r = validateMql(lead(), goodReason);
    expect(r.ok).toBe(true);
    expect(r.reasons).toHaveLength(0);
    expect(r.checklist).toHaveLength(7);
  });

  it("非 FOLLOWING → 失败", () => {
    expect(validateMql(lead({ mainStatus: "VALID" }), goodReason).ok).toBe(false);
  });

  it("未加微 → 失败", () => {
    expect(validateMql(lead({ wechatStatus: "PENDING" }), goodReason).ok).toBe(false);
  });

  it("无跟进记录 → 失败", () => {
    expect(validateMql(lead({ followUpRecords: [] }), goodReason).ok).toBe(false);
  });

  it("无 owner → 失败", () => {
    expect(validateMql(lead({ ownerId: null }), goodReason).ok).toBe(false);
  });

  it("最近意向为 LOW → 失败", () => {
    const lowFollow: FollowUpRecord = { ...lead().followUpRecords![0], intentionLevel: "LOW" };
    const r = validateMql(lead({ followUpRecords: [lowFollow] }), goodReason);
    expect(r.ok).toBe(false);
  });

  it(`原因不足 ${MIN_REASON_LEN} 字 → 失败`, () => {
    expect(validateMql(lead(), "太短").ok).toBe(false);
  });

  it("历史从未有效/接通 → 「历史外呼有效」校验项为 false", () => {
    // 说明：FOLLOWING 等阶段有 pastValidStage 兜底会视为曾有效，
    // 故用非过阶段状态验证该项本身；整体 ok 亦为 false。
    const r = validateMql(
      lead({ mainStatus: "VALID", callRecords: [], statusLogs: [] }),
      goodReason
    );
    const item = r.checklist.find((c) => c.label.includes("历史外呼有效"));
    expect(item?.passed).toBe(false);
    expect(r.ok).toBe(false);
  });
});

describe("validateMqlEligibility 按钮前置（不含原因）", () => {
  it("全前置满足且无 mqlReason → ok=true", () => {
    const r = validateMqlEligibility(lead({ mqlReason: null }));
    expect(r.ok).toBe(true);
    expect(r.checklist).toHaveLength(6);
    expect(r.checklist.some((c) => c.label.includes("原因"))).toBe(false);
  });

  it("缺少跟进 → ok=false", () => {
    expect(validateMqlEligibility(lead({ followUpRecords: [] })).ok).toBe(false);
  });
});

describe("validateSqlEligibility 按钮前置（不含原因）", () => {
  it("MQL + owner 且无 sqlReason → ok=true", () => {
    const r = validateSqlEligibility(lead({ mainStatus: "MQL", sqlReason: null }));
    expect(r.ok).toBe(true);
    expect(r.checklist).toHaveLength(2);
  });

  it("非 MQL → ok=false", () => {
    expect(validateSqlEligibility(lead({ mainStatus: "FOLLOWING" })).ok).toBe(false);
  });
});

describe("validateSql 3 条硬校验", () => {
  it("MQL + owner + 原因充分 → ok", () => {
    const r = validateSql(lead({ mainStatus: "MQL" }), goodReason);
    expect(r.ok).toBe(true);
    expect(r.checklist).toHaveLength(3);
  });

  it("非 MQL → 失败", () => {
    expect(validateSql(lead({ mainStatus: "FOLLOWING" }), goodReason).ok).toBe(false);
  });

  it("无 owner → 失败", () => {
    expect(validateSql(lead({ mainStatus: "MQL", ownerId: null }), goodReason).ok).toBe(false);
  });

  it("原因不足 → 失败", () => {
    expect(validateSql(lead({ mainStatus: "MQL" }), "短").ok).toBe(false);
  });
});
