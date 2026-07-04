import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleRouteError } from "@/lib/apiResponse";
import { parseQuestionToIntent } from "@/lib/nl/deepseek";
import { executeIntent } from "@/lib/nl/execute";
import { EXAMPLE_QUESTIONS } from "@/lib/nl/intents";
import { getNlCatalog } from "@/lib/nl/catalog";
import { tryRuleParse } from "@/lib/nl/ruleParser";
import { enrichTimeRange, resolveIntent } from "@/lib/nl/resolveIntent";
import { buildSuggestions } from "@/lib/nl/suggestions";
import { canUseSqlMode, getNlSqlMode, isSqlQueryEnabled } from "@/lib/nl/sql/config";
import { runSqlQuery } from "@/lib/nl/sql/runSqlQuery";

export const dynamic = "force-dynamic";

const schema = z.object({
  question: z.string().trim().min(1, "问题不能为空").max(200),
  mode: z.enum(["intent", "sql", "auto"]).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(500),
      })
    )
    .max(10)
    .optional(),
});

async function runIntentPath(
  question: string,
  history: z.infer<typeof schema>["history"]
) {
  const catalog = await getNlCatalog();

  const ruleHit = tryRuleParse(question);
  let parseSource: "rule" | "llm" | "degraded" = ruleHit ? "rule" : "llm";
  let confidence: "high" | "medium" | undefined = ruleHit?.confidence;
  let intent = ruleHit?.intent;

  if (!intent) {
    const parsed = await parseQuestionToIntent(question, { catalog, history });
    if (!parsed.ok) {
      if (parsed.reason === "not_configured") {
        return {
          kind: "error" as const,
          code: "NL_NOT_CONFIGURED" as const,
          message: "智能查询未启用：请在 .env 配置 DEEPSEEK_API_KEY 后重启服务。",
        };
      }
      parseSource = "degraded";
      intent = { intent: "UNSUPPORTED" as const, reason: parsed.message };
    } else {
      intent = parsed.intent;
    }
  }

  intent = enrichTimeRange(intent, question);
  const { intent: resolved, notes: resolveNotes } = resolveIntent(intent, catalog, question);
  const result = await executeIntent(resolved);
  const allNotes = [...(result.notes ?? []), ...resolveNotes];
  const suggestions = buildSuggestions(resolved, result);

  return {
    kind: "ok" as const,
    body: {
      ...result,
      notes: allNotes.length ? allNotes : undefined,
      question,
      parseSource,
      confidence,
      suggestions,
      examples: EXAMPLE_QUESTIONS,
      queryMode: "intent" as const,
      resolvedIntent: resolved.intent,
    },
  };
}

// POST /api/nl-query —— intent 白名单 或 受控 Text-to-SQL（NL_SQL_MODE）
export async function POST(req: NextRequest) {
  try {
    const { question, history, mode: requestedMode } = schema.parse(await req.json());
    const envSqlMode = getNlSqlMode();
    const mode = requestedMode ?? "auto";

    if (mode === "sql") {
      if (!canUseSqlMode("sql")) {
        return fail(
          "NL_SQL_DISABLED",
          "Text-to-SQL 未启用：请在 .env 设置 NL_SQL_MODE=readonly 或 hybrid 后重启。",
          { nlSqlMode: envSqlMode }
        );
      }
      const sqlResult = await runSqlQuery(question, history);
      if (!sqlResult.ok) {
        if (sqlResult.reason === "not_configured") {
          return fail("NL_NOT_CONFIGURED", sqlResult.message, { examples: EXAMPLE_QUESTIONS });
        }
        return fail("NL_SQL_FAILED", sqlResult.message, { reason: sqlResult.reason });
      }
      return ok({ ...sqlResult, question, queryMode: "sql" as const, examples: EXAMPLE_QUESTIONS });
    }

    const intentResult = await runIntentPath(question, history);
    if (intentResult.kind === "error") {
      return fail(intentResult.code, intentResult.message, { examples: EXAMPLE_QUESTIONS });
    }

    const shouldFallbackSql =
      mode === "auto" &&
      isSqlQueryEnabled() &&
      (intentResult.body.resolvedIntent === "UNSUPPORTED" || intentResult.body.parseSource === "degraded");

    if (shouldFallbackSql) {
      const sqlResult = await runSqlQuery(question, history);
      if (sqlResult.ok) {
        return ok({
          ...sqlResult,
          question,
          queryMode: "auto" as const,
          fallbackFrom: intentResult.body.resolvedIntent,
          examples: EXAMPLE_QUESTIONS,
        });
      }
      // SQL 也失败则返回原 intent 结果并注明
      return ok({
        ...intentResult.body,
        sqlFallbackError: sqlResult.message,
      });
    }

    return ok(intentResult.body);
  } catch (err) {
    return handleRouteError(err);
  }
}
