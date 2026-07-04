"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Card, Button, StatusBadge, Badge, Modal, Toast } from "@/components/ui";
import {
  MAIN_STATUS_LABEL,
  CALL_STATUS_LABEL,
  WECHAT_STATUS_LABEL,
  INVALID_REASON_LABEL,
  INTENTION_LEVEL_LABEL,
  TRIGGER_SOURCE_LABEL,
  TASK_TYPE_LABEL,
  LEAD_LEVEL_LABEL,
} from "@/lib/enums";
import { fmtDate, maskPhone } from "@/lib/format";

interface Checklist {
  ok: boolean;
  reasons: string[];
  checklist: { label: string; passed: boolean }[];
}

interface Detail {
  lead: any;
  allowedTransitions: string[];
  mqlEligibility: Checklist;
  sqlEligibility: Checklist;
  overdue: any;
}
interface SalesUser {
  id: string;
  name: string;
  role: string;
}

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [data, setData] = useState<Detail | null>(null);
  const [users, setUsers] = useState<SalesUser[]>([]);
  const [operatorId, setOperatorId] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [dialog, setDialog] = useState<null | "mql" | "sql" | "revoke" | "invalid" | "close" | "wechatResolve">(null);

  const flash = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2800);
  };

  const load = useCallback(async () => {
    const res = await api.get<Detail>(`/api/leads/${id}`);
    if (res.ok) setData(res.data);
    else flash("error", res.error.message);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get<SalesUser[]>("/api/sales-users").then((res) => {
      if (res.ok) {
        setUsers(res.data);
        setOperatorId((prev) => prev || res.data[0]?.id || "");
      }
    });
  }, []);

  if (!data) return <p className="text-slate-500">加载中…</p>;
  const lead = data.lead;

  // 统一变更后的处理
  const after = (res: any, okMsg: string) => {
    if (res.ok) {
      flash("success", okMsg);
      load();
      return true;
    }
    if (res.error.code === "OPTIMISTIC_LOCK_CONFLICT") {
      flash("error", "数据已被更新，正在刷新…");
      load();
    } else {
      flash("error", res.error.message + (res.error.details?.reasons ? `：${res.error.details.reasons.join("、")}` : ""));
    }
    return false;
  };

  const doStatus = async (to: string, reason?: string, invalidReason?: string) => {
    const res = await api.post(`/api/leads/${id}/status`, {
      to,
      reason,
      invalidReason,
      operatorId,
      expectedVersion: lead.version,
    });
    after(res, `已变更为 ${MAIN_STATUS_LABEL[to] ?? to}`);
  };

  const genericTargets = data.allowedTransitions.filter(
    (t) => !["MQL", "SQL", "INVALID", "CLOSED"].includes(t)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/leads" className="text-sm text-blue-600 hover:underline">
          ← 返回列表
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">操作人：</span>
          <select
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 基础信息 */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">{lead.name ?? "未命名线索"}</h1>
              <StatusBadge status={lead.mainStatus} />
              <Badge>{LEAD_LEVEL_LABEL[lead.leadLevel]}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
              <span>手机号：{maskPhone(lead.phone)}</span>
              <span>首次渠道：{lead.firstChannel}</span>
              <span>最新渠道：{lead.latestChannel}</span>
              <span>外呼：{CALL_STATUS_LABEL[lead.callStatus]}</span>
              <span>加微：{WECHAT_STATUS_LABEL[lead.wechatStatus]}</span>
              <span>版本：v{lead.version}</span>
            </div>
          </div>
          <AssignBox
            leadId={id}
            users={users}
            currentOwner={lead.owner}
            version={lead.version}
            operatorId={operatorId}
            onDone={(msg, ok) => (ok ? (flash("success", msg), load()) : flash("error", msg))}
          />
        </div>
        {data.overdue?.isOverdue && (
          <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            ⚠ 已超 48h 未跟进（约 {Math.round(data.overdue.hoursElapsed)} 小时）
          </div>
        )}
        {lead.invalidReason && (
          <div className="mt-3 text-sm text-slate-500">无效原因：{INVALID_REASON_LABEL[lead.invalidReason]}</div>
        )}
        {lead.sqlRevokedAt && (
          <div className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">
            SQL 已于 {fmtDate(lead.sqlRevokedAt)} 撤销：{lead.sqlRevokeReason}
          </div>
        )}
      </Card>

      {/* 快捷状态操作 */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">状态操作</h2>
        <div className="flex flex-wrap gap-2">
          {genericTargets.map((t) => (
            <Button key={t} variant="secondary" onClick={() => doStatus(t)}>
              → {MAIN_STATUS_LABEL[t]}
            </Button>
          ))}
          {data.allowedTransitions.includes("INVALID") && (
            <Button variant="secondary" onClick={() => setDialog("invalid")}>
              标记无效
            </Button>
          )}
          {data.allowedTransitions.includes("CLOSED") &&
            !(
              lead.mainStatus === "TO_ADD_WECHAT" && ["FAILED", "REJECTED"].includes(lead.wechatStatus)
            ) && (
            <Button variant="secondary" onClick={() => setDialog("close")}>
              关闭线索
            </Button>
          )}

          {/* MQL 按钮：FOLLOWING 且资格满足 */}
          {lead.mainStatus === "FOLLOWING" && (
            <Button
              variant="primary"
              disabled={!data.mqlEligibility.ok}
              title={data.mqlEligibility.ok ? "" : `未满足：${data.mqlEligibility.reasons.join("、")}`}
              onClick={() => setDialog("mql")}
            >
              标记 MQL
            </Button>
          )}
          {/* SQL 按钮：MQL 且资格满足 */}
          {lead.mainStatus === "MQL" && (
            <Button
              variant="primary"
              disabled={!data.sqlEligibility.ok}
              title={data.sqlEligibility.ok ? "" : `未满足：${data.sqlEligibility.reasons.join("、")}`}
              onClick={() => setDialog("sql")}
            >
              标记 SQL
            </Button>
          )}
          {lead.mainStatus === "SQL" && (
            <Button variant="danger" onClick={() => setDialog("revoke")}>
              SQL 误标退回
            </Button>
          )}
        </div>

        {/* 资格清单 */}
        {lead.mainStatus === "FOLLOWING" && <EligibilityList title="MQL 资格" c={data.mqlEligibility} />}
        {lead.mainStatus === "MQL" && <EligibilityList title="SQL 资格" c={data.sqlEligibility} />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 外呼 */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">外呼记录</h2>
          </div>
          {["TO_CALL", "CALLING", "NEW"].includes(lead.mainStatus) && (
            <>
              <CallForm leadId={id} version={lead.version} operatorId={operatorId} onDone={after} />
              <SimulateCallback leadId={id} phone={lead.phone} onDone={after} />
            </>
          )}
          <RecordList
            rows={lead.callRecords}
            empty="暂无外呼记录"
            render={(c: any) => (
              <div key={c.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
                <span>
                  #{c.callAttemptNo} {CALL_STATUS_LABEL[c.callStatus]}
                  {c.invalidReason ? `（${INVALID_REASON_LABEL[c.invalidReason]}）` : ""}
                </span>
                <span className="text-slate-400">{fmtDate(c.calledAt)}</span>
              </div>
            )}
          />
        </Card>

        {/* 加微 */}
        <Card>
          <h2 className="mb-3 text-base font-semibold text-slate-900">加微状态</h2>
          <p className="mb-2 text-sm text-slate-600">
            当前：{WECHAT_STATUS_LABEL[lead.wechatStatus]}
          </p>
          {lead.mainStatus === "TO_ADD_WECHAT" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={async () =>
                  after(
                    await api.post(`/api/leads/${id}/wechat`, { wechatStatus: "ADDED", operatorId, expectedVersion: lead.version }),
                    "已标记加微成功"
                  )
                }
              >
                标记已加微
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () =>
                  after(
                    await api.post(`/api/leads/${id}/wechat`, { wechatStatus: "FAILED", operatorId, expectedVersion: lead.version }),
                    "已记录加微失败（生成待办，状态保持待加微）"
                  )
                }
              >
                加微失败
              </Button>
              {["FAILED", "REJECTED"].includes(lead.wechatStatus) && (
                <Button size="sm" variant="secondary" onClick={() => setDialog("wechatResolve")}>
                  处理加微失败
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">仅「待加微」状态可操作加微。</p>
          )}
        </Card>
      </div>

      {/* 跟进 */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">跟进记录</h2>
        {["WECHAT_ADDED", "FOLLOWING"].includes(lead.mainStatus) && (
          <FollowUpForm leadId={id} version={lead.version} operatorId={operatorId} onDone={after} />
        )}
        <RecordList
          rows={lead.followUpRecords}
          empty="暂无跟进记录"
          render={(f: any) => (
            <div key={f.id} className="border-b border-slate-100 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  意向 {INTENTION_LEVEL_LABEL[f.intentionLevel]} · {f.owner?.name ?? "-"}
                </span>
                <span className="text-slate-400">{fmtDate(f.createdAt)}</span>
              </div>
              <p className="text-slate-600">{f.content}</p>
            </div>
          )}
        />
      </Card>

      {/* 任务 */}
      {lead.tasks?.length > 0 && (
        <Card>
          <h2 className="mb-3 text-base font-semibold text-slate-900">待办 / 异常</h2>
          {lead.tasks.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
              <span>
                <Badge color={t.status === "OPEN" ? "amber" : "green"}>{TASK_TYPE_LABEL[t.taskType]}</Badge>{" "}
                {t.title}
              </span>
              <span className="text-slate-400">{t.status}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">状态日志（时间线）</h2>
        <ol className="relative space-y-3 border-l border-slate-200 pl-4">
          {lead.statusLogs.map((log: any) => (
            <li key={log.id} className="text-sm">
              <span className="absolute -left-[5px] mt-1 h-2 w-2 rounded-full bg-blue-500" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {log.fromStatus === log.toStatus
                    ? log.reason ?? "非状态变更操作"
                    : `${MAIN_STATUS_LABEL[log.fromStatus]} → ${MAIN_STATUS_LABEL[log.toStatus]}`}
                </span>
                <Badge>{TRIGGER_SOURCE_LABEL[log.triggerSource]}</Badge>
                <span className="text-slate-400">{log.operator?.name ?? "系统"}</span>
                <span className="text-slate-400">{fmtDate(log.createdAt)}</span>
              </div>
              {log.reason && <p className="text-slate-500">原因：{log.reason}</p>}
            </li>
          ))}
        </ol>
      </Card>

      {/* 弹窗 */}
      <ReasonDialog
        open={dialog === "mql"}
        title="标记 MQL"
        label="MQL 确认原因（≥10 字）"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          const okd = after(await api.post(`/api/leads/${id}/mql`, { mqlReason: reason, operatorId, expectedVersion: lead.version }), "已标记 MQL");
          if (okd) setDialog(null);
        }}
      />
      <ReasonDialog
        open={dialog === "sql"}
        title="标记 SQL"
        label="SQL 确认原因（≥10 字）"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          const okd = after(await api.post(`/api/leads/${id}/sql`, { sqlReason: reason, operatorId, expectedVersion: lead.version }), "已标记 SQL");
          if (okd) setDialog(null);
        }}
      />
      <ReasonDialog
        open={dialog === "revoke"}
        title="SQL 误标退回"
        label="撤销原因（≥10 字）"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          const okd = after(await api.post(`/api/leads/${id}/sql/revoke`, { sqlRevokeReason: reason, operatorId, expectedVersion: lead.version }), "已退回 MQL");
          if (okd) setDialog(null);
        }}
      />
      <ReasonDialog
        open={dialog === "close"}
        title="关闭线索"
        label="关闭原因（必填）"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          await doStatus("CLOSED", reason);
          setDialog(null);
        }}
      />
      <InvalidDialog
        open={dialog === "invalid"}
        onClose={() => setDialog(null)}
        onSubmit={async (invalidReason, note) => {
          await doStatus("INVALID", note, invalidReason);
          setDialog(null);
        }}
      />
      <WechatResolveDialog
        open={dialog === "wechatResolve"}
        onClose={() => setDialog(null)}
        onSubmit={async (payload) => {
          const okd = after(
            await api.post(`/api/leads/${id}/wechat/resolve`, {
              ...payload,
              operatorId,
              expectedVersion: lead.version,
            }),
            payload.action === "RETRY" ? "已关闭失败待办，可重新加微" : "已人工确认并关闭线索"
          );
          if (okd) setDialog(null);
        }}
      />

      <Toast toast={toast} />
    </div>
  );
}

