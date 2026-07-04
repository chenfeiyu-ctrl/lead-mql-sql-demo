"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Card, StatusBadge, Badge } from "@/components/ui";
import { TASK_TYPE_LABEL } from "@/lib/enums";
import { maskPhone } from "@/lib/format";

interface ExceptionsResp {
  counts: { overdue: number; unassigned: number; openTasks: number };
  overdue: { lead: any; hoursElapsed: number | null }[];
  unassigned: { lead: any }[];
  tasks: any[];
}

const TABS = [
  { key: "overdue", label: "超时未跟进" },
  { key: "unassigned", label: "未分配" },
  { key: "tasks", label: "全部待办" },
] as const;

export default function ExceptionsPage() {
  const [data, setData] = useState<ExceptionsResp | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overdue");

  useEffect(() => {
    api.get<ExceptionsResp>("/api/exceptions").then((res) => res.ok && setData(res.data));
  }, []);

  if (!data) return <p className="text-slate-500">加载中…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">异常线索</h1>

      <div className="flex gap-2">
        {TABS.map((t) => {
          const count =
            t.key === "overdue" ? data.counts.overdue : t.key === "unassigned" ? data.counts.unassigned : data.counts.openTasks;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                tab === t.key ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-300"
              }`}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      <Card>
        {tab === "overdue" && (
          <Table
            head={["线索", "手机号", "状态", "负责人", "超时", "操作"]}
            rows={data.overdue}
            empty="暂无超时未跟进线索"
            render={(r) => (
              <tr key={r.lead.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{r.lead.name ?? "未命名"}</td>
                <td className="py-2">{maskPhone(r.lead.phone)}</td>
                <td className="py-2">
                  <StatusBadge status={r.lead.mainStatus} />
                </td>
                <td className="py-2">{r.lead.owner?.name ?? "-"}</td>
                <td className="py-2 text-red-600">{r.hoursElapsed} 小时</td>
                <td className="py-2">
                  <Link href={`/leads/${r.lead.id}`} className="text-blue-600 hover:underline">
                    去跟进
                  </Link>
                </td>
              </tr>
            )}
          />
        )}

        {tab === "unassigned" && (
          <Table
            head={["线索", "手机号", "状态", "操作"]}
            rows={data.unassigned}
            empty="暂无未分配线索"
            render={(r) => (
              <tr key={r.lead.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{r.lead.name ?? "未命名"}</td>
                <td className="py-2">{maskPhone(r.lead.phone)}</td>
                <td className="py-2">
                  <StatusBadge status={r.lead.mainStatus} />
                </td>
                <td className="py-2">
                  <Link href={`/leads/${r.lead.id}`} className="text-blue-600 hover:underline">
                    去分配
                  </Link>
                </td>
              </tr>
            )}
          />
        )}

        {tab === "tasks" && (
          <Table
            head={["类型", "标题", "线索", "状态", "操作"]}
            rows={data.tasks}
            empty="暂无待办任务"
            render={(t) => (
              <tr key={t.id} className="border-b border-slate-100">
                <td className="py-2">
                  <Badge color="amber">{TASK_TYPE_LABEL[t.taskType]}</Badge>
                </td>
                <td className="py-2">{t.title}</td>
                <td className="py-2">{t.lead?.name ?? "-"}</td>
                <td className="py-2">{t.status}</td>
                <td className="py-2">
                  {t.lead && (
                    <Link href={`/leads/${t.lead.id}`} className="text-blue-600 hover:underline">
                      查看
                    </Link>
                  )}
                </td>
              </tr>
            )}
          />
        )}
      </Card>
    </div>
  );
}

function Table<T>({ head, rows, empty, render }: { head: string[]; rows: T[]; empty: string; render: (r: T) => React.ReactNode }) {
  if (!rows || rows.length === 0) return <p className="py-8 text-center text-slate-400">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-slate-500">
          {head.map((h) => (
            <th key={h} className="py-2">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{rows.map(render)}</tbody>
    </table>
  );
}
