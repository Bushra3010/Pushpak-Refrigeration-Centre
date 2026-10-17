/**
 * Technician Calculators hub — pure calculation functions (unit-tested in tests/tools.test.ts).
 *
 * Copper pipe and tonnage reuse ./pipe and ./tonnage. Everything here works on full precision and
 * rounds money to paise only at the end; display rounding is the screen's job. Functions throw
 * ToolError with a readable message for invalid input, and return an `unavailable` reason (never a
 * guess) when approved reference data is missing.
 */

import { round2, sum } from "./money";
import type { CableTable, PtDataset, RefrigerantRule, TravelPolicy } from "../tool-settings";

export class ToolError extends Error {}
const need = (ok: boolean, msg: string) => { if (!ok) throw new ToolError(msg); };
const pos = (n: number) => Number.isFinite(n) && n > 0;
const nonNeg = (n: number) => Number.isFinite(n) && n >= 0;

/* ───────────── quotations ───────────── */

export type QLine = { name: string; kind: "Service" | "Part" | "Labour" | "Material"; qty: number; unit: string; rate: number; refId?: string };
export type QLineOut = QLine & { amount: number };
export type QuoteTotals = { lines: QLineOut[]; subtotal: number; discount: number; taxable: number; gstPct: number; gst: number; total: number };

/**
 * Itemised quotation. Discount is an amount (₹) capped by `maxDiscountPct` of the subtotal; GST is on
 * the discounted (taxable) value. Zero-quantity lines are dropped.
 */
export function quoteTotals(lines: QLine[], discount: number, gstPct: number, maxDiscountPct = 100): QuoteTotals {
  need(nonNeg(discount), "Discount cannot be negative.");
  need(nonNeg(gstPct), "GST % cannot be negative.");
  const out: QLineOut[] = [];
  for (const l of lines) {
    need(nonNeg(l.qty), `Quantity for "${l.name}" must be 0 or more.`);
    need(nonNeg(l.rate), `Rate for "${l.name}" is missing or negative.`);
    if (l.qty === 0) continue;
    out.push({ ...l, amount: round2(l.qty * l.rate) });
  }
  const subtotal = sum(out.map((l) => l.amount));
  need(discount <= subtotal, "Discount cannot be more than the subtotal.");
  const maxDisc = round2((subtotal * maxDiscountPct) / 100);
  need(discount <= maxDisc + 1e-9, `Discount above the allowed ${maxDiscountPct}% (max ₹${maxDisc.toLocaleString("en-IN")}) needs office approval.`);
  const taxable = round2(subtotal - discount);
  const gst = round2((taxable * gstPct) / 100);
  return { lines: out, subtotal, discount: round2(discount), taxable, gstPct, gst, total: round2(taxable + gst) };
}

/* ───────────── 04 extra material ───────────── */

export type ExtraItem = { name: string; unit: string; included: number; actual: number; rate: number; refId?: string };

/** Charge only what is used beyond the package allowance — never negative, never the included part again. */
export function extraMaterial(items: ExtraItem[]) {
  const rows = items.map((i) => {
    need(nonNeg(i.included) && nonNeg(i.actual), `Quantities for "${i.name}" must be 0 or more.`);
    need(nonNeg(i.rate), `Rate for "${i.name}" is missing.`);
    const chargeable = Math.max(0, i.actual - i.included);
    return { ...i, chargeable, unused: Math.max(0, i.included - i.actual), amount: round2(chargeable * i.rate) };
  });
  return { rows, total: sum(rows.map((r) => r.amount)) };
}

/* ───────────── 05 drain pipe ───────────── */

