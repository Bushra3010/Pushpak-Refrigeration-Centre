"use client";

import { useState } from "react";
import { AC_TYPES, type Db } from "../lib/data";
import { updateFin } from "../lib/store";
import { REFRIGERANTS, type AmcPlan, type CableTable, type InstallPackage, type PtDataset, type RateItem, type RefrigerantRule, type ToolSettings } from "../lib/tool-settings";
import { Badge, Btn, Panel, fieldLabel, input, muted } from "./kit";

/* Cost & Calc Rules → Technician calculators. Customer rates only (technicians never see cost or margin).
 * Reference data must cite a source; a technician tool uses it only after it is marked verified. */

const uid = () => Math.random().toString(36).slice(2, 8);
const n = (s: string) => (s.trim() === "" ? NaN : Number(s));
const grid = (min = 130): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 8 });
const L = ({ l, children }: { l: string; children: React.ReactNode }) => <label><span style={fieldLabel}>{l}</span>{children}</label>;

/** Parse "a, b, c" lines into number rows; returns an error string for any bad line. */
function parseRows(text: string, cols: number): number[][] | string {
  const rows: number[][] = [];
  for (const [i, line] of text.split("\n").map((x) => x.trim()).entries()) {
    if (!line) continue;
    const v = line.split(/[,\t;]+/).map((x) => Number(x.trim()));
    if (v.length !== cols || v.some((x) => !Number.isFinite(x))) return `Line ${i + 1}: expected ${cols} numbers.`;
    rows.push(v);
  }
  return rows.length >= 2 ? rows : "Enter at least two rows.";
}

