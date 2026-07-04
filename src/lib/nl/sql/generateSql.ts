import { z } from "zod";
import { NL_SQL_SCHEMA_DOC } from "./schemaDoc";
import { isNlConfigured } from "../deepseek";

const sqlResponseSchema = z.object({
  sql: z.string().min(8).max(4000),
  summary: z.string().max(300).optional(),
});

export type GenerateSqlResult =
  | { ok: true; sql: string; summary?: string; raw: string }
  | { ok: false; reason: "not_configured" | "timeout" | "api_error" | "invalid_output"; message: string };

function buildSqlSystemPrompt(): string {
  return `你是 SQLite 只读分析助手。根据用户中文问题生成一条 SELECT 查询。
只输出 JSON：{"sql":"...", "summary":"一句话说明"}。

硬性规则：
1. 只能 SELECT（可用 WITH），禁止 INSERT/UPDATE/DELETE/DDL/PRAGMA
2. 只能使用 schema 中的表白名单
3. 必须包含 LIMIT，且 LIMIT <= 100
4. 使用 SQLite 语法；日期可用 date('now', ...) 或 strftime
5. 统计 SQL 线索时：sql_at IS NOT NULL AND sql_revoked_at IS NULL
6. 不要编造不存在的列名

${NL_SQL_SCHEMA_DOC}`;
}

export async function generateSqlFromQuestion(
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  timeoutMs = 20000
): Promise<GenerateSqlResult> {
  if (!isNlConfigured()) {
    return { ok: false, reason: "not_configured", message: "未配置 DEEPSEEK_API_KEY" };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY!;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  const historyMessages = history.slice(-4).map((t) => ({
    role: t.role,
    content: t.content.slice(0, 400),
  }));

  const messages = [
    { role: "system", content: buildSqlSystemPrompt() },
    ...historyMessages,
    { role: "user", content: question },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, reason: "api_error", message: `DeepSeek HTTP ${res.status} ${text.slice(0, 200)}` };
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, reason: "invalid_output", message: "DeepSeek 返回为空" };
    }

    return parseSqlGenerationContent(content);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "timeout", message: "DeepSeek 请求超时" };
    }
    return {
      ok: false,
      reason: "api_error",
      message: err instanceof Error ? err.message : "DeepSeek 请求失败",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function parseSqlGenerationContent(content: string): GenerateSqlResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, reason: "invalid_output", message: "DeepSeek 输出非合法 JSON" };
  }
  const result = sqlResponseSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: "invalid_output", message: "DeepSeek 输出缺少合法 sql 字段" };
  }
  return { ok: true, sql: result.data.sql, summary: result.data.summary, raw: content };
}
