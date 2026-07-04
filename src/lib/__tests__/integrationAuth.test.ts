import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  signWebhook,
  verifyWebhook,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  MAX_SKEW_MS,
} from "../integrationAuth";

const SECRET = "test-secret";

function headersOf(sig?: string, ts?: string): Headers {
  const h = new Headers();
  if (sig !== undefined) h.set(SIGNATURE_HEADER, sig);
  if (ts !== undefined) h.set(TIMESTAMP_HEADER, ts);
  return h;
}

describe("integrationAuth.verifyWebhook", () => {
  const OLD = process.env.INTEGRATION_WEBHOOK_SECRET;
  beforeEach(() => {
    process.env.INTEGRATION_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.INTEGRATION_WEBHOOK_SECRET = OLD;
  });

  it("合法签名 + 新鲜时间戳 → 通过", () => {
    const body = JSON.stringify({ a: 1, phone: "13800000001" });
    const now = Date.now();
    const ts = now.toString();
    const sig = signWebhook(body, ts, SECRET);
    expect(verifyWebhook(body, headersOf(sig, ts), now)).toEqual({ ok: true });
  });

  it("body 被篡改 → 签名校验失败", () => {
    const body = JSON.stringify({ amount: 1 });
    const now = Date.now();
    const ts = now.toString();
    const sig = signWebhook(body, ts, SECRET);
    const tampered = JSON.stringify({ amount: 999 });
    const r = verifyWebhook(tampered, headersOf(sig, ts), now);
    expect(r.ok).toBe(false);
  });

  it("时间戳过期（超出防重放窗口）→ 拒绝", () => {
    const body = "{}";
    const now = Date.now();
    const oldTs = (now - MAX_SKEW_MS - 1000).toString();
    const sig = signWebhook(body, oldTs, SECRET);
    const r = verifyWebhook(body, headersOf(sig, oldTs), now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("防重放");
  });

  it("缺少签名头 → 拒绝", () => {
    const now = Date.now();
    const r = verifyWebhook("{}", headersOf(undefined, now.toString()), now);
    expect(r.ok).toBe(false);
  });

  it("错误密钥签名 → 拒绝", () => {
    const body = "{}";
    const now = Date.now();
    const ts = now.toString();
    const badSig = signWebhook(body, ts, "wrong-secret");
    const r = verifyWebhook(body, headersOf(badSig, ts), now);
    expect(r.ok).toBe(false);
  });

  it("服务端未配置密钥 → 默认拒绝（fail-closed）", () => {
    delete process.env.INTEGRATION_WEBHOOK_SECRET;
    const body = "{}";
    const now = Date.now();
    const ts = now.toString();
    // 即便带了看似合法的签名，未配置密钥也拒绝
    const sig = signWebhook(body, ts, SECRET);
    const r = verifyWebhook(body, headersOf(sig, ts), now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("未配置");
  });
});
