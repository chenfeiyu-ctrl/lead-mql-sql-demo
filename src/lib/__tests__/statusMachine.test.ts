import { describe, it, expect } from "vitest";
import {
  isTransitionAllowed,
  allowedNextStatuses,
  isReasonRequired,
  isOwnerRequired,
  ALLOWED_TRANSITIONS,
} from "../statusMachine";
import type { MainStatus } from "../types";

describe("statusMachine 流转白名单", () => {
  it("允许的合法流转", () => {
    expect(isTransitionAllowed("NEW", "TO_CALL")).toBe(true);
    expect(isTransitionAllowed("CALLING", "VALID")).toBe(true);
    expect(isTransitionAllowed("FOLLOWING", "MQL")).toBe(true);
    expect(isTransitionAllowed("MQL", "SQL")).toBe(true);
    expect(isTransitionAllowed("SQL", "MQL")).toBe(true); // 撤回
  });

  it("拒绝非法「跳变」流转", () => {
    expect(isTransitionAllowed("INVALID", "SQL")).toBe(false); // 无效直转 SQL
    expect(isTransitionAllowed("TO_CALL", "VALID")).toBe(false); // 必须经 CALLING
    expect(isTransitionAllowed("NEW", "MQL")).toBe(false);
    expect(isTransitionAllowed("VALID", "MQL")).toBe(false);
  });

  it("每个状态的白名单都不含自身（无自环）", () => {
    (Object.keys(ALLOWED_TRANSITIONS) as MainStatus[]).forEach((s) => {
      expect(allowedNextStatuses(s)).not.toContain(s);
    });
  });

  it("INVALID / CLOSED 必须填原因", () => {
    expect(isReasonRequired("INVALID")).toBe(true);
    expect(isReasonRequired("CLOSED")).toBe(true);
    expect(isReasonRequired("VALID")).toBe(false);
    expect(isReasonRequired("MQL")).toBe(false);
  });

  it("TO_ADD_WECHAT 及之后阶段要求 owner", () => {
    expect(isOwnerRequired("TO_ADD_WECHAT")).toBe(true);
    expect(isOwnerRequired("WECHAT_ADDED")).toBe(true);
    expect(isOwnerRequired("MQL")).toBe(true);
    expect(isOwnerRequired("SQL")).toBe(true);
    expect(isOwnerRequired("NEW")).toBe(false);
    expect(isOwnerRequired("TO_CALL")).toBe(false);
    expect(isOwnerRequired("VALID")).toBe(false);
  });
});
