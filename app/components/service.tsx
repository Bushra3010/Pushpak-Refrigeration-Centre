"use client";

import { useEffect, useState } from "react";
import {
  AC_TYPES, APPLICATIONS, BRANDS, CAPACITIES, USAGE, acJobs, acLabel, acSummary, fmtDate, fmtDateTime, inr, isDone, jobTotals,
  paymentStatus, stepOf, type AcUnit, type Db, type Job, type JobStatus, type PaymentStatus, type PreWork,
} from "../lib/data";
import { BrandMark } from "./Brand";
import { AlertIcon, CheckIcon, LockIcon } from "./icons";
import { Chips, Pill, card, field, label, small, type Tone } from "./ui";

/* ───────────────────────── Status pills ───────────────────────── */

export const JOB_TONE: Record<JobStatus, Tone> = {
  "New Request": "red", Assigned: "purple", Accepted: "purple", "On the Way": "blue", Arrived: "teal", Diagnosis: "teal",
  "Estimate Prepared": "orange", Approved: "blue", "Work Started": "blue", "Work Completed": "green", Invoiced: "amber",
  Closed: "green", Cancelled: "grey",
};

export const PAY_TONE: Record<PaymentStatus, Tone> = { Pending: "red", "Partially Paid": "amber", Paid: "green", Refunded: "grey" };

export const JobPill = ({ status }: { status: JobStatus }) => <Pill tone={JOB_TONE[status]}>{status}</Pill>;
export const PayPill = ({ job, db }: { job: Job; db: Db }) => { const s = paymentStatus(job, db.settings); return <Pill tone={PAY_TONE[s]}>{s}</Pill>; };
export const PriorityPill = ({ p }: { p: Job["priority"] }) => (p === "Normal" ? null : <Pill tone={p === "Urgent" ? "red" : "amber"}>{p}</Pill>);

/* ───────────────────────── Customer-facing progress ───────────────────────── */

const CUSTOMER_STEPS: { label: string; from: JobStatus }[] = [
  { label: "Requested", from: "New Request" },
  { label: "Assigned", from: "Assigned" },
  { label: "On the way", from: "On the Way" },
  { label: "Diagnosis", from: "Arrived" },
  { label: "Approval", from: "Estimate Prepared" },
  { label: "Repair", from: "Approved" },
  { label: "Done", from: "Invoiced" },
];

