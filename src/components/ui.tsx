"use client";

import { MAIN_STATUS_LABEL } from "@/lib/enums";

// 主状态颜色映射（docs/05 §7：INVALID 灰、MQL 蓝、SQL 绿）
const STATUS_COLOR: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-700",
  TO_CALL: "bg-sky-100 text-sky-700",
  CALLING: "bg-cyan-100 text-cyan-700",
  VALID: "bg-teal-100 text-teal-700",
  INVALID: "bg-slate-200 text-slate-500",
  TO_ADD_WECHAT: "bg-amber-100 text-amber-700",
  WECHAT_ADDED: "bg-orange-100 text-orange-700",
  FOLLOWING: "bg-indigo-100 text-indigo-700",
  MQL: "bg-blue-100 text-blue-700",
  SQL: "bg-green-100 text-green-700",
  CLOSED: "bg-slate-200 text-slate-500",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_COLOR[status] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {MAIN_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Badge({
  children,
  color = "slate",
}: {
  children: React.ReactNode;
  color?: "slate" | "green" | "red" | "amber" | "blue";
}) {
  const map: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[color]}`}>
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  title,
  type = "button",
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  title?: string;
  type?: "button" | "submit";
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-2 text-sm" };
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${sizes[size]} ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-semibold text-slate-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Toast({ toast }: { toast: { type: "success" | "error"; msg: string } | null }) {
  if (!toast) return null;
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
        toast.type === "success" ? "bg-green-600" : "bg-red-600"
      }`}
    >
      {toast.msg}
    </div>
  );
}

/** 指标口径说明：CSS 悬停/聚焦气泡（比原生 title 在 IDE 内置浏览器里更可靠） */
export function MetricHint({ formula }: { formula: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <span
        tabIndex={0}
        aria-label={`统计口径：${formula}`}
        className="inline-flex h-4 w-4 cursor-default items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold leading-none text-slate-600 outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        i
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 w-max max-w-[280px] -translate-x-1/2 rounded-md bg-slate-800 px-2.5 py-1.5 text-left text-[11px] leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {formula}
      </span>
    </span>
  );
}
