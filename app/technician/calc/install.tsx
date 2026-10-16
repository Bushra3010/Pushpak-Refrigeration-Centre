"use client";

import { calculatePipeSet, type PipeInput } from "../../lib/calc/pipe";
import { CITY_CLIMATE, CLIMATE_LABELS, estimateTonnage, type TonnageInput } from "../../lib/calc/tonnage";
import { parseInches } from "../../lib/calc/units";
import { ToolError, cableAssessment, drainPipe, extraMaterial, insulation, quoteTotals, standCheck, CONDUCTOR_SOURCE, type QLine } from "../../lib/calc/tools";
import { PIPE_PRESETS } from "../../lib/finance-types";
import { AC_TYPES, type Db, type QuoteLine } from "../../lib/data";
import type { RateItem } from "../../lib/tool-settings";
import { Box, CalcShell, Check, F, Note, Sel, Seg, Two, fmt, lineId, num, rs, useCalc, type Ctx, type Result } from "./kit";

/* 01–08 · Installation & Quotation. Every price is an admin-approved CUSTOMER rate; no cost, markup or margin reaches these screens. */

export const rateOf = (db: Db, id: string): RateItem | undefined => db.fin.tools.rates.find((r) => r.id === id);
const rateOrThrow = (db: Db, id: string) => { const r = rateOf(db, id); if (!r) throw new ToolError(`No approved rate "${id}" — ask the office to add it in Cost & Calc Rules.`); return r; };
export const gstPct = (db: Db) => (db.settings.gstEnabled ? db.settings.gstPercent : 0);
const COUNTABLE = new Set(["", "job", "piece", "pc", "roll", "set", "visit", "trip", "hour", "kg"]);
/** Quotation lines → job estimate lines. Countable whole quantities keep qty × rate; lengths become one priced line. */
export const toLines = (ls: QLine[]): QuoteLine[] => ls.filter((l) => l.qty > 0).map((l) =>
  COUNTABLE.has(l.unit) && Number.isInteger(l.qty)
    ? { id: lineId(), kind: l.kind, name: l.name, qty: l.qty, price: l.rate }
    : { id: lineId(), kind: l.kind, name: `${l.name} · ${fmt(l.qty)} ${l.unit}`, qty: 1, price: Math.round(l.qty * l.rate * 100) / 100 });
export const quoteRows = (q: ReturnType<typeof quoteTotals>) => [
  ...q.lines.map((l) => ({ k: l.unit ? `${l.name} · ${fmt(l.qty)} ${l.unit} × ${rs(l.rate)}` : l.name, v: rs(l.amount) })),
  { k: "Subtotal", v: rs(q.subtotal) },
  ...(q.discount ? [{ k: "Discount", v: `− ${rs(q.discount)}` }] : []),
  { k: `GST ${q.gstPct}%`, v: rs(q.gst) },
  { k: "Total", v: rs(q.total), strong: true },
];
const sample = (db: Db) => db.fin.tools.sampleNote;

/* ───────────── 01 Copper pipe ───────────── */

type PipeV = { label: string; od: string; odUnit: "in" | "mm"; mode: "mm" | "gauge"; wall: string; gaugeStd: string; gauge: string };
const preset = (l: string) => PIPE_PRESETS.find((p) => p.label.startsWith(l))!;
const P0 = (label: string, od: string, l: string): PipeV => ({ label, od, odUnit: "in", mode: "mm", wall: String(preset(l).wallMm), gaugeStd: "", gauge: "" });

