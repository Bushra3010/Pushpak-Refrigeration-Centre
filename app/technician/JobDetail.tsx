"use client";

import { useRef, useState } from "react";
import { AlertIcon, CameraIcon, ChevronDown, ClockIcon, PhoneIcon, PinIcon, PlusIcon, SparkIcon } from "../components/icons";
import {
  AcHistory, AcSpecs, ComplaintBox, InvoiceDoc, JobPill, PreWorkForm, PreWorkView, PriorityPill, QuoteTable, SecureBadge, SecureScreen, Timeline,
  preWorkAnswered, preWorkTotal,
} from "../components/service";
import { TimerCard } from "./Timer";
import { PipeCalcSheet } from "./PipeSheet";
import { Avatar, BottomSheet, Chips, Footer, GhostButton, PageHeader, Pill, PrimaryButton, Tabs, card, field, label, sectionTitle, small } from "../components/ui";
import {
  DEMO_OTP, ROOT_CAUSES, acLabel, acSummary, fmtDateTime, initials, inr, isoDay, jobTotals, recommend, relDay, stepOf,
  type Db, type Diagnosis, type Job, type LineKind, type PayMethod, type PreWork, type QuoteLine, type Technician,
} from "../lib/data";
import {
  addOnWork, completeWork, decideQuote, declineJob, recordPayment, sendQuote, setFollowUp, setStatus, updateJob, visitChargeOnly,
} from "../lib/store";

