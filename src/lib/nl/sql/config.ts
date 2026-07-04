// Text-to-SQL 模式配置 —— 默认关闭，需显式开启 NL_SQL_MODE。

export const SQL_MAX_ROWS = 100;

/** SQLite 物理表名（@map）白名单 */
export const ALLOWED_TABLES = [
  "leads",
  "sales_users",
  "call_records",
  "follow_up_records",
  "lead_status_logs",
  "tasks",
  "duplicate_records",
  "import_batches",
  "integration_event_logs",
] as const;

export type AllowedTable = (typeof ALLOWED_TABLES)[number];

export type NlSqlMode = "off" | "readonly" | "hybrid";

export function getNlSqlMode(): NlSqlMode {
  const raw = (process.env.NL_SQL_MODE ?? "off").toLowerCase();
  if (raw === "readonly" || raw === "hybrid") return raw;
  return "off";
}

export function isSqlQueryEnabled(): boolean {
  return getNlSqlMode() !== "off";
}

export function canUseSqlMode(mode: "intent" | "sql" | "auto"): boolean {
  const envMode = getNlSqlMode();
  if (envMode === "off") return false;
  if (mode === "sql") return true;
  if (mode === "auto") return envMode === "hybrid";
  return false;
}
