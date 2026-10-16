"use client";

import { useMemo, useState } from "react";
import { BottomSheet, PrimaryButton, card, field, label, small } from "../components/ui";
import { formatNum, round2 } from "../lib/calc/money";
import { calculatePipeSet, type PipeInput } from "../lib/calc/pipe";
import { inr, type Db, type QuoteLine } from "../lib/data";
import { PIPE_PRESETS } from "../lib/finance-types";

/* Technician copper-pipe calculator: weight, length and customer price (ex GST).
 * Cost and margin are never shown — price uses the office's rate and markup (Cost & Calc Rules). */

type P = { label: string; preset: string; odMm: string; wallMm: string };
const pre = (l: string) => PIPE_PRESETS.find((p) => p.label.startsWith(l))!;
const lid = () => `pl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function PipeCalcSheet({ db, onClose, onAdd }: { db: Db; onClose: () => void; onAdd?: (lines: QuoteLine[]) => void }) {
  const f = db.fin;
  const [pipes, setPipes] = useState<P[]>([
    { label: "Liquid", preset: pre('1/4"').label, odMm: String(pre('1/4"').odMm), wallMm: String(pre('1/4"').wallMm) },
    { label: "Suction", preset: pre('1/2"').label, odMm: String(pre('1/2"').odMm), wallMm: String(pre('1/2"').wallMm) },
  ]);
  const [len, setLen] = useState("3");
  const [unit, setUnit] = useState<"m" | "ft">("m");
  const set = (i: number, patch: Partial<P>) => setPipes(pipes.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const calc = useMemo(() => {
    try {
      const inputs: PipeInput[] = pipes.map((p) => ({ label: p.label, od: Number(p.odMm), odUnit: "mm", wallMm: Number(p.wallMm), length: Number(len), lengthUnit: unit, quantity: 1 }));
      return { r: calculatePipeSet(inputs, { ratePerKg: f.copperRatePerKg, wastagePct: f.wastagePct, pricing: { mode: "markup", pct: f.pipeMarkupPct ?? 25 }, densityKgM3: f.copperDensity }) };
    } catch (e) { return { e: (e as Error).message }; }
  }, [pipes, len, unit, f]);
  const r = calc.r;
  return (
    <BottomSheet title="Copper pipe calculator" onClose={onClose}>
      <label style={label}>Pipe run length (each line)</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input inputMode="decimal" value={len} onChange={(e) => setLen(e.target.value)} style={field} />
        <select value={unit} onChange={(e) => setUnit(e.target.value as "m" | "ft")} style={{ ...field, width: 90 }}><option value="m">metre</option><option value="ft">feet</option></select>
      </div>
      {pipes.map((p, i) => (
        <div key={i} style={{ ...card, padding: 12, marginTop: 10 }}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 13.5 }}>{p.label} line</p>
          <select value={p.preset} onChange={(e) => { const x = PIPE_PRESETS.find((y) => y.label === e.target.value); if (x) set(i, { preset: x.label, odMm: String(x.odMm), wallMm: String(x.wallMm) }); else set(i, { preset: "" }); }} style={field}>
            {PIPE_PRESETS.map((x) => <option key={x.label}>{x.label}</option>)}<option value="">Custom size…</option>
          </select>
          {!p.preset && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}><label style={label}>OD mm</label><input inputMode="decimal" value={p.odMm} onChange={(e) => set(i, { odMm: e.target.value })} style={field} /></div>
              <div style={{ flex: 1 }}><label style={label}>Wall mm</label><input inputMode="decimal" value={p.wallMm} onChange={(e) => set(i, { wallMm: e.target.value })} style={field} /></div>
            </div>
          )}
          {r && (() => { const x = r.pipes[i]; return (
            <p style={{ ...small, marginTop: 8 }}>ID {formatNum(x.idMm, 2)} mm · {formatNum(x.kgPerM, 3)} kg/m · net {formatNum(x.netWeightKg, 2)} kg · carry {formatNum(x.procurementWeightKg, 2)} kg (incl. {f.wastagePct}% wastage) · <b>{inr(x.sellingPrice)}</b></p>
          ); })()}
        </div>
      ))}
      {calc.e && <p style={{ ...small, color: "var(--error-text)", marginTop: 8 }}>{calc.e}</p>}
      {r && (
        <div style={{ ...card, padding: 12, marginTop: 10, background: "var(--blue-tint)", boxShadow: "none" }}>
          <p style={{ margin: 0, fontSize: 13 }}>Total copper {formatNum(r.totals.netWeightKg, 2)} kg · customer price <b>{inr(r.totals.price)}</b> + GST</p>
          <p style={{ ...small, margin: "4px 0 0" }}>Sizes are ASTM B280 nominal walls — check the pipe you carry. Insulation, fittings and labour are added separately.</p>
        </div>
      )}
      {onAdd && r && (
        <PrimaryButton style={{ marginTop: 12 }} onClick={() => onAdd(r.pipes.map((x) => ({
          id: lid(), kind: "Material", name: `Copper pipe ${x.label} ${pipes.find((p) => p.label === x.label)?.preset || `${formatNum(x.odMm, 2)} mm`} · ${formatNum(Number(len), 2)} ${unit}`, qty: 1, price: round2(x.sellingPrice),
        })))}>Add to estimate</PrimaryButton>
      )}
    </BottomSheet>
  );
}