export function drainPipe(i: { routeM: number; rise: number; run: number; fittings: number; wastagePct: number; ratePerM: number; fittingRate: number; stockLengthM?: number | null }) {
  need(pos(i.routeM), "Route length must be more than zero.");
  need(pos(i.rise) && pos(i.run), "Select a slope.");
  need(nonNeg(i.fittings) && Number.isInteger(i.fittings), "Fittings must be a whole number.");
  need(nonNeg(i.wastagePct) && i.wastagePct < 100, "Wastage must be 0–99%.");
  need(nonNeg(i.ratePerM) && nonNeg(i.fittingRate), "Drain rates are missing.");
  const slope = i.rise / i.run;
  const dropMm = i.routeM * slope * 1000;
  const pipeM = i.routeM * (1 + i.wastagePct / 100);
  const pieces = i.stockLengthM && i.stockLengthM > 0 ? Math.ceil(pipeM / i.stockLengthM - 1e-9) : null;
  const pipePrice = round2(pipeM * i.ratePerM);
  const fittingPrice = round2(i.fittings * i.fittingRate);
  return { slopePct: slope * 100, dropMm, mmPerM: slope * 1000, pipeM, pieces, pipePrice, fittingPrice, total: round2(pipePrice + fittingPrice) };
}

/* ───────────── 06 insulation ───────────── */

export function insulation(i: { pipeOdMm: number; thicknessMm: number; pipeLengthM: number; pieceLengthM: number; wastagePct: number; ratePerPiece: number }) {
  need(pos(i.pipeOdMm), "Pipe outside diameter must be more than zero.");
  need(pos(i.thicknessMm), "Insulation thickness must be more than zero.");
  need(pos(i.pipeLengthM), "Pipe length must be more than zero.");
  need(pos(i.pieceLengthM), "Stock piece length must be more than zero.");
  need(nonNeg(i.wastagePct) && i.wastagePct < 100, "Wastage must be 0–99%.");
  need(nonNeg(i.ratePerPiece), "Insulation rate is missing.");
  const totalM = i.pipeLengthM * (1 + i.wastagePct / 100);
  const pieces = Math.ceil(totalM / i.pieceLengthM - 1e-9);
  return { requiredIdMm: i.pipeOdMm, outerDiaMm: i.pipeOdMm + 2 * i.thicknessMm, totalM, pieces, price: round2(pieces * i.ratePerPiece) };
}

/* ───────────── 07 cable & voltage drop ───────────── */

/** Resistivity at 20 °C, Ω·mm²/m (IEC 60028 annealed copper standard 1/58; aluminium 0.028264) and temperature coefficients /K. */
export const CONDUCTORS = {
  Copper: { rho20: 0.017241, alpha: 0.00393 },
  Aluminium: { rho20: 0.028264, alpha: 0.00403 },
} as const;
export const CONDUCTOR_SOURCE = "Resistivity: IEC 60028 (copper, 1/58 Ω·mm²/m at 20 °C) and IEC 60889 / IACS 61% (aluminium); α = 0.00393 /K Cu, 0.00403 /K Al. Resistive drop only (power factor 1, reactance ignored) — an approximation for short final circuits.";

export type CableInput = {
  currentA: number; voltage: number; phase: "single" | "three"; lengthM: number; material: "Copper" | "Aluminium"; sizeMm2: number;
  conductorTempC: number; method: string; deratingFactor: number; tables: CableTable[]; dropLimitPct: number | null; dropLimitSource: string;
};