export function ToolRulesPanel({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [t, setT] = useState<ToolSettings>(structuredClone(db.fin.tools));
  const save = (patch: Partial<ToolSettings>, msg = "Technician calculator rules saved · logged in audit") => { const next = { ...t, ...patch }; setT(next); updateFin({ tools: next }, who); notify(msg); };
  const verify = <T extends { id: string; verified: boolean; verifiedBy?: string }>(list: T[], id: string, on: boolean) => list.map((x) => (x.id === id ? { ...x, verified: on, verifiedBy: on ? who : undefined } : x));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: "8px 0 0", fontSize: 18 }}>Technician calculators</h2>
      <p style={{ ...muted, margin: 0 }}>Customer selling rates (ex GST) and reference data for the 24 calculators in the technician app. Technicians see prices only — never purchase cost, markup, margin or profit. <b>{t.sampleNote}</b> In this demo, permissions are simulated in the browser; they are not production-grade data security.</p>

      <Panel title="Customer material & labour rates" actions={<Btn onClick={() => save({ rates: t.rates })}>Save rates</Btn>}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--ink-soft)" }}><th>Item</th><th>Unit</th><th>Customer ₹ / unit</th><th>Group</th><th /></tr></thead>
            <tbody>{t.rates.map((r, i) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td><input aria-label="Item" value={r.name} onChange={(e) => setT({ ...t, rates: t.rates.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} style={input} /></td>
                <td style={{ width: 80 }}><input aria-label="Unit" value={r.unit} onChange={(e) => setT({ ...t, rates: t.rates.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })} style={input} /></td>
                <td style={{ width: 120 }}><input aria-label={`Rate ${r.name}`} type="number" min={0} value={r.price} onChange={(e) => setT({ ...t, rates: t.rates.map((x, j) => (j === i ? { ...x, price: Math.max(0, Number(e.target.value)) } : x)) })} style={input} /></td>
                <td style={{ color: "var(--ink-soft)" }}>{r.group}{r.cable ? ` · ${r.cable.material} ${r.cable.sizeMm2} mm²` : ""}{r.refrigerant ? ` · ${r.refrigerant}` : ""}</td>
                <td>{!DEFAULT_IDS.has(r.id) && <Btn small kind="danger" onClick={() => setT({ ...t, rates: t.rates.filter((_, j) => j !== i) })}>Remove</Btn>}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <Btn kind="ghost" onClick={() => setT({ ...t, rates: [...t.rates, { id: `r${uid()}`, name: "New item", unit: "piece", price: 0, group: "Other" } as RateItem] })}>+ Add rate</Btn>
      </Panel>

      <div className="admin-grid-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <Panel title="Installation packages" actions={<Btn onClick={() => save({ packages: t.packages })}>Save</Btn>}>
          {t.packages.map((p, i) => { const up = (x: Partial<InstallPackage>) => setT({ ...t, packages: t.packages.map((y, j) => (j === i ? { ...y, ...x } : y)) }); return (
            <div key={p.id} style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
              <div style={grid(120)}>
                <L l="Name"><input value={p.name} onChange={(e) => up({ name: e.target.value })} style={input} /></L>
                <L l="Price ₹"><input type="number" min={0} value={p.price} onChange={(e) => up({ price: Number(e.target.value) })} style={input} /></L>
                <L l="Up to TR"><input type="number" step="0.25" value={p.maxTons} onChange={(e) => up({ maxTons: Number(e.target.value) })} style={input} /></L>
                <L l="AC types"><input value={p.acTypes.join(", ")} onChange={(e) => up({ acTypes: e.target.value.split(/,\s*/).filter(Boolean) })} style={input} /></L>
                {["cu-pair", "cab-extra", "drain-16", "ins-m"].map((k) => <L key={k} l={`Includes ${t.rates.find((r) => r.id === k)?.name.split(/[,(]/)[0] ?? k}`}><input type="number" min={0} value={p.includes[k] ?? 0} onChange={(e) => up({ includes: { ...p.includes, [k]: Math.max(0, Number(e.target.value)) } })} style={input} /></L>)}
              </div>
            </div>); })}
          <Btn kind="ghost" onClick={() => setT({ ...t, packages: [...t.packages, { id: `pk${uid()}`, name: "New package", acTypes: ["Split"], maxTons: 1.5, price: 0, includes: {}, notes: "" }] })}>+ Add package</Btn>
        </Panel>

        <Panel title="AMC plans (annual ₹ per AC)" actions={<Btn onClick={() => save({ amcPlans: t.amcPlans })}>Save</Btn>}>
          {t.amcPlans.map((p, i) => { const up = (x: Partial<AmcPlan>) => setT({ ...t, amcPlans: t.amcPlans.map((y, j) => (j === i ? { ...y, ...x } : y)) }); return (
            <div key={p.id} style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
              <div style={grid(110)}>
                <L l="Plan"><input value={p.name} onChange={(e) => up({ name: e.target.value })} style={input} /></L>
                <L l="Visits / yr"><input type="number" min={1} value={p.visitsPerYear} onChange={(e) => up({ visitsPerYear: Math.max(1, Math.round(Number(e.target.value))) })} style={input} /></L>
                {AC_TYPES.map((a) => <L key={a} l={a}><input type="number" min={0} value={p.ratePerAc[a] ?? ""} onChange={(e) => up({ ratePerAc: { ...p.ratePerAc, [a]: Number(e.target.value) } })} style={input} /></L>)}
              </div>
              <L l="Included (; separated)"><input value={p.included.join("; ")} onChange={(e) => up({ included: e.target.value.split(/;\s*/).filter(Boolean) })} style={input} /></L>
              <L l="Exclusions (; separated)"><input value={p.exclusions.join("; ")} onChange={(e) => up({ exclusions: e.target.value.split(/;\s*/).filter(Boolean) })} style={input} /></L>
            </div>); })}
        </Panel>
      </div>

      <div className="admin-grid-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <Panel title="Limits, wastage & slopes" actions={<Btn onClick={() => save({ maxTechDiscountPct: t.maxTechDiscountPct, insulationPieceM: t.insulationPieceM, insulationWastagePct: t.insulationWastagePct, drainWastagePct: t.drainWastagePct, cableWastagePct: t.cableWastagePct, standLoadFactor: t.standLoadFactor, drainSlopes: t.drainSlopes, voltageDropLimitPct: t.voltageDropLimitPct, voltageDropSource: t.voltageDropSource })}>Save</Btn>}>
          <div style={grid(140)}>
            <L l="Max technician discount %"><input type="number" min={0} max={100} value={t.maxTechDiscountPct} onChange={(e) => setT({ ...t, maxTechDiscountPct: Math.min(100, Math.max(0, Number(e.target.value))) })} style={input} /></L>
            <L l="Insulation piece length m"><input type="number" step="0.01" value={t.insulationPieceM} onChange={(e) => setT({ ...t, insulationPieceM: Number(e.target.value) })} style={input} /></L>
            <L l="Insulation wastage %"><input type="number" value={t.insulationWastagePct} onChange={(e) => setT({ ...t, insulationWastagePct: Number(e.target.value) })} style={input} /></L>
            <L l="Drain wastage %"><input type="number" value={t.drainWastagePct} onChange={(e) => setT({ ...t, drainWastagePct: Number(e.target.value) })} style={input} /></L>
            <L l="Cable wastage %"><input type="number" value={t.cableWastagePct} onChange={(e) => setT({ ...t, cableWastagePct: Number(e.target.value) })} style={input} /></L>
            <L l="Stand load factor ×"><input type="number" step="0.1" min={1} value={t.standLoadFactor} onChange={(e) => setT({ ...t, standLoadFactor: Number(e.target.value) })} style={input} /></L>
            <L l="Voltage-drop limit %"><input type="number" step="0.1" value={t.voltageDropLimitPct ?? ""} onChange={(e) => setT({ ...t, voltageDropLimitPct: e.target.value === "" ? null : Number(e.target.value) })} style={input} /></L>
            <L l="Voltage-drop limit source *"><input value={t.voltageDropSource} placeholder="e.g. IS 732 / your electrical consultant" onChange={(e) => setT({ ...t, voltageDropSource: e.target.value })} style={input} /></L>
          </div>
          <p style={{ ...fieldLabel, marginTop: 10 }}>Drain slopes (rise : run, with source)</p>
          {t.drainSlopes.map((s, i) => (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "80px 60px 70px 1fr auto", gap: 6, marginBottom: 6 }}>
              <input aria-label="Label" value={s.label} onChange={(e) => setT({ ...t, drainSlopes: t.drainSlopes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} style={input} />
              <input aria-label="Rise" type="number" value={s.rise} onChange={(e) => setT({ ...t, drainSlopes: t.drainSlopes.map((x, j) => (j === i ? { ...x, rise: Number(e.target.value) } : x)) })} style={input} />
              <input aria-label="Run" type="number" value={s.run} onChange={(e) => setT({ ...t, drainSlopes: t.drainSlopes.map((x, j) => (j === i ? { ...x, run: Number(e.target.value) } : x)) })} style={input} />
              <input aria-label="Source" value={s.source} onChange={(e) => setT({ ...t, drainSlopes: t.drainSlopes.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)) })} style={input} />
              <Btn small kind="danger" onClick={() => setT({ ...t, drainSlopes: t.drainSlopes.filter((_, j) => j !== i) })}>×</Btn>
            </div>))}
          <Btn kind="ghost" small onClick={() => setT({ ...t, drainSlopes: [...t.drainSlopes, { id: `s${uid()}`, label: "1 : 80", rise: 1, run: 80, source: "" }] })}>+ Add slope</Btn>
        </Panel>

        <Panel title="Travel reimbursement policy" actions={<Btn onClick={() => save({ travel: t.travel })}>Save</Btn>}>
          <div style={grid(150)}>
            <L l="Claims allowed"><select value={t.travel.mode} onChange={(e) => setT({ ...t, travel: { ...t.travel, mode: e.target.value as ToolSettings["travel"]["mode"] } })} style={input}>
              <option value="either">Mileage OR actual fuel (per trip)</option><option value="mileage">Mileage only</option><option value="actual">Actual fuel only</option><option value="both">Mileage AND actual together</option>
            </select></L>
            <L l="₹ per km"><input type="number" step="0.5" min={0} value={t.travel.ratePerKm} onChange={(e) => setT({ ...t, travel: { ...t.travel, ratePerKm: Number(e.target.value) } })} style={input} /></L>
          </div>
          <label style={{ display: "flex", gap: 8, fontSize: 13, margin: "10px 0" }}><input type="checkbox" checked={t.travel.receiptsRequired} onChange={(e) => setT({ ...t, travel: { ...t.travel, receiptsRequired: e.target.checked } })} /> Receipts required for actual fuel</label>
          <L l="Policy note shown to technicians"><input value={t.travel.note} onChange={(e) => setT({ ...t, travel: { ...t.travel, note: e.target.value } })} style={input} /></L>
          <p style={{ ...muted, margin: "8px 0 0" }}>Claims are always created Pending and are approved / reimbursed in Expenses & Claims. Overtime rules and salary visibility live in Payroll & Salary and the Salary panel above.</p>
        </Panel>
      </div>

      <RefRulesPanel t={t} save={save} verify={verify} />
      <PtPanel t={t} save={save} verify={verify} />
      <CablePanel t={t} save={save} verify={verify} />
    </div>
  );
}

