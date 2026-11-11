"use client";

import { useState } from "react";
import { fmtDate, inr, isoDay, type Db } from "../lib/data";
import { CYLINDER_KIND, CYLINDER_SIZES, LPG_ALERT_DAYS, currentCylinder, daysOf, lpgStats, nextCylinderNo, type LpgDraft } from "../lib/welfare";

/* Mess LPG cylinder — shared by Admin → LPG Cylinder Tracking and the technician app's "Mess LPG" screen. */

export function CylinderArt({ size = 92, inUse = true }: { size?: number; inUse?: boolean }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 80 104" aria-hidden="true">
      <rect x="27" y="2" width="26" height="16" rx="4" fill="none" stroke="#c62828" strokeWidth="5" />
      <rect x="35" y="12" width="10" height="9" rx="2" fill="#555" />
      <path d="M14 34c0-9 8-14 26-14s26 5 26 14v52c0 7-6 12-13 12H27c-7 0-13-5-13-12z" fill={inUse ? "#e53935" : "#9e9e9e"} />
      <path d="M22 30c0-4 6-6 10-6v70c-6 0-10-4-10-8z" fill="#fff" opacity=".22" />
      <rect x="16" y="56" width="48" height="3" fill="#000" opacity=".12" />
    </svg>
  );
}

export function cylinderSummary(db: Db) {
  return lpgStats(db.cylinders ?? [], isoDay(0));
}

/** Current cylinder card: number, dates, days used, balance and a progress bar. */
export function CurrentCylinder({ db, compact }: { db: Db; compact?: boolean }) {
  const s = cylinderSummary(db);
  const c = s.current;
  if (!c) return <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-soft)" }}>No cylinder in use. Start one with <b>＋ New cylinder started</b>.</p>;
  const pct = Math.min(100, Math.round((s.used / s.avg) * 100));
  const low = s.balance <= LPG_ALERT_DAYS;
  const row = (k: string, v: React.ReactNode) => <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 13.5 }}><span style={{ color: "var(--ink-soft)" }}>{k}</span><b style={{ textAlign: "right" }}>{v}</b></div>;
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ textAlign: "center", flex: "0 0 auto" }}>
        <CylinderArt size={compact ? 64 : 84} />
        <div style={{ marginTop: -6, display: "inline-block", background: low ? "#f59e0b" : "#16a34a", color: "#fff", borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 800 }}>{low ? "Running low" : "In Use"}</div>
      </div>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        {row("Cylinder no.", c.no)}
        {row("Size", `${c.sizeKg} kg (${CYLINDER_KIND[c.sizeKg]})`)}
        {row("Shared by", `${c.people} technicians · ${c.meals ?? 2} meals/day`)}
        {row("Start date", fmtDate(c.start))}
        {row("Expected end", fmtDate(s.expectedEnd!))}
        {row("Days used", `${s.used} day${s.used === 1 ? "" : "s"}`)}
        {row("Estimated balance", <span style={{ color: low ? "var(--error-text)" : undefined }}>{s.balance} day{s.balance === 1 ? "" : "s"}</span>)}
        <div style={{ height: 10, borderRadius: 999, background: "var(--bg-secondary)", marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: `${Math.max(4, pct)}%`, height: "100%", borderRadius: 999, background: low ? "#f59e0b" : "#16a34a" }} />
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-mute)", textAlign: "right" }}>{s.used} / {s.avg} days · entered by {c.by}</p>
      </div>
    </div>
  );
}

export function UsageSummary({ db }: { db: Db }) {
  const s = cylinderSummary(db);
  const rows: [string, string, string][] = [
    ["⏮️", "Last cylinder", s.last ? `${s.last.no} · ${daysOf(s.last, isoDay(0))} days · ${s.last.people} technicians` : "—"],
    ["📅", "Avg. days per cylinder (auto)", s.min === s.max ? `${s.avg} days` : `${s.min}–${s.max} days (avg ${s.avg})`],
    ["👥", "Technicians covered", s.peopleMin === s.peopleMax ? String(s.peopleMax || "—") : `${s.peopleMin}–${s.peopleMax}`],
    ["🔥", "Cylinders per month (est.)", String(s.perMonth)],
    ["🗓️", "Cylinders per year (est.)", s.perYearMin === s.perYearMax ? String(s.perYearMin) : `${s.perYearMin}–${s.perYearMax}`],
    ["₹", "Spent this year", s.spentThisYear ? inr(s.spentThisYear) : "—"],
  ];
  return (
    <div>
      {rows.map(([i, k, v], n) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: n ? "1px solid var(--line)" : "none", fontSize: 13.5 }}>
          <span aria-hidden style={{ width: 22, textAlign: "center" }}>{i}</span><span style={{ flex: 1, color: "var(--ink-soft)" }}>{k}</span><b>{v}</b>
        </div>
      ))}
      <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--ink-mute)" }}>{s.basedOn ? `Based on the last ${s.basedOn} finished cylinder${s.basedOn === 1 ? "" : "s"}.` : "Estimate uses 30 days until two cylinders are finished."}</p>
    </div>
  );
}

