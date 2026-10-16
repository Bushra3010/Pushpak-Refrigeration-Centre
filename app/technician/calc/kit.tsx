"use client";

import { useMemo, useState } from "react";
import { Chips, PageHeader, PrimaryButton, card, field, label, small } from "../../components/ui";
import { fmtDateTime, nowIso, type Db, type QuoteLine, type Technician } from "../../lib/data";
import { formatNum } from "../../lib/calc/money";
import { saveToolCalc } from "../../lib/store";
import type { ToolDef } from "./registry";

/* Shared calculator experience: labelled inputs, Calculate / Reset, result summary, breakdown,
 * assumptions, Save with customer & job, history, print and share. Calculators only describe their
 * inputs and a pure compute(); this shell does the rest identically for all 24. */

export type Ctx = { db: Db; tech: Technician; def: ToolDef; flash: (m: string) => void; onBack: () => void };

export type Row = { k: string; v: string; strong?: boolean };
export type Result = {
  summary: Row[];
  breakdown?: string[];
  assumptions?: string[];
  warnings?: string[];
  /** missing approved data: shown instead of an answer, never a guess */
  unavailable?: string;
  /** customer quotation lines (Add to Estimate) */
  lines?: QuoteLine[];
  /** text appended to the job notes (Save Readings to Job) */
  note?: string;
  /** customer-safe outputs to store with the saved calculation */
  outputs?: unknown;
};

/** "" → NaN so blank fields fail validation instead of silently becoming 0. */
export const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
export const fmt = (n: number, dp = 2) => formatNum(n, dp);
export const rs = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rid = () => `tc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const lineId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Input state + a Calculate snapshot. Each Calculate gets a fresh id, which makes saves idempotent. */
export function useCalc<V>(initial: V, compute: (v: V) => Result) {
  const [v, setV] = useState<V>(initial);
  const [snap, setSnap] = useState<{ id: string; v: V } | null>(null);
  const res = useMemo(() => {
    if (!snap) return null;
    try { return { id: snap.id, r: compute(snap.v) }; } catch (e) { return { id: snap.id, error: (e as Error).message }; }
    // compute is recreated each render; the snapshot is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);
  const set = (patch: Partial<V>) => setV((x) => ({ ...x, ...patch }));
  return {
    v, set, setV, res,
    stale: !!snap && JSON.stringify(snap.v) !== JSON.stringify(v),
    run: () => setSnap({ id: rid(), v: structuredClone(v) }),
    reset: () => { setV(initial); setSnap(null); },
    load: (x: V) => { setV(x); setSnap(null); },
  };
}

/* ───────────── fields ───────────── */

export function F({ l, unit, value, onChange, hint, type = "decimal", placeholder }: { l: string; unit?: string; value: string; onChange: (s: string) => void; hint?: string; type?: "decimal" | "text" | "datetime"; placeholder?: string }) {
  const id = `f-${l.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={id} style={{ ...label, marginBottom: 6 }}>{l}{unit && <span style={{ color: "var(--ink-mute)", fontWeight: 500 }}> ({unit})</span>}</label>
      <input id={id} aria-label={unit ? `${l} (${unit})` : l} type={type === "datetime" ? "datetime-local" : "text"} inputMode={type === "decimal" ? "decimal" : undefined} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={field} />
      {hint && <p style={{ ...small, fontSize: 11.5 }}>{hint}</p>}
    </div>
  );
}