export function cableAssessment(i: CableInput) {
  need(pos(i.currentA), "Enter the running current from the manufacturer's nameplate or manual (not from tonnage).");
  need(pos(i.voltage), "Enter the supply voltage.");
  need(pos(i.lengthM), "Cable length must be more than zero.");
  need(pos(i.sizeMm2), "Enter the conductor size in mm².");
  need(Number.isFinite(i.conductorTempC) && i.conductorTempC > -40 && i.conductorTempC < 200, "Conductor temperature must be realistic (°C).");
  need(pos(i.deratingFactor) && i.deratingFactor <= 1.5, "Derating factor must be from the approved table (usually 0.5–1).");
  const c = CONDUCTORS[i.material];
  const rho = c.rho20 * (1 + c.alpha * (i.conductorTempC - 20));
  const rPerConductor = (rho * i.lengthM) / i.sizeMm2; // Ω, one way
  const dropV = i.phase === "single" ? 2 * i.currentA * rPerConductor : Math.sqrt(3) * i.currentA * rPerConductor;
  const dropPct = (dropV / i.voltage) * 100;
  const limit = i.dropLimitPct != null && i.dropLimitSource.trim() ? i.dropLimitPct : null;
  const dropAssessment =
    limit == null
      ? { status: "unavailable" as const, text: "No approved voltage-drop limit is configured — the office must set the limit and its source in Cost & Calc Rules." }
      : dropPct <= limit
        ? { status: "ok" as const, text: `Within the approved ${limit}% limit (${i.dropLimitSource}).` }
        : { status: "exceeds" as const, text: `Exceeds the approved ${limit}% limit (${i.dropLimitSource}) — a larger conductor or shorter run is needed.` };
  const table = i.tables.find((t) => t.verified && t.material === i.material && t.method === i.method);
  const row = table?.rows.find((x) => Math.abs(x.sizeMm2 - i.sizeMm2) < 1e-9);
  const capacity = !table
    ? { status: "unavailable" as const, text: `Assessment unavailable — no verified current-rating table for ${i.material} cable, installation method "${i.method || "—"}". The office must add one from IS 3961 / IEC 60364-5-52 or the cable maker's datasheet.` }
    : !row
      ? { status: "unavailable" as const, text: `Assessment unavailable — ${table.name} has no row for ${i.sizeMm2} mm².` }
      : (() => {
          const derated = row.amps * i.deratingFactor;
          return derated >= i.currentA
            ? { status: "ok" as const, text: `${row.amps} A × derating ${i.deratingFactor} = ${round2(derated)} A ≥ ${i.currentA} A (${table.name}; ${table.source}).`, derated }
            : { status: "exceeds" as const, text: `${row.amps} A × derating ${i.deratingFactor} = ${round2(derated)} A < ${i.currentA} A — conductor too small (${table.name}).`, derated };
        })();
  return { rho, rPerConductor, dropV, dropPct, dropAssessment, capacity, table: table?.name ?? null };
}

/* ───────────── 08 stand ───────────── */

export function standCheck(i: { unitWeightKg: number; ratedLoadKg: number | null; ratingVerified: boolean; ratingSource: string; factor: number }) {
  need(pos(i.unitWeightKg), "Enter the outdoor unit weight from the manufacturer's specification.");
  if (i.ratedLoadKg == null || !(i.ratedLoadKg > 0) || !i.ratingVerified || !i.ratingSource.trim())
    return { status: "unverified" as const, required: i.unitWeightKg * i.factor, text: "Compatibility not assessed — enter the stand's rated load from its maker's label/datasheet, its source, and confirm it is verified." };
  const required = i.unitWeightKg * i.factor;
  return i.ratedLoadKg >= required
    ? { status: "ok" as const, required, text: `Rated ${i.ratedLoadKg} kg ≥ ${round2(required)} kg required (unit ${i.unitWeightKg} kg × ${i.factor}). Load rating only — the wall/structure and anchoring still need on-site judgement.` }
    : { status: "fail" as const, required, text: `Rated ${i.ratedLoadKg} kg < ${round2(required)} kg required — choose a higher-rated stand.` };
}

/* ───────────── 09 refrigerant charge ───────────── */

export type ChargeRule = Pick<RefrigerantRule, "refrigerant" | "factoryChargeG" | "includedLengthM" | "additionalGPerM" | "minLengthM" | "maxLengthM" | "shortRunRemovalGPerM" | "source">;

/**
 * Additional charge per the manufacturer's rule only. Shorter runs get NO removal unless the rule
 * explicitly gives a short-run removal rate. Throws when the rule is incomplete or the run is outside
 * the manufacturer's limits.
 */
