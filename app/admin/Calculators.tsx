"use client";

import { Fragment, useMemo, useState } from "react";
import { formatNum } from "../lib/calc/money";
import { calculatePipeSet, type ExtraLine, type PipeInput, type PricingRule } from "../lib/calc/pipe";
import { CITY_CLIMATE, CLIMATE_LABELS, DEFAULT_TONNAGE_COEFFICIENTS, estimateTonnage, type TonnageInput } from "../lib/calc/tonnage";
import { ftToM, mToFt, parseInches } from "../lib/calc/units";
import { fmtDateTime, stepOf, type Db, type QuoteLine } from "../lib/data";
import { inr2, pct } from "../lib/finance";
import { PIPE_PRESETS, type FinanceSettings } from "../lib/finance-types";
import { saveCalc, updateFin } from "../lib/store";
import { Badge, Btn, Panel, fieldLabel, input, muted } from "./kit";
import { ToolRulesPanel } from "./ToolRules";

type PipeState = { label: string; od: string; odUnit: "in" | "mm"; mode: "mm" | "gauge"; wallMm: string; gaugeStd: string; gauge: string; length: string; lengthUnit: "m" | "ft"; qty: string };
const newPipe = (label: string, od: string, wallMm = ""): PipeState => ({ label, od, odUnit: "in", mode: "mm", wallMm, gaugeStd: "", gauge: "", length: "3", lengthUnit: "m", qty: "1" });
// defaults use the ASTM B280 nominal walls (see PIPE_PRESETS); always confirm against the supplier's pipe
const presetWall = (label: string) => String(PIPE_PRESETS.find((p) => p.label.startsWith(label))?.wallMm ?? "");
const grid = (min = 140): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 10 });
const uid = () => Math.random().toString(36).slice(2, 9);

