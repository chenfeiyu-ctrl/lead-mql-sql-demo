import { generateSqlFromQuestion } from "./generateSql";
import { executeReadOnlySql } from "./executeSql";
import { auditSqlQuery } from "./auditLog";
import { validateReadOnlySql } from "./validateSql";

export interface SqlQueryResponse {
  answer: string;
  data: {
    rows: Record<string, unknown>[];
    columns: string[];
    rowCount: number;
  };
  intent: { intent: "SQL_QUERY" };
  parseSource: "sql";
  sql: string;
  sqlSummary?: string;
  formula?: string;
  notes?: string[];
  suggestions?: string[];
}

const SQL_SUGGESTIONS = [
  "每个负责人有多少条 MQL 线索",
  "各渠道本周新增线索数",
  "跟进中且已加微的线索有哪些",
  "外呼接通率按渠道统计",
];

function buildAnswer(summary: string | undefined, rowCount: number, notes: string[]): string {
  const parts: string[] = [];
  if (summary) parts.push(summary);
  parts.push(`查询返回 ${rowCount} 行。`);
  if (notes.length) parts.push(notes.join(" "));
  return parts.join(" ");
}

export type RunSqlQueryResult =
  | ({ ok: true } & SqlQueryResponse)
  | { ok: false; message: string; reason: string };

/** 完整 Text-to-SQL 链路：LLM 生成 → 校验 → 只读执行 → 脱敏 */
export async function runSqlQuery(
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = []
): Promise<RunSqlQueryResult> {
  const generated = await generateSqlFromQuestion(question, history);
  if (!generated.ok) {
    return { ok: false, message: generated.message, reason: generated.reason };
  }

  const preCheck = validateReadOnlySql(generated.sql);
  if (!preCheck.ok) {
    auditSqlQuery({ question, sql: generated.sql, rowCount: 0, ok: false, error: preCheck.reason });
    return { ok: false, message: `SQL 未通过安全校验：${preCheck.reason}`, reason: "validation_failed" };
  }

  const executed = await executeReadOnlySql(generated.sql);
  if ("reason" in executed) {
    auditSqlQuery({ question, sql: generated.sql, rowCount: 0, ok: false, error: executed.reason });
    return { ok: false, message: `SQL 执行失败：${executed.reason}`, reason: "execution_failed" };
  }

  auditSqlQuery({
    question,
    sql: executed.sql,
    rowCount: executed.rowCount,
    ok: true,
  });

  const notes = [...preCheck.notes, ...executed.notes];
  return {
    ok: true,
    answer: buildAnswer(generated.summary, executed.rowCount, notes),
    data: {
      rows: executed.rows,
      columns: executed.columns,
      rowCount: executed.rowCount,
    },
    intent: { intent: "SQL_QUERY" },
    parseSource: "sql",
    sql: executed.sql,
    sqlSummary: generated.summary,
    formula: "只读 SELECT；表白名单 + LIMIT≤100；手机号已脱敏",
    notes: notes.length ? notes : undefined,
    suggestions: SQL_SUGGESTIONS,
  };
}

export { SQL_SUGGESTIONS };