export function refrigerantCharge(rule: ChargeRule | null, actualLengthM: number) {
  if (!rule || !rule.source.trim()) return { unavailable: "Manufacturer data required — select a verified model rule or enter the values from the unit's installation manual with the page/source." } as const;
  need(nonNeg(rule.includedLengthM) && nonNeg(rule.additionalGPerM), "The manufacturer's included length and g/m rule are both required.");
  need(pos(actualLengthM), "Enter the actual one-way pipe length.");
  if (rule.maxLengthM != null) need(actualLengthM <= rule.maxLengthM, `Actual length ${actualLengthM} m exceeds the manufacturer's maximum ${rule.maxLengthM} m — do not proceed without the manufacturer's guidance.`);
  if (rule.minLengthM != null) need(actualLengthM >= rule.minLengthM, `Actual length ${actualLengthM} m is below the manufacturer's minimum ${rule.minLengthM} m.`);
  const over = actualLengthM - rule.includedLengthM;
  let additionalG = 0;
  let note: string;
  if (over > 0) { additionalG = over * rule.additionalGPerM; note = `(${actualLengthM} − ${rule.includedLengthM}) m × ${rule.additionalGPerM} g/m`; }
  else if (over < 0 && rule.shortRunRemovalGPerM != null) { additionalG = over * rule.shortRunRemovalGPerM; note = `Manufacturer short-run rule: (${actualLengthM} − ${rule.includedLengthM}) m × ${rule.shortRunRemovalGPerM} g/m`; }
  else note = over < 0 ? "Shorter than the included length — no removal (the manufacturer rule gives no short-run reduction)." : "Equal to the included length — no additional charge.";
  const targetG = rule.factoryChargeG != null && rule.factoryChargeG > 0 ? rule.factoryChargeG + additionalG : null;
  return { additionalG, targetG, note, refrigerant: rule.refrigerant, source: rule.source } as const;
}

/* ───────────── 10 refrigerant usage ───────────── */

export function refrigerantUsage(beforeKg: number, afterKg: number, ratePerKg: number) {
  need(pos(beforeKg), "Enter the cylinder weight before charging.");
  need(nonNeg(afterKg), "Enter the cylinder weight after charging.");
  need(afterKg <= beforeKg, "Ending weight is greater than the starting weight — re-weigh the cylinder.");
  need(nonNeg(ratePerKg), "Refrigerant rate is missing.");
  const usedKg = beforeKg - afterKg;
  return { usedKg, usedG: usedKg * 1000, charge: round2(usedKg * ratePerKg) };
}

/* ───────────── 25 gas weight ↔ price ───────────── */

/**
 * Loose gas sold by weight. "weight": grams → price. "price": customer budget (₹, GST-inclusive when
 * gstPct > 0) → grams to give. Base and GST are rounded to paise; grams stay full precision.
 */
export function gasWeightPrice(mode: "weight" | "price", ratePerKg: number, value: number, gstPct: number) {
  need(pos(ratePerKg), "Enter the gas selling rate per kg.");
  need(nonNeg(gstPct), "GST % cannot be negative.");
  if (mode === "weight") {
    need(pos(value), "Enter the gas weight in grams.");
    const base = round2((value / 1000) * ratePerKg);
    const gst = round2((base * gstPct) / 100);
    return { grams: value, base, gst, total: round2(base + gst) };
  }
  need(pos(value), "Enter the customer's budget in ₹.");
  const base = round2(value / (1 + gstPct / 100));
  return { grams: (base / ratePerKg) * 1000, base, gst: round2(value - base), total: value };
}

/* ───────────── pressure units ───────────── */

export const ATM_KPA = 101.325;
export const KPA_PER = { kPa: 1, bar: 100, psi: 6.894757293168, MPa: 1000 } as const;
export type PUnit = keyof typeof KPA_PER;
export const toKpa = (v: number, u: PUnit) => v * KPA_PER[u];
export const fromKpa = (kpa: number, u: PUnit) => kpa / KPA_PER[u];
/** Convert a reading to absolute kPa. Gauge readings add the local atmospheric pressure. */
export const toAbsKpa = (v: number, u: PUnit, basis: "gauge" | "absolute", atmKpa = ATM_KPA) => toKpa(v, u) + (basis === "gauge" ? atmKpa : 0);

/* ───────────── 11 pressure–temperature ───────────── */

function interp(x: number, xs: number[], ys: number[]): number | null {
  for (let k = 0; k < xs.length - 1; k++) {
    const [a, b] = [xs[k], xs[k + 1]];
    if ((x >= a && x <= b) || (x <= a && x >= b)) return a === b ? ys[k] : ys[k] + ((x - a) * (ys[k + 1] - ys[k])) / (b - a);
  }
  return null;
}

