export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "-";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "N/A";
  return `${v}%`;
}

/** 看板/查询口径说明：中文公式 + 当前分子分母 */
export function formatRateHint(
  formula: string,
  numerator: number,
  denominator: number
): string {
  if (denominator === 0) return `${formula}（当前分母为 0，无法计算）`;
  return `${formula}（当前 ${numerator} ÷ ${denominator}）`;
}
