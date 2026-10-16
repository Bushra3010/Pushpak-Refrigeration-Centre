/**
 * Money helpers. All monetary amounts are INR rupees as JS numbers, rounded to
 * paise (2 dp) at every boundary. Allocations are done in integer paise with a
 * largest-remainder method so that allocated parts always sum exactly to the
 * source amount — this is what lets every allocation reconcile to its source.
 */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const toPaise = (n: number) => Math.round(n * 100);
export const fromPaise = (p: number) => p / 100;

export function sum(values: Iterable<number>): number {
  let p = 0;
  for (const v of values) p += toPaise(v);
  return fromPaise(p);
}

/**
 * Split `amount` across keys in proportion to `weights` (largest-remainder in
 * paise). If all weights are zero/empty, nothing is allocated and the full
 * amount is returned as `unallocated`.
 */
export function allocate<K extends string>(
  amount: number,
  weights: Record<K, number>,
): { parts: Record<K, number>; unallocated: number } {
  const keys = (Object.keys(weights) as K[]).filter((k) => weights[k] > 0);
  const totalW = keys.reduce((a, k) => a + weights[k], 0);
  const parts = {} as Record<K, number>;
  if (totalW <= 0 || amount === 0) {
    for (const k of keys) parts[k] = 0;
    return { parts, unallocated: round2(amount) };
  }
  const totalP = toPaise(amount);
  const sign = totalP < 0 ? -1 : 1;
  const absP = Math.abs(totalP);
  const raw = keys.map((k) => (absP * weights[k]) / totalW);
  const floors = raw.map(Math.floor);
  let rem = absP - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rem <= 0) break;
    floors[i] += 1;
    rem -= 1;
  }
  keys.forEach((k, i) => (parts[k] = fromPaise(sign * floors[i])));
  return { parts, unallocated: 0 };
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const inr0 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const formatINR = (n: number | null | undefined, whole = false) =>
  n == null || Number.isNaN(n) ? "—" : (whole ? inr0 : inr).format(n);
export const formatNum = (n: number | null | undefined, dp = 2) =>
  n == null || Number.isNaN(n)
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: dp }).format(n);
export const formatPct = (n: number | null | undefined, dp = 1) =>
  n == null || !Number.isFinite(n) ? "—" : `${num.format(Number(n.toFixed(dp)))}%`;

/** Price from cost using markup on cost: price = cost × (1 + markup%). */
export function priceFromMarkup(cost: number, markupPct: number) {
  if (markupPct < 0) throw new Error("Markup cannot be negative");
  return round2(cost * (1 + markupPct / 100));
}

/** Price from cost using target margin on price: price = cost ÷ (1 − margin%). */
export function priceFromMargin(cost: number, marginPct: number) {
  if (marginPct < 0 || marginPct >= 100) throw new Error("Target margin must be between 0% and 99.99%");
  return round2(cost / (1 - marginPct / 100));
}

/** Margin % = profit ÷ price. Returns null when price is zero. */
export function marginPct(price: number, cost: number) {
  return price === 0 ? null : ((price - cost) / price) * 100;
}
/** Markup % = profit ÷ cost. Returns null when cost is zero. */
export function markupPct(price: number, cost: number) {
  return cost === 0 ? null : ((price - cost) / cost) * 100;
}