export function ptDatasetFor(datasets: PtDataset[], refrigerant: string) {
  return datasets.find((d) => d.verified && d.refrigerant === refrigerant && d.rows.length >= 2) ?? null;
}

export type PtResult =
  | { unavailable: string }
  | { dataset: PtDataset; tempC?: { bubble: number | null; dew: number | null }; pressureKpaA?: { bubble: number; dew: number }; range: { tMin: number; tMax: number } };

/** Look up saturation by pressure (absolute kPa) or by temperature. Linear interpolation within the verified table only. */
export function ptLookup(datasets: PtDataset[], refrigerant: string, q: { pressureKpaA?: number; tempC?: number }): PtResult {
  const ds = ptDatasetFor(datasets, refrigerant);
  if (!ds) return { unavailable: `No verified pressure–temperature table for ${refrigerant}. The office must add one (absolute pressure, bubble and dew points for blends) from a cited source — e.g. the refrigerant maker's PT chart or NIST REFPROP — and mark it verified.` };
  const rows = [...ds.rows].sort((a, b) => a.tempC - b.tempC);
  const T = rows.map((r) => r.tempC);
  const B = rows.map((r) => r.bubbleKpaA);
  const D = rows.map((r) => r.dewKpaA);
  const range = { tMin: T[0], tMax: T.at(-1)! };
  if (q.pressureKpaA != null) {
    need(pos(q.pressureKpaA), "Absolute pressure must be more than zero.");
    // bubble and dew are looked up separately: a blend's reading can be in range on one side only
    const bubble = interp(q.pressureKpaA, B, T);
    const dew = interp(q.pressureKpaA, D, T);
    if (bubble == null && dew == null) return { unavailable: `Pressure is outside the verified table range for ${refrigerant} (${range.tMin} °C to ${range.tMax} °C).` };
    return { dataset: ds, tempC: { bubble, dew }, range };
  }
  need(q.tempC != null && Number.isFinite(q.tempC), "Enter a pressure or a temperature.");
  const bubble = interp(q.tempC!, T, B);
  const dew = interp(q.tempC!, T, D);
  if (bubble == null || dew == null) return { unavailable: `Temperature is outside the verified table range (${range.tMin} °C to ${range.tMax} °C).` };
  return { dataset: ds, pressureKpaA: { bubble, dew }, range };
}

/* ───────────── 12 superheat / subcooling ───────────── */

/** Superheat uses the DEW-point saturation at suction pressure; subcooling the BUBBLE-point at liquid pressure. */
export function superheatSubcool(datasets: PtDataset[], refrigerant: string, i: { suctionKpaA?: number | null; suctionLineC?: number | null; liquidKpaA?: number | null; liquidLineC?: number | null }) {
  const ds = ptDatasetFor(datasets, refrigerant);
  if (!ds) return { unavailable: (ptLookup(datasets, refrigerant, { tempC: 0 }) as { unavailable: string }).unavailable } as const;
  need(i.suctionKpaA != null || i.liquidKpaA != null, "Enter suction readings for superheat and/or liquid readings for subcooling.");
  let superheat: { satC: number; lineC: number; value: number } | { unavailable: string } | null = null;
  let subcool: { satC: number; lineC: number; value: number } | { unavailable: string } | null = null;
  if (i.suctionKpaA != null) {
    need(i.suctionLineC != null && Number.isFinite(i.suctionLineC), "Enter the suction-line temperature.");
    const r = ptLookup(datasets, refrigerant, { pressureKpaA: i.suctionKpaA });
    const dew = "unavailable" in r ? null : r.tempC!.dew;
    superheat = dew == null ? { unavailable: "Suction pressure is outside the verified table's dew-point range." } : { satC: dew, lineC: i.suctionLineC!, value: i.suctionLineC! - dew };
  }
  if (i.liquidKpaA != null) {
    need(i.liquidLineC != null && Number.isFinite(i.liquidLineC), "Enter the liquid-line temperature.");
    const r = ptLookup(datasets, refrigerant, { pressureKpaA: i.liquidKpaA });
    const bubble = "unavailable" in r ? null : r.tempC!.bubble;
    subcool = bubble == null ? { unavailable: "Liquid pressure is outside the verified table's bubble-point range." } : { satC: bubble, lineC: i.liquidLineC!, value: bubble - i.liquidLineC! };
  }
  return { dataset: ds, superheat, subcool } as const;
}

