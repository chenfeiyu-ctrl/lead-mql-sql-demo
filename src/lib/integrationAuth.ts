import crypto from "crypto";
import type { NextRequest } from "next/server";
import { ApiError } from "./apiResponse";

// 三方回调鉴权 —— HMAC-SHA256 签名验证（Stripe 风格）+ 时间戳防重放。
// 签名基串 = `${timestamp}.${rawBody}`，用共享密钥 HMAC-SHA256 后十六进制输出。
// 密钥仅服务端持有，永不下发前端；未配置密钥时「默认拒绝」（fail-closed）。

export const SIGNATURE_HEADER = "x-webhook-signature";
export const TIMESTAMP_HEADER = "x-webhook-timestamp";

// 允许的时间偏移（防重放）：请求时间戳与服务器时间相差超过此值即拒绝。
export const MAX_SKEW_MS = 5 * 60 * 1000;

export function getWebhookSecret(): string {
  return process.env.INTEGRATION_WEBHOOK_SECRET || "";
}

export function signWebhook(rawBody: string, timestamp: string, secret: string): string {
  const base = `${timestamp}.${rawBody}`;
  const hex = crypto.createHmac("sha256", secret).update(base).digest("hex");
  return `sha256=${hex}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

// 常量时间比较，避免时序侧信道
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyWebhook(
  rawBody: string,
  headers: Headers,
  now: number = Date.now()
): VerifyResult {
  const secret = getWebhookSecret();
  if (!secret) {
    return { ok: false, reason: "服务端未配置 INTEGRATION_WEBHOOK_SECRET，已拒绝所有回调" };
  }

  const signature = headers.get(SIGNATURE_HEADER);
  const timestamp = headers.get(TIMESTAMP_HEADER);
  if (!signature || !timestamp) {
    return { ok: false, reason: `缺少 ${SIGNATURE_HEADER} 或 ${TIMESTAMP_HEADER} 请求头` };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) {
    return { ok: false, reason: "时间戳过期或非法（防重放窗口 5 分钟）" };
  }

  const expected = signWebhook(rawBody, timestamp, secret);
  if (!timingSafeEqualStr(signature, expected)) {
    return { ok: false, reason: "签名校验失败" };
  }

  return { ok: true };
}

// 路由入口：读取原始 body（用于签名校验），校验失败抛 UNAUTHORIZED。
// 返回原始文本，调用方自行 JSON.parse（保证校验与解析基于同一字节流）。
export async function requireWebhookAuth(req: NextRequest): Promise<string> {
  const raw = await req.text();
  const result = verifyWebhook(raw, req.headers);
  if (!result.ok) {
    throw new ApiError("UNAUTHORIZED", `回调鉴权失败：${result.reason}`);
  }
  return raw;
}
