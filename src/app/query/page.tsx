"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Card, Button, StatusBadge, Badge } from "@/components/ui";

const EXAMPLES = [
  "本周哪个渠道 SQL 转化率最高",
  "哪个渠道加微率最好",
  "抖音渠道的加微率是多少",
  "现在有多少超时未跟进的线索",
  "列出抖音所有跟进中的线索",
  "各状态线索分别有多少",
  "每个负责人有多少条 MQL 线索",
];

interface LeadItem {
  id: string;
  name: string | null;
  phone: string;
  mainStatus: string;
  channel: string;
  source: string;
  owner: string | null;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface NlResult {
  answer: string;
  data: unknown;
  intent: { intent: string; [k: string]: unknown };
  formula?: string;
  notes?: string[];
  parseSource?: "rule" | "llm" | "degraded" | "sql";
  sql?: string;
  sqlSummary?: string;
  fallbackFrom?: string;
  sqlFallbackError?: string;
  confidence?: "high" | "medium";
  suggestions?: string[];
}

const PARSE_SOURCE_LABEL: Record<string, string> = {
  rule: "规则解析",
  llm: "AI 意图",
  degraded: "已降级",
  sql: "Text-to-SQL",
};

export default function QueryPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [result, setResult] = useState<NlResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text);
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await api.post<NlResult>("/api/nl-query", {
      question: text,
      mode: "auto",
      history: history.slice(-8),
    });

    if (res.ok) {
      setResult(res.data);
      setHistory((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: res.data.answer },
      ]);
    } else {
      setError(res.error.message);
    }
    setLoading(false);
  };

  const clearHistory = () => {
    setHistory([]);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">智能查询</h1>
          <p className="mt-1 text-sm text-slate-500">
            用自然语言提问；常见问法走规则与白名单统计，更复杂的问题会自动改用只读查库（不执行任意 SQL）。
          </p>
        </div>
        {history.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearHistory}>
            清空对话
          </Button>
        )}
      </div>

      {history.length > 0 && (
        <Card className="max-h-48 overflow-y-auto bg-slate-50/80">
          <p className="mb-2 text-xs font-medium text-slate-500">对话上下文（最近 {history.length} 条）</p>
          <div className="space-y-2">
            {history.slice(-6).map((t, i) => (
              <div
                key={i}
                className={`rounded-md px-3 py-2 text-sm ${
                  t.role === "user" ? "bg-white text-slate-800" : "text-slate-600"
                }`}
              >
                <span className="mr-2 text-xs text-slate-400">{t.role === "user" ? "你" : "答"}</span>
                {t.content}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ask();
            }}
            placeholder="例如：本周哪个渠道 SQL 转化率最高"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <Button onClick={() => ask()} disabled={loading}>
            {loading ? "查询中…" : "查询"}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => ask(ex)}
              disabled={loading}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}

      {result && (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <p className="text-base text-slate-900">{result.answer}</p>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge color={result.parseSource === "sql" ? "green" : "blue"}>
                {result.intent.intent}
              </Badge>
              {result.parseSource && (
                <span className="text-xs text-slate-400">
                  {PARSE_SOURCE_LABEL[result.parseSource] ?? result.parseSource}
                  {result.confidence ? ` · ${result.confidence}` : ""}
                </span>
              )}
            </div>
          </div>

          {result.fallbackFrom && (
            <p className="mt-1 text-xs text-slate-500">
              白名单意图「{result.fallbackFrom}」未覆盖，已自动改用 Text-to-SQL。
            </p>
          )}
          {result.sqlFallbackError && (
            <p className="mt-1 text-xs text-amber-600">SQL 回退失败：{result.sqlFallbackError}</p>
          )}

          {result.formula && (
            <p className="mt-2 text-xs text-slate-500">口径：{result.formula}</p>
          )}
          {result.notes?.map((n, i) => (
            <p key={i} className="mt-1 text-xs text-amber-600">
              注：{n}
            </p>
          ))}

          <ResultData data={result.data} />

          {result.suggestions && result.suggestions.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs text-slate-500">继续追问</p>
              <div className="flex flex-wrap gap-2">
                {result.suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    disabled={loading}
                    className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-slate-400">
              {result.sql ? "查看执行的 SQL" : "查看解析出的意图 JSON"}
            </summary>
            {result.sql ? (
              <pre className="mt-2 overflow-auto rounded bg-slate-900 p-3 text-xs text-green-100">
                {result.sql}
              </pre>
            ) : (
              <pre className="mt-2 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-600">
                {JSON.stringify(result.intent, null, 2)}
              </pre>
            )}
          </details>
        </Card>
      )}
    </div>
  );
}

function ResultData({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") return null;

  // Text-to-SQL 动态表格
  if ("columns" in data && "rows" in data) {
    const { columns, rows } = data as {
      columns: string[];
      rows: Record<string, unknown>[];
    };
    if (rows.length === 0) {
      return <p className="mt-3 text-sm text-slate-500">查询成功，但没有返回行。</p>;
    }
    const cols = columns.length > 0 ? columns : Object.keys(rows[0]);
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              {cols.map((c) => (
                <th key={c} className="py-2 pr-3">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100">
                {cols.map((c) => (
                  <td key={c} className="py-2 pr-3 text-slate-700">
                    {formatCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 状态分布
  if ("rows" in data && Array.isArray((data as { rows: unknown[] }).rows)) {
    const rows = (data as { rows: { label: string; count: number }[] }).rows;
    if (rows.length === 0 || rows[0]?.label === undefined) return null;
    return (
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">状态</th>
            <th className="py-2">数量</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-slate-100">
              <td className="py-2 font-medium">{r.label}</td>
              <td className="py-2">{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if ("items" in data && Array.isArray((data as { items: unknown[] }).items)) {
    const items = (data as { items: LeadItem[] }).items;
    if (items.length === 0) return null;
    return (
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">姓名</th>
            <th className="py-2">手机号</th>
            <th className="py-2">状态</th>
            <th className="py-2">渠道</th>
            <th className="py-2">负责人</th>
            <th className="py-2 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id} className="border-b border-slate-100">
              <td className="py-2 font-medium">{l.name ?? "未命名"}</td>
              <td className="py-2 text-slate-600">{l.phone}</td>
              <td className="py-2">
                <StatusBadge status={l.mainStatus} />
              </td>
              <td className="py-2">{l.channel}</td>
              <td className="py-2">{l.owner ?? <span className="text-slate-400">未分配</span>}</td>
              <td className="py-2 text-right">
                <Link href={`/leads/${l.id}`} className="text-blue-600 hover:underline">
                  详情
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (Array.isArray(data)) {
    const rows = data as {
      channel: string;
      totalLeads: number;
      mqlCount: number;
      sqlCount: number;
      overallSqlRate: number | null;
      wechatRate?: number | null;
    }[];
    if (rows.length === 0) return null;
    const showWechat = rows.some((r) => r.wechatRate != null);
    return (
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">渠道</th>
            <th className="py-2">总线索</th>
            <th className="py-2">MQL</th>
            <th className="py-2">SQL</th>
            {showWechat && <th className="py-2">加微率</th>}
            <th className="py-2">SQL 转化率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.channel} className="border-b border-slate-100">
              <td className="py-2 font-medium">{r.channel}</td>
              <td className="py-2">{r.totalLeads}</td>
              <td className="py-2">{r.mqlCount}</td>
              <td className="py-2">{r.sqlCount}</td>
              {showWechat && <td className="py-2">{r.wechatRate ?? "-"}%</td>}
              <td className="py-2">{r.overallSqlRate ?? "-"}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return null;
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