const lid = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const mapsUrl = (gps: string, address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(gps || address)}`;

type Sheet = "decline" | "prework" | "add" | "addon" | "approve" | "pay" | "followup" | "invoice" | "pipe" | null;

export function JobDetailPage({ db, job, tech, onBack, flash }: { db: Db; job: Job; tech: Technician; onBack: () => void; flash: (m: string) => void }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [showHistory, setShowHistory] = useState(true);
  const c = db.customers.find((x) => x.id === job.customerId)!;
  const ac = db.acs.find((x) => x.id === job.acId)!;
  const sum = acSummary(db, ac.id);
  const t = jobTotals(job, db.settings);
  const step = stepOf(job.status);
  const by = tech.name;
  const pwDone = preWorkAnswered(job.preWork);
  const pwTotal = preWorkTotal(job.preWork);
  const editingEstimate = job.status === "Diagnosis";
  const quotePending = job.status === "Estimate Prepared" && job.quote?.status === "Pending";
  const quoteRejected = job.status === "Estimate Prepared" && job.quote?.status === "Rejected";
  const closedish = job.status === "Closed" || job.status === "Cancelled";

  const move = (s: Job["status"], msg: string, note?: string) => { setStatus(job.id, s, by, note); flash(msg); };
  const setDiag = (patch: Partial<Diagnosis>) => updateJob(job.id, { diagnosis: { ...job.diagnosis, ...patch } });
  const addLines = (ls: QuoteLine[]) => updateJob(job.id, { lines: [...job.lines, ...ls] });
  const removeLine = (id: string) => updateJob(job.id, { lines: job.lines.filter((l) => l.id !== id) });
  const canQuote = !!job.diagnosis.rootCause && job.lines.length > 0;

  return (
    <SecureScreen>
      <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
        <PageHeader title={`Job ${job.id}`} sub={`${relDay(job.date)}, ${job.slot}`} onBack={onBack} right={<JobPill status={job.status} />} />
        <div style={{ padding: "0 16px 12px", flex: 1 }}>

          <TimerCard db={db} job={job} tech={tech} flash={flash} />

          {/* Customer */}
          <div style={{ ...card, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar initials={initials(c.name)} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{c.name} <PriorityPill p={job.priority} />{c.amc && <Pill tone="green">AMC {c.amc.plan}</Pill>}</p>
                <p style={{ ...small, display: "flex", alignItems: "flex-start", gap: 4 }}><PinIcon s={14} c="var(--ink-soft)" /> {c.address}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-mute)" }}>{c.type} · prefers {c.contactPref} · {job.source}</p>
              </div>
            </div>
            {!closedish && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <a href={`tel:+91${c.phone}`} className="press" style={actionLink("var(--success)", "var(--success-text)")}><PhoneIcon s={16} c="var(--success-text)" /> Call</a>
                <a href={`https://wa.me/91${c.phone}`} target="_blank" rel="noreferrer" className="press" style={actionLink("#e7f8ee", "#128c4a")}>WhatsApp</a>
                <a href={mapsUrl(c.gps, c.address)} target="_blank" rel="noreferrer" className="press" style={actionLink("var(--blue-tint)", "var(--blue)")}><PinIcon s={16} c="var(--blue)" /> Navigate</a>
              </div>
            )}
          </div>

          {/* Complaint — always the customer's words, kept apart from diagnosis */}
          <div style={{ marginTop: 12 }}><ComplaintBox job={job} /></div>

          {/* AC + history, visible before diagnosis (PRD §6.3) */}
          <button onClick={() => setShowHistory((v) => !v)} style={{ ...sectionTitle, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <span>AC &amp; service history {sum.repeatIssues.length > 0 && <AlertIcon s={15} c="var(--error-text)" />}</span>
            <span style={{ transform: showHistory ? "rotate(180deg)" : "none", display: "flex" }}><ChevronDown s={16} c="var(--ink-mute)" /></span>
          </button>
          {showHistory && (
            <div className="fade-up" style={{ ...card, padding: 14 }}>
              <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>{ac.application} · {acLabel(ac)}</p>
              <AcSpecs ac={ac} />
              <div style={{ height: 1, background: "var(--line)", margin: "12px 0" }} />
              <AcHistory db={db} ac={ac} excludeJob={job.id} />
            </div>
          )}

          {/* Pre-work questionnaire */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={sectionTitle}>Pre-work history <span style={{ fontSize: 12, fontWeight: 600, color: pwDone ? "var(--success-text)" : "var(--error-text)" }}>{pwDone}/{pwTotal}</span></h3>
            {!closedish && step < stepOf("Work Completed") && <button onClick={() => setSheet("prework")} style={linkBtn}>{pwDone ? "Edit" : "Ask customer"}</button>}
          </div>
          <div style={{ ...card, padding: "6px 14px" }}><PreWorkView value={job.preWork} /></div>

          {/* Arrival — verify customer & AC */}
          {job.status === "Arrived" && (
            <div className="fade-up" style={{ ...card, padding: 14, marginTop: 12, border: "1.5px solid var(--teal)" }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Arrived {job.arrivedAt ? `at ${fmtDateTime(job.arrivedAt).split(", ")[1]}` : ""}</p>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={job.customerVerified} onChange={(e) => updateJob(job.id, { customerVerified: e.target.checked })} style={{ width: 20, height: 20, marginTop: 1 }} />
                <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>I have verified the customer and the AC (brand, capacity{ac.serial ? `, serial ${ac.serial}` : ""}) and reviewed the previous history.</span>
              </label>
            </div>
          )}

          {/* Diagnosis */}
          {step >= stepOf("Diagnosis") && job.status !== "Cancelled" && (
            <>
              <h3 style={sectionTitle}>Diagnosis</h3>
              {editingEstimate ? <DiagnosisForm d={job.diagnosis} set={setDiag} /> : <DiagnosisView d={job.diagnosis} />}
            </>
          )}

          {/* Estimate */}
          {step >= stepOf("Diagnosis") && job.status !== "Cancelled" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={sectionTitle}>{job.invoice ? `Invoice ${job.invoice.no}` : job.quote && !editingEstimate ? `Quotation ${job.quote.no}` : "Estimate"}</h3>
                {editingEstimate ? <span style={{ display: "flex", gap: 12 }}><button onClick={() => setSheet("pipe")} style={linkBtn}>📐 Pipe calc</button><button onClick={() => setSheet("add")} style={linkBtn}><PlusIcon s={14} c="var(--blue)" /> Add item</button></span> : <SecureBadge />}
              </div>
              <div style={{ ...card, padding: "4px 14px" }}><QuoteTable job={job} db={db} onRemove={editingEstimate ? removeLine : undefined} /></div>
              {editingEstimate && job.lines.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Discount (₹)</span>
                  <input inputMode="numeric" value={job.discount || ""} placeholder="0" onChange={(e) => updateJob(job.id, { discount: Math.min(t.subtotal, Number(e.target.value.replace(/\D/g, "")) || 0) })} style={{ ...field, width: 120, padding: "9px 12px" }} />
                </div>
              )}
              {editingEstimate && <Recommendations db={db} job={job} onAdd={(l) => { addLines([l]); flash(`${l.name} added to estimate`); }} />}
              {job.invoice && <button onClick={() => setSheet("invoice")} style={{ ...linkBtn, margin: "10px auto 0" }}>View / print invoice</button>}
            </>
          )}

          {/* Waiting for approval */}
          {quotePending && (
            <div className="fade-up" style={{ ...card, padding: 14, marginTop: 12, background: "var(--gold-tint)", boxShadow: "none", border: "1.5px solid var(--gold)" }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--gold-dark)" }}>Waiting for customer approval · {inr(t.total)}</p>
              <p style={{ ...small }}>Sent {fmtDateTime(job.quote!.at)}. {c.name.split(" ")[0]} can approve in the Pushpak app, or approve here on-site with an OTP.</p>
              <button onClick={() => { updateJob(job.id, { quote: { ...job.quote!, status: "Draft" } }); setStatus(job.id, "Diagnosis", by, "Revising estimate"); }} style={{ ...linkBtn, marginTop: 8 }}>Revise estimate</button>
            </div>
          )}
          {quoteRejected && (
            <div className="fade-up" style={{ ...card, padding: 14, marginTop: 12, background: "var(--error)", boxShadow: "none" }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--error-text)" }}>Customer rejected the quotation</p>
              <p style={small}>Revise it, or close the visit with only the inspection charge.</p>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <GhostButton onClick={() => { updateJob(job.id, { quote: { ...job.quote!, status: "Draft" } }); setStatus(job.id, "Diagnosis", by, "Revising rejected estimate"); }} style={{ flex: 1, padding: 10 }}>Revise</GhostButton>
                <GhostButton danger onClick={() => { visitChargeOnly(job.id, by); flash("Closed with visit charge"); }} style={{ flex: 1, padding: 10 }}>Visit charge only</GhostButton>
              </div>
            </div>
          )}

          {/* Work performed */}
          {step >= stepOf("Work Started") && job.status !== "Cancelled" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={sectionTitle}>Work performed</h3>
                {job.status === "Work Started" && <button onClick={() => setSheet("addon")} style={linkBtn}><PlusIcon s={14} c="var(--blue)" /> Extra work</button>}
              </div>
              {job.status === "Work Started"
                ? <WorkForm job={job} />
                : (
                  <div style={{ ...card, padding: 14, fontSize: 13, lineHeight: 1.6 }}>
                    {job.work.serviceType && <p style={{ margin: 0 }}><b>Type:</b> {job.work.serviceType}</p>}
                    {job.work.before && <p style={{ margin: 0 }}><b>Before:</b> {job.work.before}</p>}
                    {job.work.after && <p style={{ margin: 0 }}><b>After:</b> {job.work.after}</p>}
                    {job.work.remarks && <p style={{ margin: 0 }}><b>Remarks:</b> {job.work.remarks}</p>}
                  </div>
                )}
            </>
          )}

          {/* Closed: follow-up */}
          {(job.status === "Closed" || job.status === "Invoiced") && (
            <div style={{ ...card, padding: 14, marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Follow-up</p>
              <p style={small}>{job.followUp ? `${relDay(job.followUp.date)} — ${job.followUp.note}` : "No follow-up scheduled."}</p>
              <button onClick={() => setSheet("followup")} style={{ ...linkBtn, marginTop: 6 }}>{job.followUp ? "Change follow-up" : "Schedule follow-up"}</button>
            </div>
          )}

          <h3 style={sectionTitle}>Job timeline</h3>
          <div style={{ ...card, padding: 14 }}><Timeline job={job} /></div>
        </div>

        {/* Main action for the current status */}
        {!closedish && (
          <Footer>
            {job.status === "Assigned" && (
              <div style={{ display: "flex", gap: 10 }}>
                <GhostButton onClick={() => setSheet("decline")} style={{ flex: 1 }}>Decline</GhostButton>
                <PrimaryButton onClick={() => move("Accepted", "Job accepted")} style={{ flex: 2 }}>Accept Job</PrimaryButton>
              </div>
            )}
            {job.status === "Accepted" && <PrimaryButton onClick={() => move("On the Way", "Customer notified you're on the way")}>Start Travel · On the Way</PrimaryButton>}
            {job.status === "On the Way" && <PrimaryButton onClick={() => move("Arrived", "Arrival time recorded")}>I&apos;ve Arrived</PrimaryButton>}
            {job.status === "Arrived" && <PrimaryButton disabled={!job.customerVerified} onClick={() => move("Diagnosis", "Diagnosis started")}>Start Diagnosis</PrimaryButton>}
            {editingEstimate && (
              <>
                {!canQuote && <p style={{ margin: "0 0 8px", textAlign: "center", fontSize: 12, color: "var(--ink-mute)" }}>Pick a root cause and add at least one item to send the quotation.</p>}
                <PrimaryButton tone="gold" disabled={!canQuote} onClick={() => { sendQuote(job.id, by); flash("Quotation sent to customer"); }}>Send Quotation · {inr(t.total)}</PrimaryButton>
              </>
            )}
            {quotePending && <PrimaryButton tone="green" onClick={() => setSheet("approve")}>Approve on-site (OTP)</PrimaryButton>}
            {job.status === "Approved" && <PrimaryButton onClick={() => move("Work Started", "Work started")}>Start Work</PrimaryButton>}
            {job.status === "Work Started" && (
              <PrimaryButton tone="gold" disabled={!job.work.remarks.trim()} onClick={() => { completeWork(job.id, by); flash("Work completed · invoice generated"); }}>Complete Work &amp; Generate Invoice</PrimaryButton>
            )}
            {job.status === "Invoiced" && t.due > 0 && <PrimaryButton tone="gold" onClick={() => setSheet("pay")}>Collect Payment · {inr(t.due)}</PrimaryButton>}
          </Footer>
        )}

        {sheet === "decline" && <DeclineSheet onClose={() => setSheet(null)} onConfirm={(r) => { setSheet(null); declineJob(job.id, r); flash("Declined — sent back to coordinator"); onBack(); }} />}
        {sheet === "prework" && <PreWorkSheet initial={job.preWork} onClose={() => setSheet(null)} onSave={(p) => { updateJob(job.id, { preWork: p }); setSheet(null); flash("History saved"); }} />}
        {sheet === "pipe" && <PipeCalcSheet db={db} onClose={() => setSheet(null)} onAdd={(ls) => { addLines(ls); setSheet(null); flash("Copper pipe added to estimate"); }} />}
      {sheet === "add" && <AddItemSheet db={db} tech={tech} onClose={() => setSheet(null)} onAdd={(l) => { addLines([l]); flash(`${l.name} added`); }} />}
        {sheet === "addon" && <AddItemSheet db={db} tech={tech} title="Additional work (needs approval)" onClose={() => setSheet(null)} onAdd={(l) => { setSheet(null); addOnWork(job.id, [l], by); flash("Revised quotation sent for approval"); }} />}
        {sheet === "approve" && <OtpApproveSheet phone={c.phone} total={t.total} onClose={() => setSheet(null)} onApproved={() => { setSheet(null); decideQuote(job.id, true, "OTP", c.name); flash("Approved by customer"); }} />}
        {sheet === "pay" && <CollectSheet due={t.due} onClose={() => setSheet(null)} onConfirm={(amt, m, ref) => { setSheet(null); recordPayment(job.id, amt, m, ref, by); flash(amt >= t.due ? "Paid in full · job closed" : `${inr(amt)} recorded · ${inr(t.due - amt)} due`); }} />}
        {sheet === "followup" && <FollowUpSheet onClose={() => setSheet(null)} onSave={(d, n) => { setSheet(null); setFollowUp(job.id, d, n, by); flash("Follow-up scheduled"); }} />}
        {sheet === "invoice" && <BottomSheet title="Invoice" onClose={() => setSheet(null)}><InvoiceDoc job={job} db={db} kind="invoice" /><PrimaryButton onClick={() => window.print()} style={{ marginTop: 12 }}>Print / Share PDF</PrimaryButton></BottomSheet>}
      </div>
    </SecureScreen>
  );
}

const linkBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "var(--blue)", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, marginTop: 10, padding: 0 };

