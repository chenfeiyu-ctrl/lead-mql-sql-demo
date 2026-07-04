import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------- 时间工具 ----------
const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => hoursAgo(d * 24);

// ---------- 类型（与 src/lib/types.ts 一致） ----------
type MainStatus =
  | "NEW" | "TO_CALL" | "CALLING" | "VALID" | "INVALID"
  | "TO_ADD_WECHAT" | "WECHAT_ADDED" | "FOLLOWING" | "MQL" | "SQL" | "CLOSED";

interface LeadSpec {
  name: string;
  phone: string;
  source: string;
  channel: string;
  leadLevel?: string;
  mainStatus: MainStatus;
  callStatus?: string;
  wechatStatus?: string;
  followStatus?: string;
  ownerId?: string | null;
  assignedAt?: Date | null;
  callAttemptCount?: number;
  lastFollowUpAt?: Date | null;
  firstFollowUpAt?: Date | null;
  mqlAt?: Date | null;
  mqlReason?: string | null;
  sqlAt?: Date | null;
  sqlReason?: string | null;
  sqlRevokedAt?: Date | null;
  sqlRevokeReason?: string | null;
  invalidReason?: string | null;
  createdAt?: Date;
  // 关联样本
  calls?: { callStatus: string; connected: boolean; result?: string; invalidReason?: string; calledAt: Date; attemptNo: number }[];
  followUps?: { content: string; intentionLevel: string; createdAt: Date }[];
  logs?: { from: MainStatus; to: MainStatus; reason?: string; trigger?: string; at: Date }[];
  tasks?: { taskType: string; title: string; status?: string; dueAt?: Date; createdAt?: Date }[];
}

