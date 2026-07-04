import type { MainStatus } from "../types";

// 中文状态短语 → mainStatus（LEAD_LIST / 规则解析用）

const PHRASE_TO_STATUS: [RegExp, MainStatus][] = [
  [/跟进中|在跟进|待跟进|跟进的/, "FOLLOWING"],
  [/待外呼|未外呼/, "TO_CALL"],
  [/外呼中/, "CALLING"],
  [/有效线索|有效的/, "VALID"],
  [/无效|失效/, "INVALID"],
  [/待加微|未加微/, "TO_ADD_WECHAT"],
  [/已加微|加微成功/, "WECHAT_ADDED"],
  [/\bMQL\b|营销认可|市场认可/, "MQL"],
  [/\bSQL\b|销售商机|销售认可/, "SQL"],
  [/新线索|^新$/, "NEW"],
  [/已关闭|关闭/, "CLOSED"],
];

export function inferMainStatusFromText(text: string): MainStatus | undefined {
  for (const [re, status] of PHRASE_TO_STATUS) {
    if (re.test(text)) return status;
  }
  return undefined;
}
