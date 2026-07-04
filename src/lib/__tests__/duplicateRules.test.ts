import { describe, it, expect } from "vitest";
import { normalizePhone, isValidPhone, suggestAction } from "../duplicateRules";

describe("手机号规范化与校验", () => {
  it("去除空格/横线/括号", () => {
    expect(normalizePhone(" 138-0000 (0001) ")).toBe("13800000001");
  });

  it("合法 11 位手机号", () => {
    expect(isValidPhone("13800000001")).toBe(true);
    expect(isValidPhone("138 0000 0001")).toBe(true);
  });

  it("非法号码", () => {
    expect(isValidPhone("023800000001")).toBe(false); // 非 1 开头
    expect(isValidPhone("1380000")).toBe(false); // 位数不足
    expect(isValidPhone("abcdefghijk")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });
});

describe("去重动作建议", () => {
  it("原线索无效 → REACTIVATE", () => {
    expect(suggestAction("INVALID").suggestion).toBe("REACTIVATE");
  });

  it("原线索关闭 → REACTIVATE", () => {
    expect(suggestAction("CLOSED").suggestion).toBe("REACTIVATE");
  });

  it("原线索高价值 MQL/SQL → IGNORE（不抢归属）", () => {
    expect(suggestAction("MQL").suggestion).toBe("IGNORE");
    expect(suggestAction("SQL").suggestion).toBe("IGNORE");
  });

  it("处理中 → MERGE_SOURCE", () => {
    expect(suggestAction("FOLLOWING").suggestion).toBe("MERGE_SOURCE");
    expect(suggestAction("TO_CALL").suggestion).toBe("MERGE_SOURCE");
  });
});