async function main() {
  console.log("🌱 清空旧数据...");
  await prisma.integrationEventLog.deleteMany();
  await prisma.duplicateRecord.deleteMany();
  await prisma.task.deleteMany();
  await prisma.leadStatusLog.deleteMany();
  await prisma.followUpRecord.deleteMany();
  await prisma.callRecord.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.salesUser.deleteMany();

  console.log("👤 创建销售用户...");
  const users = await Promise.all([
    prisma.salesUser.create({ data: { id: "sales_001", name: "李销售", role: "SALES", department: "销售一部" } }),
    prisma.salesUser.create({ data: { id: "sales_002", name: "王销售", role: "SALES", department: "销售二部" } }),
    prisma.salesUser.create({ data: { id: "sales_003", name: "赵销售", role: "SALES", department: "销售一部" } }),
    prisma.salesUser.create({ data: { id: "sup_001", name: "张主管", role: "SUPERVISOR", department: "销售中心" } }),
    prisma.salesUser.create({ data: { id: "op_001", name: "刘运营", role: "OPERATOR", department: "市场运营" } }),
  ]);
  const [s1, s2, s3, sup] = users;

  // 导入批次（演示 CSV 历史）
  const batch = await prisma.importBatch.create({
    data: {
      filename: "sample_leads_20260628.csv",
      totalCount: 4,
      successCount: 2,
      duplicateCount: 1,
      failedCount: 1,
      status: "done",
      finishedAt: daysAgo(3),
      createdAt: daysAgo(3),
    },
  });

  console.log("📇 创建线索...");
  const specs: LeadSpec[] = [];
  let phoneSeq = 20000000;
  const nextPhone = () => `138${String(phoneSeq++).padStart(8, "0")}`;

  const channels = ["抖音", "百度", "公众号", "线下"];
  const pick = (i: number) => channels[i % channels.length];

  // --- NEW x2 ---
  specs.push({ name: "新线索甲", phone: nextPhone(), source: "广告投放", channel: "百度", mainStatus: "NEW", createdAt: hoursAgo(2) });
  specs.push({ name: "新线索乙", phone: nextPhone(), source: "表单提交", channel: "百度", mainStatus: "NEW", createdAt: hoursAgo(5) });

  // --- TO_CALL x6（含未分配 + 已分配） ---
  for (let i = 0; i < 6; i++) {
    specs.push({
      name: `待外呼${i + 1}`,
      phone: nextPhone(),
      source: "广告投放",
      channel: pick(i),
      mainStatus: "TO_CALL",
      ownerId: i < 2 ? s1.id : null,
      assignedAt: i < 2 ? hoursAgo(10) : null,
      createdAt: hoursAgo(12 + i),
      logs: [{ from: "NEW", to: "TO_CALL", trigger: "IMPORT", at: hoursAgo(12 + i) }],
    });
  }

  // --- CALLING x2 ---
  for (let i = 0; i < 2; i++) {
    specs.push({
      name: `外呼中${i + 1}`,
      phone: nextPhone(),
      source: "广告投放",
      channel: "抖音",
      mainStatus: "CALLING",
      callStatus: "CALLING",
      ownerId: s2.id,
      assignedAt: hoursAgo(6),
      createdAt: hoursAgo(8),
      calls: [{ callStatus: "CALLING", connected: false, calledAt: hoursAgo(1), attemptNo: 1 }],
      logs: [{ from: "TO_CALL", to: "CALLING", trigger: "MANUAL", at: hoursAgo(1) }],
    });
  }

  // --- VALID x4（部分无 owner） ---
  for (let i = 0; i < 4; i++) {
    specs.push({
      name: `有效线索${i + 1}`,
      phone: nextPhone(),
      source: "广告投放",
      channel: pick(i),
      mainStatus: "VALID",
      callStatus: "CONNECTED",
      ownerId: i < 2 ? s1.id : null,
      assignedAt: i < 2 ? hoursAgo(20) : null,
      createdAt: daysAgo(2),
      calls: [{ callStatus: "CONNECTED", connected: true, result: "有沟通价值", calledAt: hoursAgo(22), attemptNo: 1 }],
      logs: [
        { from: "TO_CALL", to: "CALLING", trigger: "MANUAL", at: hoursAgo(23) },
        { from: "CALLING", to: "VALID", trigger: "MANUAL", at: hoursAgo(22) },
      ],
    });
  }

  // --- INVALID x5（各 invalid_reason） ---
  const invalidReasons = ["INVALID_PHONE", "NO_DEMAND", "REJECTED", "NOT_TARGET_CUSTOMER", "UNREACHABLE"];
  invalidReasons.forEach((reason, i) => {
    specs.push({
      name: `无效线索${i + 1}`,
      phone: nextPhone(),
      source: "广告投放",
      channel: pick(i),
      mainStatus: "INVALID",
      callStatus: reason === "INVALID_PHONE" ? "INVALID_PHONE" : reason === "REJECTED" ? "REJECTED" : "CONNECTED",
      invalidReason: reason,
      createdAt: daysAgo(3),
      calls: [{ callStatus: reason === "INVALID_PHONE" ? "INVALID_PHONE" : "CONNECTED", connected: reason !== "INVALID_PHONE", invalidReason: reason, calledAt: daysAgo(3), attemptNo: 1 }],
      logs: [{ from: "CALLING", to: "INVALID", reason, trigger: "MANUAL", at: daysAgo(3) }],
    });
  });

  // --- TO_ADD_WECHAT x4（owner 必填；1 条超时、1 条加微失败） ---
  for (let i = 0; i < 4; i++) {
    const overdue = i === 0; // 超 48h 未跟进
    const wechatFail = i === 1;
    specs.push({
      name: `待加微${i + 1}`,
      phone: nextPhone(),
      source: "广告投放",
      channel: pick(i),
      mainStatus: "TO_ADD_WECHAT",
      callStatus: "CONNECTED",
      wechatStatus: wechatFail ? "FAILED" : "PENDING",
      ownerId: [s1.id, s2.id, s3.id, s1.id][i],
      assignedAt: overdue ? daysAgo(3) : hoursAgo(10),
      createdAt: daysAgo(4),
      calls: [{ callStatus: "CONNECTED", connected: true, calledAt: daysAgo(4), attemptNo: 1 }],
      logs: [{ from: "VALID", to: "TO_ADD_WECHAT", trigger: "MANUAL", at: overdue ? daysAgo(3) : hoursAgo(10) }],
      tasks: overdue
        ? [{ taskType: "OVERDUE_FOLLOW_UP", title: "待加微超 48h 未跟进", dueAt: daysAgo(1), createdAt: hoursAgo(2) }]
        : wechatFail
        ? [{ taskType: "WECHAT_FAILED", title: "加微失败，需重试", createdAt: hoursAgo(3) }]
        : undefined,
    });
  }

  // --- WECHAT_ADDED x4（1 条超时） ---
  for (let i = 0; i < 4; i++) {
    const overdue = i === 0;
    specs.push({
      name: `已加微${i + 1}`,
      phone: nextPhone(),
      source: "广告投放",
      channel: "百度",
      mainStatus: "WECHAT_ADDED",
      callStatus: "CONNECTED",
      wechatStatus: "ADDED",
      ownerId: [s1.id, s2.id, s3.id, s2.id][i],
      assignedAt: overdue ? daysAgo(4) : hoursAgo(20),
      createdAt: daysAgo(5),
      calls: [{ callStatus: "CONNECTED", connected: true, calledAt: daysAgo(5), attemptNo: 1 }],
      logs: [
        { from: "VALID", to: "TO_ADD_WECHAT", trigger: "MANUAL", at: daysAgo(5) },
        { from: "TO_ADD_WECHAT", to: "WECHAT_ADDED", trigger: "MANUAL", at: overdue ? daysAgo(4) : hoursAgo(20) },
      ],
      tasks: overdue ? [{ taskType: "OVERDUE_FOLLOW_UP", title: "已加微超 48h 未跟进", dueAt: daysAgo(2), createdAt: hoursAgo(1) }] : undefined,
    });
  }

  // --- FOLLOWING x6（有跟进；1 条超时；均 MQL 可转化候选） ---
  for (let i = 0; i < 6; i++) {
    const overdue = i === 5; // 最后一条超时
    const lastFollow = overdue ? daysAgo(3) : hoursAgo(6 + i);
    specs.push({
      name: `跟进中${i + 1}`,
      phone: nextPhone(),
      source: "广告投放",
      channel: pick(i),
      mainStatus: "FOLLOWING",
      callStatus: "CONNECTED",
      wechatStatus: "ADDED",
      followStatus: i === 4 ? "NURTURING" : "FOLLOWING",
      ownerId: [s1.id, s2.id, s3.id, s1.id, s2.id, s3.id][i],
      assignedAt: daysAgo(6),
      firstFollowUpAt: daysAgo(5),
      lastFollowUpAt: lastFollow,
      createdAt: daysAgo(7),
      calls: [{ callStatus: "CONNECTED", connected: true, calledAt: daysAgo(7), attemptNo: 1 }],
      followUps: [
        { content: "首次电话沟通，客户了解产品，意向中等", intentionLevel: "MEDIUM", createdAt: daysAgo(5) },
        { content: "微信跟进，客户询价，意向较高", intentionLevel: i === 4 ? "LOW" : "HIGH", createdAt: lastFollow },
      ],
      logs: [
        { from: "TO_ADD_WECHAT", to: "WECHAT_ADDED", trigger: "MANUAL", at: daysAgo(6) },
        { from: "WECHAT_ADDED", to: "FOLLOWING", trigger: "MANUAL", at: daysAgo(5) },
      ],
      tasks: overdue ? [{ taskType: "OVERDUE_FOLLOW_UP", title: "跟进中超 48h 未跟进", dueAt: daysAgo(1), createdAt: hoursAgo(1) }] : undefined,
    });
  }

  // --- MQL x8（mql_at 有值；含高价值重复手机号样本） ---
  for (let i = 0; i < 8; i++) {
    const mqlPhone = i === 0 ? "13800001001" : nextPhone(); // 重复样本
    specs.push({
      name: `MQL线索${i + 1}`,
      phone: mqlPhone,
      source: "广告投放",
      channel: pick(i),
      leadLevel: i < 3 ? "A" : "B",
      mainStatus: "MQL",
      callStatus: "CONNECTED",
      wechatStatus: "ADDED",
      followStatus: "FOLLOWED",
      ownerId: [s1.id, s2.id, s3.id][i % 3],
      assignedAt: daysAgo(9),
      firstFollowUpAt: daysAgo(8),
      lastFollowUpAt: daysAgo(2),
      mqlAt: daysAgo(2),
      mqlReason: "客户明确表达采购意向且预算匹配，已进入重点培育阶段",
      createdAt: daysAgo(10),
      calls: [{ callStatus: "CONNECTED", connected: true, calledAt: daysAgo(10), attemptNo: 1 }],
      followUps: [
        { content: "深入沟通需求，确认痛点", intentionLevel: "MEDIUM", createdAt: daysAgo(8) },
        { content: "客户索要方案报价，意向高", intentionLevel: "HIGH", createdAt: daysAgo(2) },
      ],
      logs: [
        { from: "WECHAT_ADDED", to: "FOLLOWING", trigger: "MANUAL", at: daysAgo(8) },
        { from: "FOLLOWING", to: "MQL", reason: "市场认可", trigger: "MANUAL", at: daysAgo(2) },
      ],
    });
  }

  // --- SQL x6（sql_at 有值；1 条已撤销演示；2 条可继续演示撤销） ---
  for (let i = 0; i < 6; i++) {
    const revoked = i === 0; // 已撤销样本
    specs.push({
      name: `SQL商机${i + 1}`,
      phone: nextPhone(),
      source: "广告投放",
      channel: pick(i),
      leadLevel: "A",
      mainStatus: revoked ? "MQL" : "SQL",
      callStatus: "CONNECTED",
      wechatStatus: "ADDED",
      followStatus: "FOLLOWED",
      ownerId: [s1.id, s2.id, s3.id][i % 3],
      assignedAt: daysAgo(12),
      firstFollowUpAt: daysAgo(11),
      lastFollowUpAt: daysAgo(3),
      mqlAt: daysAgo(5),
      mqlReason: "客户需求明确、预算充足，市场侧认可为高质量线索",
      sqlAt: revoked ? daysAgo(2) : daysAgo(1),
      sqlReason: "客户确认近期采购计划，进入商务谈判阶段",
      sqlRevokedAt: revoked ? hoursAgo(6) : null,
      sqlRevokeReason: revoked ? "复核发现客户为竞品调研，非真实商机，误标退回" : null,
      createdAt: daysAgo(13),
      calls: [{ callStatus: "CONNECTED", connected: true, calledAt: daysAgo(13), attemptNo: 1 }],
      followUps: [
        { content: "确认预算与决策链", intentionLevel: "HIGH", createdAt: daysAgo(11) },
        { content: "商务条款沟通", intentionLevel: "HIGH", createdAt: daysAgo(3) },
      ],
      logs: revoked
        ? [
            { from: "WECHAT_ADDED", to: "FOLLOWING", trigger: "MANUAL", at: daysAgo(11) },
            { from: "FOLLOWING", to: "MQL", reason: "市场认可", trigger: "MANUAL", at: daysAgo(5) },
            { from: "MQL", to: "SQL", reason: "销售认可", trigger: "MANUAL", at: daysAgo(2) },
            { from: "SQL", to: "MQL", reason: "复核发现客户为竞品调研，非真实商机，误标退回", trigger: "MANUAL", at: hoursAgo(6) },
          ]
        : [
            { from: "WECHAT_ADDED", to: "FOLLOWING", trigger: "MANUAL", at: daysAgo(11) },
            { from: "FOLLOWING", to: "MQL", reason: "市场认可", trigger: "MANUAL", at: daysAgo(5) },
            { from: "MQL", to: "SQL", reason: "销售认可", trigger: "MANUAL", at: daysAgo(1) },
          ],
    });
  }

  // --- CLOSED x3 ---
  const closeReasons = ["CUSTOMER_REJECTED", "LOST", "MISTAKE_ENTRY"];
  closeReasons.forEach((reason, i) => {
    specs.push({
      name: `已关闭${i + 1}`,
      phone: nextPhone(),
      source: "广告投放",
      channel: pick(i),
      mainStatus: "CLOSED",
      callStatus: "CONNECTED",
      wechatStatus: i === 2 ? "NOT_STARTED" : "ADDED",
      ownerId: i === 2 ? null : s1.id,
      createdAt: daysAgo(14),
      logs: [{ from: "FOLLOWING", to: "CLOSED", reason, trigger: "MANUAL", at: daysAgo(1) }],
    });
  });

  // ---------- 落库 ----------
  const phoneToLeadId = new Map<string, string>();
  for (const spec of specs) {
    const lead = await prisma.lead.create({
      data: {
        name: spec.name,
        phone: spec.phone,
        source: spec.source,
        channel: spec.channel,
        firstSource: spec.source,
        firstChannel: spec.channel,
        latestSource: spec.source,
        latestChannel: spec.channel,
        leadLevel: spec.leadLevel ?? "C",
        mainStatus: spec.mainStatus,
        callStatus: spec.callStatus ?? "NOT_CALLED",
        wechatStatus: spec.wechatStatus ?? "NOT_STARTED",
        followStatus: spec.followStatus ?? "NOT_FOLLOWED",
        ownerId: spec.ownerId ?? null,
        assignedAt: spec.assignedAt ?? null,
        callAttemptCount: spec.callAttemptCount ?? (spec.calls?.length ?? 0),
        lastFollowUpAt: spec.lastFollowUpAt ?? null,
        firstFollowUpAt: spec.firstFollowUpAt ?? null,
        mqlAt: spec.mqlAt ?? null,
        mqlReason: spec.mqlReason ?? null,
        sqlAt: spec.sqlAt ?? null,
        sqlReason: spec.sqlReason ?? null,
        sqlRevokedAt: spec.sqlRevokedAt ?? null,
        sqlRevokeReason: spec.sqlRevokeReason ?? null,
        invalidReason: spec.invalidReason ?? null,
        createdAt: spec.createdAt ?? now,
      },
    });
    phoneToLeadId.set(spec.phone, lead.id);

    if (spec.calls) {
      for (const c of spec.calls) {
        await prisma.callRecord.create({
          data: {
            leadId: lead.id,
            callAttemptNo: c.attemptNo,
            callStatus: c.callStatus,
            connected: c.connected,
            result: c.result ?? null,
            invalidReason: c.invalidReason ?? null,
            calledAt: c.calledAt,
            operatorId: spec.ownerId ?? "op_001",
          },
        });
      }
    }
    if (spec.followUps) {
      for (const f of spec.followUps) {
        await prisma.followUpRecord.create({
          data: {
            leadId: lead.id,
            ownerId: spec.ownerId ?? "sales_001",
            content: f.content,
            intentionLevel: f.intentionLevel,
            createdAt: f.createdAt,
          },
        });
      }
    }
    if (spec.logs) {
      for (const l of spec.logs) {
        await prisma.leadStatusLog.create({
          data: {
            leadId: lead.id,
            fromStatus: l.from,
            toStatus: l.to,
            reason: l.reason ?? null,
            triggerSource: l.trigger ?? "MANUAL",
            operatorId: spec.ownerId ?? "op_001",
            createdAt: l.at,
          },
        });
      }
    }
    if (spec.tasks) {
      for (const t of spec.tasks) {
        await prisma.task.create({
          data: {
            leadId: lead.id,
            taskType: t.taskType,
            title: t.title,
            status: t.status ?? "OPEN",
            dueAt: t.dueAt ?? null,
            createdAt: t.createdAt ?? now,
          },
        });
      }
    }
  }

  // ---------- 未分配异常任务（UNASSIGNED） ----------
  // 找 TO_ADD_WECHAT/WECHAT_ADDED/FOLLOWING 且无 owner 的线索（本 seed 中较少，构造 2 条）
  console.log("⚠️  创建未分配异常样本...");
  const unassignedLead1 = await prisma.lead.create({
    data: {
      name: "未分配待加微", phone: nextPhone(), source: "广告投放", channel: "抖音",
      firstSource: "广告投放", firstChannel: "抖音", latestSource: "广告投放", latestChannel: "抖音",
      mainStatus: "TO_ADD_WECHAT", callStatus: "CONNECTED", wechatStatus: "PENDING",
      ownerId: null, createdAt: daysAgo(2),
    },
  });
  await prisma.task.create({ data: { leadId: unassignedLead1.id, taskType: "UNASSIGNED", title: "待加微线索未分配负责人", status: "OPEN" } });

  const unassignedLead2 = await prisma.lead.create({
    data: {
      name: "未分配已加微", phone: nextPhone(), source: "广告投放", channel: "公众号",
      firstSource: "广告投放", firstChannel: "公众号", latestSource: "广告投放", latestChannel: "公众号",
      mainStatus: "WECHAT_ADDED", callStatus: "CONNECTED", wechatStatus: "ADDED",
      ownerId: null, createdAt: daysAgo(2),
    },
  });
  await prisma.task.create({ data: { leadId: unassignedLead2.id, taskType: "UNASSIGNED", title: "已加微线索未分配负责人", status: "OPEN" } });

  // 回传失败样本
  const cbFailLead = await prisma.lead.create({
    data: {
      name: "回传失败样本", phone: nextPhone(), source: "外呼系统", channel: "抖音",
      firstSource: "外呼系统", firstChannel: "抖音", latestSource: "外呼系统", latestChannel: "抖音",
      mainStatus: "TO_CALL", callStatus: "CALLBACK_FAILED", ownerId: null, createdAt: hoursAgo(4),
    },
  });
  await prisma.task.create({ data: { leadId: cbFailLead.id, taskType: "CALLBACK_FAILED", title: "外呼结果回传失败", status: "OPEN" } });

  // ---------- 重复手机号样本 ----------
  console.log("🔁 创建重复手机号记录...");
  // 1) 13800001001 → MQL 高价值重复（IGNORE）
  const dupMqlId = phoneToLeadId.get("13800001001")!;
  await prisma.duplicateRecord.create({
    data: { leadId: dupMqlId, phone: "13800001001", newSource: "广告投放", newChannel: "百度", action: "IGNORE", remark: "高价值线索重复进入，仅记录来源不抢归属" },
  });

  // 2) 13800001002 → INVALID 重复（REACTIVATE）
  const invLead = await prisma.lead.create({
    data: {
      name: "重复无效样本", phone: "13800001002", source: "广告投放", channel: "百度",
      firstSource: "广告投放", firstChannel: "百度", latestSource: "广告投放", latestChannel: "抖音",
      mainStatus: "INVALID", callStatus: "REJECTED", invalidReason: "REJECTED", createdAt: daysAgo(6),
    },
  });
  await prisma.duplicateRecord.create({
    data: { leadId: invLead.id, phone: "13800001002", newSource: "广告投放", newChannel: "抖音", action: "REACTIVATE", remark: "原线索无效，新渠道重复进入，待人工决定是否重新激活" },
  });

  // 3) 13800001003 → FOLLOWING 同号不同渠道（MERGE_SOURCE，不覆盖 owner）
  const folLead = await prisma.lead.create({
    data: {
      name: "重复跟进样本", phone: "13800001003", source: "广告投放", channel: "公众号",
      firstSource: "广告投放", firstChannel: "公众号", latestSource: "广告投放", latestChannel: "线下",
      mainStatus: "FOLLOWING", callStatus: "CONNECTED", wechatStatus: "ADDED", followStatus: "FOLLOWING",
      ownerId: s1.id, assignedAt: daysAgo(4), firstFollowUpAt: daysAgo(3), lastFollowUpAt: hoursAgo(5), createdAt: daysAgo(5),
    },
  });
  await prisma.followUpRecord.create({ data: { leadId: folLead.id, ownerId: s1.id, content: "跟进中，意向中等", intentionLevel: "MEDIUM", createdAt: hoursAgo(5) } });
  await prisma.duplicateRecord.create({
    data: { leadId: folLead.id, phone: "13800001003", newSource: "广告投放", newChannel: "线下", action: "MERGE_SOURCE", remark: "同号不同渠道，合并最新来源，不覆盖原负责人" },
  });

  // 归属冲突样本
  await prisma.duplicateRecord.create({
    data: { leadId: folLead.id, phone: "13800001003", newSource: "线下活动", newChannel: "线下", remark: "重复且归属冲突，待人工处理" },
  });
  await prisma.task.create({ data: { leadId: folLead.id, taskType: "DUPLICATE_CONFLICT", title: "重复线索归属冲突待处理", status: "OPEN" } });

  // ---------- 统计 ----------
  const counts = {
    leads: await prisma.lead.count(),
    users: await prisma.salesUser.count(),
    calls: await prisma.callRecord.count(),
    followUps: await prisma.followUpRecord.count(),
    logs: await prisma.leadStatusLog.count(),
    tasks: await prisma.task.count(),
    duplicates: await prisma.duplicateRecord.count(),
    mql: await prisma.lead.count({ where: { mqlAt: { not: null } } }),
    sqlValid: await prisma.lead.count({ where: { sqlAt: { not: null }, sqlRevokedAt: null } }),
  };
  console.log("✅ Seed 完成：", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