export function CopperPipe({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const f = db.fin;
  const init = { pipes: [P0("Liquid", "1/4", '1/4"'), P0("Suction", "1/2", '1/2"')], length: "3", unit: "m" as "m" | "ft", qty: "1", wastage: String(f.wastagePct), ins: "0", fit: "0", lab: "0" };
  const calc = useCalc(init, (v): Result => {
    const inputs: PipeInput[] = v.pipes.map((p) => {
      const od = p.odUnit === "in" ? parseInches(p.od) : num(p.od);
      if (od == null || !Number.isFinite(od)) throw new ToolError(`${p.label}: enter the outside diameter.`);
      let gauge = null;
      if (p.mode === "gauge") {
        const st = f.gauges.find((g) => g.id === p.gaugeStd);
        const z = st?.sizes.find((x) => x.gauge === p.gauge);
        if (!st || !z) throw new ToolError(`${p.label}: choose a gauge standard and gauge.`);
        gauge = { standard: st.code, gauge: z.gauge, thicknessMm: z.mm };
      }
      return { label: p.label, od, odUnit: p.odUnit, wallMm: p.mode === "mm" ? num(p.wall) : null, gauge, length: num(v.length), lengthUnit: v.unit, quantity: num(v.qty) };
    });
    if (!(f.copperRatePerKg > 0)) throw new ToolError("No approved copper rate — ask the office to set it in Cost & Calc Rules.");
    const set = calculatePipeSet(inputs, { ratePerKg: f.copperRatePerKg, wastagePct: num(v.wastage), pricing: { mode: "markup", pct: f.pipeMarkupPct ?? 25 }, densityKgM3: f.copperDensity });
    const extras: QLine[] = [
      { name: rateOrThrow(db, "ins-m").name, kind: "Material", qty: num(v.ins), unit: "m", rate: rateOrThrow(db, "ins-m").price },
      { name: rateOrThrow(db, "fit-set").name, kind: "Material", qty: num(v.fit), unit: "set", rate: rateOrThrow(db, "fit-set").price },
      { name: rateOrThrow(db, "lab-inst").name, kind: "Labour", qty: num(v.lab), unit: "job", rate: rateOrThrow(db, "lab-inst").price },
    ];
    const q = quoteTotals([...set.pipes.map((p): QLine => ({ name: `Copper pipe ${p.label} OD ${fmt(p.odMm)} × ${fmt(p.thicknessMm, 3)} mm (${fmt(p.totalLengthM)} m)`, kind: "Material", qty: 1, unit: "", rate: p.sellingPrice })), ...extras], 0, gstPct(db));
    const gaugeNotes = v.pipes.filter((p) => p.mode === "gauge").map((p) => { const st = f.gauges.find((g) => g.id === p.gaugeStd)!; return `${p.label}: gauge ${p.gauge} from ${st.name} — ${st.source} ${st.verified ? "· ✓ verified by office" : "· NOT yet verified against the supplier's pipe"}`; });
    return {
      summary: [
        ...set.pipes.flatMap((p) => [
          { k: `${p.label}: wall · inside Ø`, v: `${fmt(p.thicknessMm, 3)} mm · ${fmt(p.idMm, 3)} mm` },
          { k: `${p.label}: weight / m · / ft`, v: `${fmt(p.kgPerM, 4)} kg · ${fmt(p.kgPerFt, 4)} kg` },
          { k: `${p.label}: net · with ${v.wastage}% wastage`, v: `${fmt(p.netWeightKg, 3)} kg · ${fmt(p.procurementWeightKg, 3)} kg` },
          { k: `${p.label}: customer price`, v: rs(p.sellingPrice) },
        ]),
        { k: "Total copper (net · to carry)", v: `${fmt(set.totals.netWeightKg, 3)} kg · ${fmt(set.totals.procurementWeightKg, 3)} kg` },
        ...q.lines.filter((l) => l.unit).map((l) => ({ k: `${l.name} · ${fmt(l.qty)} ${l.unit}`, v: rs(l.amount) })),
        { k: "Subtotal (ex GST)", v: rs(q.subtotal) }, { k: `GST ${q.gstPct}%`, v: rs(q.gst) }, { k: "Total", v: rs(q.total), strong: true },
      ],
      breakdown: ["Inside Ø = OD − 2 × wall", "kg/m = π/4 × (OD² − ID²) × density (metres)", `Density ${f.copperDensity} kg/m³ — ${f.densitySource}`, "Customer price uses the office's approved copper rate."],
      assumptions: [...gaugeNotes, 'Presets are ASTM B280 nominal walls — check the pipe you carry.', sample(db)],
      lines: toLines(q.lines),
      outputs: { pipes: set.pipes.map((p) => ({ label: p.label, odMm: p.odMm, wallMm: p.thicknessMm, idMm: p.idMm, kgPerM: p.kgPerM, netKg: p.netWeightKg, carryKg: p.procurementWeightKg, price: p.sellingPrice })), total: q.total },
    };
  });
  const { v, set } = calc;
  const upd = (i: number, p: Partial<PipeV>) => set({ pipes: v.pipes.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return <CalcShell ctx={ctx} calc={calc} form={<>
    {v.pipes.map((p, i) => { const st = f.gauges.find((g) => g.id === p.gaugeStd); return (
      <Box key={i} title={`${p.label} line`}>
        <Sel l="Preset (ASTM B280)" value="" onChange={(x) => { const pr = PIPE_PRESETS.find((y) => y.label === x); if (pr) upd(i, { od: String(pr.odMm), odUnit: "mm", mode: "mm", wall: String(pr.wallMm) }); }} options={[["", "Choose a preset…"], ...PIPE_PRESETS.map((x) => [x.label, x.label] as [string, string])]} />
        <Two><F l="Outside Ø" unit={p.odUnit === "in" ? 'in, e.g. 3/8' : "mm"} value={p.od} onChange={(x) => upd(i, { od: x })} /><Sel l="OD unit" value={p.odUnit} onChange={(x) => upd(i, { odUnit: x })} options={[["in", "inches"], ["mm", "mm"]]} /></Two>
        <Seg l="Wall thickness by" value={p.mode === "mm" ? "Millimetres" : "Gauge"} onChange={(x) => upd(i, { mode: x === "Gauge" ? "gauge" : "mm" })} options={["Millimetres", "Gauge"]} />
        {p.mode === "mm" ? <F l="Wall thickness" unit="mm" value={p.wall} onChange={(x) => upd(i, { wall: x })} /> : (<>
          <Two>
            <Sel l="Gauge standard" value={p.gaugeStd} onChange={(x) => upd(i, { gaugeStd: x, gauge: "" })} options={[["", "Select…"], ...f.gauges.map((g) => [g.id, `${g.code}${g.verified ? "" : " (unverified)"}`] as [string, string])]} />
            <Sel l="Gauge" value={p.gauge} onChange={(x) => upd(i, { gauge: x })} options={[["", "—"], ...(st?.sizes ?? []).map((z) => [z.gauge, `${z.gauge} = ${z.mm} mm`] as [string, string])]} />
          </Two>
          {st && <Note tone={st.verified ? "info" : "warn"}>{st.name}: {st.source} {st.verified ? "✓ Verified by office." : "Not yet verified against the supplier's pipe."}</Note>}
        </>)}
      </Box>); })}
    <Box title="Run">
      <Two><F l="Length per line" unit={v.unit} value={v.length} onChange={(x) => set({ length: x })} /><Sel l="Length unit" value={v.unit} onChange={(x) => set({ unit: x })} options={[["m", "metres"], ["ft", "feet"]]} /></Two>
      <Two><F l="Quantity (runs)" value={v.qty} onChange={(x) => set({ qty: x })} /><F l="Wastage" unit="%" value={v.wastage} onChange={(x) => set({ wastage: x })} /></Two>
    </Box>
    <Box title="Separate lines (approved rates)">
      <F l="Insulation" unit="m" value={v.ins} onChange={(x) => set({ ins: x })} />
      <Two><F l="Fittings sets" value={v.fit} onChange={(x) => set({ fit: x })} /><F l="Installation labour (jobs)" value={v.lab} onChange={(x) => set({ lab: x })} /></Two>
    </Box>
  </>} />;
}

/* ───────────── 02 Tonnage ───────────── */

export function Tonnage({ ctx }: { ctx: Ctx }) {
  const c = ctx.db.fin.tonnage;
  const init = { L: "12", W: "10", H: "10", city: "Delhi / NCR", climate: "hot_dry", people: "2", sun: "normal" as TonnageInput["sunlight"], top: false, windows: "1", watts: "250", kitchen: false };
  const calc = useCalc(init, (v): Result => {
    const r = estimateTonnage({ lengthValue: num(v.L), widthValue: num(v.W), dimensionUnit: "ft", ceilingValue: num(v.H), climate: v.climate, occupants: num(v.people), sunlight: v.sun, roof: v.top ? "top_floor_roof_exposed" : "intermediate_floor", insulation: "average", windowAreaSqft: num(v.windows) * 15, applianceWatts: num(v.watts), isKitchen: v.kitchen }, c);
    const big = r.floorAreaSqft > 400 || r.recommendedTons == null;
    return {
      summary: [{ k: "Room area", v: `${fmt(r.floorAreaSqft, 0)} ft²` }, { k: "Estimated load", v: `${fmt(r.totalBtuh, 0)} BTU/h` }, { k: "Estimated tons", v: `${fmt(r.tons, 2)} TR` }, { k: "Suggested size", v: r.recommendedTons != null ? `${r.recommendedTons} TR` : "Needs site assessment", strong: true }],
      breakdown: [...r.steps.map((s) => `${s.label}: ${fmt(s.btuh, 0)} BTU/h — ${s.detail}`), `+ ${c.safetyMarginPct}% safety allowance → ${fmt(r.tonsWithMargin, 2)} TR. ${r.recommendationNote}`],
      assumptions: ["Initial estimate. 1 TR = 12,000 BTU/h; each window counted as 15 ft².", c.source, r.disclaimer],
      warnings: big ? ["Large or complex space — recommend a professional site assessment before selecting equipment."] : [],
      outputs: { btuh: r.totalBtuh, tons: r.tons, recommended: r.recommendedTons },
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <Two><F l="Length" unit="ft" value={v.L} onChange={(x) => set({ L: x })} /><F l="Width" unit="ft" value={v.W} onChange={(x) => set({ W: x })} /></Two>
    <F l="Ceiling height" unit="ft" value={v.H} onChange={(x) => set({ H: x })} />
    <Sel l="City" value={v.city} onChange={(x) => set({ city: x, climate: CITY_CLIMATE.find(([n]) => n === x)?.[1] ?? v.climate })} options={[...CITY_CLIMATE.map(([n]) => n), "Other"]} />
    {v.city === "Other" && <Sel l="Climate" value={v.climate} onChange={(x) => set({ climate: x })} options={Object.keys(c.climate).map((k) => [k, CLIMATE_LABELS[k] ?? k] as [string, string])} />}
    <Seg l="Sunlight" value={v.sun} onChange={(x) => set({ sun: x })} options={["shaded", "normal", "heavy"] as const} />
    <Two><F l="Occupants" value={v.people} onChange={(x) => set({ people: x })} /><F l="Windows" value={v.windows} onChange={(x) => set({ windows: x })} /></Two>
    <F l="Appliance heat" unit="W" value={v.watts} onChange={(x) => set({ watts: x })} hint="TV ≈ 150 W, fridge ≈ 200 W, computer ≈ 250 W, lights ≈ 100 W" />
    <Check l="Top floor (roof gets direct sun)" on={v.top} onChange={(x) => set({ top: x })} />
    <Check l="Kitchen" on={v.kitchen} onChange={(x) => set({ kitchen: x })} />
  </Box>} />;
}

/* ───────────── 03 Installation estimate ───────────── */

export function InstallationEstimate({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const T = db.fin.tools;
  const init = { acType: "Split", tons: "1.5", pkg: T.packages[0]?.id ?? "", copper: "3", cable: "3", drain: "3", stand: "stand-angle", standQty: "1", fasteners: "1", pads: "1", transport: "1", discount: "0" };
  const calc = useCalc(init, (v): Result => {
    const tons = num(v.tons);
    if (!(tons > 0)) throw new ToolError("Enter the AC capacity in TR.");
    const pk = T.packages.find((p) => p.id === v.pkg);
    const warn: string[] = [];
    if (pk && (!pk.acTypes.includes(v.acType) || tons > pk.maxTons + 1e-9)) warn.push(`"${pk.name}" is for ${pk.acTypes.join("/")} up to ${pk.maxTons} TR — check the package.`);
    const inc = pk?.includes ?? {};
    const ex = extraMaterial([
      { name: rateOrThrow(db, "cu-pair").name, unit: "m", included: inc["cu-pair"] ?? 0, actual: num(v.copper), rate: rateOrThrow(db, "cu-pair").price },
      { name: rateOrThrow(db, "cab-extra").name, unit: "m", included: inc["cab-extra"] ?? 0, actual: num(v.cable), rate: rateOrThrow(db, "cab-extra").price },
      { name: rateOrThrow(db, "drain-16").name, unit: "m", included: inc["drain-16"] ?? 0, actual: num(v.drain), rate: rateOrThrow(db, "drain-16").price },
    ]);
    const lines: QLine[] = [
      ...(pk ? [{ name: pk.name, kind: "Labour" as const, qty: 1, unit: "job", rate: pk.price }] : [{ name: rateOrThrow(db, "lab-inst").name, kind: "Labour" as const, qty: 1, unit: "job", rate: rateOrThrow(db, "lab-inst").price }]),
      ...ex.rows.filter((r) => r.chargeable > 0).map((r) => ({ name: `${r.name.replace(/\s*\(per metre\)/, "")} beyond package`, kind: "Material" as const, qty: r.chargeable, unit: "m", rate: r.rate })),
      ...(v.stand ? [{ name: rateOrThrow(db, v.stand).name, kind: "Material" as const, qty: num(v.standQty), unit: "piece", rate: rateOrThrow(db, v.stand).price }] : []),
      { name: rateOrThrow(db, "fasteners").name, kind: "Material", qty: num(v.fasteners), unit: "set", rate: rateOrThrow(db, "fasteners").price },
      { name: rateOrThrow(db, "pads").name, kind: "Material", qty: num(v.pads), unit: "set", rate: rateOrThrow(db, "pads").price },
      { name: rateOrThrow(db, "transport").name, kind: "Service", qty: num(v.transport), unit: "trip", rate: rateOrThrow(db, "transport").price },
    ];
    const q = quoteTotals(lines, num(v.discount), gstPct(db), T.maxTechDiscountPct);
    return {
      summary: quoteRows(q), warnings: warn,
      breakdown: pk ? [`Package includes: ${Object.entries(inc).map(([k, n]) => `${n} ${rateOf(db, k)?.unit ?? ""} ${rateOf(db, k)?.name.replace(/\s*\(per metre\)|, extra/g, "") ?? k}`).join(", ") || "no materials"}`, ...ex.rows.map((r) => `${r.name}: used ${r.actual} − included ${r.included} = ${fmt(r.chargeable)} chargeable`)] : [],
      assumptions: [`${v.acType} AC, ${tons} TR.`, `Technician discount limit ${T.maxTechDiscountPct}% of subtotal.`, sample(db)],
      lines: toLines(q.lines), outputs: { total: q.total, subtotal: q.subtotal },
    };
  });
  const { v, set } = calc;
  const stands = T.rates.filter((r) => r.group === "Stand & accessories" && r.id.startsWith("stand"));
  return <CalcShell ctx={ctx} calc={calc} form={<>
    <Box title="AC">
      <Two><Sel l="AC type" value={v.acType} onChange={(x) => set({ acType: x })} options={AC_TYPES} /><F l="Capacity" unit="TR" value={v.tons} onChange={(x) => set({ tons: x })} /></Two>
      <Sel l="Installation package" value={v.pkg} onChange={(x) => set({ pkg: x })} options={[...T.packages.map((p) => [p.id, `${p.name} · ${rs(p.price)}`] as [string, string]), ["", "No package (labour only)"]]} />
    </Box>
    <Box title="Materials actually needed">
      <F l="Copper pipe pair" unit="m" value={v.copper} onChange={(x) => set({ copper: x })} />
      <Two><F l="Cable" unit="m" value={v.cable} onChange={(x) => set({ cable: x })} /><F l="Drain pipe" unit="m" value={v.drain} onChange={(x) => set({ drain: x })} /></Two>
      <Sel l="Stand" value={v.stand} onChange={(x) => set({ stand: x })} options={[...stands.map((s) => [s.id, `${s.name} · ${rs(s.price)}`] as [string, string]), ["", "No stand"]]} />
      <Two><F l="Stand qty" value={v.standQty} onChange={(x) => set({ standQty: x })} /><F l="Fastener sets" value={v.fasteners} onChange={(x) => set({ fasteners: x })} /></Two>
      <Two><F l="Vibration pad sets" value={v.pads} onChange={(x) => set({ pads: x })} /><F l="Transport trips" value={v.transport} onChange={(x) => set({ transport: x })} /></Two>
      <F l="Discount" unit="₹" value={v.discount} onChange={(x) => set({ discount: x })} hint={`Up to ${T.maxTechDiscountPct}% without office approval.`} />
    </Box>
  </>} />;
}

/* ───────────── 04 Extra material ───────────── */

const EXTRA_IDS = ["cu-pair", "cab-extra", "drain-16", "ins-m"];
export function ExtraMaterial({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const T = db.fin.tools;
  const pk0 = T.packages[0];
  const fromPkg = (id: string) => Object.fromEntries(EXTRA_IDS.map((k) => [k, { inc: String(T.packages.find((p) => p.id === id)?.includes[k] ?? 0), act: "" }]));
  const init = { pkg: pk0?.id ?? "", items: fromPkg(pk0?.id ?? "") as Record<string, { inc: string; act: string }> };
  const calc = useCalc(init, (v): Result => {
    const ex = extraMaterial(EXTRA_IDS.map((k) => { const r = rateOrThrow(db, k); return { name: r.name, unit: r.unit, included: num(v.items[k].inc), actual: num(v.items[k].act), rate: r.price, refId: k }; }));
    return {
      summary: [...ex.rows.map((r) => ({ k: `${r.name.replace(/, extra|\s*\(per metre\)/g, "")}: ${fmt(r.chargeable)} ${r.unit} extra`, v: rs(r.amount) })), { k: "Total extra (ex GST)", v: rs(ex.total), strong: true }],
      breakdown: ex.rows.map((r) => `${r.name}: used ${fmt(r.actual)} − included ${fmt(r.included)} → ${fmt(r.chargeable)} chargeable${r.unused ? ` (${fmt(r.unused)} of the allowance unused — no credit)` : ""}`),
      assumptions: ["Only quantities beyond the package allowance are charged; the included part is never charged again.", sample(db)],
      lines: ex.rows.filter((r) => r.chargeable > 0).map((r) => ({ id: lineId(), kind: "Material", name: `Extra ${r.name.replace(/, extra|\s*\(per metre\)/g, "")} · ${fmt(r.chargeable)} ${r.unit}`, qty: 1, price: r.amount })),
      outputs: { total: ex.total },
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <Sel l="Package (fills included quantities)" value={v.pkg} onChange={(x) => set({ pkg: x, items: fromPkg(x) as typeof v.items })} options={[...T.packages.map((p) => [p.id, p.name] as [string, string]), ["", "No package"]]} />
    {EXTRA_IDS.map((k) => { const r = rateOf(db, k); return r ? (
      <div key={k}><p style={{ margin: "4px 0 6px", fontSize: 13, fontWeight: 700 }}>{r.name} · {rs(r.price)}/{r.unit}</p>
        <Two><F l={`Included ${r.unit}`} value={v.items[k].inc} onChange={(x) => set({ items: { ...v.items, [k]: { ...v.items[k], inc: x } } })} /><F l={`Actual ${r.unit}`} value={v.items[k].act} onChange={(x) => set({ items: { ...v.items, [k]: { ...v.items[k], act: x } } })} /></Two></div>) : null; })}
  </Box>} />;
}

/* ───────────── 05 Drain pipe ───────────── */

export function DrainPipe({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const T = db.fin.tools;
  const init = { route: "4", slope: T.drainSlopes[0]?.id ?? "", fittings: "2", wastage: String(T.drainWastagePct), stock: "" };
  const calc = useCalc(init, (v): Result => {
    const s = T.drainSlopes.find((x) => x.id === v.slope);
    if (!s) throw new ToolError("Select a slope configured by the office.");
    const pipe = rateOrThrow(db, "drain-16");
    const fitR = rateOrThrow(db, "drain-fit");
    const r = drainPipe({ routeM: num(v.route), rise: s.rise, run: s.run, fittings: num(v.fittings), wastagePct: num(v.wastage), ratePerM: pipe.price, fittingRate: fitR.price, stockLengthM: v.stock ? num(v.stock) : null });
    return {
      summary: [{ k: "Slope", v: `${s.label} = ${fmt(r.slopePct, 2)}% = ${fmt(r.mmPerM, 1)} mm fall per metre` }, { k: "Height drop over route", v: `${fmt(r.dropMm, 0)} mm` }, { k: "Pipe incl. wastage", v: `${fmt(r.pipeM)} m${r.pieces != null ? ` (${r.pieces} stock lengths)` : ""}` }, { k: "Pipe price", v: rs(r.pipePrice) }, { k: `Fittings × ${v.fittings}`, v: rs(r.fittingPrice) }, { k: "Total (ex GST)", v: rs(r.total), strong: true }],
      breakdown: [`Drop = ${v.route} m × ${s.rise}/${s.run} = ${fmt(r.dropMm, 0)} mm`, `Pipe = ${v.route} m × (1 + ${v.wastage}%)`],
      assumptions: [s.source, "No single slope suits every installation — follow the manufacturer's manual and keep the drain falling all the way with no traps.", sample(db)],
      lines: [{ id: lineId(), kind: "Material", name: `${pipe.name.replace(/\s*\(per metre\)/, "")} · ${fmt(r.pipeM)} m`, qty: 1, price: r.pipePrice }, ...(r.fittingPrice ? [{ id: lineId(), kind: "Material" as const, name: fitR.name, qty: num(v.fittings), price: fitR.price }] : [])],
      outputs: r,
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <F l="Route length" unit="m" value={v.route} onChange={(x) => set({ route: x })} />
    <Sel l="Slope (rise : run)" value={v.slope} onChange={(x) => set({ slope: x })} options={T.drainSlopes.map((s) => [s.id, `${s.label} (${fmt((s.rise / s.run) * 1000, 1)} mm per m)`] as [string, string])} hint="Slope units: vertical fall : horizontal length." />
    <Two><F l="Fittings" value={v.fittings} onChange={(x) => set({ fittings: x })} /><F l="Wastage" unit="%" value={v.wastage} onChange={(x) => set({ wastage: x })} /></Two>
    <F l="Stock pipe length (optional)" unit="m" value={v.stock} onChange={(x) => set({ stock: x })} />
    <Note>Pipe size: {rateOf(db, "drain-16")?.name ?? "—"} at the approved rate.</Note>
  </Box>} />;
}

/* ───────────── 06 Insulation ───────────── */

export function Insulation({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const T = db.fin.tools;
  const init = { od: String(preset('1/2"').odMm), thick: "9", length: "3", piece: String(T.insulationPieceM), wastage: String(T.insulationWastagePct) };
  const calc = useCalc(init, (v): Result => {
    const rate = rateOrThrow(db, "ins-piece");
    const r = insulation({ pipeOdMm: num(v.od), thicknessMm: num(v.thick), pipeLengthM: num(v.length), pieceLengthM: num(v.piece), wastagePct: num(v.wastage), ratePerPiece: rate.price });
    return {
      summary: [{ k: "Insulation bore (ID) needed", v: `${fmt(r.requiredIdMm)} mm` }, { k: "Insulated outer Ø", v: `${fmt(r.outerDiaMm)} mm` }, { k: "Total length", v: `${fmt(r.totalM)} m` }, { k: "Stock pieces", v: `${r.pieces} × ${v.piece} m` }, { k: "Customer price (ex GST)", v: rs(r.price), strong: true }],
      breakdown: [`Pieces = ⌈${v.length} m × (1 + ${v.wastage}%) ÷ ${v.piece} m⌉ = ${r.pieces}`, "Bore must match the pipe OD so the tube fits snugly with no gap."],
      assumptions: ["Insulate liquid and suction lines separately.", sample(db)],
      lines: [{ id: lineId(), kind: "Material", name: `Insulation ${fmt(r.requiredIdMm, 1)} mm bore × ${v.thick} mm · ${r.pieces} pcs`, qty: r.pieces, price: rate.price }],
      outputs: r,
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <Sel l="Pipe preset" value="" onChange={(x) => { const p = PIPE_PRESETS.find((y) => y.label === x); if (p) set({ od: String(p.odMm) }); }} options={[["", "Choose…"], ...PIPE_PRESETS.map((x) => [x.label, x.label] as [string, string])]} />
    <Two><F l="Pipe outside Ø" unit="mm" value={v.od} onChange={(x) => set({ od: x })} /><F l="Insulation thickness" unit="mm" value={v.thick} onChange={(x) => set({ thick: x })} /></Two>
    <Two><F l="Pipe length" unit="m" value={v.length} onChange={(x) => set({ length: x })} /><F l="Stock piece length" unit="m" value={v.piece} onChange={(x) => set({ piece: x })} /></Two>
    <F l="Wastage" unit="%" value={v.wastage} onChange={(x) => set({ wastage: x })} />
  </Box>} />;
}

/* ───────────── 07 Cable & electrical ───────────── */

export function CableElectrical({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const T = db.fin.tools;
  const cables = T.rates.filter((r) => r.cable);
  const methods = [...new Set(T.cableTables.map((t) => t.method))];
  const init = { amps: "", volts: "230", phase: "single" as "single" | "three", length: "10", material: "Copper" as "Copper" | "Aluminium", rateId: cables[1]?.id ?? cables[0]?.id ?? "", size: String(cables[1]?.cable?.sizeMm2 ?? 2.5), method: methods[0] ?? "", temp: "70", derate: "1", wastage: String(T.cableWastagePct) };
  const calc = useCalc(init, (v): Result => {
    const a = cableAssessment({ currentA: num(v.amps), voltage: num(v.volts), phase: v.phase, lengthM: num(v.length), material: v.material, sizeMm2: num(v.size), conductorTempC: num(v.temp), method: v.method, deratingFactor: num(v.derate), tables: T.cableTables, dropLimitPct: T.voltageDropLimitPct, dropLimitSource: T.voltageDropSource });
    const rate = rateOf(db, v.rateId);
    const qty = num(v.length) * (1 + num(v.wastage) / 100);
    const price = rate ? Math.round(qty * rate.price * 100) / 100 : null;
    const warnings = [a.dropAssessment.status === "exceeds" ? a.dropAssessment.text : "", a.capacity.status === "exceeds" ? a.capacity.text : ""].filter(Boolean);
    return {
      summary: [{ k: "Voltage drop", v: `${fmt(a.dropV, 2)} V (${fmt(a.dropPct, 2)}%)`, strong: true }, { k: "Drop assessment", v: a.dropAssessment.status === "ok" ? "Within limit" : a.dropAssessment.status === "exceeds" ? "Exceeds limit" : "Unavailable" }, { k: "Current rating", v: a.capacity.status === "ok" ? "OK per approved table" : a.capacity.status === "exceeds" ? "Too small" : "Unavailable" }, { k: "Cable to carry", v: `${fmt(qty)} m` }, ...(price != null ? [{ k: "Cable price (ex GST)", v: rs(price) }] : [])],
      unavailable: [a.dropAssessment.status === "unavailable" ? a.dropAssessment.text : "", a.capacity.status === "unavailable" ? a.capacity.text : ""].filter(Boolean).join(" ") || undefined,
      warnings,
      breakdown: [`R = ρ × L ÷ A = ${fmt(a.rho, 5)} × ${v.length} ÷ ${v.size} = ${fmt(a.rPerConductor, 4)} Ω per conductor`, v.phase === "single" ? `Vd = 2 × I × R = 2 × ${v.amps} × ${fmt(a.rPerConductor, 4)}` : `Vd = √3 × I × R = 1.732 × ${v.amps} × ${fmt(a.rPerConductor, 4)}`, a.capacity.text, a.dropAssessment.text],
      assumptions: ["Current is the manufacturer's nameplate/manual running current — never derived from tonnage.", "MCB / protective device: select from the manufacturer's recommended rating and the approved standard; this tool does not choose one.", CONDUCTOR_SOURCE, "Have the installation verified by a licensed electrician where required."],
      lines: rate && price ? [{ id: lineId(), kind: "Material", name: `${rate.name.replace(/\s*\(per metre\)/, "")} · ${fmt(qty)} m`, qty: 1, price }] : [],
      outputs: { dropV: a.dropV, dropPct: a.dropPct, capacity: a.capacity.status },
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} onDemo={() => calc.load({ ...init, amps: "6.8" })} form={<Box>
    <F l="Running current (nameplate / manual)" unit="A" value={v.amps} onChange={(x) => set({ amps: x })} hint="From the manufacturer's nameplate or manual — not from tonnage." />
    <Two><F l="Voltage" unit="V" value={v.volts} onChange={(x) => set({ volts: x })} /><Sel l="Phase" value={v.phase} onChange={(x) => set({ phase: x, volts: x === "three" ? "415" : "230" })} options={[["single", "Single phase"], ["three", "Three phase"]]} /></Two>
    <F l="Cable length (one way)" unit="m" value={v.length} onChange={(x) => set({ length: x })} />
    <Sel l="Cable (approved rate)" value={v.rateId} onChange={(x) => { const c = cables.find((y) => y.id === x); set({ rateId: x, size: c?.cable ? String(c.cable.sizeMm2) : v.size, material: c?.cable?.material ?? v.material }); }} options={[...cables.map((c) => [c.id, `${c.name} · ${rs(c.price)}/m`] as [string, string]), ["", "Other cable (no price)"]]} />
    <Two><Sel l="Conductor" value={v.material} onChange={(x) => set({ material: x })} options={["Copper", "Aluminium"] as const} /><F l="Size" unit="mm²" value={v.size} onChange={(x) => set({ size: x })} /></Two>
    <Sel l="Installation method (approved tables)" value={v.method} onChange={(x) => set({ method: x })} options={methods.length ? methods : [["", "No approved tables yet"]]} />
    <Two><F l="Conductor temp" unit="°C" value={v.temp} onChange={(x) => set({ temp: x })} /><F l="Derating factor" value={v.derate} onChange={(x) => set({ derate: x })} hint="Grouping × ambient, from the approved table" /></Two>
    <F l="Wastage" unit="%" value={v.wastage} onChange={(x) => set({ wastage: x })} />
  </Box>} />;
}

/* ───────────── 08 Stand & accessories ───────────── */

export function StandAccessories({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const T = db.fin.tools;
  const stands = T.rates.filter((r) => r.id.startsWith("stand"));
  const init = { model: "", weight: "", stand: stands[0]?.id ?? "", rated: "", verified: false, source: "", fasteners: "1", pads: "1" };
  const calc = useCalc(init, (v): Result => {
    const chk = standCheck({ unitWeightKg: num(v.weight), ratedLoadKg: v.rated ? num(v.rated) : null, ratingVerified: v.verified, ratingSource: v.source, factor: T.standLoadFactor });
    const lines: QLine[] = [
      ...(v.stand ? [{ name: rateOrThrow(db, v.stand).name, kind: "Material" as const, qty: 1, unit: "piece", rate: rateOrThrow(db, v.stand).price }] : []),
      { name: rateOrThrow(db, "fasteners").name, kind: "Material", qty: num(v.fasteners), unit: "set", rate: rateOrThrow(db, "fasteners").price },
      { name: rateOrThrow(db, "pads").name, kind: "Material", qty: num(v.pads), unit: "set", rate: rateOrThrow(db, "pads").price },
    ];
    const q = quoteTotals(lines, 0, gstPct(db));
    return {
      summary: [{ k: "Compatibility", v: chk.status === "ok" ? "Load rating OK" : chk.status === "fail" ? "Rating too low" : "Not assessed", strong: true }, { k: "Load needed", v: `${fmt(chk.required, 1)} kg` }, ...quoteRows(q)],
      warnings: chk.status === "fail" ? [chk.text] : [],
      unavailable: chk.status === "unverified" ? chk.text : undefined,
      breakdown: [`Required = unit weight ${v.weight || "—"} kg × office factor ${T.standLoadFactor}`, chk.text],
      assumptions: ["Checklist: stand, anchor fasteners (suited to the wall), anti-vibration pads, level, clearance per manual, drain fall, service access.", `Model: ${v.model || "not entered"}. Weight from the manufacturer's specification.`, "This does not certify the wall or structure — judge it on site.", sample(db)],
      lines: toLines(q.lines), outputs: { status: chk.status, total: q.total },
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <F l="AC model" type="text" value={v.model} onChange={(x) => set({ model: x })} />
    <F l="Outdoor unit weight (manufacturer spec)" unit="kg" value={v.weight} onChange={(x) => set({ weight: x })} />
    <Sel l="Stand type" value={v.stand} onChange={(x) => set({ stand: x })} options={[...stands.map((s) => [s.id, `${s.name} · ${rs(s.price)}`] as [string, string]), ["", "No stand"]]} />
    <F l="Stand rated load (maker's label/datasheet)" unit="kg" value={v.rated} onChange={(x) => set({ rated: x })} />
    <F l="Rating source" type="text" value={v.source} onChange={(x) => set({ source: x })} placeholder="e.g. label on stand, datasheet ref" />
    <Check l="I have checked this rating against the maker's label or datasheet" on={v.verified} onChange={(x) => set({ verified: x })} />
    <Two><F l="Fastener sets" value={v.fasteners} onChange={(x) => set({ fasteners: x })} /><F l="Vibration pad sets" value={v.pads} onChange={(x) => set({ pads: x })} /></Two>
  </Box>} />;
}