export function ProgressSteps({ status }: { status: JobStatus }) {
  const cur = stepOf(status);
  const idx = CUSTOMER_STEPS.reduce((acc, s, i) => (cur >= stepOf(s.from) ? i : acc), 0);
  const done = status === "Closed";
  return (
    <div style={{ display: "flex" }}>
      {CUSTOMER_STEPS.map((s, i) => {
        const past = i < idx || done;
        const now = i === idx && !done;
        return (
          <div key={s.label} style={{ flex: 1, textAlign: "center", position: "relative" }}>
            {i > 0 && <span style={{ position: "absolute", top: 11, right: "50%", width: "100%", height: 2, background: i <= idx || done ? "var(--blue)" : "var(--line)" }} />}
            <span style={{
              position: "relative", width: 24, height: 24, margin: "0 auto", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: past ? "var(--blue)" : now ? "var(--surface)" : "var(--line)", border: now ? "2.5px solid var(--blue)" : "none",
            }}>{past && <CheckIcon s={12} c="white" />}{now && <span className="animate-pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--blue)" }} />}</span>
            <p style={{ margin: "4px 0 0", fontSize: 9.5, fontWeight: now ? 700 : 500, color: i <= idx || done ? "var(--ink)" : "var(--ink-mute)" }}>{s.label}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Timeline ───────────────────────── */

export function Timeline({ job }: { job: Job }) {
  const rows = [...job.timeline].reverse();
  return (
    <div style={{ position: "relative" }}>
      {rows.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 12, paddingBottom: i === rows.length - 1 ? 0 : 14, position: "relative" }}>
          {i < rows.length - 1 && <span style={{ position: "absolute", left: 5, top: 14, bottom: 0, width: 2, background: "var(--line)" }} />}
          <span style={{ width: 12, height: 12, marginTop: 4, borderRadius: "50%", flexShrink: 0, background: i === 0 ? "var(--blue)" : "var(--line-strong)", boxShadow: i === 0 ? "0 0 0 4px var(--blue-tint)" : "none" }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{t.status}</p>
            {t.note && <p style={{ margin: "1px 0 0", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>{t.note}</p>}
            <p style={{ margin: "1px 0 0", fontSize: 11, color: "var(--ink-mute)" }}>{fmtDateTime(t.at)} · {t.by}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Quotation / invoice lines ───────────────────────── */

export function QuoteTable({ job, db, onRemove, compact }: { job: Job; db: Db; onRemove?: (lineId: string) => void; compact?: boolean }) {
  const t = jobTotals(job, db.settings);
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, padding: compact ? "7px 0" : "9px 0", fontSize: 13 };
  return (
    <div>
      {job.lines.map((l, i) => (
        <div key={l.id} style={{ ...row, borderTop: i ? "1px solid var(--line)" : "none", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)" }}>
              {l.name}{l.qty > 1 && <span style={{ color: "var(--ink-soft)", fontWeight: 500 }}> × {l.qty}</span>}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "var(--ink-mute)", display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span>{l.kind}</span>
              {l.upsell && <span style={{ color: "var(--gold-dark)", fontWeight: 700 }}>Recommended</span>}
              {l.addOn && <span style={{ color: "var(--purple)", fontWeight: 700 }}>Add-on · awaiting approval</span>}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontWeight: 600 }}>{inr(l.qty * l.price)}</span>
            {onRemove && <button onClick={() => onRemove(l.id)} aria-label={`Remove ${l.name}`} style={{ border: "none", background: "var(--error)", color: "var(--error-text)", borderRadius: 8, width: 24, height: 24, cursor: "pointer", fontWeight: 700 }}>×</button>}
          </div>
        </div>
      ))}
      {job.lines.length === 0 && <p style={{ margin: 0, padding: "14px 0", fontSize: 13, color: "var(--ink-mute)", textAlign: "center" }}>No items yet</p>}
      {job.lines.length > 0 && (
        <div style={{ borderTop: "1px dashed var(--line-strong)", marginTop: 4, paddingTop: 4 }}>
          <div style={{ ...row, color: "var(--ink-soft)" }}><span>Subtotal</span><span>{inr(t.subtotal)}</span></div>
          {t.discount > 0 && <div style={{ ...row, color: "var(--success-text)" }}><span>Discount</span><span>− {inr(t.discount)}</span></div>}
          {db.settings.gstEnabled && <div style={{ ...row, color: "var(--ink-soft)" }}><span>GST {db.settings.gstPercent}%</span><span>{inr(t.gst)}</span></div>}
          <div style={{ ...row, fontSize: 16, fontWeight: 800 }}><span>Total</span><span>{inr(t.total)}</span></div>
          {t.paid > 0 && <div style={{ ...row, color: "var(--success-text)", fontWeight: 600 }}><span>Paid</span><span>{inr(t.paid)}</span></div>}
          {t.paid > 0 && t.due > 0 && <div style={{ ...row, color: "var(--error-text)", fontWeight: 700 }}><span>Balance due</span><span>{inr(t.due)}</span></div>}
        </div>
      )}
    </div>
  );
}

/** Printable tax invoice / quotation. `window.print()` prints only this block. */
export function InvoiceDoc({ job, db, kind }: { job: Job; db: Db; kind: "invoice" | "quotation" }) {
  const c = db.customers.find((x) => x.id === job.customerId)!;
  const ac = db.acs.find((x) => x.id === job.acId)!;
  const tech = db.techs.find((x) => x.id === job.techId);
  const t = jobTotals(job, db.settings);
  const s = db.settings;
  const no = kind === "invoice" ? job.invoice?.no : job.quote?.no;
  const at = kind === "invoice" ? job.invoice?.at : job.quote?.at;
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, color: "var(--ink-mute)", fontWeight: 700, padding: "6px 4px", borderBottom: "1px solid var(--line)", textTransform: "uppercase" };
  const td: React.CSSProperties = { fontSize: 12, padding: "7px 4px", borderBottom: "1px solid var(--line)", verticalAlign: "top" };
  return (
    <div className="print-doc" style={{ ...card, padding: 16, background: "white" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <BrandMark size={40} />
          <div>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800 }}>{s.company}</p>
            <p style={{ margin: 0, fontSize: 10.5, color: "var(--ink-soft)", lineHeight: 1.4 }}>{s.address}<br />{s.phone}{s.gstEnabled ? ` · GSTIN ${s.gstin}` : ""}</p>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, margin: "14px 0 10px", padding: "10px 12px", borderRadius: 12, background: "var(--bg-secondary)" }}>
        <div>
          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: "var(--ink-mute)" }}>{kind === "invoice" ? (s.gstEnabled ? "TAX INVOICE" : "INVOICE") : "QUOTATION"}</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{no}</p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--ink-soft)" }}>{at ? fmtDateTime(at) : ""}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: "var(--ink-mute)" }}>BILL TO</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{c.name}</p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--ink-soft)" }}>+91 {c.phone}</p>
        </div>
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "var(--ink-soft)" }}>
        Job {job.id} · {acLabel(ac)} ({ac.application}){ac.serial ? ` · S/N ${ac.serial}` : ""}{tech ? ` · Technician: ${tech.name}` : ""}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th}>Item</th><th style={{ ...th, textAlign: "right" }}>Qty</th><th style={{ ...th, textAlign: "right" }}>Rate</th><th style={{ ...th, textAlign: "right" }}>Amount</th></tr></thead>
        <tbody>
          {job.lines.map((l) => (
            <tr key={l.id}><td style={td}>{l.name}<div style={{ fontSize: 10, color: "var(--ink-mute)" }}>{l.kind}</div></td><td style={{ ...td, textAlign: "right" }}>{l.qty}</td><td style={{ ...td, textAlign: "right" }}>{inr(l.price)}</td><td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{inr(l.qty * l.price)}</td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginLeft: "auto", maxWidth: 240, marginTop: 8, fontSize: 12.5 }}>
        {[["Subtotal", inr(t.subtotal)], ...(t.discount ? [["Discount", `− ${inr(t.discount)}`]] : []), ...(s.gstEnabled ? [[`CGST ${s.gstPercent / 2}%`, inr(t.gst / 2)], [`SGST ${s.gstPercent / 2}%`, inr(t.gst / 2)]] : [])].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "var(--ink-soft)" }}><span>{k}</span><span>{v}</span></div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 2px", borderTop: "1px solid var(--line-strong)", marginTop: 4, fontSize: 15, fontWeight: 800 }}><span>Total</span><span>{inr(t.total)}</span></div>
        {kind === "invoice" && <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: t.due ? "var(--error-text)" : "var(--success-text)", fontWeight: 700 }}><span>{t.due ? "Balance due" : "Paid in full"}</span><span>{t.due ? inr(t.due) : inr(t.paid)}</span></div>}
      </div>
      {kind === "invoice" && job.payments.length > 0 && (
        <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--ink-soft)" }}>
          Payments: {job.payments.map((p) => `${p.refund ? "Refund " : ""}${inr(p.amount)} ${p.method}${p.ref ? ` (${p.ref})` : ""} on ${fmtDate(p.at)}`).join("; ")}
        </p>
      )}
      <p style={{ margin: "12px 0 0", fontSize: 10.5, color: "var(--ink-mute)", lineHeight: 1.5 }}>
        {kind === "quotation" ? "Valid for 7 days. Work starts only after your approval. Any extra work will be quoted separately." : "Thank you for choosing Pushpak. 30-day service warranty on labour; parts as per manufacturer warranty."}
      </p>
    </div>
  );
}

