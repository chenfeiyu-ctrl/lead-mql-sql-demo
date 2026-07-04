"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Card, Button, StatusBadge, Toast } from "@/components/ui";
import { LEAD_LEVEL_LABEL, DUPLICATE_ACTION_LABEL } from "@/lib/enums";

const SOURCES = ["广告投放", "表单提交", "线下活动", "CSV导入", "外呼系统"];
const CHANNELS = ["抖音", "百度", "公众号", "线下"];

interface DupInfo {
  existing: { id: string; name: string | null; mainStatus: string; owner?: { name: string } | null };
  suggestion: string;
  message: string;
}

type CreateLeadResponse =
  | { id: string }
  | {
      lead: { id: string };
      previousStatus: string;
      suggestion: string;
      message: string;
    };

export default function NewLeadPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"manual" | "csv">("manual");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const flash = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2600);
  };

  // ---- 手动新增 ----
  const [form, setForm] = useState({ name: "", phone: "", source: "广告投放", channel: "抖音", leadLevel: "C" });
  const [dup, setDup] = useState<DupInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const checkDup = async () => {
    setDup(null);
    if (!form.phone.trim()) return;
    const res = await api.post<{ isDuplicate: boolean } & DupInfo>("/api/leads/check-duplicate", {
      phone: form.phone,
    });
    if (res.ok && res.data.isDuplicate) {
      setDup(res.data as unknown as DupInfo);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    const res = await api.post<CreateLeadResponse>("/api/leads", form);
    setSubmitting(false);
    if (res.ok) {
      if ("lead" in res.data) {
        flash("success", `已重新激活原线索（原状态：${res.data.previousStatus}）`);
        router.push(`/leads/${res.data.lead.id}`);
      } else {
        flash("success", "新增成功");
        router.push(`/leads/${res.data.id}`);
      }
    } else if (res.error.code === "DUPLICATE_PHONE") {
      const d = res.error.details as DupInfo;
      setDup(d);
      flash("error", res.error.message);
    } else {
      flash("error", res.error.message);
    }
  };

  // ---- CSV 导入 ----
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("upload.csv");
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const onFile = async (file: File) => {
    setFilename(file.name);
    setCsvText(await file.text());
  };

  const doImport = async () => {
    if (!csvText.trim()) {
      flash("error", "请先选择或粘贴 CSV 内容");
      return;
    }
    setImporting(true);
    const res = await api.post<any>("/api/leads/import", { filename, content: csvText });
    setImporting(false);
    if (res.ok) {
      setImportResult(res.data);
      flash("success", "导入完成");
    } else {
      flash("error", res.error.message);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">新增 / 导入线索</h1>

      <div className="flex gap-2">
        <Button variant={tab === "manual" ? "primary" : "secondary"} onClick={() => setTab("manual")}>
          手动新增
        </Button>
        <Button variant={tab === "csv" ? "primary" : "secondary"} onClick={() => setTab("csv")}>
          CSV 导入
        </Button>
      </div>

      {tab === "manual" ? (
        <Card className="space-y-4">
          <Field label="手机号 *">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              onBlur={checkDup}
              placeholder="11 位手机号"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>

          {dup && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-800">
                该手机号已存在（
                <StatusBadge status={dup.existing.mainStatus} />
                {dup.existing.owner?.name ? `，负责人：${dup.existing.owner.name}` : "，未分配"}）
              </p>
              <p className="mt-1 text-amber-700">
                建议：{DUPLICATE_ACTION_LABEL[dup.suggestion] ?? dup.suggestion}。{dup.message}
              </p>
              <p className="mt-1 text-xs text-amber-600">
                {dup.suggestion === "REACTIVATE"
                  ? "提交后将重新激活原线索至「待外呼」，清空负责人与外呼次数，并关闭旧待办；不会新建重复线索。"
                  : dup.suggestion === "IGNORE"
                    ? "原线索为高价值状态，仅记录重复来源，不会新建或改归属。"
                    : "系统不会新建重复线索，也不会覆盖原负责人。"}
              </p>
              <a href={`/leads/${dup.existing.id}`} className="mt-1 inline-block text-blue-600 hover:underline">
                查看原线索 →
              </a>
            </div>
          )}

          <Field label="姓名">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="来源 *">
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {SOURCES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="渠道 *">
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {CHANNELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="线索等级">
            <select
              value={form.leadLevel}
              onChange={(e) => setForm({ ...form, leadLevel: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {Object.entries(LEAD_LEVEL_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-slate-400">手动新增通过基础校验后直接进入「待外呼」。</p>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "提交中…" : "提交"}
          </Button>
        </Card>
      ) : (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">上传 CSV（表头：name,phone,source,channel,lead_level）</p>
            <a href="/sample_leads.csv" download className="text-sm text-blue-600 hover:underline">
              下载模板
            </a>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="block w-full text-sm"
          />
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            placeholder="或直接粘贴 CSV 内容…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
          <Button onClick={doImport} disabled={importing}>
            {importing ? "导入中…" : "开始导入"}
          </Button>

          {importResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="总计" value={importResult.batch.totalCount} />
                <Stat label="成功" value={importResult.batch.successCount} color="text-green-700" />
                <Stat label="重复" value={importResult.batch.duplicateCount} color="text-amber-700" />
                <Stat label="失败" value={importResult.batch.failedCount} color="text-red-700" />
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1">行</th>
                    <th className="py-1">姓名</th>
                    <th className="py-1">手机号</th>
                    <th className="py-1">结果</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.results.map((r: any) => (
                    <tr key={r.row} className="border-b border-slate-100">
                      <td className="py-1">{r.row}</td>
                      <td className="py-1">{r.name || "-"}</td>
                      <td className="py-1">{r.phone || "-"}</td>
                      <td className="py-1">
                        {r.outcome === "created" && <span className="text-green-700">成功</span>}
                        {r.outcome === "reactivated" && <span className="text-green-700">{r.message}</span>}
                        {r.outcome === "duplicate" && <span className="text-amber-700">{r.message}</span>}
                        {r.outcome === "failed" && <span className="text-red-700">失败：{r.message}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Toast toast={toast} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, color = "text-slate-800" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
