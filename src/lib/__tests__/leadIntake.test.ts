import { describe, expect, it, vi } from "vitest";
import { intakeLeadTx } from "../leadIntake";

function createTx(initialLead: Record<string, unknown> | null) {
  let lead: Record<string, unknown> | null = initialLead
    ? {
        version: 1,
        mainStatus: "INVALID",
        callStatus: "REJECTED",
        wechatStatus: "NOT_STARTED",
        followStatus: "NOT_FOLLOWED",
        invalidReason: "REJECTED",
        ownerId: "sales_1",
        assignedAt: new Date("2026-06-01T00:00:00.000Z"),
        ...initialLead,
      }
    : null;
  const duplicateRecords: Array<Record<string, unknown>> = [];
  const statusLogs: Array<Record<string, unknown>> = [];
  const tasks: Array<Record<string, unknown>> = initialLead?.tasks
    ? [...(initialLead.tasks as Record<string, unknown>[])]
    : [];

  return {
    lead: {
      findFirst: vi.fn(async () => (lead ? { ...lead } : null)),
      findUnique: vi.fn(async () => (lead ? { ...lead } : null)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        lead = { id: "new_lead", version: 1, ...data };
        return { ...lead };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        lead = { ...lead, ...data };
        return { ...lead };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { version: number }; data: Record<string, unknown> }) => {
        if (!lead || where.version !== lead.version) return { count: 0 };
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
    duplicateRecord: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const record = { id: `dup_${duplicateRecords.length + 1}`, ...data };
        duplicateRecords.push(record);
        return record;
      }),
    },
    leadStatusLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const log = { id: `log_${statusLogs.length + 1}`, ...data };
        statusLogs.push(log);
        return log;
      }),
    },
    task: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { leadId?: string; status?: string };
          data: Record<string, unknown>;
        }) => {
          let count = 0;
          for (const t of tasks) {
            if (where.leadId && t.leadId !== where.leadId) continue;
            if (where.status && t.status !== where.status) continue;
            Object.assign(t, data);
            count++;
          }
          return { count };
        }
      ),
    },
    getLead: () => lead,
    getDuplicateRecords: () => duplicateRecords,
    getStatusLogs: () => statusLogs,
    getTasks: () => tasks,
  };
}

describe("intakeLeadTx", () => {
  it("新手机号创建 TO_CALL 线索", async () => {
    const tx = createTx(null);

    const result = await intakeLeadTx(tx as never, {
      phone: "13800000001",
      source: "manual",
      channel: "抖音",
      triggerSource: "MANUAL",
    });

    expect(result.outcome).toBe("created");
    expect(tx.getLead()?.mainStatus).toBe("TO_CALL");
    expect(tx.getStatusLogs()[0]).toMatchObject({
      fromStatus: "NEW",
      toStatus: "TO_CALL",
    });
  });

  it("INVALID 重复进线会重新激活至 TO_CALL 并重置负责人/SLA 字段", async () => {
    const tx = createTx({
      id: "lead_1",
      phone: "13800000001",
      mainStatus: "INVALID",
      callAttemptCount: 3,
      tasks: [
        { id: "t1", leadId: "lead_1", status: "OPEN", taskType: "OVERDUE_FOLLOW_UP" },
        { id: "t2", leadId: "lead_1", status: "RESOLVED", taskType: "UNASSIGNED" },
      ],
    });

    const result = await intakeLeadTx(tx as never, {
      phone: "13800000001",
      source: "ad_platform",
      channel: "小红书",
      triggerSource: "IMPORT",
      operatorId: "op_1",
    });

    expect(result.outcome).toBe("reactivated");
    expect(tx.getLead()).toMatchObject({
      mainStatus: "TO_CALL",
      latestSource: "ad_platform",
      latestChannel: "小红书",
      invalidReason: null,
      ownerId: null,
      assignedAt: null,
      callAttemptCount: 0,
      lastFollowUpAt: null,
      firstFollowUpAt: null,
    });
    expect(tx.getDuplicateRecords()[0]).toMatchObject({ action: "REACTIVATE" });
    expect(tx.getStatusLogs()[0]).toMatchObject({
      fromStatus: "INVALID",
      toStatus: "TO_CALL",
      relatedRecordType: "duplicate_record",
      relatedRecordId: "dup_1",
    });
    expect(tx.getTasks()[0]).toMatchObject({ status: "RESOLVED", resolvedBy: "op_1" });
    expect(tx.getTasks()[1]).toMatchObject({ status: "RESOLVED" });
  });

  it("CLOSED 重复进线会重新激活至 TO_CALL", async () => {
    const tx = createTx({ id: "lead_1", phone: "13800000001", mainStatus: "CLOSED" });

    const result = await intakeLeadTx(tx as never, {
      phone: "13800000001",
      source: "csv_import",
      channel: "百度",
      triggerSource: "IMPORT",
    });

    expect(result.outcome).toBe("reactivated");
    expect(tx.getLead()).toMatchObject({ mainStatus: "TO_CALL", latestChannel: "百度" });
    expect(tx.getStatusLogs()[0]).toMatchObject({ fromStatus: "CLOSED", toStatus: "TO_CALL" });
  });
});
