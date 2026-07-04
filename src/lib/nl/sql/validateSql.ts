import { ALLOWED_TABLES, SQL_MAX_ROWS, type AllowedTable } from "./config";

export interface SqlValidationResult {
  ok: true;
  sql: string;
  notes: string[];
}

export interface SqlValidationError {
  ok: false;
  reason: string;
}

const ALLOWED_SET = new Set<string>(ALLOWED_TABLES);

const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "REPLACE",
  "TRUNCATE",
  "ATTACH",
  "DETACH",
  "PRAGMA",
  "VACUUM",
  "REINDEX",
  "LOAD_EXTENSION",
] as const;

const FORBIDDEN_IDENTIFIERS = ["SQLITE_MASTER", "SQLITE_SCHEMA", "SQLITE_TEMP_MASTER"] as const;

/** 去掉注释与多余空白，便于校验 */
export function normalizeSqlInput(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;\s*$/, "");
}

function extractReferencedTables(sql: string): string[] {
  const tables: string[] = [];
  const re = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    tables.push(m[1].toLowerCase());
  }
  return tables;
}

function ensureLimit(sql: string, max: number): { sql: string; notes: string[] } {
  const notes: string[] = [];
  const limitAtEnd = /\bLIMIT\s+(\d+)\s*$/i.exec(sql);
  if (limitAtEnd) {
    const n = parseInt(limitAtEnd[1], 10);
    if (n > max) {
      notes.push(`LIMIT 已从 ${n} 收紧为 ${max}。`);
      return { sql: sql.replace(/\bLIMIT\s+\d+\s*$/i, `LIMIT ${max}`), notes };
    }
    return { sql, notes };
  }
  notes.push(`已自动追加 LIMIT ${max}。`);
  return { sql: `${sql} LIMIT ${max}`, notes };
}

/** 受控 Text-to-SQL 校验：只读 SELECT + 表白名单 + 行数上限 */
export function validateReadOnlySql(raw: string): SqlValidationResult | SqlValidationError {
  if (!raw?.trim()) {
    return { ok: false, reason: "SQL 为空" };
  }

  if (/;/.test(raw.replace(/;\s*$/, ""))) {
    return { ok: false, reason: "不允许多条 SQL 语句" };
  }

  const sql = normalizeSqlInput(raw);
  const upper = sql.toUpperCase();

  if (!/^(WITH|SELECT)\b/.test(upper)) {
    return { ok: false, reason: "只允许 SELECT 查询（可用 WITH 子句）" };
  }

  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(sql)) {
      return { ok: false, reason: `禁止关键字 ${kw}` };
    }
  }

  for (const id of FORBIDDEN_IDENTIFIERS) {
    if (upper.includes(id)) {
      return { ok: false, reason: "禁止访问系统表" };
    }
  }

  const tables = extractReferencedTables(sql);
  if (tables.length === 0) {
    return { ok: false, reason: "未识别到 FROM/JOIN 表名" };
  }

  for (const t of tables) {
    if (!ALLOWED_SET.has(t)) {
      return { ok: false, reason: `不允许查询表「${t}」` };
    }
  }

  const { sql: limited, notes } = ensureLimit(sql, SQL_MAX_ROWS);
  return { ok: true, sql: limited, notes };
}

export function isAllowedTable(name: string): name is AllowedTable {
  return ALLOWED_SET.has(name.toLowerCase());
}