/* ───────────── 13 air ΔT ───────────── */

export function airDeltaT(returnC: number, supplyC: number, mode: "cooling" | "heating") {
  need(Number.isFinite(returnC) && Number.isFinite(supplyC), "Enter both return-air and supply-air temperatures.");
  need(returnC > -30 && returnC < 70 && supplyC > -30 && supplyC < 90, "Temperatures look out of range — check the probe and units (°C).");
  const dt = mode === "cooling" ? returnC - supplyC : supplyC - returnC;
  return { deltaC: dt, deltaF: dt * 1.8, unexpected: dt < 0 };
}

/* ───────────── 14 airflow ───────────── */

export const M3H_PER_CFM = 1.6990108; // 1 ft³/min = 0.0283168466 m³ × 60
export function airflow(i: { velocity: number; velocityUnit: "m/s" | "fpm"; area: number; areaUnit: "m²" | "ft²"; areaKind: "effective" | "gross"; freeAreaFactor: number | null }) {
  need(pos(i.velocity), "Enter the average measured velocity (traverse average).");
  need(pos(i.area), "Enter the area.");
  let effective = i.area;
  if (i.areaKind === "gross") {
    need(i.freeAreaFactor != null && i.freeAreaFactor > 0 && i.freeAreaFactor <= 1, "Gross grille size needs the grille maker's free-area factor (0–1) — or enter the effective free area directly.");
    effective = i.area * i.freeAreaFactor!;
  }
  const vMs = i.velocityUnit === "m/s" ? i.velocity : i.velocity * 0.00508;
  const aM2 = i.areaUnit === "m²" ? effective : effective * 0.09290304;
  const m3h = vMs * aM2 * 3600;
  return { effectiveArea: effective, vMs, aM2, m3h, cfm: m3h / M3H_PER_CFM };
}

/* ───────────── 16 electricity ───────────── */

export function electricityCost(kw: number, hoursPerDay: number, days: number, tariff: number) {
  need(pos(kw), "Enter the measured (or rated) electrical INPUT in kW — not the cooling capacity.");
  need(kw < 50, "Electrical input above 50 kW is unusual for a room AC — check the value.");
  need(pos(hoursPerDay) && hoursPerDay <= 24, "Hours per day must be between 0 and 24.");
  need(pos(days) && Number.isInteger(days), "Days must be a whole number.");
  need(nonNeg(tariff), "Enter the tariff (₹ per kWh).");
  const dailyKwh = kw * hoursPerDay;
  return { dailyKwh, kwh: dailyKwh * days, daily: round2(dailyKwh * tariff), period: round2(dailyKwh * days * tariff), monthly30: round2(dailyKwh * 30 * tariff) };
}

/* ───────────── 17 replacement savings ───────────── */

export function replacementSavings(oldKwhYr: number, newKwhYr: number, tariff: number, investment: number, comparable: boolean) {
  need(comparable, "Confirm both figures use the same usage assumptions (hours, set-point, room).");
  need(pos(oldKwhYr) && pos(newKwhYr), "Enter both annual consumptions in kWh.");
  need(pos(tariff), "Enter the tariff (₹ per kWh).");
  need(nonNeg(investment), "Investment cannot be negative.");
  const kwh = oldKwhYr - newKwhYr;
  const money = round2(kwh * tariff);
  return { kwh, money, paybackYears: money > 0 ? investment / money : null };
}

/* ───────────── 19 unit conversion ───────────── */

export const BTUH_PER_KW_COOLING = 3412.142;
export type ConvKind = "length-ft-m" | "length-in-mm" | "mass" | "temp" | "pressure" | "cooling" | "airflow";

