"use client";

import {
  ATM_KPA, ToolError, airDeltaT, airflow, fromKpa, gasWeightPrice, ptDatasetFor, ptLookup, quoteTotals, refrigerantCharge, refrigerantUsage, superheatSubcool, toAbsKpa,
  type ChargeRule, type PUnit, type QLine,
} from "../../lib/calc/tools";
import { REFRIGERANTS } from "../../lib/tool-settings";
import { Box, CalcShell, Check, F, Note, Sel, Seg, Two, fmt, lineId, num, rs, useCalc, type Ctx, type Result } from "./kit";
import { gstPct, quoteRows, rateOf, toLines } from "./install";

/* 09–15 · Service & Diagnostics. Diagnostic tools never invent reference data: no verified table → "Assessment unavailable". */

const P_UNITS: PUnit[] = ["psi", "bar", "kPa", "MPa"];
const pressureText = (kpaA: number, u: PUnit, basis: "gauge" | "absolute", atm: number) => `${fmt(fromKpa(basis === "gauge" ? kpaA - atm : kpaA, u), 2)} ${u}${basis === "gauge" ? "g" : "a"}`;

/* ───────────── 09 Refrigerant charge adjustment ───────────── */

export function RefrigerantCharge({ ctx }: { ctx: Ctx }) {
  const rules = ctx.db.fin.tools.refrigerantRules.filter((r) => r.verified);
  const init = { ruleId: rules[0]?.id ?? "manual", brand: "", model: "", refrigerant: "R32", factory: "", included: "", gpm: "", min: "", max: "", shortRun: "", source: "", actual: "" };
  const calc = useCalc(init, (v): Result => {
    const picked = rules.find((r) => r.id === v.ruleId);
    const opt = (s: string) => (s.trim() === "" ? null : num(s));
    const rule: ChargeRule | null = picked ?? (v.source.trim() && v.included.trim() && v.gpm.trim()
      ? { refrigerant: v.refrigerant, factoryChargeG: opt(v.factory), includedLengthM: num(v.included), additionalGPerM: num(v.gpm), minLengthM: opt(v.min), maxLengthM: opt(v.max), shortRunRemovalGPerM: opt(v.shortRun), source: v.source }
      : null);
    const r = refrigerantCharge(rule, num(v.actual));
    const model = picked ? `${picked.brand} ${picked.model}` : `${v.brand} ${v.model}`.trim() || "model not entered";
    if ("unavailable" in r) return { summary: [], unavailable: r.unavailable };
    return {
      summary: [{ k: "Model", v: model }, { k: "Refrigerant", v: r.refrigerant }, { k: "Additional refrigerant", v: `${fmt(r.additionalG, 0)} g`, strong: true }, ...(r.targetG != null ? [{ k: "Target total charge", v: `${fmt(r.targetG, 0)} g (${fmt(r.targetG / 1000, 3)} kg)` }] : [])],
      breakdown: [r.note, ...(r.targetG != null ? [`Target = factory charge + additional`] : ["Target total not shown — factory charge not given."])],
      assumptions: [`Source: ${r.source}${picked ? " (office-verified rule)" : " (entered by technician from the manual — unverified by office)"}`, "Charge by weight per the manufacturer. Never estimate the charge from tonnage or pressure."],
      warnings: picked ? [] : ["Rule entered on site — double-check against the installation manual before charging."],
      note: `🧪 Refrigerant charge (${model}, ${r.refrigerant}): actual pipe ${v.actual} m → additional ${fmt(r.additionalG, 0)} g${r.targetG != null ? `, target total ${fmt(r.targetG, 0)} g` : ""}. ${r.note} Source: ${r.source}.`,
      outputs: r,
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} onDemo={() => calc.load({ ...init, ruleId: "manual", brand: "DEMO", model: "Sample 1.5 TR", refrigerant: "R32", factory: "1050", included: "7.5", gpm: "15", min: "3", max: "20", source: "DEMO values — not from a real manual", actual: "10" })} form={<>
    <Box>
      <Sel l="Manufacturer rule" value={v.ruleId} onChange={(x) => set({ ruleId: x })} options={[...rules.map((r) => [r.id, `${r.brand} ${r.model} · ${r.refrigerant} ✓`] as [string, string]), ["manual", "Enter from the unit's installation manual"]]} hint={rules.length ? "Office-verified model rules." : "No office-verified model rules yet — enter the manufacturer's values from the manual."} />
      {v.ruleId === "manual" && (<>
        <Two><F l="Brand" type="text" value={v.brand} onChange={(x) => set({ brand: x })} /><F l="Exact model" type="text" value={v.model} onChange={(x) => set({ model: x })} /></Two>
        <Sel l="Refrigerant" value={v.refrigerant} onChange={(x) => set({ refrigerant: x })} options={REFRIGERANTS} />
        <Two><F l="Factory charge" unit="g" value={v.factory} onChange={(x) => set({ factory: x })} /><F l="Included pipe length" unit="m" value={v.included} onChange={(x) => set({ included: x })} /></Two>
        <F l="Additional charge rule" unit="g per metre" value={v.gpm} onChange={(x) => set({ gpm: x })} />
        <Two><F l="Min length" unit="m" value={v.min} onChange={(x) => set({ min: x })} /><F l="Max length" unit="m" value={v.max} onChange={(x) => set({ max: x })} /></Two>
        <F l="Short-run removal (only if the manual says so)" unit="g per metre" value={v.shortRun} onChange={(x) => set({ shortRun: x })} hint="Leave blank unless the manufacturer explicitly specifies removing refrigerant for short runs." />
        <F l="Source (manual & page)" type="text" value={v.source} onChange={(x) => set({ source: x })} placeholder="e.g. Installation manual p.14" />
      </>)}
    </Box>
    <Box><F l="Actual pipe length (one way)" unit="m" value={v.actual} onChange={(x) => set({ actual: x })} /></Box>
  </>} />;
}

/* ───────────── 10 Refrigerant usage & billing ───────────── */

export function RefrigerantUsage({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const gasRates = db.fin.tools.rates.filter((r) => r.refrigerant);
  const init = { rateId: gasRates[0]?.id ?? "", before: "", after: "", unit: "kg" as "kg" | "g" };
  const calc = useCalc(init, (v): Result => {
    const rate = rateOf(db, v.rateId);
    if (!rate) throw new ToolError("Select a refrigerant with an approved rate.");
    const k = v.unit === "g" ? 1000 : 1;
    const r = refrigerantUsage(num(v.before) / k, num(v.after) / k, rate.price);
    return {
      summary: [{ k: "Measured usage", v: `${fmt(r.usedG, 0)} g (${fmt(r.usedKg, 3)} kg)`, strong: true }, { k: `${rate.refrigerant} at ${rs(rate.price)}/kg`, v: rs(r.charge) }],
      breakdown: [`Used = ${v.before} − ${v.after} ${v.unit}`, `Charge = ${fmt(r.usedKg, 3)} kg × ${rs(rate.price)}`],
      assumptions: ["Measured cylinder usage only — includes hose losses and is not proof that the system charge is correct.", db.fin.tools.sampleNote],
      lines: r.usedKg > 0 ? [{ id: lineId(), kind: "Material", name: `${rate.refrigerant} refrigerant (measured) · ${fmt(r.usedKg, 3)} kg`, qty: 1, price: r.charge }] : [],
      outputs: r,
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <Sel l="Refrigerant (approved rate)" value={v.rateId} onChange={(x) => set({ rateId: x })} options={gasRates.map((r) => [r.id, `${r.refrigerant} · ${rs(r.price)}/kg`] as [string, string])} />
    <Seg l="Scale units" value={v.unit} onChange={(x) => set({ unit: x })} options={["kg", "g"] as const} />
    <Two><F l="Cylinder before" unit={v.unit} value={v.before} onChange={(x) => set({ before: x })} /><F l="Cylinder after" unit={v.unit} value={v.after} onChange={(x) => set({ after: x })} /></Two>
  </Box>} />;
}

/* ───────────── 25 Gas weight ↔ price ───────────── */

export function GasWeightPrice({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const gasRates = db.fin.tools.rates.filter((r) => r.refrigerant);
  const gstRate = db.settings.gstPercent || 18;
  const MODES = ["Weight → Price", "Price → Weight"] as const;
  const GST = ["Rate is final", `Add ${gstRate}% GST`] as const;
  const init = { rateId: gasRates[0]?.id ?? "", rate: gasRates[0] ? String(gasRates[0].price) : "", mode: MODES[0] as (typeof MODES)[number], value: "", gst: GST[0] as string };
  const calc = useCalc(init, (v): Result => {
    const byWeight = v.mode === MODES[0];
    const pct = v.gst === GST[0] ? 0 : gstRate;
    const rate = num(v.rate);
    const r = gasWeightPrice(byWeight ? "weight" : "price", rate, num(v.value), pct);
    const gas = rateOf(db, v.rateId)?.refrigerant ?? "Refrigerant";
    return {
      summary: [
        byWeight ? { k: "Total selling price", v: rs(r.total), strong: true } : { k: "Gas quantity to give", v: `${fmt(r.grams, 2)} g`, strong: true },
        { k: "Gas weight", v: `${fmt(r.grams, 2)} g` },
        { k: "Base gas amount", v: rs(r.base) },
        { k: pct ? `GST ${pct}%` : "GST", v: rs(r.gst) },
        { k: "Customer pays", v: rs(r.total), strong: true },
      ],
      breakdown: byWeight
        ? [`Base = ${fmt(r.grams, 2)} g ÷ 1,000 × ${rs(rate)}/kg = ${rs(r.base)}`, ...(pct ? [`GST = ${rs(r.base)} × ${pct}% = ${rs(r.gst)}`] : [])]
        : [...(pct ? [`Base = ${rs(r.total)} ÷ ${1 + pct / 100} = ${rs(r.base)}`] : []), `Weight = ${rs(r.base)} ÷ ${rs(rate)}/kg × 1,000 = ${fmt(r.grams, 2)} g`],
      assumptions: ["Weigh the gas on a calibrated scale; hose losses are not included.", ...(byWeight ? [] : ["Budget is what the customer pays, GST included."])],
      lines: [{ id: lineId(), kind: "Material", name: `${gas} gas · ${fmt(r.grams, 0)} g`, qty: 1, price: r.base }],
      outputs: r,
    };
  });
  const { v, set } = calc;
  const pickRate = (id: string) => { const r = rateOf(db, id); set({ rateId: id, ...(r ? { rate: String(r.price) } : {}) }); };
  return <CalcShell ctx={ctx} calc={calc} onDemo={() => calc.load({ ...init, rate: "1200", value: "650" })} form={<Box>
    {gasRates.length > 0 && <Sel l="Refrigerant" value={v.rateId} onChange={pickRate} options={gasRates.map((r) => [r.id, `${r.refrigerant} · ${rs(r.price)}/kg`] as [string, string])} />}
    <F l="Gas selling rate" unit="₹/kg" value={v.rate} onChange={(x) => set({ rate: x })} />
    <Seg l="Calculate" value={v.mode} onChange={(x) => set({ mode: x, value: "" })} options={MODES} />
    {v.mode === MODES[0]
      ? <F l="Customer required weight" unit="grams" value={v.value} onChange={(x) => set({ value: x })} />
      : <F l="Customer budget" unit="₹" value={v.value} onChange={(x) => set({ value: x })} />}
    <Seg l="GST" value={v.gst} onChange={(x) => set({ gst: x })} options={GST} />
  </Box>} />;
}

/* ───────────── 11 Pressure–temperature ───────────── */

export function PressureTemperature({ ctx }: { ctx: Ctx }) {
  const ds = ctx.db.fin.tools.ptDatasets;
  const init = { refrigerant: "R32", by: "pressure" as "pressure" | "temperature", value: "", unit: "psi" as PUnit, basis: "gauge" as "gauge" | "absolute", atm: String(ATM_KPA) };
  const calc = useCalc(init, (v): Result => {
    const atm = num(v.atm);
    if (!(atm > 0)) throw new ToolError("Enter local atmospheric pressure in kPa (101.325 at sea level).");
    const q = v.by === "pressure" ? { pressureKpaA: toAbsKpa(num(v.value), v.unit, v.basis, atm) } : { tempC: num(v.value) };
    if (v.by === "pressure" && !Number.isFinite(q.pressureKpaA!)) throw new ToolError("Enter the pressure.");
    const r = ptLookup(ds, v.refrigerant, q);
    if ("unavailable" in r) return { summary: [], unavailable: r.unavailable };
    const glide = r.dataset.blend === "zeotropic";
    const c = (x: number | null) => (x == null ? "outside table range" : `${fmt(x, 1)} °C`);
    const rows = r.tempC
      ? glide ? [{ k: "Bubble-point temperature", v: c(r.tempC.bubble) }, { k: "Dew-point temperature", v: c(r.tempC.dew) }, ...(r.tempC.bubble != null && r.tempC.dew != null ? [{ k: "Glide", v: `${fmt(r.tempC.dew - r.tempC.bubble, 1)} K` }] : [])] : [{ k: "Saturation temperature", v: c(r.tempC.dew ?? r.tempC.bubble), strong: true }]
      : glide ? [{ k: "Bubble-point pressure", v: pressureText(r.pressureKpaA!.bubble, v.unit, v.basis, atm) }, { k: "Dew-point pressure", v: pressureText(r.pressureKpaA!.dew, v.unit, v.basis, atm) }] : [{ k: "Saturation pressure", v: pressureText(r.pressureKpaA!.dew, v.unit, v.basis, atm), strong: true }];
    return {
      summary: rows,
      breakdown: [v.by === "pressure" ? `Absolute = reading ${v.basis === "gauge" ? `+ atmosphere ${atm} kPa` : ""} = ${fmt(q.pressureKpaA!, 1)} kPa(a)` : `Temperature ${v.value} °C`, "Linear interpolation between verified table rows."],
      assumptions: [`Table: ${r.dataset.refrigerant} (${r.dataset.blend}) — ${r.dataset.source}. Valid ${r.range.tMin} °C to ${r.range.tMax} °C.`, glide ? "Zeotropic blend: use dew point for superheat, bubble point for subcooling." : "Pure / azeotropic: bubble ≈ dew."],
      note: `🌡️ PT ${v.refrigerant}: ${v.value} ${v.by === "pressure" ? `${v.unit} ${v.basis}` : "°C"} → ${rows.map((x) => `${x.k} ${x.v}`).join(", ")} (${r.dataset.source})`,
      outputs: rows,
    };
  });
  const { v, set } = calc;
  const has = !!ptDatasetFor(ds, v.refrigerant);
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <Sel l="Refrigerant" value={v.refrigerant} onChange={(x) => set({ refrigerant: x })} options={REFRIGERANTS.map((r) => [r, `${r}${ptDatasetFor(ds, r) ? " ✓ verified table" : " — no verified table"}`] as [string, string])} />
    {!has && <Note tone="off">No verified pressure–temperature table for {v.refrigerant}. Results will show “Assessment unavailable” until the office adds one (absolute kPa, bubble & dew points, cited source).</Note>}
    <Seg l="Look up by" value={v.by} onChange={(x) => set({ by: x })} options={["pressure", "temperature"] as const} />
    <F l={v.by === "pressure" ? "Pressure" : "Saturation temperature"} unit={v.by === "pressure" ? `${v.unit} ${v.basis}` : "°C"} value={v.value} onChange={(x) => set({ value: x })} />
    <Two><Sel l="Pressure unit" value={v.unit} onChange={(x) => set({ unit: x })} options={P_UNITS} /><Sel l="Gauge / absolute" value={v.basis} onChange={(x) => set({ basis: x })} options={[["gauge", "Gauge (manifold)"], ["absolute", "Absolute"]]} /></Two>
    <F l="Local atmospheric pressure" unit="kPa" value={v.atm} onChange={(x) => set({ atm: x })} hint="101.325 at sea level; lower at altitude." />
  </Box>} />;
}

/* ───────────── 12 Superheat / subcooling ───────────── */

export function SuperheatSubcool({ ctx }: { ctx: Ctx }) {
  const ds = ctx.db.fin.tools.ptDatasets;
  const init = { refrigerant: "R32", unit: "psi" as PUnit, basis: "gauge" as "gauge" | "absolute", atm: String(ATM_KPA), sp: "", st: "", lp: "", lt: "", location: "Outdoor unit service valves" };
  const calc = useCalc(init, (v): Result => {
    const atm = num(v.atm);
    const abs = (s: string) => (s.trim() === "" ? null : toAbsKpa(num(s), v.unit, v.basis, atm));
    const r = superheatSubcool(ds, v.refrigerant, { suctionKpaA: abs(v.sp), suctionLineC: v.st.trim() ? num(v.st) : null, liquidKpaA: abs(v.lp), liquidLineC: v.lt.trim() ? num(v.lt) : null });
    if (!("dataset" in r) || !r.dataset) return { summary: [], unavailable: (r as { unavailable: string }).unavailable };
    const rows: { k: string; v: string; strong?: boolean }[] = [];
    const steps: string[] = [];
    const un: string[] = [];
    if (r.superheat) { if ("unavailable" in r.superheat) un.push(r.superheat.unavailable); else { rows.push({ k: "Superheat", v: `${fmt(r.superheat.value, 1)} K`, strong: true }); steps.push(`Superheat = suction line ${v.st} °C − dew-point sat. ${fmt(r.superheat.satC, 1)} °C`); } }
    if (r.subcool) { if ("unavailable" in r.subcool) un.push(r.subcool.unavailable); else { rows.push({ k: "Subcooling", v: `${fmt(r.subcool.value, 1)} K`, strong: true }); steps.push(`Subcooling = bubble-point sat. ${fmt(r.subcool.satC, 1)} °C − liquid line ${v.lt} °C`); } }
    return {
      summary: [...rows, { k: "Measured at", v: v.location }], breakdown: steps, unavailable: un.join(" ") || undefined,
      assumptions: [`Table: ${r.dataset.source}`, "Compare with the manufacturer's target for this model and conditions — there is no universal pass/fail value.", "Pressures converted to absolute before lookup."],
      note: `📉 ${v.refrigerant} at ${v.location}: ${rows.map((x) => `${x.k} ${x.v}`).join(", ")} (suction ${v.sp || "—"} ${v.unit}${v.basis[0]}, line ${v.st || "—"} °C; liquid ${v.lp || "—"} ${v.unit}${v.basis[0]}, line ${v.lt || "—"} °C)`,
      outputs: rows,
    };
  });
  const { v, set } = calc;
  const has = !!ptDatasetFor(ds, v.refrigerant);
  return <CalcShell ctx={ctx} calc={calc} form={<>
    <Box>
      <Sel l="Refrigerant" value={v.refrigerant} onChange={(x) => set({ refrigerant: x })} options={REFRIGERANTS.map((r) => [r, `${r}${ptDatasetFor(ds, r) ? " ✓" : " — no verified table"}`] as [string, string])} />
      {!has && <Note tone="off">Needs a verified pressure–temperature table for {v.refrigerant} (dew & bubble points). Until the office adds one, the result is “Assessment unavailable”.</Note>}
      <Two><Sel l="Pressure unit" value={v.unit} onChange={(x) => set({ unit: x })} options={P_UNITS} /><Sel l="Gauge / absolute" value={v.basis} onChange={(x) => set({ basis: x })} options={[["gauge", "Gauge"], ["absolute", "Absolute"]]} /></Two>
      <F l="Atmospheric pressure" unit="kPa" value={v.atm} onChange={(x) => set({ atm: x })} />
      <Sel l="Measurement location" value={v.location} onChange={(x) => set({ location: x })} options={["Outdoor unit service valves", "Indoor coil outlet / inlet", "Other (see notes)"]} />
    </Box>
    <Box title="Superheat (suction side)"><Two><F l="Suction pressure" unit={v.unit} value={v.sp} onChange={(x) => set({ sp: x })} /><F l="Suction-line temp" unit="°C" value={v.st} onChange={(x) => set({ st: x })} /></Two></Box>
    <Box title="Subcooling (liquid side)"><Two><F l="Liquid pressure" unit={v.unit} value={v.lp} onChange={(x) => set({ lp: x })} /><F l="Liquid-line temp" unit="°C" value={v.lt} onChange={(x) => set({ lt: x })} /></Two></Box>
  </>} />;
}

/* ───────────── 13 Air ΔT ───────────── */

export function AirDeltaT({ ctx }: { ctx: Ctx }) {
  const init = { ret: "", sup: "", mode: "cooling" as "cooling" | "heating" };
  const calc = useCalc(init, (v): Result => {
    const r = airDeltaT(num(v.ret), num(v.sup), v.mode);
    return {
      summary: [{ k: "Temperature difference", v: `${fmt(r.deltaC, 1)} K (${fmt(r.deltaF, 1)} °F)`, strong: true }, { k: "Return · supply", v: `${v.ret} °C · ${v.sup} °C` }],
      warnings: r.unexpected ? [`Supply air is ${v.mode === "cooling" ? "warmer" : "cooler"} than return — check probe placement and mode.`] : [],
      breakdown: [v.mode === "cooling" ? "ΔT = return − supply" : "ΔT = supply − return"],
      assumptions: ["A single reading — it does not diagnose refrigerant charge or overall AC health on its own. Depends on airflow, humidity and load."],
      note: `🌬️ Air ΔT (${v.mode}): return ${v.ret} °C, supply ${v.sup} °C → ${fmt(r.deltaC, 1)} K`,
      outputs: r,
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <Seg l="Mode" value={v.mode} onChange={(x) => set({ mode: x })} options={["cooling", "heating"] as const} />
    <Two><F l="Return air" unit="°C" value={v.ret} onChange={(x) => set({ ret: x })} /><F l="Supply air" unit="°C" value={v.sup} onChange={(x) => set({ sup: x })} /></Two>
  </Box>} />;
}

/* ───────────── 14 Airflow ───────────── */

export function Airflow({ ctx }: { ctx: Ctx }) {
  const init = { vel: "", vu: "m/s" as "m/s" | "fpm", area: "", au: "m²" as "m²" | "ft²", kind: "effective" as "effective" | "gross", factor: "" };
  const calc = useCalc(init, (v): Result => {
    const r = airflow({ velocity: num(v.vel), velocityUnit: v.vu, area: num(v.area), areaUnit: v.au, areaKind: v.kind, freeAreaFactor: v.factor ? num(v.factor) : null });
    return {
      summary: [{ k: "Airflow (estimate)", v: `${fmt(r.cfm, 0)} CFM`, strong: true }, { k: "Airflow (metric)", v: `${fmt(r.m3h, 0)} m³/h` }, { k: "Effective free area", v: `${fmt(r.aM2, 4)} m²` }],
      breakdown: [`Q = v × A = ${fmt(r.vMs, 3)} m/s × ${fmt(r.aM2, 4)} m² × 3600`, ...(v.kind === "gross" ? [`Effective area = gross ${v.area} ${v.au} × free-area factor ${v.factor}`] : [])],
      assumptions: ["Estimate. Use the average of a traverse across the grille, not one spot.", "Effective free area is the open area air passes through — smaller than the grille's outside (gross) dimensions."],
      note: `🌀 Airflow ≈ ${fmt(r.cfm, 0)} CFM (${fmt(r.m3h, 0)} m³/h): ${v.vel} ${v.vu} over ${fmt(r.aM2, 4)} m² effective`,
      outputs: r,
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <Two><F l="Average velocity" unit={v.vu} value={v.vel} onChange={(x) => set({ vel: x })} /><Sel l="Velocity unit" value={v.vu} onChange={(x) => set({ vu: x })} options={["m/s", "fpm"] as const} /></Two>
    <Seg l="Area entered is" value={v.kind === "effective" ? "Effective free area" : "Gross grille size"} onChange={(x) => set({ kind: x === "Gross grille size" ? "gross" : "effective" })} options={["Effective free area", "Gross grille size"]} />
    <Two><F l={v.kind === "effective" ? "Effective free area" : "Gross area"} unit={v.au} value={v.area} onChange={(x) => set({ area: x })} /><Sel l="Area unit" value={v.au} onChange={(x) => set({ au: x })} options={["m²", "ft²"] as const} /></Two>
    {v.kind === "gross" && <F l="Free-area factor (grille maker)" value={v.factor} onChange={(x) => set({ factor: x })} hint="e.g. 0.7 — from the grille manufacturer. Required for gross sizes." />}
  </Box>} />;
}

/* ───────────── 15 Repair estimate ───────────── */

export function RepairEstimate({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const T = db.fin.tools;
  const services = db.services.filter((s) => s.active);
  const init = { parts: [{ id: "", qty: "1" }], service: "", hours: "1", visit: true, transport: "0", discount: "0" };
  const calc = useCalc(init, (v): Result => {
    const lines: QLine[] = [];
    for (const p of v.parts) {
      if (!p.id) continue;
      const part = db.parts.find((x) => x.id === p.id)!;
      lines.push({ name: part.name, kind: "Part", qty: num(p.qty), unit: part.unit, rate: part.price, refId: part.id });
    }
    const svc = services.find((s) => s.id === v.service);
    if (svc) lines.push({ name: svc.name, kind: "Service", qty: 1, unit: "job", rate: svc.price, refId: svc.id });
    const lab = rateOf(db, "lab-hour");
    if (lab) lines.push({ name: lab.name.replace(/\s*\(per hour\)/, ""), kind: "Labour", qty: num(v.hours), unit: "hour", rate: lab.price });
    const visit = rateOf(db, "visit");
    if (v.visit && visit) lines.push({ name: visit.name, kind: "Service", qty: 1, unit: "visit", rate: visit.price });
    const tr = rateOf(db, "transport");
    if (tr) lines.push({ name: tr.name, kind: "Service", qty: num(v.transport), unit: "trip", rate: tr.price });
    if (!lines.length) throw new ToolError("Add at least one part, service or labour.");
    const q = quoteTotals(lines, num(v.discount), gstPct(db), T.maxTechDiscountPct);
    return {
      summary: [...quoteRows(q), { k: "Customer approval amount", v: rs(q.total), strong: true }],
      assumptions: ["Parts at catalogue customer prices; labour, visit and transport at approved rates.", `Discount limit ${T.maxTechDiscountPct}% without office approval.`],
      lines: toLines(q.lines).map((l, i) => ({ ...l, refId: q.lines[i]?.refId })),
      outputs: { total: q.total },
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<>
    <Box title="Spare parts">
      {v.parts.map((p, i) => (
        <Two key={i}>
          <Sel l={`Part ${i + 1}`} value={p.id} onChange={(x) => set({ parts: v.parts.map((y, j) => (j === i ? { ...y, id: x } : y)) })} options={[["", "—"], ...db.parts.map((x) => [x.id, `${x.name} · ${rs(x.price)}`] as [string, string])]} />
          <F l="Qty" value={p.qty} onChange={(x) => set({ parts: v.parts.map((y, j) => (j === i ? { ...y, qty: x } : y)) })} />
        </Two>
      ))}
      <button onClick={() => set({ parts: [...v.parts, { id: "", qty: "1" }] })} style={{ background: "none", border: "none", color: "var(--blue)", fontWeight: 600, cursor: "pointer", padding: 0 }}>+ Add part</button>
    </Box>
    <Box title="Service & charges">
      <Sel l="Service (catalogue)" value={v.service} onChange={(x) => set({ service: x })} options={[["", "—"], ...services.map((s) => [s.id, `${s.name} · ${rs(s.price)}`] as [string, string])]} />
      <Two><F l="Labour" unit="hours" value={v.hours} onChange={(x) => set({ hours: x })} /><F l="Transport trips" value={v.transport} onChange={(x) => set({ transport: x })} /></Two>
      <Check l={`Visit charge (${rs(rateOf(db, "visit")?.price ?? 0)})`} on={v.visit} onChange={(x) => set({ visit: x })} />
      <F l="Discount" unit="₹" value={v.discount} onChange={(x) => set({ discount: x })} hint={`Up to ${T.maxTechDiscountPct}% of subtotal.`} />
    </Box>
  </>} />;
}