const actionLink = (bg: string, fg: string): React.CSSProperties => ({
  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 10, borderRadius: 12,
  background: bg, color: fg, fontSize: 12.5, fontWeight: 600, textDecoration: "none",
});

/* ───────────────────────── Diagnosis ───────────────────────── */

function DiagnosisForm({ d, set }: { d: Diagnosis; set: (p: Partial<Diagnosis>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const inp = { ...field, padding: "11px 12px" };
  const box: React.CSSProperties = { marginBottom: 12 };
  return (
    <div style={{ ...card, padding: 14 }}>
      <label style={{ display: "block", ...box }}><span style={label}>What you observed</span>
        <textarea rows={2} value={d.observed} onChange={(e) => set({ observed: e.target.value })} placeholder="Separate from the customer's complaint — what you actually see" style={{ ...inp, resize: "none" }} /></label>
      <div style={box}><span style={label}>Root cause</span><Chips options={ROOT_CAUSES} value={d.rootCause as (typeof ROOT_CAUSES)[number]} onChange={(v) => set({ rootCause: v })} /></div>
      <div style={box}><span style={label}>Gas status</span><Chips options={["Normal", "Low", "Empty", "Overcharged", "Not checked"] as const} value={d.gasStatus as "Normal"} onChange={(v) => set({ gasStatus: v })} /></div>
      <span style={label}>Readings</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, ...box }}>
        {([["voltage", "Voltage (V)"], ["ampere", "Current (A)"], ["suctionPsi", "Suction (psi)"], ["ventTempC", "Vent temp (°C)"], ["errorCode", "Error code"]] as const).map(([k, l]) => (
          <label key={k}><span style={{ fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 600 }}>{l}</span>
            <input value={d[k]} onChange={(e) => set({ [k]: k === "errorCode" ? e.target.value.toUpperCase().slice(0, 6) : e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} inputMode={k === "errorCode" ? "text" : "decimal"} style={inp} /></label>
        ))}
      </div>
      <div className="form-grid" style={box}>
        <label><span style={label}>Indoor unit</span><input value={d.indoorObs} onChange={(e) => set({ indoorObs: e.target.value })} placeholder="Coil, filter, fan, PCB…" style={inp} /></label>
        <label><span style={label}>Outdoor unit</span><input value={d.outdoorObs} onChange={(e) => set({ outdoorObs: e.target.value })} placeholder="Compressor, capacitor, fan…" style={inp} /></label>
      </div>
      <label style={{ display: "block", ...box }}><span style={label}>Diagnosis notes</span>
        <textarea rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} style={{ ...inp, resize: "none" }} /></label>
      <label style={{ display: "block", ...box }}><span style={label}>Recommended repair / action</span>
        <input value={d.recommendation} onChange={(e) => set({ recommendation: e.target.value })} placeholder="Shown to the customer with the quotation" style={inp} /></label>
      <span style={label}>Photos / videos</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {thumbs.map((u) => <img key={u} src={u} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: "cover" }} />)}
        {Array.from({ length: Math.max(0, d.photos - thumbs.length) }).map((_, i) => <span key={i} style={{ width: 60, height: 60, borderRadius: 10, background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--ink-mute)" }}>Saved</span>)}
        <button onClick={() => fileRef.current?.click()} style={{ width: 60, height: 60, borderRadius: 10, border: "1.5px dashed var(--line-strong)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} aria-label="Add photo"><CameraIcon s={22} c="var(--blue)" /></button>
        <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.type.startsWith("image/")) setThumbs((t) => [...t, URL.createObjectURL(f)]);
          set({ photos: d.photos + 1 });
          e.target.value = "";
        }} />
      </div>
      <p style={{ ...small, fontSize: 11 }}>Demo: photos stay on this device. They&apos;ll upload to storage with the backend.</p>
    </div>
  );
}

function DiagnosisView({ d }: { d: Diagnosis }) {
  const rows: [string, string][] = ([
    ["Observed", d.observed], ["Root cause", d.rootCause], ["Gas", d.gasStatus + (d.suctionPsi ? ` · ${d.suctionPsi} psi` : "")],
    ["Voltage / current", [d.voltage && `${d.voltage} V`, d.ampere && `${d.ampere} A`].filter(Boolean).join(" · ")], ["Vent temp", d.ventTempC && `${d.ventTempC} °C`],
    ["Error code", d.errorCode], ["Indoor", d.indoorObs], ["Outdoor", d.outdoorObs], ["Notes", d.notes], ["Recommendation", d.recommendation],
    ["Photos", d.photos ? String(d.photos) : ""],
  ] as [string, string][]).filter(([, v]) => v);
  return (
    <div style={{ ...card, padding: "4px 14px" }}>
      {rows.map(([k, v], i) => (
        <div key={k} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--line)" : "none", fontSize: 13 }}>
          <span style={{ width: 110, flexShrink: 0, color: "var(--ink-soft)" }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
        </div>
      ))}
      {rows.length === 0 && <p style={{ ...small, padding: "10px 0" }}>Not recorded.</p>}
    </div>
  );
}

/* ───────────────────────── Recommendations (PRD §7) ───────────────────────── */

function Recommendations({ db, job, onAdd }: { db: Db; job: Job; onAdd: (l: QuoteLine) => void }) {
  const recs = recommend(db, job);
  if (!recs.length) return null;
  return (
    <>
      <h3 style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: 6 }}><SparkIcon s={16} c="var(--gold-dark)" /> Recommended for this AC</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {recs.map((r) => (
          <div key={r.id} style={{ ...card, padding: 12, borderLeft: "4px solid var(--gold)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{r.title}</p>
              <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{r.price ? inr(r.price) : "Lead"}</span>
            </div>
            <p style={{ ...small, fontSize: 12 }}>{r.reason}</p>
            {r.kind !== "Lead" && r.kind !== "AMC" ? (
              <button onClick={() => onAdd({ id: lid(), kind: r.kind as LineKind, name: r.title, qty: 1, price: r.price, refId: r.refId, upsell: true })} style={{ ...linkBtn, marginTop: 6 }}><PlusIcon s={13} c="var(--blue)" /> Add to quotation</button>
            ) : (
              <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--ink-mute)", fontWeight: 600 }}>{r.kind === "AMC" ? "Mention to the customer — office will follow up on AMC." : "Logged as a replacement lead for the office."}</p>
            )}
          </div>
        ))}
      </div>
      <p style={{ ...small, fontSize: 11, marginTop: 6 }}>Suggestions only — the customer approves anything chargeable.</p>
    </>
  );
}

