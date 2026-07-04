import type { Intent } from "./intents";
import type { ExecuteResult } from "./execute";
import { EXAMPLE_QUESTIONS } from "./intents";

/** 根据意图与结果生成追问建议（前端 chips） */
export function buildSuggestions(intent: Intent, result: ExecuteResult): string[] {
  const out: string[] = [];

  switch (intent.intent) {
    case "CHANNEL_SQL_RATE_RANK":
      out.push("哪个渠道加微率最好", "各状态线索分别有多少");
      break;
    case "CHANNEL_METRIC_RANK":
      out.push("本周哪个渠道 SQL 转化率最高", "抖音渠道的加微率是多少");
      break;
    case "METRIC_SINGLE": {
      const ch = intent.filters?.channel;
      if (ch) {
        out.push(`列出${ch}所有跟进中的线索`, `${ch}渠道的整体漏斗情况`);
      } else if (intent.metric === "overdueCount") {
        out.push("列出超时未跟进的线索", "有多少未分配的线索");
      } else if (intent.metric === "mqlCount") {
        out.push("本周哪个渠道 SQL 转化率最高", "各状态线索分别有多少");
      } else {
        out.push("本周哪个渠道 SQL 转化率最高", "现在有多少超时未跟进的线索");
      }
      break;
    }
    case "LEAD_LIST": {
      if (intent.channel) {
        out.push(`${intent.channel}渠道的加微率是多少`, "本周哪个渠道 SQL 转化率最高");
      } else {
        out.push("列出抖音所有跟进中的线索", "现在有多少超时未跟进的线索");
      }
      break;
    }
    case "LEAD_LOOKUP":
      out.push("现在有多少超时未跟进的线索", "各状态线索分别有多少");
      break;
    case "STATUS_BREAKDOWN":
      out.push("现在有多少超时未跟进的线索", "本周哪个渠道 SQL 转化率最高");
      break;
    case "FUNNEL_OVERALL":
      out.push("哪个渠道加微率最好", "列出跟进中的线索");
      break;
    case "HELP":
    case "UNSUPPORTED":
      out.push(...EXAMPLE_QUESTIONS.slice(0, 4));
      break;
  }

  if (result.answer.includes("未找到") || result.answer.includes("没有可统计")) {
    out.unshift("帮助", "各状态线索分别有多少");
  }

  return [...new Set(out)].slice(0, 5);
}
