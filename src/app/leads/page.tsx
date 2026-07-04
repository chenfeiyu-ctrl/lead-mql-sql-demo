"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Card, StatusBadge, Button } from "@/components/ui";
import { MAIN_STATUS_LABEL, MAIN_STATUS_ORDER } from "@/lib/enums";
import { fmtDate, maskPhone } from "@/lib/format";

interface StatusLogSnippet {
  createdAt: string;
  fromStatus: string;
  toStatus: string;
}

interface LeadRow {
  id: string;
  name: string | null;
  phone: string;
  source: string;
  channel: string;
  mainStatus: string;
  owner: { id: string; name: string } | null;
  lastFollowUpAt: string | null;
  statusLogs: StatusLogSnippet[];
}

function statusChangeTitle(log: StatusLogSnippet | undefined): string | undefined {
  if (!log) return undefined;
  const from = MAIN_STATUS_LABEL[log.fromStatus] ?? log.fromStatus;
  const to = MAIN_STATUS_LABEL[log.toStatus] ?? log.toStatus;
  return `${from} → ${to}`;
}
interface ListResp {
  total: number;
  page: number;
  pageSize: number;
  items: LeadRow[];
}
interface SalesUser {
  id: string;
  name: string;
}

const CHANNELS = ["抖音", "百度", "公众号", "线下"];

interface FilterMeta {
  sources: string[];
  channels: string[];
}

export default function LeadsPage() {
  const [items, setItems] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<SalesUser[]>([]);

  const [q, setQ] = useState("");
  const [mainStatus, setMainStatus] = useState("");
  const [source, setSource] = useState("");
  const [channel, setChannel] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>(CHANNELS);

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (mainStatus) params.set("mainStatus", mainStatus);
    if (source) params.set("source", source);
    if (channel) params.set("channel", channel);
    if (ownerId) params.set("ownerId", ownerId);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const res = await api.get<ListResp>(`/api/leads?${params.toString()}`);
    if (res.ok) {
      setItems(res.data.items);
      setTotal(res.data.total);
    }
    setLoading(false);
  }, [q, mainStatus, source, channel, ownerId, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get<SalesUser[]>("/api/sales-users").then((res) => {
      if (res.ok) setUsers(res.data);
    });
    api.get<FilterMeta>("/api/leads/meta").then((res) => {
      if (res.ok) {
        setSources(res.data.sources);
        if (res.data.channels.length > 0) setChannels(res.data.channels);
      }
    });
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">线索管理</h1>
        <Link href="/leads/new">
          <Button>+ 新增线索</Button>
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="搜索姓名/手机号"
            className="w-48 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={mainStatus}
            onChange={(e) => {
              setPage(1);
              setMainStatus(e.target.value);
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">全部状态</option>
            {MAIN_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {MAIN_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={source}
            onChange={(e) => {
              setPage(1);
              setSource(e.target.value);
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">全部来源</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={channel}
            onChange={(e) => {
              setPage(1);
              setChannel(e.target.value);
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">全部渠道</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={ownerId}
            onChange={(e) => {
              setPage(1);
              setOwnerId(e.target.value);
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">全部负责人</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-sm text-slate-500">共 {total} 条</span>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-slate-500">加载中…</p>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slate-500">没有符合条件的线索</p>
            <Link href="/leads/new" className="mt-3 inline-block">
              <Button>新增线索</Button>
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">姓名</th>
                <th className="py-2">手机号</th>
                <th className="py-2">来源</th>
                <th className="py-2">渠道</th>
                <th className="py-2">状态</th>
                <th className="py-2">状态变更时间</th>
                <th className="py-2">负责人</th>
                <th className="py-2">最近跟进</th>
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => {
                const lastLog = l.statusLogs[0];
                return (
                <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 font-medium">{l.name ?? "未命名"}</td>
                  <td className="py-2 text-slate-600">{maskPhone(l.phone)}</td>
                  <td className="py-2 text-slate-600">{l.source}</td>
                  <td className="py-2">{l.channel}</td>
                  <td className="py-2">
                    <StatusBadge status={l.mainStatus} />
                  </td>
                  <td className="py-2 text-slate-500" title={statusChangeTitle(lastLog)}>
                    {lastLog ? fmtDate(lastLog.createdAt) : "-"}
                  </td>
                  <td className="py-2">{l.owner?.name ?? <span className="text-slate-400">未分配</span>}</td>
                  <td className="py-2 text-slate-500">{l.lastFollowUpAt ? fmtDate(l.lastFollowUpAt) : "-"}</td>
                  <td className="py-2 text-right">
                    <Link href={`/leads/${l.id}`} className="text-blue-600 hover:underline">
                      详情
                    </Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <span className="text-sm text-slate-500">
              {page} / {totalPages}
            </span>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