/* ───────────────────────── Work form ───────────────────────── */

const WORK_TYPES = ["Service", "Repair", "Gas charging", "Part replacement", "Installation", "AMC service", "Inspection only"] as const;

function WorkForm({ job }: { job: Job }) {
  const set = (p: Partial<Job["work"]>) => updateJob(job.id, { work: { ...job.work, ...p } });
  const inp = { ...field, padding: "11px 12px", resize: "none" as const };
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ marginBottom: 12 }}><span style={label}>Service / repair type</span><Chips options={WORK_TYPES} value={job.work.serviceType as (typeof WORK_TYPES)[number]} onChange={(v) => set({ serviceType: v })} /></div>
      <label style={{ display: "block", marginBottom: 12 }}><span style={label}>Before (condition)</span><textarea rows={2} value={job.work.before} onChange={(e) => set({ before: e.target.value })} placeholder="e.g. Vent temp 22°C, coil choked" style={inp} /></label>
      <label style={{ display: "block", marginBottom: 12 }}><span style={label}>After (result)</span><textarea rows={2} value={job.work.after} onChange={(e) => set({ after: e.target.value })} placeholder="e.g. Vent temp 11°C, running 30 min OK" style={inp} /></label>
      <label style={{ display: "block" }}><span style={label}>Completion remarks *</span><textarea rows={2} value={job.work.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="What you did — goes on the AC's permanent history" style={inp} /></label>
    </div>
  );
}

