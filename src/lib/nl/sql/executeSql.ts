import { prisma } from "../../prisma";
import { validateReadOnlySql } from "./validateSql";
import { maskSqlRows } from "./maskResults";

export interface SqlExecuteResult {
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  sql: string;
  notes: string[];
}

export async function executeReadOnlySql(
  rawSql: string
): Promise<SqlExecuteResult | { reason: string }> {
  const validated = validateReadOnlySql(rawSql);
  if (!validated.ok) return { reason: validated.reason };

  try {
    const rawRows = await prisma.$queryRawUnsafe(validated.sql);
    const rows = Array.isArray(rawRows)
      ? maskSqlRows(rawRows as Record<string, unknown>[])
      : [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return {
      rows,
      columns,
      rowCount: rows.length,
      sql: validated.sql,
      notes: validated.notes,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SQL 执行失败";
    return { reason: message.slice(0, 300) };
  }
}