/* ───────────────────────── AC service history (PRD §10) ───────────────────────── */

export function AcHistory({ db, ac, onOpenJob, excludeJob }: { db: Db; ac: AcUnit; onOpenJob?: (id: string) => void; excludeJob?: string }) {
  const s = acSummary(db, ac.id);
  const jobs = acJobs(db, ac.id).filter((j) => j.id !== excludeJob && j.status !== "Cancelled");
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {[["Visits", String(s.visits)], ["Total spend", inr(s.spend)], ["Last service", s.lastService ? fmtDate(s.lastService) : "—"]].map(([k, v]) => (
          <div key={k} style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: "9px 10px" }}>
            <p style={{ margin: 0, fontSize: 10.5, color: "var(--ink-mute)", fontWeight: 600 }}>{k}</p>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800 }}>{v}</p>
          </div>
        ))}
      </div>
      {s.repeatIssues.length > 0 && (
        <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 12, background: "var(--error)", color: "var(--error-text)", fontSize: 12.5, fontWeight: 600, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertIcon s={16} c="var(--error-text)" /> <span>Repeat problem: {s.repeatIssues.join(", ")}. Check the earlier fix before diagnosing.</span>
        </div>
      )}
      {(s.gasCharges.length > 0 || s.partsReplaced.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {s.gasCharges.map((d) => <Pill key={`g${d}`} tone="blue">Gas · {fmtDate(d)}</Pill>)}
          {s.partsReplaced.map((p, i) => <Pill key={`p${i}`} tone="purple">{p.name} · {fmtDate(p.at)}</Pill>)}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        {jobs.map((j, i) => {
          const tech = db.techs.find((t) => t.id === j.techId);
          const inner = (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{fmtDate(j.date)} · {j.id}</span>
                <JobPill status={j.status} />
              </div>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--text-secondary)" }}><b>Complaint:</b> {j.complaint.issues.join(", ")}</p>
              {j.diagnosis.rootCause && <p style={{ margin: "1px 0 0", fontSize: 12, color: "var(--text-secondary)" }}><b>Diagnosis:</b> {j.diagnosis.rootCause}{j.diagnosis.observed ? ` — ${j.diagnosis.observed}` : ""}</p>}
              {isDone(j) && j.lines.length > 0 && <p style={{ margin: "1px 0 0", fontSize: 12, color: "var(--text-secondary)" }}><b>Work:</b> {j.lines.map((l) => l.name).join(", ")}</p>}
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--ink-mute)" }}>{tech?.name ?? "Unassigned"}{isDone(j) ? ` · ${inr(jobTotals(j, db.settings).total)}` : ""}{j.rating ? ` · ${"★".repeat(j.rating)}` : ""}</p>
            </>
          );
          const box: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "10px 0", borderTop: i ? "1px solid var(--line)" : "none", background: "none", border: "none", borderTopStyle: "solid" };
          return onOpenJob
            ? <button key={j.id} onClick={() => onOpenJob(j.id)} style={{ ...box, cursor: "pointer", borderTop: i ? "1px solid var(--line)" : "none" }}>{inner}</button>
            : <div key={j.id} style={{ ...box, borderTop: i ? "1px solid var(--line)" : "none" }}>{inner}</div>;
        })}
        {jobs.length === 0 && <p style={{ ...small, textAlign: "center", padding: "10px 0" }}>No earlier service on record.</p>}
      </div>
    </div>
  );
}

