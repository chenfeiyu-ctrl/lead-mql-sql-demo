import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "市场线索 MQL/SQL 系统",
  description: "市场线索清洗与销售流转 MVP",
};

const NAV = [
  { href: "/dashboard", label: "漏斗看板" },
  { href: "/leads", label: "线索管理" },
  { href: "/exceptions", label: "异常线索" },
  { href: "/query", label: "智能查询" },
  { href: "/settings/sales-users", label: "销售团队" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
              <Link href="/dashboard" className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">
                  L
                </span>
                <span className="text-lg font-semibold text-slate-900">线索 MQL/SQL</span>
              </Link>
              <nav className="flex items-center gap-1">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