/** New cylinder form. `inp`/`lab` let the admin panel and the phone app use their own field styles. */
export function LpgForm({ db, inp, lab, onSave, onCancel, showCost = true }: {
  db: Db; inp: React.CSSProperties; lab: React.CSSProperties; onSave: (d: LpgDraft) => string | null; onCancel?: () => void; showCost?: boolean;
}) {
  const list = db.cylinders ?? [];
  const cur = currentCylinder(list);
  const [d, setD] = useState<LpgDraft>({ no: nextCylinderNo(list), sizeKg: cur?.sizeKg ?? "14.2", start: isoDay(0), people: cur?.people ?? (db.techs.filter((t) => t.active).length || 1), meals: cur?.meals ?? 2, cost: null, vendor: cur?.vendor ?? "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (x: Partial<LpgDraft>) => { setD({ ...d, ...x }); setErr(null); };
  return (
    <form onSubmit={(e) => { e.preventDefault(); setErr(onSave(d)); }} style={{ display: "grid", gap: 12 }}>
      {cur && <p style={{ margin: 0, fontSize: 12.5, color: "var(--gold-dark)", background: "var(--gold-tint)", borderRadius: 10, padding: "8px 10px", fontWeight: 600 }}>{cur.no} (started {fmtDate(cur.start)}) will be marked finished on the start date below.</p>}
      <div className="form-grid">
        <div><span style={lab}>Cylinder no. (auto)</span><div style={{ ...inp, display: "flex", alignItems: "center", fontWeight: 700, background: "var(--bg-secondary)" }}>{d.no}</div></div>
        <label><span style={lab}>Start date *</span><input type="date" max={isoDay(0)} value={d.start} onChange={(e) => set({ start: e.target.value })} style={inp} /></label>
        <label><span style={lab}>Cylinder size</span>
          <select value={d.sizeKg} onChange={(e) => set({ sizeKg: e.target.value as LpgDraft["sizeKg"] })} style={inp}>{CYLINDER_SIZES.map((s) => <option key={s} value={s}>{s} kg — {CYLINDER_KIND[s]}</option>)}</select>
        </label>
        <label><span style={lab}>Technicians eating at the mess *</span><input type="number" inputMode="numeric" min={1} value={d.people || ""} onChange={(e) => set({ people: Number(e.target.value) })} style={inp} /></label>
        <label><span style={lab}>Meals per day *</span><select value={d.meals} onChange={(e) => set({ meals: Number(e.target.value) })} style={inp}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n} meal{n === 1 ? "" : "s"} / day</option>)}</select></label>
        {showCost && <label><span style={lab}>Cost (₹)</span><input type="number" inputMode="numeric" min={0} value={d.cost ?? ""} onChange={(e) => set({ cost: e.target.value === "" ? null : Number(e.target.value) })} placeholder="e.g. 905" style={inp} /></label>}
        <label><span style={lab}>Gas agency</span><input value={d.vendor} onChange={(e) => set({ vendor: e.target.value })} style={inp} /></label>
      </div>
      {err && <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {onCancel && <button type="button" onClick={onCancel} style={{ ...btnBase, background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line-strong)" }}>Cancel</button>}
        <button type="submit" className="press" style={{ ...btnBase, background: "var(--blue)", color: "#fff", border: "1px solid var(--blue)", flex: onCancel ? undefined : 1 }}>Save — cylinder started</button>
      </div>
    </form>
  );
}

const btnBase: React.CSSProperties = { borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" };