const DEFAULT_IDS = new Set(["cu-pair", "ins-piece", "ins-m", "fit-set", "cab-extra", "drain-16", "drain-fit", "stand-angle", "stand-heavy", "fasteners", "pads", "lab-hour", "lab-inst", "visit", "transport"]);
type Common = { t: ToolSettings; save: (p: Partial<ToolSettings>, msg?: string) => void; verify: <T extends { id: string; verified: boolean; verifiedBy?: string }>(list: T[], id: string, on: boolean) => T[] };

const VerifyBtns = ({ verified, by, onToggle, onRemove }: { verified: boolean; by?: string; onToggle: () => void; onRemove: () => void }) => (
  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Badge tone={verified ? "green" : "amber"}>{verified ? `Verified${by ? ` by ${by}` : ""}` : "Unverified — not used"}</Badge><Btn small kind="ghost" onClick={onToggle}>{verified ? "Unverify" : "Mark verified"}</Btn><Btn small kind="danger" onClick={onRemove}>Remove</Btn></span>
);

function RefRulesPanel({ t, save, verify }: Common) {
  const blank = { brand: "", model: "", refrigerant: "R32", factory: "", included: "", gpm: "", min: "", max: "", short: "", source: "" };
  const [f, setF] = useState(blank);
  const ok = f.brand && f.model && f.source.trim() && n(f.included) >= 0 && n(f.gpm) >= 0;
  const opt = (s: string) => (s.trim() === "" ? null : n(s));
  return (
    <Panel title="Manufacturer refrigerant rules (from installation manuals)">
      {t.refrigerantRules.map((r) => (
        <div key={r.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
          <b>{r.brand} {r.model}</b> · {r.refrigerant} · factory {r.factoryChargeG ?? "—"} g · includes {r.includedLengthM} m · +{r.additionalGPerM} g/m{r.maxLengthM != null ? ` · max ${r.maxLengthM} m` : ""}{r.shortRunRemovalGPerM != null ? ` · short-run −${r.shortRunRemovalGPerM} g/m` : ""} <VerifyBtns verified={r.verified} by={r.verifiedBy} onToggle={() => save({ refrigerantRules: verify(t.refrigerantRules, r.id, !r.verified) })} onRemove={() => save({ refrigerantRules: t.refrigerantRules.filter((x) => x.id !== r.id) })} />
          <p style={{ ...muted, margin: "2px 0 0" }}>Source: {r.source}</p>
        </div>))}
      {!t.refrigerantRules.length && <p style={muted}>No model rules yet. None are shipped — add them from each model's installation manual. Until then technicians enter the manual's values on site.</p>}
      <div style={{ ...grid(110), marginTop: 10 }}>
        {(["brand", "model"] as const).map((k) => <L key={k} l={k === "brand" ? "Brand" : "Exact model"}><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} style={input} /></L>)}
        <L l="Refrigerant"><select value={f.refrigerant} onChange={(e) => setF({ ...f, refrigerant: e.target.value })} style={input}>{REFRIGERANTS.map((x) => <option key={x}>{x}</option>)}</select></L>
        {([["factory", "Factory charge g"], ["included", "Included length m"], ["gpm", "Additional g/m"], ["min", "Min m"], ["max", "Max m"], ["short", "Short-run removal g/m (only if stated)"]] as const).map(([k, l]) => <L key={k} l={l}><input type="number" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} style={input} /></L>)}
      </div>
      <L l="Source (manual title, page) *"><input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} style={input} /></L>
      <Btn kind="ghost" disabled={!ok} onClick={() => { const r: RefrigerantRule = { id: `rr${uid()}`, brand: f.brand, model: f.model, refrigerant: f.refrigerant, factoryChargeG: opt(f.factory), includedLengthM: n(f.included), additionalGPerM: n(f.gpm), minLengthM: opt(f.min), maxLengthM: opt(f.max), shortRunRemovalGPerM: opt(f.short), source: f.source, verified: false }; save({ refrigerantRules: [...t.refrigerantRules, r] }, "Rule added — mark it verified after checking the manual"); setF(blank); }}>Add rule (unverified)</Btn>
    </Panel>
  );
}

