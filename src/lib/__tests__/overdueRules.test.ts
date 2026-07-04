import { describe, it, expect } from "vitest";
import { evaluateOverdue, inOverdueScope, OVERDUE_MS } from "../overdueRules";
import type { Lead } from "@prisma/client";

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    mainStatus: "FOLLOWING",
    ownerId: "s1",
    assignedAt: null,
    lastFollowUpAt: null,
    ...over,
  } as Lead;
}

const NOW = new Date("2026-07-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);

describe("超时范围", () => {
  it("仅待加微/已加微/跟进中在范围内", () => {
    expect(inOverdueScope("TO_ADD_WECHAT")).toBe(true);
    expect(inOverdueScope("WECHAT_ADDED")).toBe(true);
    expect(inOverdueScope("FOLLOWING")).toBe(true);
    expect(inOverdueScope("TO_CALL")).toBe(false);
    expect(inOverdueScope("MQL")).toBe(false);
  });
});

describe("evaluateOverdue", () => {
  it("范围外 → 全部 false", () => {
    const r = evaluateOverdue(lead({ mainStatus: "TO_CALL" }), NOW);
    expect(r.inScope).toBe(false);
    expect(r.isOverdue).toBe(false);
  });

  it("范围内但无 owner → isUnassigned", () => {
    const r = evaluateOverdue(lead({ ownerId: null, mainStatus: "TO_ADD_WECHAT" }), NOW);
    expect(r.isUnassigned).toBe(true);
    expect(r.isOverdue).toBe(false);
  });

  it("已分配未跟进，超 48h（以 assigned_at 起算）→ overdue", () => {
    const r = evaluateOverdue(lead({ assignedAt: hoursAgo(49) }), NOW);
    expect(r.isOverdue).toBe(true);
    expect(r.startAt?.getTime()).toBe(hoursAgo(49).getTime());
  });

  it("已分配未跟进，未超 48h → 不 overdue", () => {
    const r = evaluateOverdue(lead({ assignedAt: hoursAgo(10) }), NOW);
    expect(r.isOverdue).toBe(false);
  });

  it("有跟进记录时以 last_follow_up_at 起算（优先于 assigned_at）", () => {
    const r = evaluateOverdue(
      lead({ assignedAt: hoursAgo(100), lastFollowUpAt: hoursAgo(10) }),
      NOW
    );
    expect(r.isOverdue).toBe(false);
    expect(r.startAt?.getTime()).toBe(hoursAgo(10).getTime());
  });

  it("边界：恰好 48h 不算超时，>48h 才超时", () => {
    const exactly = new Date(NOW.getTime() - OVERDUE_MS);
    expect(evaluateOverdue(lead({ assignedAt: exactly }), NOW).isOverdue).toBe(false);
    const justOver = new Date(NOW.getTime() - OVERDUE_MS - 1000);
    expect(evaluateOverdue(lead({ assignedAt: justOver }), NOW).isOverdue).toBe(true);
  });
});
