import { describe, it, expect, vi } from "vitest";
import { applyCallResultTx } from "../leadService";
import type { MainStatus } from "../types";

function createTx(initial: Record<string, unknown>) {
  let lead: Record<string, unknown> = {
    callAttemptCount: 0,
    version: 1,
    wechatStatus: "NOT_STARTED",
    ownerId: "s1",
    ...initial,
  };
  const statusLogs: Array<Record<string, unknown>> = [];

  const tx = {
    lead: {
      findUnique: vi.fn(async () => ({ ...lead })),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; version: number }; data: Record<string, unknown> }) => {
        if (where.version !== lead.version) return { count: 0 };
        const next: Record<string, unknown> = { ...lead };
        for (const [key, val] of Object.entries(data)) {
          if (val && typeof val === "object" && "increment" in (val as object)) {
            next[key] = (lead[key] as number) + (val as { increment: number }).increment;
          } else {
            next[key] = val;
          }
        }
        lead = next;
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        lead = { ...lead, ...data };
        if (data.version && typeof data.version === "object" && "increment" in data.version) {
          lead.version = (lead.version as number) + 1;
        }
        return lead;
      }),
    },
    callRecord: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "call1", ...data })),
    },
    leadStatusLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        statusLogs.push(data);
        return { id: `log${statusLogs.length}`, ...data };
      }),
    },
    task: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "task1", ...data })),
    },
    getLead: () => lead,
    getLogs: () => statusLogs,
  };
  return tx;
}

describe("applyCallResultTx", () => {
  it("TO_CALL + CONNECTED → 经 CALLING 桥接到 VALID", async () => {
    const tx = createTx({ id: "l1", mainStatus: "TO_CALL" });
    await applyCallResultTx(tx as never, "l1", {
      callStatus: "CONNECTED",
      connected: true,
      result: "HAS_DEMAND",
      triggerSource: "MANUAL",
    });
    expect(tx.getLead().mainStatus).toBe("VALID");
    expect(tx.getLogs().map((l) => l.toStatus)).toEqual(["CALLING", "VALID"]);
  });

  it("CONNECTED + result=NO_DEMAND → INVALID", async () => {
    const tx = createTx({ id: "l1", mainStatus: "TO_CALL" });
    await applyCallResultTx(tx as never, "l1", {
      callStatus: "CONNECTED",
      connected: true,
      result: "NO_DEMAND",
      triggerSource: "CALL_CALLBACK",
    });
    expect(tx.getLead().mainStatus).toBe("INVALID");
    expect(tx.getLead().invalidReason).toBe("NO_DEMAND");
  });

  it("NOT_CONNECTED → TO_CALL 且 call_attempt_count +1", async () => {
    const tx = createTx({ id: "l1", mainStatus: "CALLING", callAttemptCount: 2 });
    await applyCallResultTx(tx as never, "l1", {
      callStatus: "NOT_CONNECTED",
      connected: false,
      triggerSource: "MANUAL",
    });
    expect(tx.getLead().mainStatus).toBe("TO_CALL");
    expect(tx.getLead().callAttemptCount).toBe(3);
    expect(tx.getLogs().map((l) => `${l.fromStatus}->${l.toStatus}`)).toEqual(["CALLING->TO_CALL"]);
  });

  it("NOT_CONNECTED from TO_CALL 不写状态日志（主状态未实质变化）", async () => {
    const tx = createTx({ id: "l1", mainStatus: "TO_CALL", callAttemptCount: 1 });
    await applyCallResultTx(tx as never, "l1", {
      callStatus: "NOT_CONNECTED",
      connected: false,
      triggerSource: "MANUAL",
    });
    expect(tx.getLead().mainStatus).toBe("TO_CALL");
    expect(tx.getLead().callAttemptCount).toBe(2);
    expect(tx.getLogs()).toHaveLength(0);
  });

  it("CALLBACK_FAILED → 主状态不变并创建待办", async () => {
    const tx = createTx({ id: "l1", mainStatus: "TO_CALL" });
    await applyCallResultTx(tx as never, "l1", {
      callStatus: "CALLBACK_FAILED",
      triggerSource: "CALL_CALLBACK",
    });
    expect(tx.getLead().mainStatus).toBe("TO_CALL");
    expect(tx.task.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ taskType: "CALLBACK_FAILED" }) })
    );
  });
});
