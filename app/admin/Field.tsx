"use client";

import { useState } from "react";
import { fmtDateTime, isOpen, isoDay, siteOf, type Db, type Job } from "../lib/data";
import { CATEGORY_ICON, SERVICE_CATEGORIES, breakToday, distanceM, isCongested, fmtDistance, parseGps, type FieldRules, type ServiceCategory } from "../lib/field";
import { fieldRulesOf, setFieldRules } from "../lib/store";
import { Badge, Btn, Panel, Table, fieldLabel, input, muted } from "./kit";

/* Admin pieces for the field rules: Settings panel, live technician board, and "nearby" dispatch info. */

export type LiveStatus = "Available" | "On Job" | "On Break" | "Off Duty";

/** Live status: a running break timer beats the availability flag. */
export function liveStatus(db: Db, techId: string): { status: LiveStatus; breakMin: number; overBreak: boolean } {
  const t = db.techs.find((x) => x.id === techId);
  const b = breakToday(db.timeLogs, techId, isoDay(0));
  const lim = fieldRulesOf(db).maxBreakMin;
  return { status: b.onBreak ? "On Break" : (t?.availability ?? "Off Duty"), breakMin: b.minutes, overBreak: lim > 0 && b.minutes > lim };
}
export const LIVE_TONE: Record<LiveStatus, "green" | "blue" | "amber" | "grey"> = { Available: "green", "On Job": "blue", "On Break": "amber", "Off Duty": "grey" };

/** Distance from a technician's last shared location to the job's site, if both are known. */
export function techDistance(db: Db, techId: string, job: Job): number | null {
  const t = db.techs.find((x) => x.id === techId);
  const site = parseGps(siteOf(job, db.customers.find((c) => c.id === job.customerId)).gps);
  return t?.loc && site ? distanceM(t.loc, site) : null;
}

