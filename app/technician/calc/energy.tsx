"use client";

import { Fragment } from "react";
import { ATM_KPA, LENGTH_UNITS, MM_PER, ToolError, convert, convertLength, electricityCost, feetInches, toFeetInches, type LengthU, quoteTotals, replacementSavings, type ConvKind, type QLine } from "../../lib/calc/tools";
import { AC_TYPES } from "../../lib/data";
import { Box, CalcShell, Check, F, Note, Sel, Two, fmt, num, rs, useCalc, type Ctx, type Result } from "./kit";
import { gstPct, quoteRows, rateOf, toLines } from "./install";
import { parseInches } from "../../lib/calc/units";

/* 16–19 · Energy & Customer Planning */

/* ───────────── 16 Electricity cost ───────────── */

export function ElectricityCost({ ctx }: { ctx: Ctx }) {
  const init = { kw: "", basis: "measured" as "measured" | "rated", hours: "8", days: "30", tariff: "7.5" };
  const calc = useCalc(init, (v): Result => {
    const r = electricityCost(num(v.kw), num(v.hours), num(v.days), num(v.tariff));
    return {
      summary: [{ k: "Energy per day", v: `${fmt(r.dailyKwh, 2)} kWh` }, { k: `Energy for ${v.days} days`, v: `${fmt(r.kwh, 1)} kWh` }, { k: "Cost per day", v: rs(r.daily) }, { k: `Cost for ${v.days} days`, v: rs(r.period), strong: true }, { k: "Per 30-day month", v: rs(r.monthly30) }],
      breakdown: [`kWh = ${v.kw} kW × ${v.hours} h × ${v.days} days`, `Cost = kWh × ₹${v.tariff}/kWh`],
      assumptions: [`Electrical input ${v.basis === "measured" ? "measured on site (clamp meter / energy meter)" : "from the rated input on the nameplate"} — NOT the cooling capacity (a 1.5 TR AC cools ≈ 5.3 kW but draws far less electrical power).`, "Inverter ACs vary their input with room load, outdoor temperature and set-point, so real bills differ.", "Tariff is the customer's average ₹/kWh including slabs and duties as entered."],
      outputs: r,
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} onDemo={() => calc.load({ ...init, kw: "1.2" })} form={<Box>
    <F l="Average electrical input" unit="kW" value={v.kw} onChange={(x) => set({ kw: x })} hint="Electrical input power — not cooling capacity." />
    <Sel l="Input is" value={v.basis} onChange={(x) => set({ basis: x })} options={[["measured", "Measured on site"], ["rated", "Rated (nameplate)"]]} />
    <Two><F l="Running hours / day" unit="h" value={v.hours} onChange={(x) => set({ hours: x })} /><F l="Number of days" value={v.days} onChange={(x) => set({ days: x })} /></Two>
    <F l="Tariff" unit="₹ per kWh" value={v.tariff} onChange={(x) => set({ tariff: x })} />
  </Box>} />;
}

/* ───────────── 17 Replacement savings ───────────── */

export function ReplacementSavings({ ctx }: { ctx: Ctx }) {
  const init = { oldK: "", newK: "", tariff: "7.5", invest: "", comparable: false, assumptions: "8 h/day, 24 °C, same room" };
  const calc = useCalc(init, (v): Result => {
    const r = replacementSavings(num(v.oldK), num(v.newK), num(v.tariff), num(v.invest || "0"), v.comparable);
    const pay = r.paybackYears;
    return {
      summary: [{ k: "Annual energy saved", v: `${fmt(r.kwh, 0)} kWh` }, { k: "Annual money saved", v: rs(r.money), strong: true }, { k: "Simple payback", v: pay == null ? "No payback — no savings under these assumptions" : `${fmt(pay, 1)} years` }],
      warnings: r.money <= 0 ? ["The new unit does not save energy with these figures — no payback is shown."] : [],
      breakdown: [`Saved = ${v.oldK} − ${v.newK} kWh/yr`, `₹ = kWh × ₹${v.tariff}`, ...(pay != null ? [`Payback = ₹${v.invest || 0} ÷ ₹${fmt(r.money, 0)}/yr`] : [])],
      assumptions: [`Same usage for both: ${v.assumptions}.`, "Estimate only; ignores tariff changes, maintenance and financing."],
      outputs: r,
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} onDemo={() => calc.load({ ...init, oldK: "1650", newK: "980", invest: "42000", comparable: true })} form={<Box>
    <Two><F l="Old AC energy" unit="kWh / year" value={v.oldK} onChange={(x) => set({ oldK: x })} /><F l="New AC energy" unit="kWh / year" value={v.newK} onChange={(x) => set({ newK: x })} /></Two>
    <Two><F l="Tariff" unit="₹/kWh" value={v.tariff} onChange={(x) => set({ tariff: x })} /><F l="Extra investment" unit="₹" value={v.invest} onChange={(x) => set({ invest: x })} /></Two>
    <F l="Usage assumptions" type="text" value={v.assumptions} onChange={(x) => set({ assumptions: x })} />
    <Check l="Both figures use the same usage assumptions (e.g. both BEE label values, or both measured the same way)" on={v.comparable} onChange={(x) => set({ comparable: x })} />
  </Box>} />;
}

/* ───────────── 18 AMC plan ───────────── */

export function AmcPlan({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const T = db.fin.tools;
  const init = { plan: T.amcPlans[0]?.id ?? "", qty: Object.fromEntries(AC_TYPES.map((t) => [t, t === "Split" ? "1" : "0"])) as Record<string, string>, gas: "0", discount: "0" };
  const calc = useCalc(init, (v): Result => {
    const plan = T.amcPlans.find((p) => p.id === v.plan);
    if (!plan) throw new ToolError("Select an AMC plan configured by the office.");
    const lines: QLine[] = [];
    let units = 0;
    for (const t of AC_TYPES) {
      const n = num(v.qty[t] || "0");
      if (!(n >= 0) || !Number.isInteger(n)) throw new ToolError(`Number of ${t} ACs must be a whole number.`);
      if (n === 0) continue;
      const rate = plan.ratePerAc[t];
      if (rate == null) throw new ToolError(`${plan.name} has no approved rate for ${t} ACs.`);
      units += n;
      lines.push({ name: `${plan.name} · ${t} AC`, kind: "Service", qty: n, unit: "job", rate });
    }
    if (!units) throw new ToolError("Enter at least one AC.");
    const gas = rateOf(db, "gas-r32");
    if (num(v.gas) > 0 && gas) lines.push({ name: `Optional: ${gas.name}`, kind: "Material", qty: num(v.gas), unit: "kg", rate: gas.price });
    const q = quoteTotals(lines, num(v.discount), gstPct(db), T.maxTechDiscountPct);
    const visits = plan.visitsPerYear * units;
    return {
      summary: [...quoteRows(q), { k: "Per-visit equivalent", v: `${rs(q.taxable / visits)} (${visits} visits, ex GST)` }],
      breakdown: [`${plan.visitsPerYear} visits/year × ${units} AC(s) = ${visits} visits`],
      assumptions: [`Included: ${plan.included.join("; ")}`, `Not included: ${plan.exclusions.join("; ")}`, T.sampleNote],
      lines: toLines(q.lines), outputs: { total: q.total, visits },
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <Sel l="Plan" value={v.plan} onChange={(x) => set({ plan: x })} options={T.amcPlans.map((p) => [p.id, `${p.name} · ${p.visitsPerYear} visits/yr`] as [string, string])} />
    <p style={{ margin: "4px 0 8px", fontSize: 13, fontWeight: 700 }}>Number of ACs</p>
    <Two>{AC_TYPES.map((t) => <F key={t} l={t} value={v.qty[t]} onChange={(x) => set({ qty: { ...v.qty, [t]: x } })} />)}</Two>
    <F l="Optional refrigerant (R32)" unit="kg" value={v.gas} onChange={(x) => set({ gas: x })} />
    <F l="Discount" unit="₹" value={v.discount} onChange={(x) => set({ discount: x })} hint={`Up to ${T.maxTechDiscountPct}% of subtotal.`} />
  </Box>} />;
}

/* ───────────── 19 Unit converter ───────────── */

type Kind = ConvKind | "length" | "ft-in";
const KINDS: [Kind, string, string[]][] = [
  ["length", "Length: mm · cm · m · inch · feet", [...LENGTH_UNITS]],
  ["ft-in", "Feet + Inch (5' 8\") → mm · cm · m · decimal ft", []],
  ["mass", "Kilograms ↔ grams", ["kg", "g"]],
  ["temp", "Celsius ↔ Fahrenheit", ["°C", "°F"]],
  ["pressure", "Pressure: bar · psi · kPa", ["psi", "bar", "kPa", "MPa"]],
  ["cooling", "Cooling: BTU/h · kW cooling · TR", ["BTU/h", "kW cooling", "TR"]],
  ["airflow", "Airflow: CFM ↔ m³/h", ["CFM", "m³/h"]],
];

const LEN_NAME: Record<LengthU, string> = { mm: "Millimetres (mm)", cm: "Centimetres (cm)", m: "Metres (m)", in: "Inches (in)", ft: "Feet (ft)" };
const LEN_SHORT: Record<LengthU, string> = { mm: "mm", cm: "cm", m: "m", in: "inch", ft: "ft" };
const LEN_DP: Record<LengthU, number> = { mm: 2, cm: 3, m: 4, in: 3, ft: 4 };
const ftIn = (totalIn: number) => { const { ft, inch } = toFeetInches(totalIn); return `${ft}' ${fmt(inch, 2)}"`; };
const stepText = (s: { op: string; factor: number }) => `${s.op} ${fmt(s.factor, 6)}`;

/** Quick reference shown under the form — computed from the exact factors, "≈" where rounded. */
const REFERENCE: [LengthU, LengthU, number][] = [
  ["in", "mm", 1], ["in", "cm", 1], ["in", "ft", 12], ["ft", "in", 1], ["ft", "m", 10], ["ft", "cm", 1],
  ["ft", "mm", 1], ["m", "ft", 1], ["m", "in", 1], ["mm", "cm", 10], ["mm", "in", 25.4], ["cm", "ft", 100], ["cm", "in", 1],
];

function LengthReference() {
  return (
    <div style={{ marginTop: 6 }}>
      <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700 }}>Quick reference</p>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13 }}>
        {REFERENCE.map(([a, b, q]) => {
          const val = (q * MM_PER[a]) / MM_PER[b];
          const exact = Math.abs(Number(val.toFixed(3)) - val) < 1e-9;
          return <Fragment key={`${a}${b}${q}`}><span style={{ color: "var(--ink-mute)" }}>{LEN_SHORT[a]} → {LEN_SHORT[b]}</span><span>{fmt(q, 3)} {LEN_SHORT[a]} {exact ? "=" : "≈"} {fmt(val, 3)} {LEN_SHORT[b]}</span></Fragment>;
        })}
      </div>
    </div>
  );
}

export function UnitConverter({ ctx }: { ctx: Ctx }) {
  const init = { kind: "pressure" as Kind, from: "psi", value: "", ft: "", inch: "", basis: "gauge" as "gauge" | "absolute", atm: String(ATM_KPA) };
  const calc = useCalc(init, (v): Result => {
    if (v.kind === "length") {
      const from = v.from as LengthU;
      const value = num(v.value);
      const rows = convertLength(value, from);
      const totalIn = (value * MM_PER[from]) / MM_PER.in;
      return {
        summary: [
          { k: "Input", v: `${v.value} ${LEN_SHORT[from]}` },
          ...rows.map((r) => ({ k: LEN_NAME[r.unit], v: `${fmt(r.value, LEN_DP[r.unit])} ${r.unit}`, strong: r.unit === "mm" || r.unit === "ft" })),
          { k: "Feet + inches", v: ftIn(totalIn) },
        ],
        breakdown: rows.map((r) => `${v.value} ${LEN_SHORT[from]} ${stepText(r.step)} = ${fmt(r.value, LEN_DP[r.unit])} ${r.unit}`),
        assumptions: ["Exact factors: 1 inch = 25.4 mm = 2.54 cm, 1 ft = 12 inch = 30.48 cm = 304.8 mm = 0.3048 m, 1 m = 100 cm = 1000 mm.", "Values are rounded for display only; the next step always uses the full value."],
        outputs: rows.map(({ unit, value }) => ({ unit, value })),
      };
    }
    if (v.kind === "ft-in") {
      const inch = v.inch.trim() === "" ? 0 : parseInches(v.inch);
      if (inch == null) throw new ToolError("Inches: enter a number or fraction such as 8, 8.5 or 8 1/2.");
      const r = feetInches(v.ft.trim() === "" ? 0 : num(v.ft), inch);
      const label = `${v.ft || 0}' ${v.inch || 0}"`;
      return {
        summary: [
          { k: "Input", v: label },
          { k: "Total inches", v: `${fmt(r.totalIn, 3)} inch` },
          { k: "Decimal feet", v: `${fmt(r.decimalFt, 4)} ft`, strong: true },
          { k: LEN_NAME.mm, v: `${fmt(r.mm, 2)} mm`, strong: true },
          { k: LEN_NAME.cm, v: `${fmt(r.cm, 3)} cm` },
          { k: LEN_NAME.m, v: `${fmt(r.m, 4)} m` },
        ],
        breakdown: [
          `Total inches = ${v.ft || 0} ft × 12 + ${fmt(inch, 3)} inch = ${fmt(r.totalIn, 3)} inch`,
          `Decimal feet = ${fmt(r.totalIn, 3)} ÷ 12 = ${fmt(r.decimalFt, 4)} ft`,
          `mm = ${fmt(r.totalIn, 3)} × 25.4 = ${fmt(r.mm, 2)} mm`,
          `cm = ${fmt(r.mm, 2)} ÷ 10 = ${fmt(r.cm, 3)} cm`,
          `m = ${fmt(r.mm, 2)} ÷ 1000 = ${fmt(r.m, 4)} m`,
        ],
        warnings: inch >= 12 ? [`${fmt(inch, 3)} inches is a foot or more — read as ${ftIn(r.totalIn)}.`] : undefined,
        assumptions: ["1 ft = 12 inch, 1 inch = 25.4 mm (exact). Inches accept fractions such as 8 1/2."],
        outputs: r,
      };
    }
    const rows = convert(v.kind, num(v.value), v.from, { basis: v.basis, atmKpa: num(v.atm) });
    const dp = (u: string) => (u === "TR" || u === "kg" || u === "in" ? 4 : u === "BTU/h" ? 0 : 3);
    return {
      summary: [{ k: "Input", v: `${v.value} ${v.from}${v.kind === "pressure" ? ` (${v.basis})` : ""}` }, ...rows.map((r) => ({ k: r.unit, v: fmt(r.value, dp(r.unit)) }))],
      assumptions: v.kind === "cooling" ? ["kW here is COOLING (thermal) capacity, not electrical input. 1 TR = 12,000 BTU/h; 1 kW = 3,412.14 BTU/h."] : v.kind === "pressure" ? [`Same basis in and out (${v.basis}); the last row converts ${v.basis === "gauge" ? "gauge → absolute" : "absolute → gauge"} using ${v.atm} kPa atmosphere.`] : ["Exact conversion factors (1 kg = 1000 g, °F = °C × 1.8 + 32, 1 CFM = 1.699 m³/h)."],
      outputs: rows,
    };
  });
  const { v, set } = calc;
  const units = KINDS.find((k) => k[0] === v.kind)![2];
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <Sel l="Convert" value={v.kind} onChange={(x) => set({ kind: x, from: KINDS.find((k) => k[0] === x)![2][0] ?? "" })} options={KINDS.map(([k, l]) => [k, l] as [Kind, string])} />
    {v.kind === "ft-in"
      ? <Two><F l="Feet" unit="ft" value={v.ft} onChange={(x) => set({ ft: x })} placeholder="5" /><F l="Inches" unit="inch" type="text" value={v.inch} onChange={(x) => set({ inch: x })} placeholder="8 or 8 1/2" /></Two>
      : <Two><F l="Value" value={v.value} onChange={(x) => set({ value: x })} /><Sel l="From" value={v.from} onChange={(x) => set({ from: x })} options={v.kind === "length" ? LENGTH_UNITS.map((u) => [u, LEN_SHORT[u]] as [string, string]) : units} /></Two>}
    {v.kind === "pressure" && <Two><Sel l="Basis" value={v.basis} onChange={(x) => set({ basis: x })} options={[["gauge", "Gauge"], ["absolute", "Absolute"]]} /><F l="Atmosphere" unit="kPa" value={v.atm} onChange={(x) => set({ atm: x })} /></Two>}
    {v.kind === "cooling" && <Note>Cooling kW ≠ electrical input kW.</Note>}
    {(v.kind === "length" || v.kind === "ft-in") && <LengthReference />}
  </Box>} />;
}
