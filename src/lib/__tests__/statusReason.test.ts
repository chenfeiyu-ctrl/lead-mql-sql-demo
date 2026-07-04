import { describe, it, expect } from "vitest";
import { resolveInvalidStatusReason } from "../statusReason";

describe("resolveInvalidStatusReason", () => {
  it("补充说明为空时用无效原因标签", () => {
    expect(resolveInvalidStatusReason(null, "INVALID_PHONE")).toBe("空号/号码错误");
    expect(resolveInvalidStatusReason("  ", "NO_DEMAND")).toBe("无需求");
    expect(resolveInvalidStatusReason("客户明确拒绝", "REJECTED")).toBe("客户明确拒绝");
  });
});
