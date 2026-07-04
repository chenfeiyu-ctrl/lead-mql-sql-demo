import type {
  Lead,
  FollowUpRecord,
  CallRecord,
  LeadStatusLog,
} from "@prisma/client";

// MQL/SQL 硬校验 —— 与 docs/02 §5 / §6 一致。
// 返回 { ok, reasons }：ok 为 true 表示满足全部条件；reasons 为未满足项（人类可读）。

export type LeadWithRuleContext = Lead & {
  followUpRecords?: FollowUpRecord[];
  callRecords?: CallRecord[];
  statusLogs?: LeadStatusLog[];
};

export interface RuleResult {
  ok: boolean;
  reasons: string[]; // 未满足的条件说明
  checklist: { label: string; passed: boolean }[];
}

const MIN_REASON_LEN = 10;

function latestFollowUp(lead: LeadWithRuleContext): FollowUpRecord | undefined {
  const list = lead.followUpRecords ?? [];
  if (list.length === 0) return undefined;
  return [...list].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
}

// 历史上外呼有效：曾达 VALID（status_log）或存在 connected 的 call_record
function everValidOrConnected(lead: LeadWithRuleContext): boolean {
  const reachedValid = (lead.statusLogs ?? []).some(
    (l) => l.toStatus === "VALID"
  );
  const connected = (lead.callRecords ?? []).some(
    (c) => c.connected || c.callStatus === "CONNECTED"
  );
  // 当前处于 VALID 之后阶段也视为曾有效（seed/直接推进兜底）
  const pastValidStage = [
    "TO_ADD_WECHAT",
    "WECHAT_ADDED",
    "FOLLOWING",
    "MQL",
    "SQL",
  ].includes(lead.mainStatus);
  return reachedValid || connected || pastValidStage;
}

function buildMqlPreconditionChecklist(lead: LeadWithRuleContext) {
  const followCount = (lead.followUpRecords ?? []).length;
  const latest = latestFollowUp(lead);
  return [
    { label: "当前状态为「跟进中」(FOLLOWING)", passed: lead.mainStatus === "FOLLOWING" },
    { label: "已加微 (wechat_status=ADDED)", passed: lead.wechatStatus === "ADDED" },
    { label: "至少 1 条跟进记录", passed: followCount >= 1 },
    { label: "已分配负责人", passed: !!lead.ownerId },
    {
      label: "最近跟进意向为 中/高",
      passed: !!latest && (latest.intentionLevel === "MEDIUM" || latest.intentionLevel === "HIGH"),
    },
    { label: "历史外呼有效（曾达 VALID 或接通）", passed: everValidOrConnected(lead) },
  ];
}

function toRuleResult(checklist: { label: string; passed: boolean }[]): RuleResult {
  const reasons = checklist.filter((c) => !c.passed).map((c) => c.label);
  return { ok: reasons.length === 0, reasons, checklist };
}

// 详情页按钮启用条件（不含原因；原因在弹窗提交时校验）
export function validateMqlEligibility(lead: LeadWithRuleContext): RuleResult {
  return toRuleResult(buildMqlPreconditionChecklist(lead));
}

export function validateSqlEligibility(lead: LeadWithRuleContext): RuleResult {
  return toRuleResult([
    { label: "当前状态为 MQL", passed: lead.mainStatus === "MQL" },
    { label: "已分配负责人", passed: !!lead.ownerId },
  ]);
}

export function validateMql(
  lead: LeadWithRuleContext,
  mqlReason: string | undefined | null
): RuleResult {
  const reasonLen = (mqlReason ?? "").trim().length;
  const checklist = [
    ...buildMqlPreconditionChecklist(lead),
    { label: `MQL 原因 ≥ ${MIN_REASON_LEN} 字`, passed: reasonLen >= MIN_REASON_LEN },
  ];
  return toRuleResult(checklist);
}

export function validateSql(
  lead: LeadWithRuleContext,
  sqlReason: string | undefined | null
): RuleResult {
  const reasonLen = (sqlReason ?? "").trim().length;
  const checklist = [
    { label: "当前状态为 MQL", passed: lead.mainStatus === "MQL" },
    { label: "已分配负责人", passed: !!lead.ownerId },
    { label: `SQL 原因 ≥ ${MIN_REASON_LEN} 字`, passed: reasonLen >= MIN_REASON_LEN },
  ];
  return toRuleResult(checklist);
}

export { MIN_REASON_LEN };
