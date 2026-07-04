"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Card, MetricHint } from "@/components/ui";
import { pct, formatRateHint } from "@/lib/format";
import type { FunnelResult, ChannelFunnelRow } from "@/lib/metrics";

interface FunnelResponse {
  funnel: FunnelResult;
  byChannel?: ChannelFunnelRow[];
}

export default function DashboardPage() {
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<FunnelResponse>("/api/dashboard/funnel?groupBy=channel").then((res) => {
      if (res.ok) setData(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-slate-500">加载中…</p>;
  if (!data || data.funnel.counts.total === 0)
    return (
      <Card>
        <p className="text-slate-600">暂无数据，请先运行 <code className="rounded bg-slate-100 px-1">npm run seed</code> 生成演示数据。</p>
      </Card>
    );

  const f = data.funnel;
  const cards = [
    { label: "总线索", value: f.counts.total, sub: null, formula: "进入系统的全部线索数量" },
    {
      label: "已外呼",
      value: f.counts.called,
      sub: `覆盖率 ${pct(f.rates.calledRate)}`,
      formula: formatRateHint(f.formulas.calledRate, f.counts.called, f.counts.total),
    },
    {
      label: "有效线索",
      value: f.counts.valid,
      sub: `有效率 ${pct(f.rates.validRate)}`,
      formula: formatRateHint(f.formulas.validRate, f.counts.valid, f.counts.called),
    },
    {
      label: "已加微",
      value: f.counts.wechatAdded,
      sub: `加微率 ${pct(f.rates.wechatRate)}`,
      formula: formatRateHint(f.formulas.wechatRate, f.counts.wechatAdded, f.counts.valid),
    },
    {
      label: "MQL",
      value: f.counts.mql,
      sub: `转化率 ${pct(f.rates.mqlRate)}`,
      formula: formatRateHint(f.formulas.mqlRate, f.counts.mql, f.counts.wechatAdded),
    },
    {
      label: "SQL",
      value: f.counts.sql,
      sub: `转化率 ${pct(f.rates.sqlRate)}`,
      formula: formatRateHint(f.formulas.sqlRate, f.counts.sql, f.counts.mql),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">漏斗看板</h1>
        <p className="text-sm text-slate-500">
          整体 SQL 转化率 <span className="font-semibold text-green-700">{pct(f.rates.overallSqlRate)}</span>
          <MetricHint formula={formatRateHint(f.formulas.overallSqlRate, f.counts.sql, f.counts.total)} />
          ｜平均响应 {f.avgResponseHours ?? "-"} 小时
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label}>
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className="mt-1 text-3xl font-bold text-slate-900">{c.value}</div>
            {c.sub && (
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                {c.sub}
                <MetricHint formula={c.formula} />
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-amber-800">异常线索</div>
            <div className="mt-1 text-2xl font-bold text-amber-900">
              {f.exceptions.overdue + f.exceptions.unassigned}
            </div>
            <div className="mt-1 text-xs text-amber-700">
              超时未跟进 {f.exceptions.overdue} ｜ 未分配 {f.exceptions.unassigned}
            </div>
          </div>
          <Link href="/exceptions" className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700">
            查看异常
          </Link>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">按渠道概览</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">渠道</th>
              <th className="py-2">线索数</th>
              <th className="py-2">MQL</th>
              <th className="py-2">有效 SQL</th>
              <th className="py-2">
                <span className="inline-flex items-center gap-1">
                  整体 SQL 转化率
                  <MetricHint formula={f.formulas.overallSqlRate} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(data.byChannel ?? []).map((r) => (
              <tr key={r.channel} className="border-b border-slate-100">
                <td className="py-2 font-medium">{r.channel}</td>
                <td className="py-2">{r.totalLeads}</td>
                <td className="py-2">{r.mqlCount}</td>
                <td className="py-2">{r.sqlCount}</td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1 font-semibold text-green-700">
                    {pct(r.overallSqlRate)}
                    <MetricHint
                      formula={formatRateHint(
                        "该渠道整体 SQL 转化率 = 有效 SQL 数 ÷ 总线索数",
                        r.sqlCount,
                        r.totalLeads
                      )}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-400">
          MQL = 曾标记 MQL 的线索数（mql_at 有值）；有效 SQL = sql_at 有值且未撤销。
        </p>
      </Card>
    </div>
  );
}