export function FieldRulesPanel({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const cur = fieldRulesOf(db);
  const [r, setR] = useState<FieldRules>(cur);
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(r) !== JSON.stringify(cur);
  const toggleCat = (c: ServiceCategory) => setR({ ...r, categories: r.categories.includes(c) ? r.categories.filter((x) => x !== c) : SERVICE_CATEGORIES.filter((x) => x === c || r.categories.includes(x)) });
  const sw = (on: boolean, onChange: (b: boolean) => void, l: string, sub: string) => (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid var(--line)", cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: "#111" }} />
      <span><b style={{ fontSize: 13.5 }}>{l}</b><span style={{ ...muted, display: "block" }}>{sub}</span></span>
    </label>
  );
  return (
    <Panel title="Booking & field rules" actions={<Btn disabled={!dirty} onClick={() => { const e = setFieldRules(r, who); setErr(e); if (!e) notify("Field rules saved · logged in audit"); }}>Save</Btn>}>
      <span style={fieldLabel}>Service categories in the customer app</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 14px" }}>
        {SERVICE_CATEGORIES.map((c) => <Btn key={c} small kind={r.categories.includes(c) ? "primary" : "ghost"} onClick={() => toggleCat(c)}>{CATEGORY_ICON[c]} {c}</Btn>)}
      </div>
      <div className="form-grid">
        <label><span style={fieldLabel}>Arrival radius (metres)</span><input inputMode="numeric" value={String(r.geofenceM)} onChange={(e) => setR({ ...r, geofenceM: Number(e.target.value.replace(/\D/g, "")) || 0 })} style={input} /><span style={muted}>Technician can mark &ldquo;Arrived&rdquo; only within this distance of the customer&apos;s pin (or with a reason).</span></label>
        <label><span style={fieldLabel}>Nearby technicians radius (km)</span><input inputMode="decimal" value={String(r.nearbyKm)} onChange={(e) => setR({ ...r, nearbyKm: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} style={input} /><span style={muted}>Dispatch shows technicians within this distance of the job first.</span></label>
        <label><span style={fieldLabel}>Daily break limit (minutes)</span><input inputMode="numeric" value={String(r.maxBreakMin)} onChange={(e) => setR({ ...r, maxBreakMin: Number(e.target.value.replace(/\D/g, "")) || 0 })} style={input} /><span style={muted}>Breaks over the limit are flagged to the office (0 = no limit).</span></label>
      </div>
      <div style={{ marginTop: 10 }}>
        {sw(r.visitOtp, (b) => setR({ ...r, visitOtp: b }), "Visit OTP (built-in)", "Customer sees a 4-digit code in the app; the technician enters it on arrival before work starts.")}
        {sw(r.inAppCall, (b) => setR({ ...r, inAppCall: b }), "App-to-app calling", "Customer and technician call inside the app; phone numbers stay hidden and calls are logged on the job.")}
      </div>
      {err && <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
      <p style={{ ...muted, marginTop: 8 }}>Demo note: live calls, SMS OTP and background GPS need the server/telephony integration; here they run inside this browser.</p>
    </Panel>
  );
}

/** Live board: who is available, on a job, on break (and how long), and where they were last seen. */
export function TechLiveBoard({ db }: { db: Db }) {
  const rules = fieldRulesOf(db);
  const rows = db.techs.filter((t) => t.active);
  return (
    <Panel title="Live status — geo-location & break time" pad={false}>
      <Table rows={rows} rowKey={(t) => t.id} empty="No active technicians." cols={[
        { key: "n", head: "Technician", render: (t) => <div><b>{t.name}</b><div style={muted}>{t.area}</div></div> },
        { key: "s", head: "Status", render: (t) => { const l = liveStatus(db, t.id); return <Badge tone={LIVE_TONE[l.status]}>{l.status}</Badge>; } },
        { key: "b", head: "Break today", render: (t) => { const l = liveStatus(db, t.id); return <span style={{ fontWeight: l.overBreak ? 700 : 400, color: l.overBreak ? "var(--error-text)" : undefined }}>{l.breakMin} / {rules.maxBreakMin || "∞"} min{l.overBreak ? " · over limit" : ""}</span>; } },
        { key: "j", head: "Open jobs today", render: (t) => db.jobs.filter((j) => j.techId === t.id && j.date === isoDay(0) && isOpen(j)).length },
        { key: "l", head: "Last location", render: (t) => t.loc ? <div><a href={`https://maps.google.com/?q=${t.loc.lat},${t.loc.lng}`} target="_blank" rel="noreferrer">View on map ↗</a><div style={muted}>{fmtDateTime(t.loc.at)}</div></div> : <span style={muted}>Not shared yet (shares while on duty in the app)</span> },
      ]} />
    </Panel>
  );
}

/** Job overview extras: category, property, visit OTP, arrival check, in-app calls. */
export function JobFieldInfo({ db, job }: { db: Db; job: Job }) {
  const rules = fieldRulesOf(db);
  const s = siteOf(job, db.customers.find((c) => c.id === job.customerId));
  const prop = [s.propertyType, [s.building, s.unit].filter(Boolean).join(", "), s.floor, s.lift ? `Lift: ${s.lift}` : "", isCongested(s.areaType) ? `${s.areaType} (${(s.congested ?? []).join(", ") || "no details"})` : ""].filter(Boolean).join(" · ");
  const row = (k: string, v: React.ReactNode) => <div style={{ display: "flex", gap: 10, fontSize: 13, padding: "4px 0" }}><span style={{ ...muted, width: 120, flexShrink: 0 }}>{k}</span><span>{v}</span></div>;
  return (
    <div style={{ marginTop: 8 }}>
      {row("Category", `${CATEGORY_ICON[job.category ?? "AC"]} ${job.category ?? "AC"}`)}
      {prop && row("Property", prop)}
      {s.instructions && row("Instructions", s.instructions)}
      {rules.visitOtp && row("Visit OTP", job.otpVerifiedAt ? <span style={{ color: "var(--success-text)", fontWeight: 600 }}>✓ Verified {fmtDateTime(job.otpVerifiedAt)}</span> : job.visitOtp ? <span>Code {job.visitOtp} · not verified yet</span> : "—")}
      {job.arrival && row("Arrival", <span style={{ color: job.arrival.override ? "var(--gold-dark)" : undefined }}>{job.arrival.distanceM != null ? `${fmtDistance(job.arrival.distanceM)} from pin` : "No location"}{job.arrival.override ? ` · override: ${job.arrival.override}` : ` · within ${rules.geofenceM} m`}</span>)}
      {(job.calls ?? []).length > 0 && row("In-app calls", <span>{(job.calls ?? []).map((c) => `${fmtDateTime(c.at)} ${c.from} → ${c.to} (${Math.floor(c.seconds / 60)}m ${c.seconds % 60}s)`).join(" · ")}</span>)}
    </div>
  );
}