function PtPanel({ t, save, verify }: Common) {
  const [f, setF] = useState({ refrigerant: "R32", blend: "pure" as PtDataset["blend"], source: "", rows: "" });
  const [err, setErr] = useState("");
  return (
    <Panel title="Pressure–temperature tables (diagnostics)">
      {t.ptDatasets.map((d) => (
        <div key={d.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
          <b>{d.refrigerant}</b> ({d.blend}) · {d.rows.length} rows, {Math.min(...d.rows.map((r) => r.tempC))} to {Math.max(...d.rows.map((r) => r.tempC))} °C <VerifyBtns verified={d.verified} by={d.verifiedBy} onToggle={() => save({ ptDatasets: verify(t.ptDatasets, d.id, !d.verified) })} onRemove={() => save({ ptDatasets: t.ptDatasets.filter((x) => x.id !== d.id) })} />
          <p style={{ ...muted, margin: "2px 0 0" }}>Source: {d.source}</p>
        </div>))}
      {!t.ptDatasets.length && <p style={muted}>No tables shipped — none are invented. Superheat / subcooling and the PT reference show “Assessment unavailable” until a verified table exists for the refrigerant.</p>}
      <div style={{ ...grid(140), marginTop: 10 }}>
        <L l="Refrigerant"><select value={f.refrigerant} onChange={(e) => setF({ ...f, refrigerant: e.target.value })} style={input}>{REFRIGERANTS.map((x) => <option key={x}>{x}</option>)}</select></L>
        <L l="Type"><select value={f.blend} onChange={(e) => setF({ ...f, blend: e.target.value as PtDataset["blend"] })} style={input}><option value="pure">Pure</option><option value="azeotropic">Azeotropic / near-azeotropic</option><option value="zeotropic">Zeotropic (glide)</option></select></L>
      </div>
      <L l="Source (e.g. refrigerant maker's PT chart, NIST REFPROP version) *"><input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} style={input} /></L>
      <L l="Rows: temperature °C, bubble kPa ABSOLUTE, dew kPa ABSOLUTE — one per line (pure: bubble = dew)"><textarea value={f.rows} onChange={(e) => setF({ ...f, rows: e.target.value })} style={{ ...input, minHeight: 90, fontFamily: "monospace" }} /></L>
      {err && <p style={{ color: "var(--error-text)", fontSize: 12.5 }}>{err}</p>}
      <Btn kind="ghost" disabled={!f.source.trim() || !f.rows.trim()} onClick={() => {
        const rows = parseRows(f.rows, 3);
        if (typeof rows === "string") { setErr(rows); return; }
        if (rows.some(([, b, d]) => !(b > 0 && d > 0))) { setErr("Pressures must be absolute and above zero."); return; }
        setErr("");
        save({ ptDatasets: [...t.ptDatasets, { id: `pt${uid()}`, refrigerant: f.refrigerant, blend: f.blend, source: f.source, verified: false, rows: rows.map(([tempC, bubbleKpaA, dewKpaA]) => ({ tempC, bubbleKpaA, dewKpaA })) }] }, "Table added — mark it verified after checking the source");
        setF({ ...f, rows: "", source: "" });
      }}>Add table (unverified)</Btn>
    </Panel>
  );
}