export function AcSpecs({ ac }: { ac: AcUnit }) {
  const rows: [string, string][] = [
    ["Application", ac.application], ["Type", `${ac.acType} · ${ac.inverter ? "Inverter" : "Non-inverter"}`], ["Capacity", ac.capacity],
    ["Brand / model", `${ac.brand}${ac.model ? ` · ${ac.model}` : ""}`], ["Serial no.", ac.serial || "—"],
    ["AC age / installed", `${ac.ageYears} yr / ${ac.installAgeYears} yr ago`], ["Purchased", ac.purchased], ["Warranty", ac.warranty],
    ["Usage", `${ac.usage} · ~${ac.dailyHours} h/day`],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
      {rows.map(([k, v]) => (
        <div key={k}><p style={{ margin: 0, fontSize: 10.5, color: "var(--ink-mute)", fontWeight: 600 }}>{k}</p><p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>{v}</p></div>
      ))}
    </div>
  );
}

/* ───────────────────────── AC form (PRD §3B) ───────────────────────── */

export type AcDraft = Omit<AcUnit, "id" | "customerId">;
export const EMPTY_AC: AcDraft = {
  application: "Bedroom", acType: "Split", capacity: "1.5 Ton", brand: "", model: "", serial: "", inverter: true,
  ageYears: 0, installAgeYears: 0, purchased: "New", warranty: "Don't Know", dailyHours: 8, usage: "Regular",
};

