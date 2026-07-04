// Text-to-SQL 审计 —— 开发环境 console；生产可接日志系统。

export interface SqlAuditEntry {
  question: string;
  sql: string;
  rowCount: number;
  ok: boolean;
  error?: string;
  at: string;
}

export function auditSqlQuery(entry: Omit<SqlAuditEntry, "at">): void {
  const full: SqlAuditEntry = { ...entry, at: new Date().toISOString() };
  if (process.env.NODE_ENV !== "test") {
    console.info("[nl-sql-audit]", JSON.stringify(full));
  }
}