function SaveBar({ db, onSave, allowLines }: { db: Db; onSave: (title: string, customerId: string | null, jobId: string | null) => void; allowLines: boolean }) {
  const [title, setTitle] = useState("");
  const [cust, setCust] = useState("");
  const [job, setJob] = useState("");
  const jobs = db.jobs.filter((j) => (!cust || j.customerId === cust) && stepOf(j.status) < stepOf("Approved") && j.status !== "Cancelled");
  return (
    <div style={{ ...grid(160), marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
      <label><span style={fieldLabel}>Save as</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bedroom 1.5T pipe run" style={input} /></label>
      <label><span style={fieldLabel}>Customer</span><select value={cust} onChange={(e) => { setCust(e.target.value); setJob(""); }} style={input}><option value="">—</option>{db.customers.filter((c) => !c.mergedInto).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label><span style={fieldLabel}>{allowLines ? "Add lines to estimate of job" : "Attach to job / estimate"}</span><select value={job} onChange={(e) => setJob(e.target.value)} style={input}><option value="">—</option>{jobs.map((j) => <option key={j.id}>{j.id}</option>)}</select></label>
      <div style={{ display: "flex", alignItems: "flex-end" }}><Btn disabled={!title.trim()} onClick={() => onSave(title.trim(), cust || null, job || null)}>{job && allowLines ? "Save & add to estimate" : "Save"}</Btn></div>
      {allowLines && <p style={{ ...muted, gridColumn: "1 / -1", margin: 0 }}>Estimate only — stock reduces only when parts are actually consumed on a job.</p>}
    </div>
  );
}

/* ───────────── Copper pipe ───────────── */

function CopperCalculator({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const f = db.fin;
  const [pipes, setPipes] = useState<PipeState[]>([newPipe("Liquid line", "1/4", presetWall('1/4"')), newPipe("Suction line", "1/2", presetWall('1/2"'))]);
  const [rate, setRate] = useState(String(f.copperRatePerKg || ""));
  const [supplier, setSupplier] = useState("");
  const [wastage, setWastage] = useState(String(f.wastagePct));
  const [mode, setMode] = useState<PricingRule["mode"]>("markup");
  const [rulePct, setRulePct] = useState(String(f.pipeMarkupPct ?? 25));
  const rule = useMemo<PricingRule>(() => ({ mode, pct: rulePct.trim() === "" ? NaN : Number(rulePct) }), [mode, rulePct]);
  const [tax, setTax] = useState(true);
  const [extras, setExtras] = useState<ExtraLine[]>([
    { kind: "insulation", description: "Insulation tube", quantity: 0, unit: "m", unitCost: 0 },
    { kind: "fittings", description: "Flare nuts / fittings", quantity: 0, unit: "set", unitCost: 0 },
    { kind: "labour", description: "Installation labour", quantity: 0, unit: "job", unitCost: 0 },
  ]);
  const upd = (i: number, p: Partial<PipeState>) => setPipes(pipes.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const calc = useMemo(() => {
    const inputs: PipeInput[] = [];
    for (const p of pipes) {
      const od = p.odUnit === "in" ? parseInches(p.od) : Number(p.od);
      if (od == null || !Number.isFinite(od)) return { error: `${p.label}: enter the outside diameter.` };
      let gauge = null;
      if (p.mode === "gauge") {
        const st = f.gauges.find((g) => g.id === p.gaugeStd);
        const sz = st?.sizes.find((z) => z.gauge === p.gauge);
        if (!st || !sz) return { error: `${p.label}: choose a gauge standard and gauge.` };
        gauge = { standard: st.code, gauge: sz.gauge, thicknessMm: sz.mm };
      }
      inputs.push({ label: p.label, od, odUnit: p.odUnit, wallMm: p.mode === "mm" ? (p.wallMm === "" ? null : Number(p.wallMm)) : null, gauge, length: Number(p.length), lengthUnit: p.lengthUnit, quantity: Number(p.qty) });
    }
    try {
      return { inputs, r: calculatePipeSet(inputs, { ratePerKg: Number(rate || 0), supplierRatePerMetre: supplier ? Number(supplier) : null, wastagePct: wastage.trim() === "" ? 0 : Number(wastage), pricing: rule, taxRatePct: tax ? db.settings.gstPercent : null, densityKgM3: f.copperDensity }, extras.filter((e) => e.quantity > 0)) };
    } catch (e) { return { error: (e as Error).message }; }
  }, [pipes, rate, supplier, wastage, rule, tax, extras, f, db.settings.gstPercent]);
  const r = "r" in calc ? calc.r : null;

  const save = (title: string, customerId: string | null, jobId: string | null) => {
    if (!r) return;
    const gst = tax ? db.settings.gstPercent : 0;
    const lines: QuoteLine[] = [
      ...r.pipes.map((p) => ({ id: `cl${uid()}`, kind: "Material" as const, name: `Copper pipe ${p.label ?? ""} OD ${formatNum(p.odMm, 2)}×${formatNum(p.thicknessMm, 3)} mm (${formatNum(p.totalLengthM, 2)} m)`, qty: 1, price: p.sellingPrice })),
      ...r.extras.map((e) => ({ id: `cl${uid()}`, kind: (e.kind === "labour" ? "Labour" : "Material") as QuoteLine["kind"], name: `${e.description} (${e.quantity} ${e.unit})`, qty: 1, price: e.price })),
    ];
    const err = saveCalc({ kind: "Copper pipe", title, customerId, jobId, by: who, inputs: { pipes: calc.inputs, rate, supplier, wastage, rule, gst, density: f.copperDensity, densitySource: f.densitySource, extras }, outputs: r }, jobId ? lines : null);
    notify(err ? `⚠ ${err}` : jobId ? `Saved and ${lines.length} line(s) added to ${jobId}'s estimate` : "Calculation saved");
  };

  return (
    <div className="admin-grid-2">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {pipes.map((p, i) => {
          const st = f.gauges.find((g) => g.id === p.gaugeStd);
          return (
            <Panel key={i} title={<input value={p.label} onChange={(e) => upd(i, { label: e.target.value })} style={{ ...input, fontWeight: 700, width: 200 }} aria-label="Pipe name" />} actions={<>
              <select value="" onChange={(e) => { const pr = PIPE_PRESETS.find((x) => x.label === e.target.value); if (pr) upd(i, { od: String(pr.odMm), odUnit: "mm", mode: "mm", wallMm: String(pr.wallMm) }); }} style={{ ...input, width: "auto" }} aria-label="Preset">
                <option value="">ASTM B280 preset…</option>{PIPE_PRESETS.map((x) => <option key={x.label}>{x.label}</option>)}
              </select>
              {pipes.length > 1 && <Btn small kind="danger" onClick={() => setPipes(pipes.filter((_, j) => j !== i))}>Remove</Btn>}
            </>}>
              <div style={grid()}>
                <label><span style={fieldLabel}>Outside diameter</span><span style={{ display: "flex", gap: 4 }}><input value={p.od} onChange={(e) => upd(i, { od: e.target.value })} style={input} placeholder={p.odUnit === "in" ? "3/8" : "9.52"} /><select value={p.odUnit} onChange={(e) => upd(i, { odUnit: e.target.value as "in" | "mm" })} style={{ ...input, width: 64 }}><option value="in">in</option><option value="mm">mm</option></select></span></label>
                <label><span style={fieldLabel}>Wall by</span><select value={p.mode} onChange={(e) => upd(i, { mode: e.target.value as "mm" | "gauge" })} style={input}><option value="mm">Millimetres</option><option value="gauge">Gauge</option></select></label>
                {p.mode === "mm" ? (
                  <label><span style={fieldLabel}>Wall thickness mm</span><input type="number" step="0.001" min={0} value={p.wallMm} onChange={(e) => upd(i, { wallMm: e.target.value })} style={input} /></label>
                ) : (<>
                  <label><span style={fieldLabel}>Gauge standard</span><select value={p.gaugeStd} onChange={(e) => upd(i, { gaugeStd: e.target.value, gauge: "" })} style={input}><option value="">Select…</option>{f.gauges.map((g) => <option key={g.id} value={g.id}>{g.code}{g.verified ? "" : " (unverified)"}</option>)}</select></label>
                  <label><span style={fieldLabel}>Gauge</span><select value={p.gauge} onChange={(e) => upd(i, { gauge: e.target.value })} style={input}><option value="">—</option>{st?.sizes.map((z) => <option key={z.gauge} value={z.gauge}>{z.gauge} = {z.mm} mm</option>)}</select></label>
                </>)}
                <label><span style={fieldLabel}>Length / piece</span><span style={{ display: "flex", gap: 4 }}><input type="number" min={0} step="0.01" value={p.length} onChange={(e) => upd(i, { length: e.target.value })} style={input} /><select value={p.lengthUnit} onChange={(e) => upd(i, { lengthUnit: e.target.value as "m" | "ft" })} style={{ ...input, width: 60 }}><option>m</option><option>ft</option></select></span></label>
                <label><span style={fieldLabel}>Quantity</span><input type="number" min={1} step={1} value={p.qty} onChange={(e) => upd(i, { qty: e.target.value })} style={input} /></label>
              </div>
              {p.mode === "gauge" && st && <p style={{ ...muted, margin: "8px 0 0" }}>Standard: <b>{st.name}</b> — {st.source} {st.verified ? "✓ verified" : "· not yet verified (Cost rules)"}</p>}
            </Panel>
          );
        })}
        <div><Btn kind="ghost" onClick={() => setPipes([...pipes, newPipe(`Pipe ${pipes.length + 1}`, "3/8")])}>+ Add pipe</Btn></div>
        <Panel title="Rates & pricing">
          <div style={grid()}>
            <label><span style={fieldLabel}>Copper ₹ / kg</span><input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} style={input} /></label>
            <label><span style={fieldLabel}>Supplier ₹ / metre (optional)</span><input type="number" min={0} value={supplier} onChange={(e) => setSupplier(e.target.value)} style={input} /></label>
            <label><span style={fieldLabel}>Wastage %</span><input type="number" min={0} max={99} value={wastage} onChange={(e) => setWastage(e.target.value)} style={input} /></label>
            <label><span style={fieldLabel}>Pricing</span><select value={mode} onChange={(e) => setMode(e.target.value as PricingRule["mode"])} style={input}><option value="markup">Markup on cost</option><option value="margin">Target margin</option></select></label>
            <label><span style={fieldLabel}>{rule.mode === "markup" ? "Markup %" : "Margin %"}</span><input type="number" min={0} value={rulePct} onChange={(e) => setRulePct(e.target.value)} style={input} /></label>
            <label><span style={fieldLabel}>GST {db.settings.gstPercent}% (separate)</span><span style={{ display: "flex", alignItems: "center", gap: 6, height: 38 }}><input type="checkbox" checked={tax} onChange={(e) => setTax(e.target.checked)} /> Apply</span></label>
          </div>
          <p style={{ ...muted, margin: "8px 0 0" }}>Density {f.copperDensity} kg/m³ — {f.densitySource}</p>
        </Panel>
        <Panel title="Insulation, fittings & labour (separate items)">
          {extras.map((e, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
              <input value={e.description} onChange={(x) => setExtras(extras.map((y, j) => (j === i ? { ...y, description: x.target.value } : y)))} style={input} aria-label="Item" />
              <input type="number" min={0} placeholder="Qty" value={e.quantity || ""} onChange={(x) => setExtras(extras.map((y, j) => (j === i ? { ...y, quantity: Number(x.target.value) } : y)))} style={input} aria-label="Quantity" />
              <input value={e.unit} onChange={(x) => setExtras(extras.map((y, j) => (j === i ? { ...y, unit: x.target.value } : y)))} style={input} aria-label="Unit" />
              <input type="number" min={0} placeholder="Cost ₹" value={e.unitCost || ""} onChange={(x) => setExtras(extras.map((y, j) => (j === i ? { ...y, unitCost: Number(x.target.value) } : y)))} style={input} aria-label="Unit cost" />
            </div>
          ))}
        </Panel>
      </div>
      <Panel title="Results">
        {"error" in calc && <p role="alert" style={{ background: "var(--gold-tint)", color: "var(--gold-dark)", padding: 10, borderRadius: 10, fontSize: 13, margin: 0 }}>{calc.error}</p>}
        {r && (<>
          {r.pipes.map((p, i) => (
            <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <p style={{ margin: "0 0 6px", fontWeight: 700 }}>{p.label}</p>
              <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 12px", fontSize: 12.5, margin: 0, fontVariantNumeric: "tabular-nums" }}>
                {([
                  ["Thickness", `${formatNum(p.thicknessMm, 4)} mm · ${p.thicknessSource}`], ["Inside diameter", `${formatNum(p.idMm, 3)} mm`], ["Weight / metre", `${formatNum(p.kgPerM, 4)} kg`],
                  ["Weight / foot", `${formatNum(p.kgPerFt, 4)} kg`], ["Total length", `${formatNum(p.totalLengthM, 2)} m`], ["Net weight", `${formatNum(p.netWeightKg, 3)} kg`],
                  ["Procurement weight", `${formatNum(p.procurementWeightKg, 3)} kg`], ["Purchase cost", `${inr2(p.purchaseCost)} (${p.costBasis === "weight" ? "by weight" : "supplier ₹/m"})`],
                  ["Selling price", inr2(p.sellingPrice)], ["Profit · margin", `${inr2(p.profit)} · ${pct(p.marginPct)}`],
                ] as [string, string][]).map(([k, v]) => <Fragment key={k}><dt style={{ color: "var(--ink-soft)" }}>{k}</dt><dd style={{ margin: 0, textAlign: "right" }}>{v}</dd></Fragment>)}
              </dl>
            </div>
          ))}
          {r.extras.map((e, i) => <p key={i} style={{ ...muted, margin: "2px 0", display: "flex", justifyContent: "space-between" }}><span>{e.description} ({e.quantity} {e.unit})</span><span>{inr2(e.cost)} → {inr2(e.price)}</span></p>)}
          <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", background: "var(--bg-secondary)", borderRadius: 12, padding: 12, fontSize: 13, margin: "10px 0 0", fontVariantNumeric: "tabular-nums" }}>
            {([["Net copper weight", `${formatNum(r.totals.netWeightKg, 3)} kg`], ["Procurement weight", `${formatNum(r.totals.procurementWeightKg, 3)} kg`], ["Total cost", inr2(r.totals.cost)], ["Selling price (ex GST)", inr2(r.totals.price)], ["Profit · margin", `${inr2(r.totals.profit)} · ${pct(r.totals.marginPct)}`], ["GST (separate)", inr2(r.totals.tax)], ["Total incl. GST", inr2(r.totals.totalWithTax)]] as [string, string][])
              .map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd style={{ margin: 0, textAlign: "right", fontWeight: k.startsWith("Total incl") ? 800 : 500 }}>{v}</dd></Fragment>)}
          </dl>
          <SaveBar db={db} onSave={save} allowLines />
        </>)}
      </Panel>
    </div>
  );
}

/* ───────────── Tonnage ───────────── */

type TonnageForm = Omit<TonnageInput, "lengthValue" | "widthValue" | "ceilingValue" | "occupants" | "windowAreaSqft" | "applianceWatts"> & {
  lengthValue: string; widthValue: string; ceilingValue: string; occupants: string; windowAreaSqft: string; applianceWatts: string; city: string;
};
const TONNAGE_NUMS = ["lengthValue", "widthValue", "ceilingValue", "occupants", "windowAreaSqft", "applianceWatts"] as const;

function TonnageEstimator({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const c = db.fin.tonnage;
  // fields are kept as typed text so decimals ("3.5") and empty fields edit naturally; parsed only for the estimate
  const [i, setI] = useState<TonnageForm>({ lengthValue: "12", widthValue: "10", dimensionUnit: "ft", ceilingValue: "10", city: "Delhi / NCR", climate: "hot_dry", occupants: "2", sunlight: "normal", roof: "intermediate_floor", insulation: "average", windowAreaSqft: "15", applianceWatts: "250", isKitchen: false });
  const parsed = useMemo<TonnageInput>(() => {
    const out = { ...i } as Record<string, unknown>;
    for (const k of TONNAGE_NUMS) out[k] = i[k].trim() === "" ? NaN : Number(i[k]);
    delete out.city;
    return out as unknown as TonnageInput;
  }, [i]);
  const res = useMemo(() => { try { return { r: estimateTonnage(parsed, c) }; } catch (e) { return { e: (e as Error).message }; } }, [parsed, c]);
  const num = (k: (typeof TONNAGE_NUMS)[number], label: string) => <label><span style={fieldLabel}>{label}</span><input type="text" inputMode="decimal" value={i[k]} onChange={(e) => setI({ ...i, [k]: e.target.value })} style={input} aria-label={label} /></label>;
  // switching units converts the room dimensions instead of reinterpreting 12 ft as 12 m
  const setUnit = (u: "ft" | "m") => {
    if (u === i.dimensionUnit) return;
    const conv = (v: string) => { const n = Number(v); return v.trim() === "" || !Number.isFinite(n) ? v : String(Math.round((u === "m" ? ftToM(n) : mToFt(n)) * 100) / 100); };
    setI({ ...i, dimensionUnit: u, lengthValue: conv(i.lengthValue), widthValue: conv(i.widthValue), ceilingValue: conv(i.ceilingValue) });
  };
  const save = (title: string, customerId: string | null, jobId: string | null) => {
    if (!res.r) return;
    const err = saveCalc({ kind: "Tonnage", title, customerId, jobId, by: who, inputs: { input: parsed, city: i.city, coefficients: c }, outputs: res.r }, null);
    notify(err ? `⚠ ${err}` : jobId ? `Estimate saved and attached to ${jobId}` : "Estimate saved");
  };
  return (
    <div className="admin-grid-2">
      <Panel title="Room details">
        <div style={grid()}>
          <label><span style={fieldLabel}>Units</span><select value={i.dimensionUnit} onChange={(e) => setUnit(e.target.value as "ft" | "m")} style={input}><option value="ft">Feet</option><option value="m">Metres</option></select></label>
          {num("lengthValue", `Length (${i.dimensionUnit})`)}{num("widthValue", `Width (${i.dimensionUnit})`)}{num("ceilingValue", `Ceiling (${i.dimensionUnit})`)}
          <label><span style={fieldLabel}>City</span><select value={i.city} onChange={(e) => { const z = CITY_CLIMATE.find(([n]) => n === e.target.value)?.[1]; setI({ ...i, city: e.target.value, climate: z && c.climate[z] != null ? z : i.climate }); }} style={input}>{CITY_CLIMATE.map(([n]) => <option key={n}>{n}</option>)}<option value="Other">Other — choose climate</option></select></label>
          <label><span style={fieldLabel}>Climate zone</span><select value={i.climate} onChange={(e) => setI({ ...i, climate: e.target.value, city: CITY_CLIMATE.some(([n, z]) => n === i.city && z === e.target.value) ? i.city : "Other" })} style={input}>{Object.keys(c.climate).map((k) => <option key={k} value={k}>{CLIMATE_LABELS[k] ?? k} (×{c.climate[k]})</option>)}</select></label>
          {num("occupants", "Occupants")}
          <label><span style={fieldLabel}>Sunlight</span><select value={i.sunlight} onChange={(e) => setI({ ...i, sunlight: e.target.value as TonnageInput["sunlight"] })} style={input}><option value="shaded">Shaded</option><option value="normal">Normal</option><option value="heavy">Heavy sun</option></select></label>
          <label><span style={fieldLabel}>Roof exposure</span><select value={i.roof} onChange={(e) => setI({ ...i, roof: e.target.value as TonnageInput["roof"] })} style={input}><option value="intermediate_floor">Floor above</option><option value="top_floor_roof_exposed">Top floor</option><option value="single_storey_roof_exposed">Single storey / tin roof</option></select></label>
          <label><span style={fieldLabel}>Insulation</span><select value={i.insulation} onChange={(e) => setI({ ...i, insulation: e.target.value as TonnageInput["insulation"] })} style={input}><option value="good">Good</option><option value="average">Average</option><option value="poor">Poor</option></select></label>
          {num("windowAreaSqft", "Window area (ft²)")}{num("applianceWatts", "Appliance heat (W)")}
          <label><span style={fieldLabel}>Kitchen</span><span style={{ display: "flex", alignItems: "center", gap: 6, height: 38 }}><input type="checkbox" checked={i.isKitchen} onChange={(e) => setI({ ...i, isKitchen: e.target.checked })} /> Yes</span></label>
        </div>
      </Panel>
      <Panel title="Estimate">
        {res.e && <p role="alert" style={{ background: "var(--gold-tint)", padding: 10, borderRadius: 10, fontSize: 13, margin: 0 }}>{res.e}</p>}
        {res.r && (<>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Estimated cooling load</p>
          <p style={{ margin: "2px 0", fontSize: 28, fontWeight: 800 }}>{formatNum(res.r.totalBtuh, 0)} <span style={{ fontSize: 14, color: "var(--ink-soft)" }}>BTU/h</span></p>
          <p style={{ margin: 0 }}>{formatNum(res.r.tons, 2)} TR · with {c.safetyMarginPct}% margin {formatNum(res.r.tonsWithMargin, 2)} TR</p>
          <div style={{ background: "var(--blue-tint)", borderRadius: 12, padding: 12, margin: "10px 0" }}>
            Suggested capacity: <b style={{ fontSize: 18 }}>{res.r.recommendedTons != null ? `${res.r.recommendedTons} TR` : "—"}</b>
            <p style={{ ...muted, margin: "2px 0 0" }}>{res.r.recommendationNote}</p>
          </div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}><tbody>
            {res.r.steps.map((s) => <tr key={s.label} style={{ borderTop: "1px solid var(--line)", verticalAlign: "top" }}><td style={{ padding: "5px 6px 5px 0", fontWeight: 700 }}>{s.label}</td><td style={{ color: "var(--ink-soft)" }}>{s.detail}</td><td style={{ textAlign: "right" }}>{formatNum(s.btuh, 0)}</td></tr>)}
          </tbody></table>
          <p style={{ ...muted, margin: "8px 0 0" }}>1 TR = 12,000 BTU/h. Method: {c.source}</p>
          <p style={{ background: "var(--gold-tint)", color: "var(--gold-dark)", borderRadius: 10, padding: 8, fontSize: 12, margin: "8px 0 0" }}>{res.r.disclaimer}</p>
          <SaveBar db={db} onSave={save} allowLines={false} />
        </>)}
      </Panel>
    </div>
  );
}

export function CalculatorsSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [tab, setTab] = useState<"pipe" | "tonnage" | "saved">("pipe");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {([["pipe", "Copper pipe weight & price"], ["tonnage", "AC tonnage estimator"], ["saved", `Saved (${db.calcs.length})`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ border: "none", borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: tab === k ? "var(--blue)" : "var(--surface)", color: tab === k ? "white" : "var(--text-secondary)", boxShadow: "var(--shadow-card)" }}>{l}</button>
        ))}
      </div>
      {tab === "pipe" && <CopperCalculator db={db} who={who} notify={notify} />}
      {tab === "tonnage" && <TonnageEstimator db={db} who={who} notify={notify} />}
      {tab === "saved" && (
        <Panel title="Saved calculations">
          {db.calcs.map((c) => (
            <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
              <Badge tone={c.kind === "Tonnage" ? "teal" : "amber"}>{c.kind}</Badge> <b>{c.title}</b> · {db.customers.find((x) => x.id === c.customerId)?.name ?? "no customer"}{c.jobId ? ` · ${c.jobId}` : ""} <span style={muted}>· {fmtDateTime(c.at)} by {c.by}</span>
            </div>
          ))}
          {!db.calcs.length && <p style={muted}>Nothing saved yet.</p>}
        </Panel>
      )}
    </div>
  );
}