export function AcForm({ value, onChange, inputStyle = field, labelStyle = label }: { value: AcDraft; onChange: (v: AcDraft) => void; inputStyle?: React.CSSProperties; labelStyle?: React.CSSProperties }) {
  const set = <K extends keyof AcDraft>(k: K, v: AcDraft[K]) => onChange({ ...value, [k]: v });
  const num = (v: string) => Math.max(0, Math.min(40, Number(v.replace(/\D/g, "").slice(0, 2)) || 0));
  const block: React.CSSProperties = { marginBottom: 14 };
  return (
    <div>
      <div style={block}><span style={labelStyle}>Application</span><Chips options={APPLICATIONS} value={value.application} onChange={(v) => set("application", v)} /></div>
      <div style={block}><span style={labelStyle}>AC type</span><Chips options={AC_TYPES} value={value.acType} onChange={(v) => set("acType", v)} /></div>
      <div style={block}><span style={labelStyle}>Capacity</span><Chips options={CAPACITIES} value={value.capacity} onChange={(v) => set("capacity", v)} /></div>
      <div style={block}><span style={labelStyle}>Inverter?</span><Chips options={["Inverter", "Non-Inverter"] as const} value={value.inverter ? "Inverter" : "Non-Inverter"} onChange={(v) => set("inverter", v === "Inverter")} /></div>
      <div className="form-grid" style={block}>
        <label><span style={labelStyle}>Brand</span>
          <select value={value.brand} onChange={(e) => set("brand", e.target.value)} style={inputStyle}>
            <option value="">Select brand</option>{BRANDS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label><span style={labelStyle}>Model number</span><input value={value.model} onChange={(e) => set("model", e.target.value.toUpperCase())} placeholder="e.g. FTKF50TV" style={inputStyle} /></label>
        <label><span style={labelStyle}>Serial number</span><input value={value.serial} onChange={(e) => set("serial", e.target.value.toUpperCase())} placeholder="On the indoor unit sticker" style={inputStyle} /></label>
        <label><span style={labelStyle}>Approx. AC age (years)</span><input inputMode="numeric" value={value.ageYears || ""} onChange={(e) => set("ageYears", num(e.target.value))} placeholder="0" style={inputStyle} /></label>
        <label><span style={labelStyle}>Installed (years ago)</span><input inputMode="numeric" value={value.installAgeYears || ""} onChange={(e) => set("installAgeYears", num(e.target.value))} placeholder="0" style={inputStyle} /></label>
        <label><span style={labelStyle}>Daily usage (hours)</span><input inputMode="numeric" value={value.dailyHours || ""} onChange={(e) => set("dailyHours", Math.min(24, num(e.target.value)))} placeholder="8" style={inputStyle} /></label>
      </div>
      <div style={block}><span style={labelStyle}>AC purchased</span><Chips options={["New", "Used"] as const} value={value.purchased} onChange={(v) => set("purchased", v)} /></div>
      <div style={block}><span style={labelStyle}>Under warranty?</span><Chips options={["Yes", "No", "Don't Know"] as const} value={value.warranty} onChange={(v) => set("warranty", v)} /></div>
      <div style={block}><span style={labelStyle}>Usage</span><Chips options={USAGE} value={value.usage} onChange={(v) => set("usage", v)} /></div>
    </div>
  );
}

/* ───────────────────────── Pre-work questionnaire (PRD §5) ───────────────────────── */

type Q = { k: keyof PreWork; q: string; opts?: readonly string[]; show?: (p: PreWork) => boolean; placeholder?: string };
export const PREWORK_QUESTIONS: Q[] = [
  { k: "occurrence", q: "Is this the first time, or has it happened before?", opts: ["First Time", "Repeat Problem"] },
  { k: "prevTechVisit", q: "Has any technician visited before for this problem?", opts: ["Yes", "No"] },
  { k: "prevDiagnosis", q: "What diagnosis / solution was given then?", show: (p) => p.prevTechVisit === "Yes", placeholder: "e.g. Said gas was low" },
  { k: "prevWork", q: "What repair / work was done?", show: (p) => p.prevTechVisit === "Yes", placeholder: "e.g. Gas top-up" },
  { k: "prevPartChanged", q: "Was any part changed? Which one?", show: (p) => p.prevTechVisit === "Yes", placeholder: "e.g. Capacitor — or 'No'" },
  { k: "gasChargedBefore", q: "Has gas charging been done before?", opts: ["Yes", "No", "Don't Know"] },
  { k: "gasChargedWhen", q: "When was the gas charged (approx.)?", show: (p) => p.gasChargedBefore === "Yes", placeholder: "e.g. 7 months ago" },
  { k: "coolingLastedAfterGas", q: "How long did cooling stay good after that?", show: (p) => p.gasChargedBefore === "Yes", placeholder: "e.g. 4–5 months" },
  { k: "majorExpense", q: "Any major AC expense earlier?", opts: ["Yes", "No"] },
  { k: "majorExpenseDetails", q: "Amount and what was done", show: (p) => p.majorExpense === "Yes", placeholder: "e.g. ₹9,000 compressor, 2023" },
  { k: "lastService", q: "When was the last AC service?", placeholder: "e.g. March this year" },
  { k: "recentlyShifted", q: "Was the AC recently shifted / reinstalled?", opts: ["Yes", "No"] },
  { k: "voltageProblem", q: "Any recent electrical / voltage problem?", opts: ["Yes", "No"] },
  { k: "unusualSoundSmell", q: "Any unusual sound, smell or vibration recently?", opts: ["Yes", "No"] },
  { k: "leakageBefore", q: "Has water leakage happened before?", opts: ["Yes", "No"] },
  { k: "coolingTrend", q: "Was cooling good earlier and now reduced, or always low?", opts: ["Was good, now reduced", "Always low"] },
];

export const preWorkAnswered = (p: PreWork) => PREWORK_QUESTIONS.filter((q) => (!q.show || q.show(p)) && p[q.k]).length;
export const preWorkTotal = (p: PreWork) => PREWORK_QUESTIONS.filter((q) => !q.show || q.show(p)).length;

export function PreWorkForm({ value, onChange, inputStyle = field }: { value: PreWork; onChange: (v: PreWork) => void; inputStyle?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {PREWORK_QUESTIONS.filter((q) => !q.show || q.show(value)).map((q) => (
        <div key={q.k}>
          <p style={{ margin: "0 0 7px", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{q.q}</p>
          {q.opts
            ? <Chips options={q.opts} value={value[q.k] as string} onChange={(v) => onChange({ ...value, [q.k]: value[q.k] === v ? "" : v })} />
            : <input value={value[q.k] as string} onChange={(e) => onChange({ ...value, [q.k]: e.target.value })} placeholder={q.placeholder} style={inputStyle} />}
        </div>
      ))}
    </div>
  );
}

export function PreWorkView({ value }: { value: PreWork }) {
  const rows = PREWORK_QUESTIONS.filter((q) => value[q.k]);
  if (!rows.length) return <p style={{ ...small, margin: 0 }}>Not captured yet.</p>;
  return (
    <div>
      {rows.map((q, i) => (
        <div key={q.k} style={{ padding: "7px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-mute)" }}>{q.q}</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{value[q.k]}</p>
        </div>
      ))}
    </div>
  );
}

/** Customer's complaint, shown verbatim and visually apart from the technician's diagnosis. */
export function ComplaintBox({ job }: { job: Job }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 12, background: "var(--gold-tint)", border: "1px solid var(--gold-100)" }}>
      <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: "var(--gold-dark)", letterSpacing: "0.04em" }}>CUSTOMER&apos;S COMPLAINT (THEIR WORDS)</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0" }}>
        {job.complaint.issues.map((i) => <Pill key={i} tone="orange">{i}</Pill>)}
        {job.complaint.errorCode && <Pill tone="red">Code {job.complaint.errorCode}</Pill>}
      </div>
      {job.complaint.notes && <p style={{ margin: 0, fontSize: 13, color: "var(--ink)", lineHeight: 1.5, fontStyle: "italic" }}>&ldquo;{job.complaint.notes}&rdquo;</p>}
    </div>
  );
}