/* ───────────────────────── Sheets ───────────────────────── */

const DECLINE_REASONS = ["Outside my area", "Don't have the required part", "Not skilled for this AC type", "Already on another job", "Personal emergency"] as const;

function DeclineSheet({ onClose, onConfirm }: { onClose: () => void; onConfirm: (r: string) => void }) {
  const [r, setR] = useState("");
  return (
    <BottomSheet title="Decline job" onClose={onClose}>
      <Chips options={DECLINE_REASONS} value={r as (typeof DECLINE_REASONS)[number]} onChange={setR} />
      <p style={{ ...small, margin: "12px 4px" }}>The coordinator will reassign this job.</p>
      <PrimaryButton disabled={!r} onClick={() => onConfirm(r)}>Decline job</PrimaryButton>
    </BottomSheet>
  );
}

function PreWorkSheet({ initial, onClose, onSave }: { initial: PreWork; onClose: () => void; onSave: (p: PreWork) => void }) {
  const [p, setP] = useState(initial);
  return (
    <BottomSheet title="Ask the customer" onClose={onClose}>
      <PreWorkForm value={p} onChange={setP} />
      <PrimaryButton onClick={() => onSave(p)} style={{ marginTop: 16 }}>Save answers</PrimaryButton>
    </BottomSheet>
  );
}

