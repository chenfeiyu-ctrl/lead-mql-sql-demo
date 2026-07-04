import { describe, it, expect, vi } from "vitest";
import { changeStatusTx, resolveWechatIssueTx } from "../leadService";

describe("changeStatusTx INVALID", () => {
  it("reason 已兜底 → 成功写入日志", async () => {
    const lead = {
      id: "lead1",
      mainStatus: "CALLING",
      wechatStatus: "NOT_STARTED",
      ownerId: "sales1",
      version: 1,
    };
    const tx = {
      lead: {
        findUnique: vi.fn(async () => lead),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      leadStatusLog: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      },
    };
    await changeStatusTx(tx as never, {
      leadId: "lead1",
      to: "INVALID",
      triggerSource: "MANUAL",
      reason: "空号/号码错误",
      leadData: { invalidReason: "INVALID_PHONE" },
    });
    expect(tx.leadStatusLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toStatus: "INVALID", reason: "空号/号码错误" }),
      })
    );
  });

  it("reason 为空 → PRECONDITION_FAILED", async () => {
    const lead = {
      id: "lead1",
      mainStatus: "CALLING",
      wechatStatus: "NOT_STARTED",
      ownerId: "sales1",
      version: 1,
    };
    const tx = {
      lead: { findUnique: vi.fn(async () => lead), updateMany: vi.fn() },
      leadStatusLog: { create: vi.fn() },
    };
    await expect(
      changeStatusTx(tx as never, {
        leadId: "lead1",
        to: "INVALID",
        triggerSource: "MANUAL",
        reason: "",
        leadData: { invalidReason: "INVALID_PHONE" },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

function createWechatTx(initial: Record<string, unknown>) {
  let lead: Record<string, unknown> = {
    id: "lead1",
    mainStatus: "TO_ADD_WECHAT",
    wechatStatus: "FAILED",
    followStatus: "NOT_FOLLOWED",
    ownerId: "sales1",
    version: 1,
    ...initial,
  };
  const statusLogs: Array<Record<string, unknown>> = [];
  const taskUpdates: Array<Record<string, unknown>> = [];

  return {
    lead: {
      findUnique: vi.fn(async () => ({ ...lead })),
      updateMany: vi.fn(async ({ where, data }: { where: { version: number }; data: Record<string, unknown> }) => {
        if (where.version !== lead.version) return { count: 0 };
        const next = { ...lead };
        for (const [key, val] of Object.entries(data)) {
          if (val && typeof val === "object" && "increment" in val) {
            next[key] = (next[key] as number) + (val as { increment: number }).increment;
          } else {
            next[key] = val;
          }
        }
        lead = next;
        return { count: 1 };
      }),
    },
    leadStatusLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        statusLogs.push(data);
        return { id: `log${statusLogs.length}`, ...data };
      }),
    },
    task: {
      updateMany: vi.fn(async (args: Record<string, unknown>) => {
        taskUpdates.push(args);
        return { count: 1 };
      }),
    },
    getLead: () => lead,
    getLogs: () => statusLogs,
    getTaskUpdates: () => taskUpdates,
  };
}

describe("resolveWechatIssueTx", () => {
  it("通用状态变更仍禁止加微失败后直接关闭", async () => {
    const tx = createWechatTx({});
    await expect(
      changeStatusTx(tx as never, {
        leadId: "lead1",
        to: "CLOSED",
        triggerSource: "MANUAL",
        reason: "加不上微信，关闭",
      })
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("通用状态变更仍禁止客户拒绝加微后直接关闭", async () => {
    const tx = createWechatTx({ wechatStatus: "REJECTED" });
    await expect(
      changeStatusTx(tx as never, {
        leadId: "lead1",
        to: "CLOSED",
        triggerSource: "MANUAL",
        reason: "客户拒绝加微",
      })
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("RETRY 将加微状态改回 PENDING 并关闭 WECHAT_FAILED 待办", async () => {
    const tx = createWechatTx({});
    await resolveWechatIssueTx(tx as never, {
      leadId: "lead1",
      action: "RETRY",
      operatorId: "op1",
      expectedVersion: 1,
    });

    expect(tx.getLead()).toMatchObject({ mainStatus: "TO_ADD_WECHAT", wechatStatus: "PENDING" });
    expect(tx.getTaskUpdates()[0]).toMatchObject({
      where: { leadId: "lead1", taskType: "WECHAT_FAILED", status: "OPEN" },
      data: expect.objectContaining({ status: "RESOLVED", resolvedBy: "op1" }),
    });
  });

  it("CLOSE 允许人工确认后关闭并写状态日志、关闭待办", async () => {
    const tx = createWechatTx({ wechatStatus: "REJECTED" });
    await resolveWechatIssueTx(tx as never, {
      leadId: "lead1",
      action: "CLOSE",
      closeReason: "客户明确拒绝继续推进",
      remark: "客户表示不需要，不希望继续联系",
      operatorId: "op1",
      expectedVersion: 1,
    });

    expect(tx.getLead()).toMatchObject({ mainStatus: "CLOSED", followStatus: "CLOSED" });
    expect(tx.getLogs()[0]).toMatchObject({
      fromStatus: "TO_ADD_WECHAT",
      toStatus: "CLOSED",
      reason: expect.stringContaining("客户明确拒绝继续推进"),
    });
    expect(tx.getTaskUpdates()[0]).toMatchObject({
      where: { leadId: "lead1", taskType: "WECHAT_FAILED", status: "OPEN" },
    });
  });

  it("CLOSE 缺少人工复核说明会拒绝", async () => {
    const tx = createWechatTx({});
    await expect(
      resolveWechatIssueTx(tx as never, {
        leadId: "lead1",
        action: "CLOSE",
        closeReason: "无法建立私域联系",
        remark: "",
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