/* ───────────── Cost & calculation rules ───────────── */

export function CostRulesSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [f, setF] = useState<FinanceSettings>(structuredClone(db.fin));
  const [g, setG] = useState({ std: f.gauges[0]?.id ?? "", gauge: "", mm: "" });
  const [ns, setNs] = useState({ code: "", name: "", source: "" });
  const save = (patch: Partial<FinanceSettings>, msg = "Cost rules saved · logged in audit") => { updateFin(patch, who); setF({ ...f, ...patch }); notify(msg); };
  const t = f.tonnage;
  const tn = (path: string, v: number) => {
    const next = structuredClone(t) as unknown as Record<string, unknown>;
    const keys = path.split(".");
    let o = next as Record<string, unknown>;
    keys.slice(0, -1).forEach((k) => { o = o[k] as Record<string, unknown>; });
    o[keys.at(-1)!] = v;
    setF({ ...f, tonnage: next as unknown as FinanceSettings["tonnage"] });
  };
  const n = (path: string, label: string, v: number) => <label key={path}><span style={fieldLabel}>{label}</span><input type="number" step="0.01" value={v} onChange={(e) => tn(path, Number(e.target.value))} style={input} /></label>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="admin-grid-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <Panel title="Salary & cost allocation" actions={<Btn onClick={() => save({ attendanceAffectsSalary: f.attendanceAffectsSalary, labourIncludesTravel: f.labourIncludesTravel, sharedBasis: f.sharedBasis, overheadBasis: f.overheadBasis, salaryVisibleTo: f.salaryVisibleTo })}>Save</Btn>}>
          <label style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 8 }}><input type="checkbox" checked={f.attendanceAffectsSalary} onChange={(e) => setF({ ...f, attendanceAffectsSalary: e.target.checked })} /> Absences & unpaid leave reduce payable salary (low job hours never do)</label>
          <label style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 8 }}><input type="checkbox" checked={f.labourIncludesTravel} onChange={(e) => setF({ ...f, labourIncludesTravel: e.target.checked })} /> Approved travel time counts as that job&apos;s direct labour</label>
          <label><span style={fieldLabel}>Shared technician costs (fixed allowances, room, food…) allocated by</span><select value={f.sharedBasis} onChange={(e) => setF({ ...f, sharedBasis: e.target.value as FinanceSettings["sharedBasis"] })} style={input}>
            <option value="productive_hours">Approved productive (work) hours</option><option value="job_hours">Approved job hours (work + travel)</option><option value="completed_jobs">Completed jobs (equal per job)</option><option value="none">Do not allocate</option>
          </select></label>
          <label style={{ display: "block", marginTop: 10 }}><span style={fieldLabel}>Company overhead allocated to jobs (reporting only, never a second expense) by</span><select value={f.overheadBasis} onChange={(e) => setF({ ...f, overheadBasis: e.target.value as FinanceSettings["overheadBasis"] })} style={input}>
            <option value="revenue">Revenue</option><option value="labour_hours">Labour hours</option><option value="direct_cost">Direct cost</option><option value="none">Do not allocate</option>
          </select></label>
          <p style={{ ...fieldLabel, marginTop: 12 }}>Technicians who may see their own salary & payslips</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{db.techs.map((x) => <label key={x.id} style={{ fontSize: 13, display: "flex", gap: 5 }}><input type="checkbox" checked={f.salaryVisibleTo.includes(x.id)} onChange={(e) => setF({ ...f, salaryVisibleTo: e.target.checked ? [...f.salaryVisibleTo, x.id] : f.salaryVisibleTo.filter((y) => y !== x.id) })} />{x.name}</label>)}</div>
          <p style={{ ...muted, margin: "10px 0 0" }}>Direct job petrol / travel / food go straight to their job and are always excluded from shared allocation. Approved payroll months keep their stored allocations.</p>
        </Panel>
        <Panel title="Copper calculator defaults" actions={<Btn onClick={() => save({ copperDensity: f.copperDensity, densitySource: f.densitySource, copperRatePerKg: f.copperRatePerKg, wastagePct: f.wastagePct, pipeMarkupPct: f.pipeMarkupPct ?? 25 })}>Save</Btn>}>
          <div style={grid()}>
            <label><span style={fieldLabel}>Density kg/m³</span><input type="number" value={f.copperDensity} onChange={(e) => setF({ ...f, copperDensity: Number(e.target.value) })} style={input} /></label>
            <label><span style={fieldLabel}>Rate ₹/kg</span><input type="number" value={f.copperRatePerKg} onChange={(e) => setF({ ...f, copperRatePerKg: Number(e.target.value) })} style={input} /></label>
            <label><span style={fieldLabel}>Wastage %</span><input type="number" value={f.wastagePct} onChange={(e) => setF({ ...f, wastagePct: Number(e.target.value) })} style={input} /></label>
            <label><span style={fieldLabel}>Technician-app markup %</span><input type="number" min={0} value={f.pipeMarkupPct ?? 25} onChange={(e) => setF({ ...f, pipeMarkupPct: Number(e.target.value) })} style={input} /></label>
          </div>
          <label style={{ display: "block", marginTop: 10 }}><span style={fieldLabel}>Density source (recorded)</span><textarea value={f.densitySource} onChange={(e) => setF({ ...f, densitySource: e.target.value })} style={{ ...input, minHeight: 70 }} /></label>
        </Panel>
      </div>
      <Panel title="Gauge tables — gauge is not universal; enter values only from a cited source">
        {f.gauges.map((st) => (
          <div key={st.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
            <b>{st.code}</b> {st.name} <Badge tone={st.verified ? "green" : "amber"}>{st.verified ? "Verified" : "Unverified"}</Badge>
            {!st.verified && <> <Btn small kind="ghost" onClick={() => save({ gauges: f.gauges.map((x) => (x.id === st.id ? { ...x, verified: true } : x)) }, `${st.code} marked verified`)}>Mark verified</Btn></>}
            <p style={{ ...muted, margin: "4px 0" }}>Source: {st.source}</p>
            <p style={{ margin: 0, fontSize: 12.5 }}>{st.sizes.map((z) => `${z.gauge}: ${z.mm} mm`).join(" · ") || "No sizes yet"}</p>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <select value={g.std} onChange={(e) => setG({ ...g, std: e.target.value })} style={{ ...input, width: "auto" }}>{f.gauges.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select>
          <input placeholder="Gauge" value={g.gauge} onChange={(e) => setG({ ...g, gauge: e.target.value })} style={{ ...input, width: 90 }} />
          <input placeholder="Thickness mm" type="number" step="0.0001" value={g.mm} onChange={(e) => setG({ ...g, mm: e.target.value })} style={{ ...input, width: 130 }} />
          <Btn kind="ghost" disabled={!g.gauge || !(Number(g.mm) > 0 && Number(g.mm) < 10)} onClick={() => save({ gauges: f.gauges.map((x) => (x.id === g.std ? { ...x, verified: false, sizes: [...x.sizes.filter((z) => z.gauge !== g.gauge), { gauge: g.gauge, mm: Number(g.mm) }].sort((a, b) => Number(a.gauge) - Number(b.gauge)) } : x)) }, "Gauge size saved — standard needs re-verification")}>Add / update size</Btn>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <input placeholder="Code" value={ns.code} onChange={(e) => setNs({ ...ns, code: e.target.value })} style={{ ...input, width: 90 }} />
          <input placeholder="Name" value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} style={{ ...input, width: 200 }} />
          <input placeholder="Source (standard / supplier datasheet) *" value={ns.source} onChange={(e) => setNs({ ...ns, source: e.target.value })} style={{ ...input, flex: 1, minWidth: 240 }} />
          <Btn kind="ghost" disabled={!ns.code || !ns.source} onClick={() => { save({ gauges: [...f.gauges, { id: `g${uid()}`, code: ns.code.toUpperCase(), name: ns.name, source: ns.source, verified: false, sizes: [] }] }, "Gauge standard added"); setNs({ code: "", name: "", source: "" }); }}>Add standard</Btn>
        </div>
      </Panel>
      <Panel title="Tonnage estimator coefficients" actions={<><Btn kind="ghost" onClick={() => save({ tonnage: structuredClone(DEFAULT_TONNAGE_COEFFICIENTS) }, "Reset to documented defaults")}>Reset defaults</Btn><Btn onClick={() => save({ tonnage: t })}>Save</Btn></>}>
        <div style={grid(150)}>
          {n("baseBtuPerSqft", "Base BTU/h per ft²", t.baseBtuPerSqft)}{n("referenceCeilingFt", "Reference ceiling ft", t.referenceCeilingFt)}
          {Object.keys(t.climate).map((k) => n(`climate.${k}`, `Climate ${(CLIMATE_LABELS[k] ?? k).split(" (")[0]}`, t.climate[k]))}
          {n("sunlight.shaded", "Sun shaded ×", t.sunlight.shaded)}{n("sunlight.normal", "Sun normal ×", t.sunlight.normal)}{n("sunlight.heavy", "Sun heavy ×", t.sunlight.heavy)}
          {n("roof.intermediate_floor", "Roof: floor above ×", t.roof.intermediate_floor)}{n("roof.top_floor_roof_exposed", "Roof: top floor ×", t.roof.top_floor_roof_exposed)}{n("roof.single_storey_roof_exposed", "Roof: single storey ×", t.roof.single_storey_roof_exposed)}
          {n("insulation.good", "Insulation good ×", t.insulation.good)}{n("insulation.average", "Insulation avg ×", t.insulation.average)}{n("insulation.poor", "Insulation poor ×", t.insulation.poor)}
          {n("occupantsIncluded", "Occupants included", t.occupantsIncluded)}{n("btuPerExtraOccupant", "BTU/h per extra person", t.btuPerExtraOccupant)}{n("btuPerWindowSqft", "BTU/h per window ft²", t.btuPerWindowSqft)}
          {n("kitchenBtu", "Kitchen BTU/h", t.kitchenBtu)}{n("safetyMarginPct", "Safety margin %", t.safetyMarginPct)}
          <label style={{ gridColumn: "span 2" }}><span style={fieldLabel}>Available capacities (TR)</span><input value={t.availableTons.join(", ")} onChange={(e) => setF({ ...f, tonnage: { ...t, availableTons: e.target.value.split(/[,\s]+/).map(Number).filter((x) => x > 0) } })} style={input} /></label>
        </div>
        <p style={{ ...muted, margin: "8px 0 0" }}>{t.source}</p>
      </Panel>
      <ToolRulesPanel db={db} who={who} notify={notify} />
    </div>
  );
}