export function convert(kind: ConvKind, value: number, from: string, opts: { basis?: "gauge" | "absolute"; atmKpa?: number } = {}): { unit: string; value: number }[] {
  need(Number.isFinite(value), "Enter a number.");
  const out = (pairs: [string, number][]) => pairs.filter(([u]) => u !== from).map(([unit, v]) => ({ unit, value: v }));
  switch (kind) {
    case "length-ft-m": return out([["ft", from === "ft" ? value : value / 0.3048], ["m", from === "m" ? value : value * 0.3048]]);
    case "length-in-mm": return out([["in", from === "in" ? value : value / 25.4], ["mm", from === "mm" ? value : value * 25.4]]);
    case "mass": { const kg = from === "kg" ? value : value / 1000; return out([["kg", kg], ["g", kg * 1000]]); }
    case "temp": { const c = from === "°C" ? value : (value - 32) / 1.8; need(c >= -273.15, "Below absolute zero."); return out([["°C", c], ["°F", c * 1.8 + 32]]); }
    case "pressure": {
      const kpa = toKpa(value, from as PUnit);
      const atm = opts.atmKpa ?? ATM_KPA;
      const rows = (Object.keys(KPA_PER) as PUnit[]).map((u) => [u, fromKpa(kpa, u)] as [string, number]);
      const other = opts.basis === "gauge" ? kpa + atm : kpa - atm;
      return [...out(rows), { unit: `kPa ${opts.basis === "gauge" ? "absolute" : "gauge"} (atm ${atm} kPa)`, value: other }];
    }
    case "cooling": {
      const btuh = from === "BTU/h" ? value : from === "TR" ? value * 12000 : value * BTUH_PER_KW_COOLING;
      return out([["BTU/h", btuh], ["TR", btuh / 12000], ["kW cooling", btuh / BTUH_PER_KW_COOLING]]);
    }
    case "airflow": { const m3h = from === "m³/h" ? value : value * M3H_PER_CFM; return out([["m³/h", m3h], ["CFM", m3h / M3H_PER_CFM]]); }
  }
}

/* ───────────── 20 work & travel hours ───────────── */

export type Interval = { kind: "Work" | "Travel" | "Break"; start: string; end: string; id?: string };
const t = (iso: string) => new Date(iso).getTime();

/**
 * Hours by kind without double counting. Overlapping entries are reported (the timer prevents them,
 * manual entries can create them); overlapping time is counted once, with priority Break > Work > Travel
 * so a break inside a work block reduces work. Overnight entries are fine — times carry their dates.
 */
export function summariseIntervals(list: Interval[]) {
  for (const i of list) need(Number.isFinite(t(i.start)) && Number.isFinite(t(i.end)) && t(i.end) > t(i.start), `Entry ${i.start} → ${i.end}: end must be after start.`);
  const overlaps: [Interval, Interval][] = [];
  const sorted = [...list].sort((a, b) => t(a.start) - t(b.start));
  for (let a = 0; a < sorted.length; a++)
    for (let b = a + 1; b < sorted.length && t(sorted[b].start) < t(sorted[a].end); b++) overlaps.push([sorted[a], sorted[b]]);
  const cuts = [...new Set(sorted.flatMap((i) => [t(i.start), t(i.end)]))].sort((x, y) => x - y);
  const rank = { Break: 3, Work: 2, Travel: 1 } as const;
  const ms = { Work: 0, Travel: 0, Break: 0 };
  let duty = 0;
  for (let k = 0; k < cuts.length - 1; k++) {
    const [s, e] = [cuts[k], cuts[k + 1]];
    const covering = sorted.filter((i) => t(i.start) <= s && t(i.end) >= e);
    if (!covering.length) continue;
    const top = covering.reduce((x, y) => (rank[y.kind] > rank[x.kind] ? y : x));
    ms[top.kind] += e - s;
    duty += e - s;
  }
  const h = (m: number) => m / 3_600_000;
  const first = sorted[0];
  const last = sorted.reduce((x, y) => (t(y.end) > t(x.end) ? y : x), sorted[0]);
  return { work: h(ms.Work), travel: h(ms.Travel), break: h(ms.Break), duty: h(duty), span: first ? h(t(last.end) - t(first.start)) : 0, overlaps, overnight: list.some((i) => i.start.slice(0, 10) !== i.end.slice(0, 10)) };
}

