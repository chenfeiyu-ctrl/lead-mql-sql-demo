import { maskPhone } from "../../format";

function serializeValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return v;
  return v;
}

/** 对 SQL 结果中的手机号等敏感字段脱敏 */
export function maskSqlRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const serialized = serializeValue(value);
      if (typeof serialized === "string") {
        if (/phone/i.test(key)) {
          next[key] = maskPhone(serialized);
        } else if (/payload/i.test(key) && serialized.length > 120) {
          next[key] = `${serialized.slice(0, 120)}…`;
        } else {
          next[key] = serialized;
        }
      } else {
        next[key] = serialized;
      }
    }
    return next;
  });
}
