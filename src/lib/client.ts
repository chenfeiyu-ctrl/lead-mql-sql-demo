// 客户端 API 封装：统一解析 { ok, data, error } 响应结构。

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}
export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown
): Promise<ApiSuccess<T> | ApiFailure> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  try {
    return (await res.json()) as ApiSuccess<T> | ApiFailure;
  } catch {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: `请求失败（HTTP ${res.status}）` },
    };
  }
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body),
};