function AddItemSheet({ db, tech, title = "Add to estimate", onClose, onAdd }: { db: Db; tech: Technician; title?: string; onClose: () => void; onAdd: (l: QuoteLine) => void }) {
  const [tab, setTab] = useState<"svc" | "part" | "custom">("svc");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"Labour" | "Material">("Labour");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const n = q.trim().toLowerCase();
  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: "1px solid var(--line)" };
  const addBtn: React.CSSProperties = { border: "none", borderRadius: 9, background: "var(--blue-tint)", color: "var(--blue)", fontWeight: 700, fontSize: 12.5, padding: "7px 12px", cursor: "pointer" };
  return (
    <BottomSheet title={title} onClose={onClose}>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "svc", label: "Services" }, { id: "part", label: "Parts" }, { id: "custom", label: "Labour / other" }]} />
      {tab !== "custom" && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" style={{ ...field, marginTop: 10, padding: "10px 12px" }} />}
      {tab === "svc" && (
        <div style={{ ...card, padding: "0 14px", marginTop: 10 }}>
          {db.services.filter((s) => s.active && (!n || s.name.toLowerCase().includes(n))).map((s, i) => (
            <div key={s.id} style={{ ...row, borderTop: i ? row.borderTop : "none" }}>
              <div style={{ flex: 1 }}><p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{s.name}</p><p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-soft)" }}>{s.category} · {inr(s.price)}</p></div>
              <button onClick={() => onAdd({ id: lid(), kind: "Service", name: s.name, qty: 1, price: s.price, refId: s.id })} style={addBtn}>Add</button>
            </div>
          ))}
        </div>
      )}
      {tab === "part" && (
        <div style={{ ...card, padding: "0 14px", marginTop: 10 }}>
          {db.parts.filter((p) => !n || `${p.name} ${p.sku}`.toLowerCase().includes(n)).sort((a, b) => (tech.van[b.id] ?? 0) - (tech.van[a.id] ?? 0)).map((p, i) => {
            const van = tech.van[p.id] ?? 0;
            return (
              <div key={p.id} style={{ ...row, borderTop: i ? row.borderTop : "none" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{p.name}</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: van ? "var(--success-text)" : p.stock ? "var(--ink-soft)" : "var(--error-text)" }}>{inr(p.price)}/{p.unit} · {van ? `${van} in your van` : p.stock ? `${p.stock} in warehouse` : "Out of stock"}</p>
                </div>
                <button disabled={!van && !p.stock} onClick={() => onAdd({ id: lid(), kind: "Part", name: p.name, qty: 1, price: p.price, refId: p.id })} style={{ ...addBtn, opacity: van || p.stock ? 1 : 0.4 }}>Add</button>
              </div>
            );
          })}
        </div>
      )}
      {tab === "custom" && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <Chips options={["Labour", "Material"] as const} value={kind} onChange={setKind} />
          <label><span style={label}>Description</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "Labour" ? "e.g. Outdoor unit shifting labour" : "e.g. Wall bracket, extra wiring"} style={field} /></label>
          <label><span style={label}>Amount (₹)</span><input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 6))} style={field} /></label>
          <PrimaryButton disabled={!name.trim() || !Number(price)} onClick={() => { onAdd({ id: lid(), kind, name: name.trim(), qty: 1, price: Number(price) }); setName(""); setPrice(""); }}>Add {kind.toLowerCase()} charge</PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}