export function Sel<T extends string>({ l, value, onChange, options, hint }: { l: string; value: T; onChange: (v: T) => void; options: readonly (T | [T, string])[]; hint?: string }) {
  const id = `s-${l.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={id} style={{ ...label, marginBottom: 6 }}>{l}</label>
      <select id={id} aria-label={l} value={value} onChange={(e) => onChange(e.target.value as T)} style={field}>
        {options.map((o) => { const [val, txt] = Array.isArray(o) ? o : [o, o]; return <option key={val} value={val}>{txt}</option>; })}
      </select>
      {hint && <p style={{ ...small, fontSize: 11.5 }}>{hint}</p>}
    </div>
  );
}

export function Seg<T extends string>({ l, value, onChange, options }: { l: string; value: T; onChange: (v: T) => void; options: readonly T[] }) {
  return <div style={{ marginBottom: 10 }}><span style={{ ...label, marginBottom: 6 }}>{l}</span><Chips options={options} value={value} onChange={onChange} /></div>;
}

export function Check({ l, on, onChange }: { l: string; on: boolean; onChange: (b: boolean) => void }) {
  return <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, margin: "4px 0 12px" }}><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} /> <span>{l}</span></label>;
}

export const Two = ({ children }: { children: React.ReactNode }) => <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{children}</div>;
export const Box = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <div style={{ ...card, padding: 14, marginBottom: 12 }}>{title && <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14 }}>{title}</p>}{children}</div>
);
export const Note = ({ tone = "info", children }: { tone?: "info" | "warn" | "off"; children: React.ReactNode }) => (
  <p style={{ ...small, margin: "0 0 10px", padding: 10, borderRadius: 12, background: tone === "warn" ? "var(--gold-tint)" : tone === "off" ? "var(--surface-dim)" : "var(--blue-tint)", color: tone === "warn" ? "var(--gold-dark)" : "var(--ink-soft)" }}>{children}</p>
);

/* ───────────── shell ───────────── */

/** Jobs this technician may use: lead OR helper (helper-assigned jobs included). */
export const myJobs = (db: Db, techId: string) => {
  const mine = db.jobs.filter((j) => j.techId === techId || (j.helpers ?? []).includes(techId));
  const done = (j: (typeof mine)[number]) => j.status === "Closed" || j.status === "Cancelled" || j.status === "Invoiced";
  return [...mine.filter((j) => !done(j)), ...mine.filter(done)]; // open jobs first
};

export function CalcShell({ ctx, form, calc, onDemo, extraActions, onClaim, claimLabel = "Create Claim" }: {
  ctx: Ctx;
  form: React.ReactNode;
  calc: ReturnType<typeof useCalc<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  onDemo?: () => void;
  extraActions?: (r: Result, id: string) => React.ReactNode;
  onClaim?: (r: Result, id: string) => string | null;
  claimLabel?: string;
}) {
  const { db, tech, def, flash } = ctx;
  const jobs = myJobs(db, tech.id);
  const custIds = [...new Set(jobs.map((j) => j.customerId))];
  const [jobId, setJobId] = useState("");
  const [custId, setCustId] = useState("");
  const [title, setTitle] = useState("");
  const [done, setDone] = useState<Record<string, string>>({}); // calc id → what was done
  const res = calc.res;
  const r = res && "r" in res ? res.r : null;
  const id = res?.id ?? "";
  const job = jobs.find((j) => j.id === jobId);
  const customerId = job?.customerId ?? (custId || null);
  const history = db.calcs.filter((c) => c.tool === def.id && c.techId === tech.id).slice(0, 5);

  const save = (mode: "save" | "estimate" | "readings") => {
    if (!r) return;
    const err = saveToolCalc(
      { id, tool: def.id, kind: def.name, title: title.trim() || `${def.name}${job ? ` · ${job.id}` : ""}`, customerId, jobId: jobId || null, techId: tech.id, by: tech.name, inputs: calc.v, outputs: r.outputs ?? null, summary: r.summary.map(({ k, v }) => ({ k, v })) },
      mode === "estimate" ? { lines: r.lines } : mode === "readings" ? { note: r.note ?? `📏 ${def.name}: ${r.summary.map((x) => `${x.k} ${x.v}`).join(" · ")}` } : {},
    );
    if (err) { flash(`⚠ ${err}`); return; }
    setDone({ ...done, [id]: mode });
    flash(mode === "estimate" ? `Added to ${jobId}'s estimate` : mode === "readings" ? `Readings saved to ${jobId}` : "Calculation saved");
  };
  const share = async () => {
    if (!r) return;
    const text = [`${def.name} — Pushpak Refrigeration`, ...r.summary.map((x) => `${x.k}: ${x.v}`), ...(r.unavailable ? [r.unavailable] : []), "Estimate only — confirm on site."].join("\n");
    try {
      if (navigator.share) await navigator.share({ title: def.name, text });
      else { await navigator.clipboard.writeText(text); flash("Copied — paste into WhatsApp or SMS"); }
    } catch { /* share cancelled */ }
  };

  const savedHere = done[id];
  const canSave = !!r && !calc.stale && !savedHere;
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title={def.name} sub={`${def.no.toString().padStart(2, "0")} · ${def.category}`} onBack={ctx.onBack} />
      <div className="print-doc" style={{ padding: "0 16px 24px", position: "relative", background: "var(--app-bg)" }}>
        <p className="print-only" style={{ margin: "0 0 8px", fontWeight: 700 }}>Pushpak Refrigeration Centre · {def.name} · {fmtDateTime(nowIso())}</p>
        <div className="no-print">
          {form}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <PrimaryButton onClick={calc.run} style={{ flex: 2 }}>Calculate</PrimaryButton>
            <button onClick={calc.reset} className="press" style={ghost}>Reset</button>
          </div>
          {onDemo && <button onClick={() => { onDemo(); flash("Demo values loaded — sample data, not real readings"); }} style={linkBtn}>Load demo example</button>}
        </div>

        {res && (
          <div style={{ ...card, padding: 14, marginTop: 14 }} aria-live="polite">
            <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 14 }}>Result</p>
            {calc.stale && <Note tone="warn">Inputs changed — tap Calculate to update.</Note>}
            {"error" in res && <p role="alert" style={{ ...small, color: "var(--error-text)", margin: 0 }}>{res.error}</p>}
            {r?.unavailable && <div role="status" style={{ background: "var(--surface-dim)", borderRadius: 12, padding: 12, marginBottom: 8 }}><b style={{ fontSize: 13.5 }}>Assessment unavailable</b><p style={{ ...small, margin: "4px 0 0" }}>{r.unavailable}</p></div>}
            {r?.warnings?.map((w) => <Note key={w} tone="warn">{w}</Note>)}
            {r && r.summary.length > 0 && (
              <dl style={{ margin: 0 }}>{r.summary.map((x, i) => (
                <div key={x.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: i ? "1px solid var(--line)" : "none", fontSize: 13.5 }}>
                  <dt style={{ color: "var(--ink-soft)" }}>{x.k}</dt><dd style={{ margin: 0, fontWeight: x.strong ? 800 : 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{x.v}</dd>
                </div>))}
              </dl>
            )}
            {r?.breakdown && r.breakdown.length > 0 && (<><p style={{ ...label, margin: "12px 0 4px", fontSize: 12.5 }}>How it was calculated</p><ul style={{ ...small, margin: 0, paddingLeft: 18 }}>{r.breakdown.map((b) => <li key={b}>{b}</li>)}</ul></>)}
            {r?.assumptions && r.assumptions.length > 0 && (<><p style={{ ...label, margin: "12px 0 4px", fontSize: 12.5 }}>Assumptions &amp; references</p><ul style={{ ...small, margin: 0, paddingLeft: 18 }}>{r.assumptions.map((b) => <li key={b}>{b}</li>)}</ul></>)}
          </div>
        )}

        {r && (
          <div className="no-print" style={{ ...card, padding: 14, marginTop: 12 }}>
            <Sel l="Job" value={jobId} onChange={setJobId} options={[["", "— No job —"], ...jobs.map((j) => [j.id, `${j.id} · ${db.customers.find((c) => c.id === j.customerId)?.name ?? ""} · ${j.status}${j.techId !== tech.id ? " (helper)" : ""}`] as [string, string])]} />
            {!jobId && <Sel l="Customer" value={custId} onChange={setCustId} options={[["", "— No customer —"], ...custIds.map((c) => [c, db.customers.find((x) => x.id === c)?.name ?? c] as [string, string])]} />}
            <F l="Save as" type="text" value={title} onChange={setTitle} placeholder={def.name} />
            {savedHere && <Note>✓ {savedHere === "estimate" ? "Added to the estimate" : savedHere === "readings" ? "Readings saved to the job" : savedHere === "claim" ? "Claim submitted for approval" : "Saved"}. Change inputs and Calculate again for another record.</Note>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {def.action === "estimate" && r.lines && r.lines.length > 0 && <PrimaryButton disabled={!canSave || !jobId} onClick={() => save("estimate")}>Add to Estimate{!jobId ? " (select a job)" : ""}</PrimaryButton>}
              {def.action === "readings" && <PrimaryButton disabled={!canSave || !jobId || !!r.unavailable && !r.summary.length} onClick={() => save("readings")}>Save Readings to Job{!jobId ? " (select a job)" : ""}</PrimaryButton>}
              {def.action === "claim" && onClaim && <PrimaryButton tone="green" disabled={!canSave} onClick={() => { const err = onClaim(r, id); if (err) flash(`⚠ ${err}`); else { setDone({ ...done, [id]: "claim" }); flash("Claim sent for approval — not approved or paid yet"); } }}>{claimLabel}</PrimaryButton>}
              {extraActions?.(r, id)}
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={!canSave} onClick={() => save("save")} className="press" style={{ ...ghost, flex: 1, opacity: canSave ? 1 : 0.5 }}>Save Calculation</button>
                <button onClick={() => window.print()} className="press" style={{ ...ghost, flex: 1 }}>Print</button>
                <button onClick={share} className="press" style={{ ...ghost, flex: 1 }}>Share</button>
              </div>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="no-print" style={{ marginTop: 14 }}>
            <p style={{ ...label, fontSize: 13 }}>Saved history</p>
            {history.map((h) => (
              <details key={h.id} style={{ ...card, padding: "10px 12px", marginBottom: 6 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{h.title} <span style={{ color: "var(--ink-mute)", fontWeight: 500 }}>· {fmtDateTime(h.at)}{h.jobId ? ` · ${h.jobId}` : ""}</span></summary>
                <div style={{ marginTop: 6 }}>{(h.summary ?? []).map((x) => <p key={x.k} style={{ ...small, display: "flex", justifyContent: "space-between", gap: 10 }}><span>{x.k}</span><b>{x.v}</b></p>)}</div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ghost: React.CSSProperties = { flex: 1, border: "1.5px solid var(--line-strong)", background: "var(--surface)", borderRadius: 14, padding: "12px 10px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", color: "var(--text-secondary)" };
const linkBtn: React.CSSProperties = { marginTop: 10, background: "none", border: "none", color: "var(--blue)", fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 0 };