/* ───────────────────────── Live tracking map (demo) ───────────────────────── */

/** Stylised map — the technician marker moves along the route while "On the Way".
 *  Replace with Google Maps + the technician's live GPS once the backend is in. */
export function MapMock({ moving, height = 190, etaMin }: { moving: boolean; height?: number; etaMin?: number }) {
  const [t, setT] = useState(0.15);
  useEffect(() => {
    if (!moving) return;
    const id = setInterval(() => setT((x) => (x >= 0.85 ? 0.85 : x + 0.01)), 400);
    return () => clearInterval(id);
  }, [moving]);
  // Quadratic bezier from (40,150) via (170,20) to (300,90).
  const at = (u: number) => ({ x: (1 - u) ** 2 * 40 + 2 * (1 - u) * u * 170 + u * u * 300, y: (1 - u) ** 2 * 150 + 2 * (1 - u) * u * 20 + u * u * 90 });
  const p = at(moving ? t : 0);
  const eta = etaMin !== undefined ? Math.max(2, Math.round(etaMin * (1 - (t - 0.15) / 0.7))) : undefined;
  return (
    <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", height, background: "#e9f0e6" }}>
      <svg viewBox="0 0 340 180" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-label="Map showing the technician's route">
        <rect width="340" height="180" fill="#eef3ea" />
        <path d="M0 60 H340 M0 125 H340 M90 0 V180 M220 0 V180" stroke="#fff" strokeWidth="12" />
        <path d="M0 60 H340 M0 125 H340 M90 0 V180 M220 0 V180" stroke="#dfe6db" strokeWidth="1" />
        <rect x="110" y="72" width="90" height="42" rx="6" fill="#d7ebd0" />
        <rect x="236" y="10" width="80" height="38" rx="6" fill="#dce7f5" />
        <path d="M40 150 Q170 20 300 90" fill="none" stroke="var(--blue)" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 9" />
        <circle cx="300" cy="90" r="9" fill="var(--red)" /><circle cx="300" cy="90" r="3.5" fill="white" />
        <circle cx={p.x} cy={p.y} r="12" fill="var(--blue)" opacity="0.3" className="ping" />
        <circle cx={p.x} cy={p.y} r="8" fill="var(--blue)" stroke="white" strokeWidth="3" />
      </svg>
      {eta !== undefined && moving && (
        <span style={{ position: "absolute", left: 10, top: 10, background: "white", borderRadius: 10, padding: "5px 10px", fontSize: 12, fontWeight: 700, boxShadow: "var(--shadow-md)" }}>
          Arriving in ~{eta} min
        </span>
      )}
    </div>
  );
}