function OtpApproveSheet({ phone, total, onClose, onApproved }: { phone: string; total: number; onClose: () => void; onApproved: () => void }) {
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState(false);
  return (
    <BottomSheet title="Customer approval" onClose={onClose}>
      <div style={{ ...card, padding: 14, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Quotation total</p>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{inr(total)}</p>
      </div>
      {!sent ? (
        <>
          <p style={{ ...small, margin: "12px 4px" }}>An OTP will be sent to the customer&apos;s mobile +91 {phone.slice(0, 2)}xxxxxx{phone.slice(-2)}. Ask them to read it out once they agree.</p>
          <PrimaryButton onClick={() => setSent(true)}>Send OTP to customer</PrimaryButton>
        </>
      ) : (
        <>
          <input value={otp} onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(false); }} inputMode="numeric" aria-label="Customer OTP" placeholder="• • • •"
            style={{ ...field, marginTop: 14, textAlign: "center", fontSize: 24, fontWeight: 800, letterSpacing: "0.5em", ...(err ? { borderColor: "var(--error-text)" } : {}) }} />
          <p style={{ margin: "6px 4px 12px", fontSize: 11.5, color: err ? "var(--error-text)" : "var(--ink-mute)" }}>{err ? "Wrong OTP." : `Demo OTP: ${DEMO_OTP}`}</p>
          <PrimaryButton tone="green" disabled={otp.length !== 4} onClick={() => (otp === DEMO_OTP ? onApproved() : setErr(true))}>Verify &amp; record approval</PrimaryButton>
        </>
      )}
    </BottomSheet>
  );
}

