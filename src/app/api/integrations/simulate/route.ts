import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError } from "@/lib/apiResponse";
import {
  getWebhookSecret,
  signWebhook,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/integrationAuth";

export const dynamic = "force-dynamic";

// POST /api/integrations/simulate —— 演示用「模拟外部系统」。
// 前端不持有密钥；本路由在服务端用共享密钥对 payload 签名后，转发到真实回调端点，
// 从而完整演示带鉴权的回调链路（含幂等/防重放）。生产环境应移除或加内部保护。

const TARGETS = ["ad-leads", "call-callback", "wechat-callback"] as const;

const schema = z.object({
  target: z.enum(TARGETS),
  payload: z.record(z.unknown()),
});

export async function POST(req: NextRequest) {
  try {
    const { target, payload } = schema.parse(await req.json());

    const secret = getWebhookSecret();
    if (!secret) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INTEGRATION_NOT_CONFIGURED",
            message: "未配置 INTEGRATION_WEBHOOK_SECRET，无法模拟已签名回调",
          },
        },
        { status: 503 }
      );
    }

    const raw = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const signature = signWebhook(raw, timestamp, secret);

    const url = new URL(`/api/integrations/${target}`, req.nextUrl.origin);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: signature,
        [TIMESTAMP_HEADER]: timestamp,
      },
      body: raw,
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return handleRouteError(err);
  }
}