/* ───────────── 22 travel claim ───────────── */

export function travelClaim(policy: TravelPolicy, i: { method: "mileage" | "actual" | "both"; km: number; actual: number; receiptRef: string }) {
  const allowed = policy.mode === "both" ? ["mileage", "actual", "both"] : policy.mode === "either" ? ["mileage", "actual"] : [policy.mode];
  need(allowed.includes(i.method), i.method === "both" ? "Policy does not allow mileage and actual fuel together for one trip." : `Policy allows ${policy.mode} claims only.`);
  const useMileage = i.method === "mileage" || i.method === "both";
  const useActual = i.method === "actual" || i.method === "both";
  if (useMileage) { need(pos(i.km), "Enter the distance in km."); need(pos(policy.ratePerKm), "No approved ₹/km rate — ask the office."); }
  if (useActual) {
    need(pos(i.actual), "Enter the actual eligible amount.");
    if (policy.receiptsRequired) need(i.receiptRef.trim().length > 0, "Receipt number / photo reference is required.");
  }
  const mileage = useMileage ? round2(i.km * policy.ratePerKm) : 0;
  const actual = useActual ? round2(i.actual) : 0;
  return { mileage, actual, amount: round2(mileage + actual) };
}

/* ───────────── 23 material requirement ───────────── */

export type MatRow = { name: string; unit: string; planned: number; van: number; issued: number; consumed: number; returned: number; partId?: string };

export function materialRequirement(rows: MatRow[]) {
  return rows.map((r) => {
    for (const [k, v] of Object.entries({ planned: r.planned, van: r.van, issued: r.issued, consumed: r.consumed, returned: r.returned }))
      need(nonNeg(v), `"${r.name}": ${k} must be 0 or more.`);
    need(r.consumed + r.returned <= r.issued + 1e-9, `"${r.name}": consumed + returned (${r.consumed + r.returned}) is more than issued (${r.issued}).`);
    const stillNeeded = Math.max(0, r.planned - r.consumed);
    const onHandForJob = r.issued - r.consumed - r.returned;
    return { ...r, shortage: Math.max(0, stillNeeded - onHandForJob - r.van), unusedForReturn: Math.max(0, onHandForJob - stillNeeded), stillNeeded, onHandForJob };
  });
}

/* ───────────── 24 customer bill ───────────── */

export type BillLine = { id: string; name: string; qty: number; price: number; approved: boolean };

/**
 * Final bill from APPROVED lines only. Lines are de-duplicated by id so an estimate line and the
 * same extra added again are billed once. Rounds GST to the rupee like the invoice (jobTotals).
 */
export function customerBill(lines: BillLine[], discount: number, gstEnabled: boolean, gstPct: number, payments: { amount: number; refund?: boolean }[]) {
  const seen = new Set<string>();
  const billed: BillLine[] = [];
  const duplicates: BillLine[] = [];
  const pending: BillLine[] = [];
  for (const l of lines) {
    if (seen.has(l.id)) { duplicates.push(l); continue; }
    seen.add(l.id);
    (l.approved ? billed : pending).push(l);
  }
  need(nonNeg(discount), "Discount cannot be negative.");
  const subtotal = billed.reduce((a, l) => a + l.qty * l.price, 0);
  const disc = Math.min(discount, subtotal);
  const taxable = subtotal - disc;
  const gst = gstEnabled ? Math.round((taxable * gstPct) / 100) : 0;
  const total = taxable + gst;
  const paid = payments.reduce((a, p) => a + (p.refund ? -p.amount : p.amount), 0);
  const balance = total - paid;
  return { billed, pending, duplicates, subtotal, discount: disc, taxable, gst, cgst: gst / 2, sgst: gst / 2, total, paid, balance: Math.max(0, balance), credit: Math.max(0, -balance) };
}