function CollectSheet({ due, onClose, onConfirm }: { due: number; onClose: () => void; onConfirm: (amt: number, m: PayMethod, ref: string) => void }) {
  const [m, setM] = useState<PayMethod>("UPI");
  const [amt, setAmt] = useState(String(due));
  const [ref, setRef] = useState("");
  const n = Number(amt) || 0;
  const needRef = m !== "Cash";
  return (
    <BottomSheet title="Collect payment" onClose={onClose}>
      <div style={{ ...card, padding: 14, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Balance due</p>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{inr(due)}</p>
      </div>
      <div style={{ marginTop: 12 }}><Chips options={["UPI", "Cash", "Card"] as const} value={m as "UPI"} onChange={setM} /></div>
      <label style={{ display: "block", marginTop: 12 }}><span style={label}>Amount received</span><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, "").slice(0, 7))} style={field} /></label>
      {needRef && <label style={{ display: "block", marginTop: 12 }}><span style={label}>Transaction / UTR reference</span><input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="e.g. 4123 5678 9012" style={field} /></label>}
      <p style={{ ...small, margin: "10px 4px 14px" }}>{n < due && n > 0 ? `Partial payment — ${inr(due - n)} will stay due.` : m === "UPI" ? "Show the Pushpak QR. Confirm only after the payment succeeds." : m === "Cash" ? "Cash is deposited at the office at the end of the day." : ""}</p>
      <PrimaryButton tone="gold" disabled={n <= 0 || n > due || (needRef && ref.trim().length < 4)} onClick={() => onConfirm(n, m, ref.trim())}>Record {inr(n)} · {m}</PrimaryButton>
    </BottomSheet>
  );
}

function FollowUpSheet({ onClose, onSave }: { onClose: () => void; onSave: (d: string, note: string) => void }) {
  const opts = [["1 week", 7], ["1 month", 30], ["3 months", 90], ["6 months", 180]] as const;
  const [days, setDays] = useState(30);
  const [note, setNote] = useState("Check cooling after repair");
  return (
    <BottomSheet title="Schedule follow-up" onClose={onClose}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {opts.map(([l, d]) => (
          <button key={l} onClick={() => setDays(d)} aria-pressed={days === d} style={{ flex: 1, padding: 10, borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 700, border: days === d ? "1.5px solid var(--blue)" : "1.5px solid var(--line)", background: days === d ? "var(--blue-tint)" : "var(--surface)", color: days === d ? "var(--blue)" : "var(--text-secondary)" }}>{l}</button>
        ))}
      </div>
      <p style={{ ...small, margin: "8px 4px" }}><ClockIcon s={12} c="var(--ink-soft)" /> {relDay(isoDay(days))}</p>
      <label><span style={label}>Note</span><input value={note} onChange={(e) => setNote(e.target.value)} style={field} /></label>
      <PrimaryButton disabled={!note.trim()} onClick={() => onSave(isoDay(days), note.trim())} style={{ marginTop: 14 }}>Save follow-up</PrimaryButton>
    </BottomSheet>
  );
}