/* ───────────────────────── Screen protection (PRD §14) ───────────────────────── */

/** Hides sensitive content when the app loses focus and blocks text selection / long-press copy.
 *  The Android wrapper adds FLAG_SECURE on top; the server remains the real access control. */
export function SecureScreen({ children, label: what = "customer & billing data" }: { children: React.ReactNode; label?: string }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const hide = () => setHidden(true);
    const show = () => setHidden(document.visibilityState !== "visible");
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    document.addEventListener("visibilitychange", show);
    return () => { window.removeEventListener("blur", hide); window.removeEventListener("focus", show); document.removeEventListener("visibilitychange", show); };
  }, []);
  return (
    <div className="secure" onContextMenu={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()}>
      {children}
      {hidden && (
        <div className="secure-veil" onClick={() => setHidden(false)}>
          <LockIcon s={30} c="var(--blue)" />
          Protected screen — {what} is hidden while the app is in the background.
          <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-mute)" }}>Tap to show</span>
        </div>
      )}
    </div>
  );
}

export function SecureBadge() {
  return (
    <span title="Screenshots and screen recording are blocked on this screen in the Android app" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "var(--success-text)", background: "var(--success)", padding: "3px 8px", borderRadius: 999 }}>
      <LockIcon s={11} c="var(--success-text)" /> Protected
    </span>
  );
}