function CablePanel({ t, save, verify }: Common) {
  const [f, setF] = useState({ name: "", material: "Copper" as CableTable["material"], method: "", ambient: "40", source: "", rows: "" });
  const [err, setErr] = useState("");
  return (
    <Panel title="Cable current-rating tables (electrical estimate)">
      {t.cableTables.map((c) => (
        <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
          <b>{c.name}</b> · {c.material} · {c.method} · {c.ambientC} °C · {c.rows.map((r) => `${r.sizeMm2} mm² ${r.amps} A`).join(", ")} <VerifyBtns verified={c.verified} by={c.verifiedBy} onToggle={() => save({ cableTables: verify(t.cableTables, c.id, !c.verified) })} onRemove={() => save({ cableTables: t.cableTables.filter((x) => x.id !== c.id) })} />
          <p style={{ ...muted, margin: "2px 0 0" }}>Source: {c.source}</p>
        </div>))}
      {!t.cableTables.length && <p style={muted}>No tables shipped. The cable estimate still calculates voltage drop, but shows “Assessment unavailable” for current rating until an approved table exists.</p>}
      <div style={{ ...grid(140), marginTop: 10 }}>
        <L l="Table name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={input} /></L>
        <L l="Conductor"><select value={f.material} onChange={(e) => setF({ ...f, material: e.target.value as CableTable["material"] })} style={input}><option>Copper</option><option>Aluminium</option></select></L>
        <L l="Installation method"><input value={f.method} placeholder="e.g. PVC conduit on wall" onChange={(e) => setF({ ...f, method: e.target.value })} style={input} /></L>
        <L l="Ambient °C"><input type="number" value={f.ambient} onChange={(e) => setF({ ...f, ambient: e.target.value })} style={input} /></L>
      </div>
      <L l="Source (IS 3961 / IEC 60364-5-52 table, or the cable maker's datasheet) *"><input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} style={input} /></L>
      <L l="Rows: size mm², amps — one per line"><textarea value={f.rows} onChange={(e) => setF({ ...f, rows: e.target.value })} style={{ ...input, minHeight: 70, fontFamily: "monospace" }} /></L>
      {err && <p style={{ color: "var(--error-text)", fontSize: 12.5 }}>{err}</p>}
      <Btn kind="ghost" disabled={!f.name || !f.method || !f.source.trim()} onClick={() => {
        const rows = parseRows(f.rows, 2);
        if (typeof rows === "string") { setErr(rows); return; }
        setErr("");
        save({ cableTables: [...t.cableTables, { id: `ct${uid()}`, name: f.name, material: f.material, method: f.method, ambientC: Number(f.ambient), source: f.source, verified: false, rows: rows.map(([sizeMm2, amps]) => ({ sizeMm2, amps })) }] }, "Table added — mark it verified after checking the source");
        setF({ ...f, rows: "", source: "", name: "" });
      }}>Add table (unverified)</Btn>
    </Panel>
  );
}
