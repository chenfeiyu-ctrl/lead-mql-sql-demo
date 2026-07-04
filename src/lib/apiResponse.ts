import { NextResponse } from "next/server";
import { ZodError } from "zod";

// 统一响应结构：{ ok, data } / { ok:false, error:{ code, message, details } }

// 错误码与 docs/04 §1.3 业务错误码注册表保持一致。
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "MQL_PRECONDITION_FAILED"
  | "SQL_PRECONDITION_FAILED"
  | "OWNER_REQUIRED"
  | "PRECONDITION_FAILED"
  | "OPTIMISTIC_LOCK_CONFLICT"
  | "DUPLICATE_PHONE"
  | "INTEGRATION_INVALID_PAYLOAD"
  | "NL_NOT_CONFIGURED"
  | "NL_SQL_DISABLED"
  | "NL_SQL_FAILED"
  | "CONFLICT"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  MQL_PRECONDITION_FAILED: 409,
  SQL_PRECONDITION_FAILED: 409,
  OWNER_REQUIRED: 409,
  PRECONDITION_FAILED: 422,
  OPTIMISTIC_LOCK_CONFLICT: 409,
  DUPLICATE_PHONE: 409,
  INTEGRATION_INVALID_PAYLOAD: 422,
  NL_NOT_CONFIGURED: 503,
  NL_SQL_DISABLED: 503,
  NL_SQL_FAILED: 422,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  statusOverride?: number
) {
  const status = statusOverride ?? STATUS_BY_CODE[code] ?? 400;
  return NextResponse.json(
    { ok: false, error: { code, message, details } },
    { status }
  );
}

// 业务异常：在 service 层抛出，route 层统一捕获
export class ApiError extends Error {
  code: ApiErrorCode;
  details?: unknown;
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function handleRouteError(err: unknown) {
  if (err instanceof ApiError) {
    return fail(err.code, err.message, err.details);
  }
  if (err instanceof ZodError) {
    return fail("VALIDATION_ERROR", "参数校验失败", err.flatten());
  }
  console.error("[API_UNHANDLED]", err);
  const message = err instanceof Error ? err.message : "服务器内部错误";
  return fail("INTERNAL_ERROR", message);
}
