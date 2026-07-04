import { intentSchema, type Intent, EXAMPLE_QUESTIONS } from "./intents";
import { MAIN_STATUS_VALUES, SINGLE_METRIC_LABELS, CHANNEL_RANK_METRIC_LABELS } from "./labels";
import type { NlCatalog } from "./catalog";

// DeepSeek 客户端 —— OpenAI 兼容 chat/completions，JSON 模式。
// 仅服务端调用，API Key 不下发前端。LLM 只产出结构化意图，不产出/执行 SQL。

export function isNlConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ParseOptions {
  catalog?: NlCatalog;
  history?: ChatTurn[];
  timeoutMs?: number;
}

function buildSystemPrompt(catalog?: NlCatalog): string {
  const catalogBlock = catalog
    ? `
当前系统词表（channel/source/ownerName 请优先使用下列精确值）：
- 渠道: ${catalog.channels.join("、") || "（暂无）"}
- 来源: ${catalog.sources.join("、") || "（暂无）"}
- 负责人: ${catalog.owners.map((o) => o.name).join("、") || "（暂无）"}`
    : "";

  return `你是一个「市场线索 MQL/SQL 系统」的自然语言查询解析器。
你的唯一任务：把用户的中文问题转换成一个严格的 JSON 意图对象。只输出 JSON，不要任何多余文字。
${catalogBlock}

可用意图（intent 字段必须是其中之一）：
1. FUNNEL_OVERALL —— 询问整体漏斗/转化情况。可选 filters:{channel,source,ownerId,ownerName,timeRange}
2. CHANNEL_SQL_RATE_RANK —— 哪个渠道 SQL 转化率最高/渠道 SQL 排名。可选 timeRange
3. CHANNEL_METRIC_RANK —— 按指定指标排渠道。必填 metric，可选 timeRange
   metric 取值：${Object.keys(CHANNEL_RANK_METRIC_LABELS).join(", ")}
4. METRIC_SINGLE —— 询问单一指标数值。必填 metric，可选 filters:{channel,source,ownerId,ownerName,timeRange}
   metric 取值：total called valid wechatAdded mqlCount sqlCount calledRate validRate wechatRate mqlRate sqlRate overallSqlRate avgResponseHours overdueCount unassignedCount
5. LEAD_LIST —— 列出/筛选线索。可选 mainStatus,channel,source,ownerId,overdue(布尔),limit(<=50)
   mainStatus 取值：${MAIN_STATUS_VALUES.join(", ")}
6. LEAD_LOOKUP —— 查找某个具体线索。可选 phone 或 name
7. STATUS_BREAKDOWN —— 各状态线索数量分布。可选 filters:{channel,source,ownerId,timeRange}
8. HELP —— 用户问能问什么/怎么用
9. UNSUPPORTED —— 问题与线索/指标无关或无法映射。可带 reason

时间范围 timeRange 只能是：today, this_week, last_7_days, this_month, all（不要自己算日期）。
负责人可填 ownerName（中文名）或 ownerId；渠道/来源按词表或用户原词填写。

指标含义：${Object.entries(SINGLE_METRIC_LABELS)
    .map(([k, v]) => `${k}=${v}`)
    .join("；")}

示例：
Q: 本周哪个渠道 SQL 转化率最高
A: {"intent":"CHANNEL_SQL_RATE_RANK","timeRange":"this_week"}
Q: 哪个渠道加微率最好
A: {"intent":"CHANNEL_METRIC_RANK","metric":"wechatRate","timeRange":"this_week"}
Q: 抖音渠道的加微率是多少
A: {"intent":"METRIC_SINGLE","metric":"wechatRate","filters":{"channel":"抖音"}}
Q: 李销售负责多少条 MQL 线索
A: {"intent":"METRIC_SINGLE","metric":"mqlCount","filters":{"ownerName":"李销售"}}
Q: 各状态线索分别有多少
A: {"intent":"STATUS_BREAKDOWN"}
Q: 现在有多少超时未跟进的线索
A: {"intent":"METRIC_SINGLE","metric":"overdueCount"}
Q: 13800000001 是谁
A: {"intent":"LEAD_LOOKUP","phone":"13800000001"}
Q: 帮助
A: {"intent":"HELP"}`;
}

export type ParseResult =
  | { ok: true; intent: Intent; raw: string }
  | { ok: false; reason: "not_configured" | "timeout" | "api_error" | "invalid_output"; message: string };

type CallFailure = Extract<ParseResult, { ok: false }>;

async function callDeepSeek(
  messages: { role: string; content: string }[],
  timeoutMs: number
): Promise<{ ok: true; content: string } | CallFailure> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "not_configured", message: "未配置 DEEPSEEK_API_KEY" };
  }
  const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

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

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, reason: "invalid_output", message: "DeepSeek 返回为空" };
    }
    return { ok: true, content };
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

export async function parseQuestionToIntent(
  question: string,
  options: ParseOptions = {}
): Promise<ParseResult> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const systemPrompt = buildSystemPrompt(options.catalog);

  const historyMessages = (options.history ?? [])
    .slice(-6)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 400) }));

  const baseMessages = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: question },
  ];

  const first = await callDeepSeek(baseMessages, timeoutMs);
  if (!first.ok) return first;

  let parsed = parseIntentContent(first.content);
  if (parsed.ok) return { ...parsed, raw: first.content };

  // 校验失败时带错误信息重试一次
  const retry = await callDeepSeek(
    [
      ...baseMessages,
      { role: "assistant", content: first.content },
      {
        role: "user",
        content: `上一输出不符合 schema：${parsed.message}。请只输出一个合法 JSON 意图对象。`,
      },
    ],
    timeoutMs
  );
  if (!retry.ok) return parsed;

  parsed = parseIntentContent(retry.content);
  if (parsed.ok) return { ...parsed, raw: retry.content };
  return parsed;
}

// 从 LLM 文本中解析并用 Zod 严格校验意图（导出以便单测）。
export function parseIntentContent(content: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, reason: "invalid_output", message: "DeepSeek 输出非合法 JSON" };
  }
  const result = intentSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: "invalid_output", message: "DeepSeek 输出不符合意图规范" };
  }
  return { ok: true, intent: result.data, raw: content };
}

export { EXAMPLE_QUESTIONS };