// ---------- 子组件 ----------

function EligibilityList({ title, c }: { title: string; c: Checklist }) {
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
      <p className="mb-1 font-medium text-slate-700">{title}检查</p>
      <ul className="space-y-1">
        {c.checklist.map((item, i) => (
          <li key={i} className={item.passed ? "text-green-700" : "text-slate-500"}>
            {item.passed ? "✓" : "✗"} {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecordList({ rows, empty, render }: { rows: any[]; empty: string; render: (r: any) => React.ReactNode }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-slate-400">{empty}</p>;
  return <div>{rows.map(render)}</div>;
}

function AssignBox({
  leadId,
  users,
  currentOwner,
  version,
  operatorId,
  onDone,
}: {
  leadId: string;
  users: SalesUser[];
  currentOwner: any;
  version: number;
  operatorId: string;
  onDone: (msg: string, ok: boolean) => void;
}) {
  const [sel, setSel] = useState(currentOwner?.id ?? "");
  return (
    <div className="text-right text-sm">
      <div className="mb-1 text-slate-500">负责人</div>
      <div className="flex items-center gap-2">
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">未分配</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!sel || sel === currentOwner?.id}
          onClick={async () => {
            const res = await api.post(`/api/leads/${leadId}/assign`, { ownerId: sel, operatorId, expectedVersion: version });
            onDone(res.ok ? "已分配负责人" : (res as any).error.message, res.ok);
          }}
        >
          分配
        </Button>
      </div>
    </div>
  );
}

function CallForm({ leadId, version, operatorId, onDone }: any) {
  const [callStatus, setCallStatus] = useState("CONNECTED");
  const [invalidReason, setInvalidReason] = useState("");
  const [result, setResult] = useState("");
  return (
    <div className="mb-3 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={callStatus} onChange={(e) => setCallStatus(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
          {Object.entries(CALL_STATUS_LABEL)
            .filter(([k]) => k !== "NOT_CALLED")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
        {callStatus === "CONNECTED" && (
          <select value={invalidReason} onChange={(e) => setInvalidReason(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
            <option value="">接通有效</option>
            <option value="NO_DEMAND">接通但无需求（判无效）</option>
            <option value="NOT_TARGET_CUSTOMER">非目标客户（判无效）</option>
          </select>
        )}
        <input value={result} onChange={(e) => setResult(e.target.value)} placeholder="结果备注" className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm" />
        <Button
          size="sm"
          onClick={async () => {
            const res = await api.post(`/api/leads/${leadId}/calls`, {
              callStatus,
              result,
              invalidReason: callStatus === "CONNECTED" && invalidReason ? invalidReason : undefined,
              operatorId,
              expectedVersion: version,
            });
            onDone(res, "外呼结果已录入");
          }}
        >
          录入外呼
        </Button>
      </div>
    </div>
  );
}

function SimulateCallback({ leadId, phone, onDone }: { leadId: string; phone: string; onDone: (res: any, msg: string) => boolean }) {
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  const send = async (payload: Record<string, unknown>, eventId: string, msg: string) => {
    // 经服务端 mock 签名转发：浏览器不持有 webhook 密钥
    const res = await api.post("/api/integrations/simulate", {
      target: "call-callback",
      payload: {
        source_system: "call_center",
        external_event_id: eventId,
        lead_id: leadId,
        phone,
        ...payload,
      },
    });
    setLastEventId(eventId);
    onDone(res, msg);
  };

  const newId = () => `sim_${Date.now()}`;

  return (
    <div className="mb-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-3">
      <p className="mb-2 text-xs font-medium text-slate-500">模拟外呼系统回调（HMAC 签名鉴权 · 幂等 · integration_event_logs）</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => send({ call_status: "CONNECTED", connected: true, result: "HAS_DEMAND" }, newId(), "回调：接通 → 有效")}>
          回调：接通
        </Button>
        <Button size="sm" variant="secondary" onClick={() => send({ call_status: "NOT_CONNECTED", connected: false, result: "NO_ANSWER" }, newId(), "回调：未接通")}>
          回调：未接通
        </Button>
        <Button size="sm" variant="secondary" onClick={() => send({ call_status: "CALLBACK_FAILED", connected: false }, newId(), "回调：回传失败（生成待办）")}>
          回调：回传失败
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!lastEventId}
          title={lastEventId ? "使用上一次 event_id 重发，演示幂等去重" : "先触发一次回调"}
          onClick={() => lastEventId && send({ call_status: "CONNECTED", connected: true }, lastEventId, "重复回调：已幂等忽略")}
        >
          重发上次(幂等)
        </Button>
      </div>
    </div>
  );
}

function FollowUpForm({ leadId, version, operatorId, onDone }: any) {
  const [content, setContent] = useState("");
  const [intentionLevel, setIntentionLevel] = useState("MEDIUM");
  return (
    <div className="mb-3 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="跟进内容" className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm" />
        <select value={intentionLevel} onChange={(e) => setIntentionLevel(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
          {Object.entries(INTENTION_LEVEL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              意向 {v}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          onClick={async () => {
            if (!content.trim()) return;
            const res = await api.post(`/api/leads/${leadId}/followups`, { content, intentionLevel, operatorId, expectedVersion: version });
            if ((res as any).ok) setContent("");
            onDone(res, "跟进已记录");
          }}
        >
          新增跟进
        </Button>
      </div>
    </div>
  );
}

function ReasonDialog({
  open,
  title,
  label,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          取消
        </Button>
        <Button onClick={() => onSubmit(reason)}>确认</Button>
      </div>
    </Modal>
  );
}

function InvalidDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (reason: string, note: string) => void }) {
  const [reason, setReason] = useState("INVALID_PHONE");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setReason("INVALID_PHONE");
      setNote("");
    }
  }, [open]);
  return (
    <Modal open={open} title="标记无效" onClose={onClose}>
      <label className="mb-1 block text-sm font-medium text-slate-700">无效原因（必选）</label>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
        {Object.entries(INVALID_REASON_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <label className="mb-1 block text-sm font-medium text-slate-700">补充说明（可选）</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          取消
        </Button>
        <Button variant="danger" onClick={() => onSubmit(reason, note)}>
          确认无效
        </Button>
      </div>
    </Modal>
  );
}

function WechatResolveDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { action: "RETRY" | "CLOSE"; closeReason?: string; remark?: string }) => void;
}) {
  const [action, setAction] = useState<"RETRY" | "CLOSE">("RETRY");
  const [closeReason, setCloseReason] = useState("无法建立私域联系");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    if (open) {
      setAction("RETRY");
      setCloseReason("无法建立私域联系");
      setRemark("");
    }
  }, [open]);

  return (
    <Modal open={open} title="处理加微失败" onClose={onClose}>
      <label className="mb-1 block text-sm font-medium text-slate-700">处理动作</label>
      <select value={action} onChange={(e) => setAction(e.target.value as "RETRY" | "CLOSE")} className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="RETRY">重试加微（关闭失败待办，状态改为申请中）</option>
        <option value="CLOSE">人工确认无法推进，关闭线索</option>
      </select>

      {action === "CLOSE" && (
        <>
          <label className="mb-1 block text-sm font-medium text-slate-700">关闭原因</label>
          <select value={closeReason} onChange={(e) => setCloseReason(e.target.value)} className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option>无法建立私域联系</option>
            <option>客户明确拒绝继续推进</option>
            <option>客户确认暂无需求</option>
            <option>客户已流失或选择竞品</option>
            <option>其他人工复核原因</option>
          </select>
          <label className="mb-1 block text-sm font-medium text-slate-700">人工复核说明（必填）</label>
          <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <p className="mt-2 text-xs text-slate-500">单次加微失败不会自动关闭；只有人工确认客户无法继续推进时才关闭。</p>
        </>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          取消
        </Button>
        <Button
          variant={action === "CLOSE" ? "danger" : "primary"}
          onClick={() => onSubmit(action === "RETRY" ? { action } : { action, closeReason, remark })}
        >
          确认
        </Button>
      </div>
    </Modal>
  );
}
