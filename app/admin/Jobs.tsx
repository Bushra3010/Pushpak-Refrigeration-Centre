"use client";

import { useMemo, useState } from "react";
import { AcHistory, AcSpecs, ComplaintBox, JOB_TONE, PAY_TONE, PreWorkForm, PreWorkView, QuoteTable, Timeline } from "../components/service";
import { Chips } from "../components/ui";
import {
  COMPLAINTS, EMPTY_PREWORK, SLOTS, acLabel, acSummary, fmtDate, fmtDateTime, inr, isOpen, isoDay, jobTotals, paymentStatus, relDay, today,
  type ComplaintIssue, type Db, type Job, type PayMethod, type PreWork, siteOf,
} from "../lib/data";
import {
  addJobNote, assignJob, cancelJob, closeJob, createJob, decideQuote, recordPayment, refundPayment, rescheduleJob, setPriority,
} from "../lib/store";
import { Badge, Btn, Filter, Initials, Modal, Panel, SearchBox, Table, fieldLabel, input, muted } from "./kit";
import { JobFinance } from "./JobFinance";

export const custName = (db: Db, id: string) => db.customers.find((c) => c.id === id)?.name ?? id;
export const techName = (db: Db, id: string | null) => (id ? db.techs.find((t) => t.id === id)?.name ?? id : "—");

type JobFilter = "All" | "Unassigned" | "Assigned" | "In Progress" | "Awaiting Approval" | "Billing" | "Closed" | "Cancelled";
const bucket = (j: Job): JobFilter =>
  j.status === "New Request" ? "Unassigned"
    : j.status === "Assigned" || j.status === "Accepted" ? "Assigned"
      : j.status === "Estimate Prepared" ? "Awaiting Approval"
        : j.status === "Invoiced" || j.status === "Work Completed" ? "Billing"
          : j.status === "Closed" ? "Closed" : j.status === "Cancelled" ? "Cancelled" : "In Progress";

/** SLA: a request should be assigned within 2h and attended on the scheduled day. */
export const overdue = (j: Job) => (j.status === "New Request" && j.date <= today()) || (isOpen(j) && j.date < today());

export function JobsSection({ db, who, openJobId, setOpenJobId, notify }: { db: Db; who: string; openJobId: string | null; setOpenJobId: (id: string | null) => void; notify: (m: string) => void }) {
  const [f, setF] = useState<JobFilter>("All");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"List" | "Calendar" | "By area">("List");
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return db.jobs.filter((j) => (f === "All" || bucket(j) === f) &&
      (!n || `${j.id} ${custName(db, j.customerId)} ${db.customers.find((c) => c.id === j.customerId)?.phone} ${j.complaint.issues.join(" ")} ${techName(db, j.techId)}`.toLowerCase().includes(n)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [db, f, q]);

  const opts: JobFilter[] = ["All", "Unassigned", "Assigned", "In Progress", "Awaiting Approval", "Billing", "Closed", "Cancelled"];
  const counts = Object.fromEntries(opts.map((o) => [o, o === "All" ? db.jobs.length : db.jobs.filter((j) => bucket(j) === o).length]));
  const job = openJobId ? db.jobs.find((j) => j.id === openJobId) : undefined;

  return (
    <>
      <Panel title="Service requests & jobs" pad={false} actions={<>
        <SearchBox value={q} onChange={setQ} placeholder="Job, customer, mobile, technician" />
        <Filter options={["List", "Calendar", "By area"] as const} value={view} onChange={setView} />
        <Btn kind="gold" onClick={() => setCreating(true)}>+ New request</Btn>
      </>}>
        <div style={{ padding: "12px 16px" }}><Filter<JobFilter> options={opts} value={f} onChange={setF} counts={counts} /></div>
        {view === "List" && (
          <Table rows={rows} rowKey={(j) => j.id} empty="No jobs match." cols={[
            { key: "id", head: "Job", render: (j) => <button onClick={() => setOpenJobId(j.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}><b style={{ color: "var(--blue)" }}>{j.id}</b><div style={muted}>{j.source}</div></button> },
            { key: "c", head: "Customer / AC", render: (j) => { const ac = db.acs.find((a) => a.id === j.acId); return <>{custName(db, j.customerId)}<div style={muted}>{ac ? `${ac.application} · ${acLabel(ac)}` : ""}</div></>; } },
            { key: "p", head: "Complaint", render: (j) => <span style={{ fontSize: 12.5 }}>{j.complaint.issues.join(", ")}</span> },
            { key: "d", head: "Scheduled", render: (j) => <>{relDay(j.date)}<div style={muted}>{j.slot}</div></> },
            { key: "t", head: "Technician", render: (j) => j.techId ? techName(db, j.techId) : <Badge tone="red">Unassigned</Badge> },
            { key: "s", head: "Status", render: (j) => <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}><Badge tone={JOB_TONE[j.status]}>{j.status}</Badge>{j.priority !== "Normal" && <Badge tone={j.priority === "Urgent" ? "red" : "amber"}>{j.priority}</Badge>}{overdue(j) && <Badge tone="red">Overdue</Badge>}</div> },
            { key: "a", head: "Amount", align: "right", render: (j) => j.lines.length ? <>{inr(jobTotals(j, db.settings).total)}{j.invoice && <div><Badge tone={PAY_TONE[paymentStatus(j, db.settings)]}>{paymentStatus(j, db.settings)}</Badge></div>}</> : <span style={muted}>—</span> },
            { key: "x", head: "", align: "right", render: (j) => <Btn small kind={j.status === "New Request" ? "primary" : "ghost"} onClick={() => setOpenJobId(j.id)}>{j.status === "New Request" ? "Assign" : "Open"}</Btn> },
          ]} />
        )}
        {view === "Calendar" && <CalendarView db={db} rows={rows} onOpen={setOpenJobId} />}
        {view === "By area" && <AreaView db={db} rows={rows.filter(isOpen)} onOpen={setOpenJobId} />}
      </Panel>

      {job && <JobDrawer db={db} job={job} who={who} onClose={() => setOpenJobId(null)} notify={notify} />}
      {creating && <NewJobModal db={db} who={who} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenJobId(id); notify(`${id} created`); }} />}
    </>
  );
}

function CalendarView({ db, rows, onOpen }: { db: Db; rows: Job[]; onOpen: (id: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => isoDay(i - 1));
  return (
    <div className="no-scroll" style={{ overflowX: "auto", padding: "0 16px 16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(150px, 1fr))", gap: 8, minWidth: 1050 }}>
        {days.map((d) => (
          <div key={d} style={{ background: d === today() ? "var(--blue-tint)" : "var(--bg-secondary)", borderRadius: 12, padding: 8, minHeight: 220 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700 }}>{relDay(d)}</p>
            {rows.filter((j) => j.date === d && j.status !== "Cancelled").sort((a, b) => a.slot.localeCompare(b.slot)).map((j) => (
              <button key={j.id} onClick={() => onOpen(j.id)} style={{ width: "100%", textAlign: "left", border: "1px solid var(--line)", borderLeft: `3px solid ${j.techId ? "var(--blue)" : "var(--red)"}`, background: "white", borderRadius: 8, padding: "6px 8px", marginBottom: 6, cursor: "pointer" }}>
                <p style={{ margin: 0, fontSize: 11, color: "var(--ink-mute)" }}>{j.slot.split(" –")[0]} · {j.id}</p>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>{custName(db, j.customerId)}</p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--ink-soft)" }}>{j.techId ? techName(db, j.techId) : "Unassigned"} · {j.status}</p>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function AreaView({ db, rows, onOpen }: { db: Db; rows: Job[]; onOpen: (id: string) => void }) {
  const areas = [...new Set(rows.map((j) => db.customers.find((c) => c.id === j.customerId)?.area ?? "Other"))];
  return (
    <div style={{ padding: "0 16px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
      {areas.map((a) => {
        const js = rows.filter((j) => db.customers.find((c) => c.id === j.customerId)?.area === a);
        const covering = db.techs.filter((t) => t.active && t.area.includes(a));
        return (
          <div key={a} style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: 10 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800 }}>📍 {a} <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}>· {js.length} open</span></p>
            <p style={{ ...muted, margin: "0 0 6px" }}>Covered by: {covering.map((t) => t.name.split(" ")[0]).join(", ") || "no technician"}</p>
            {js.map((j) => (
              <button key={j.id} onClick={() => onOpen(j.id)} style={{ width: "100%", textAlign: "left", border: "1px solid var(--line)", background: "white", borderRadius: 8, padding: "6px 8px", marginBottom: 6, cursor: "pointer", fontSize: 12 }}>
                <b>{j.id}</b> · {custName(db, j.customerId)}<div style={muted}>{relDay(j.date)} · {j.techId ? techName(db, j.techId) : "Unassigned"}</div>
              </button>
            ))}
          </div>
        );
      })}
      {areas.length === 0 && <p style={muted}>No open jobs.</p>}
    </div>
  );
}

/* ───────────────────────── Technician ranking for dispatch ───────────────────────── */

export function rankTechs(db: Db, job: Job) {
  const area = db.customers.find((c) => c.id === job.customerId)?.area ?? "";
  const ac = db.acs.find((a) => a.id === job.acId);
  return db.techs.filter((t) => t.active).map((t) => {
    const load = db.jobs.filter((j) => j.techId === t.id && j.date === job.date && isOpen(j)).length;
    const inArea = t.area.toLowerCase().includes(area.toLowerCase());
    const skill = ac ? t.skills.includes(ac.acType) : false;
    const score = (inArea ? 3 : 0) + (skill ? 2 : 0) + (t.availability === "Available" ? 2 : t.availability === "On Job" ? 1 : -3) - load + t.rating / 5;
    return { t, load, inArea, skill, score };
  }).sort((a, b) => b.score - a.score);
}

/* ───────────────────────── Job record ───────────────────────── */

export function JobDrawer({ db, job, who, onClose, notify }: { db: Db; job: Job; who: string; onClose: () => void; notify: (m: string) => void }) {
  const [tab, setTab] = useState<"Overview" | "Diagnosis & quote" | "AC history" | "Timeline" | "Team, time & profit">("Overview");
  const [modal, setModal] = useState<"cancel" | "reschedule" | "pay" | "refund" | null>(null);
  const [note, setNote] = useState("");
  const c = db.customers.find((x) => x.id === job.customerId)!;
  const ac = db.acs.find((x) => x.id === job.acId)!;
  const t = jobTotals(job, db.settings);
  const ranked = rankTechs(db, job);
  const canAssign = isOpen(job);
  const sec: React.CSSProperties = { margin: "16px 0 8px", fontSize: 13, fontWeight: 800, color: "var(--ink)" };

  return (
    <Modal width={860} title={`${job.id} · ${c.name}`} onClose={onClose} footer={<>
      {isOpen(job) && <Btn kind="danger" onClick={() => setModal("cancel")}>Cancel job</Btn>}
      {isOpen(job) && <Btn kind="ghost" onClick={() => setModal("reschedule")}>Reschedule</Btn>}
      {job.invoice && t.due > 0 && <Btn kind="gold" onClick={() => setModal("pay")}>Record payment</Btn>}
      {t.paid > 0 && <Btn kind="ghost" onClick={() => setModal("refund")}>Refund</Btn>}
      {job.status === "Invoiced" && t.due > 0 && <Btn kind="ghost" onClick={() => { closeJob(job.id, who, `Closed with ${inr(t.due)} written off`); notify(`${job.id} closed`); }}>Close (write off due)</Btn>}
      <Btn onClick={onClose}>Done</Btn>
    </>}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Badge tone={JOB_TONE[job.status]}>{job.status}</Badge>
        {job.invoice && <Badge tone={PAY_TONE[paymentStatus(job, db.settings)]}>{paymentStatus(job, db.settings)}</Badge>}
        {overdue(job) && <Badge tone="red">Overdue</Badge>}
        <span style={muted}>{job.source} · created {fmtDateTime(job.createdAt)} · scheduled {fmtDate(job.date)}, {job.slot}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={muted}>Priority</span>
          <select value={job.priority} onChange={(e) => { setPriority(job.id, e.target.value as Job["priority"], who); notify(`Priority → ${e.target.value}`); }} style={{ ...input, width: "auto", padding: "5px 8px" }}>
            {(["Normal", "High", "Urgent"] as const).map((p) => <option key={p}>{p}</option>)}
          </select>
        </span>
      </div>
      <Filter options={["Overview", "Diagnosis & quote", "AC history", "Timeline", "Team, time & profit"] as const} value={tab} onChange={setTab} />

      {tab === "Overview" && (
        <div className="admin-grid-2" style={{ marginTop: 14 }}>
          <div>
            <p style={{ ...sec, marginTop: 0 }}>Customer</p>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}><b>{c.name}</b> · +91 {c.phone}{c.altPhone ? ` / ${c.altPhone}` : ""}<br />{(() => { const st = siteOf(job, c); return <>{st.address}{st.area ? `, ${st.area}` : ""}{st.landmark ? ` · near ${st.landmark}` : ""}{st.gps && <> · <a href={`https://maps.google.com/?q=${st.gps}`} target="_blank" rel="noreferrer">Map</a></>}{(st.address !== c.address || st.contactPhone !== c.phone) && <><br /><span style={{ color: "var(--gold-dark)", fontWeight: 600 }}>Service address for this visit · contact {st.contactName} +91 {st.contactPhone}</span></>}</>; })()}<br /><span style={muted}>{c.type} · prefers {c.contactPref}{c.amc ? ` · AMC ${c.amc.plan} till ${fmtDate(c.amc.to)}` : ""}</span></p>
            <p style={sec}>AC</p>
            <p style={{ margin: 0, fontSize: 13.5 }}><b>{ac.application}</b> · {acLabel(ac)} · {ac.ageYears} yrs · {ac.usage}</p>
            <p style={sec}>Complaint</p>
            <ComplaintBox job={job} />
            <p style={sec}>Pre-work history</p>
            <PreWorkView value={job.preWork} />
          </div>
          <div>
            <p style={{ ...sec, marginTop: 0 }}>Technician {job.techId ? `· ${techName(db, job.techId)}` : ""}</p>
            {canAssign ? (
              <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                {ranked.map(({ t: tech, load, inArea, skill }, i) => (
                  <div key={tech.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i ? "1px solid var(--line)" : "none", background: tech.id === job.techId ? "var(--blue-tint)" : "white" }}>
                    <Initials name={tech.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{tech.name} {i === 0 && tech.id !== job.techId && <Badge tone="green">Best match</Badge>}</p>
                      <p style={{ ...muted, margin: 0 }}>{tech.availability} · {load} job{load === 1 ? "" : "s"} that day · ★{tech.rating}{inArea ? " · covers area" : ""}{skill ? ` · ${ac.acType}` : ""}</p>
                    </div>
                    {tech.id === job.techId ? <Badge tone="blue">Assigned</Badge> : <Btn small onClick={() => { assignJob(job.id, tech.id, who); notify(`${job.id} ${job.techId ? "reassigned" : "assigned"} to ${tech.name}`); }}>{job.techId ? "Reassign" : "Assign"}</Btn>}
                  </div>
                ))}
              </div>
            ) : <p style={muted}>{job.techId ? techName(db, job.techId) : "—"}</p>}

            <p style={sec}>Bill</p>
            {job.lines.length ? (
              <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "2px 12px" }}><QuoteTable job={job} db={db} compact /></div>
            ) : <p style={muted}>No estimate yet.</p>}
            {job.status === "Estimate Prepared" && job.quote?.status === "Pending" && (
              <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={muted}>Customer confirmed on call?</span>
                <Btn small kind="primary" onClick={() => { decideQuote(job.id, true, "OTP", `${who} (phone confirmation)`); notify("Quotation approved"); }}>Mark approved</Btn>
                <Btn small kind="danger" onClick={() => { decideQuote(job.id, false, undefined, `${who} (phone confirmation)`); notify("Quotation rejected"); }}>Rejected</Btn>
              </div>
            )}

            <p style={sec}>Notes &amp; attachments</p>
            {job.notes.map((n, i) => <p key={i} style={{ margin: "0 0 6px", fontSize: 12.5 }}><b>{n.by}:</b> {n.text} <span style={muted}>· {fmtDateTime(n.at)}</span></p>)}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note" style={input} />
              <Btn disabled={!note.trim()} onClick={() => { addJobNote(job.id, note.trim(), who); setNote(""); }}>Add</Btn>
            </div>
            {job.diagnosis.photos > 0 && <p style={{ ...muted, marginTop: 6 }}>📷 {job.diagnosis.photos} photo(s) from technician</p>}
          </div>
        </div>
      )}

      {tab === "Diagnosis & quote" && (
        <div className="admin-grid-2" style={{ marginTop: 14 }}>
          <div>
            <p style={{ ...sec, marginTop: 0 }}>Technician diagnosis</p>
            {job.diagnosis.rootCause ? (
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                {([["Observed", job.diagnosis.observed], ["Root cause", job.diagnosis.rootCause], ["Gas", job.diagnosis.gasStatus], ["Voltage", job.diagnosis.voltage && `${job.diagnosis.voltage} V`], ["Error code", job.diagnosis.errorCode], ["Indoor", job.diagnosis.indoorObs], ["Outdoor", job.diagnosis.outdoorObs], ["Notes", job.diagnosis.notes], ["Recommendation", job.diagnosis.recommendation]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k}><span style={muted}>{k}: </span><b>{v}</b></div>)}
              </div>
            ) : <p style={muted}>Not diagnosed yet.</p>}
            <p style={sec}>Work performed</p>
            {job.work.remarks ? <p style={{ margin: 0, fontSize: 13 }}>{job.work.serviceType && <b>{job.work.serviceType}: </b>}{job.work.remarks}{job.work.before && <><br /><span style={muted}>Before: {job.work.before} · After: {job.work.after}</span></>}</p> : <p style={muted}>—</p>}
          </div>
          <div>
            <p style={{ ...sec, marginTop: 0 }}>Quotation {job.quote ? `${job.quote.no} · rev ${job.quote.revision}` : ""}</p>
            {job.quote && <p style={{ ...muted, margin: "0 0 6px" }}>Status {job.quote.status}{job.quote.approvedVia ? ` via ${job.quote.approvedVia}` : ""}{job.quote.decidedAt ? ` · ${fmtDateTime(job.quote.decidedAt)}` : ""}</p>}
            <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "2px 12px" }}><QuoteTable job={job} db={db} compact /></div>
            <p style={sec}>Payments</p>
            {job.payments.map((p) => <p key={p.id} style={{ margin: "0 0 4px", fontSize: 12.5 }}>{p.refund ? "↩ Refund " : ""}<b>{inr(p.amount)}</b> · {p.method}{p.ref ? ` · ${p.ref}` : ""} · {fmtDateTime(p.at)} · {p.by}</p>)}
            {job.payments.length === 0 && <p style={muted}>No payments.</p>}
          </div>
        </div>
      )}

      {tab === "AC history" && (
        <div className="admin-grid-2" style={{ marginTop: 14 }}>
          <div><AcSpecs ac={ac} /></div>
          <div><AcHistory db={db} ac={ac} excludeJob={job.id} /></div>
        </div>
      )}

      {tab === "Timeline" && <div style={{ marginTop: 14 }}><Timeline job={job} /></div>}
      {tab === "Team, time & profit" && <JobFinance db={db} job={job} who={who} notify={notify} />}

      {modal === "cancel" && <CancelModal onClose={() => setModal(null)} onConfirm={(r) => { cancelJob(job.id, r, who); setModal(null); notify(`${job.id} cancelled`); }} />}
      {modal === "reschedule" && <RescheduleModal job={job} onClose={() => setModal(null)} onConfirm={(d, s, r) => { rescheduleJob(job.id, d, s, r, who); setModal(null); notify(`${job.id} rescheduled`); }} />}
      {modal === "pay" && <PaymentModal due={t.due} onClose={() => setModal(null)} onConfirm={(a, m, r) => { recordPayment(job.id, a, m, r, who); setModal(null); notify(`${inr(a)} recorded`); }} />}
      {modal === "refund" && <RefundModal max={t.paid} onClose={() => setModal(null)} onConfirm={(a, r) => { refundPayment(job.id, a, r, who); setModal(null); notify(`${inr(a)} refunded`); }} />}
    </Modal>
  );
}

function CancelModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (r: string) => void }) {
  const [r, setR] = useState("");
  return (
    <Modal title="Cancel job" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Back</Btn><Btn kind="danger" disabled={r.trim().length < 3} onClick={() => onConfirm(r.trim())}>Cancel job</Btn></>}>
      <label><span style={fieldLabel}>Reason (shared with customer and technician)</span><input value={r} onChange={(e) => setR(e.target.value)} style={input} placeholder="e.g. Customer not reachable" /></label>
    </Modal>
  );
}

function RescheduleModal({ job, onClose, onConfirm }: { job: Job; onClose: () => void; onConfirm: (d: string, s: string, r: string) => void }) {
  const [d, setD] = useState(job.date);
  const [s, setS] = useState(job.slot);
  const [r, setR] = useState("");
  return (
    <Modal title={`Reschedule ${job.id}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Back</Btn><Btn disabled={!r.trim() || (d === job.date && s === job.slot)} onClick={() => onConfirm(d, s, r.trim())}>Reschedule</Btn></>}>
      <div className="form-grid">
        <label><span style={fieldLabel}>Date</span><input type="date" value={d} min={today()} onChange={(e) => setD(e.target.value)} style={input} /></label>
        <label><span style={fieldLabel}>Slot</span><select value={s} onChange={(e) => setS(e.target.value)} style={input}>{SLOTS.map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>
      <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Reason</span><input value={r} onChange={(e) => setR(e.target.value)} style={input} placeholder="e.g. Customer asked for evening" /></label>
    </Modal>
  );
}

export function PaymentModal({ due, onClose, onConfirm }: { due: number; onClose: () => void; onConfirm: (a: number, m: PayMethod, ref: string) => void }) {
  const [a, setA] = useState(String(due));
  const [m, setM] = useState<PayMethod>("UPI");
  const [ref, setRef] = useState("");
  const n = Number(a) || 0;
  return (
    <Modal title="Record payment" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Back</Btn><Btn kind="gold" disabled={n <= 0 || n > due || (m !== "Cash" && ref.trim().length < 4)} onClick={() => onConfirm(n, m, ref.trim())}>Record {inr(n)}</Btn></>}>
      <p style={{ margin: "0 0 12px", fontSize: 13 }}>Balance due: <b>{inr(due)}</b></p>
      <div className="form-grid">
        <label><span style={fieldLabel}>Amount</span><input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ""))} style={input} /></label>
        <label><span style={fieldLabel}>Method</span><select value={m} onChange={(e) => setM(e.target.value as PayMethod)} style={input}>{(["UPI", "Cash", "Card", "Online"] as const).map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>
      {m !== "Cash" && <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Transaction reference</span><input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} style={input} /></label>}
    </Modal>
  );
}

function RefundModal({ max, onClose, onConfirm }: { max: number; onClose: () => void; onConfirm: (a: number, r: string) => void }) {
  const [a, setA] = useState("");
  const [r, setR] = useState("");
  const n = Number(a) || 0;
  return (
    <Modal title="Refund" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Back</Btn><Btn kind="danger" disabled={n <= 0 || n > max || !r.trim()} onClick={() => onConfirm(n, r.trim())}>Refund {inr(n)}</Btn></>}>
      <div className="form-grid">
        <label><span style={fieldLabel}>Amount (max {inr(max)})</span><input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ""))} style={input} /></label>
        <label><span style={fieldLabel}>Reason</span><input value={r} onChange={(e) => setR(e.target.value)} style={input} /></label>
      </div>
      <p style={{ ...muted, marginTop: 10 }}>Refunds are recorded in the audit log.</p>
    </Modal>
  );
}

/* ───────────────────────── New service request ───────────────────────── */

export function NewJobModal({ db, who, onClose, onCreated, presetCustomer }: { db: Db; who: string; onClose: () => void; onCreated: (id: string) => void; presetCustomer?: string }) {
  const [q, setQ] = useState("");
  const [cid, setCid] = useState(presetCustomer ?? "");
  const [acId, setAcId] = useState("");
  const [issues, setIssues] = useState<ComplaintIssue[]>([]);
  const [notes, setNotes] = useState("");
  const [pre, setPre] = useState<PreWork>({ ...EMPTY_PREWORK });
  const [showPre, setShowPre] = useState(false);
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState(SLOTS[1]);
  const [priority, setPri] = useState<Job["priority"]>("Normal");
  const [source, setSource] = useState<Job["source"]>("Phone");
  const [techId, setTechId] = useState("");

  const n = q.trim().toLowerCase();
  const matches = n.length >= 2 ? db.customers.filter((c) => !c.mergedInto && `${c.name} ${c.phone} ${c.address}`.toLowerCase().includes(n)).slice(0, 6) : [];
  const cust = db.customers.find((c) => c.id === cid);
  const acs = db.acs.filter((a) => a.customerId === cid);
  const valid = cust && acId && issues.length > 0 && date && slot;
  const draft = { customerId: cid, acId, date, techId: null } as unknown as Job;

  return (
    <Modal width={720} title="New service request" onClose={onClose} footer={<>
      <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
      <Btn kind="gold" disabled={!valid} onClick={() => onCreated(createJob({ customerId: cid, acId, date, slot, priority, source, complaint: { issues, notes: notes.trim(), errorCode: "" }, preWork: pre, techId: techId || null }, who))}>Create request</Btn>
    </>}>
      {!cust ? (
        <>
          <span style={fieldLabel}>Find customer by mobile, name or address</span>
          <SearchBox value={q} onChange={setQ} placeholder="e.g. 98765 or Sharma" />
          <div style={{ marginTop: 8 }}>
            {matches.map((c) => (
              <button key={c.id} onClick={() => { setCid(c.id); setAcId(db.acs.find((a) => a.customerId === c.id)?.id ?? ""); }} className="admin-row" style={{ display: "block", width: "100%", textAlign: "left", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", marginBottom: 6, background: "white", cursor: "pointer", fontSize: 13 }}>
                <b>{c.name}</b> · +91 {c.phone}<div style={muted}>{c.address}</div>
              </button>
            ))}
            {n.length >= 2 && matches.length === 0 && <p style={muted}>No customer found — add them from Customers first.</p>}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: "var(--bg-secondary)", marginBottom: 14 }}>
            <span style={{ fontSize: 13 }}><b>{cust.name}</b> · +91 {cust.phone} · {cust.area}</span>
            {!presetCustomer && <Btn small kind="ghost" onClick={() => { setCid(""); setAcId(""); }}>Change</Btn>}
          </div>
          <span style={fieldLabel}>AC</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {acs.map((a) => {
              const s = acSummary(db, a.id);
              return (
                <button key={a.id} onClick={() => setAcId(a.id)} style={{ border: a.id === acId ? "2px solid var(--blue)" : "1px solid var(--line-strong)", borderRadius: 10, padding: "8px 10px", background: a.id === acId ? "var(--blue-tint)" : "white", cursor: "pointer", textAlign: "left", fontSize: 12.5 }}>
                  <b>{a.application}</b> · {acLabel(a)}<div style={muted}>{s.visits} visits{s.repeatIssues.length ? " · ⚠ repeat issues" : ""}</div>
                </button>
              );
            })}
            {acs.length === 0 && <p style={muted}>This customer has no AC on record — add one from Customers.</p>}
          </div>
          <span style={fieldLabel}>Complaint (as the customer describes it)</span>
          <Chips options={COMPLAINTS} value={issues} multi onChange={(i) => setIssues((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))} />
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Customer's own words" style={{ ...input, marginTop: 8, resize: "none" }} />
          <button onClick={() => setShowPre((v) => !v)} style={{ background: "none", border: "none", color: "var(--blue)", fontWeight: 600, fontSize: 13, cursor: "pointer", padding: "10px 0" }}>{showPre ? "▾" : "▸"} Pre-work history questionnaire (optional)</button>
          {showPre && <div style={{ marginBottom: 12 }}><PreWorkForm value={pre} onChange={setPre} inputStyle={input} /></div>}
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
            <label><span style={fieldLabel}>Date</span><input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} style={input} /></label>
            <label><span style={fieldLabel}>Slot</span><select value={slot} onChange={(e) => setSlot(e.target.value)} style={input}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label><span style={fieldLabel}>Priority</span><select value={priority} onChange={(e) => setPri(e.target.value as Job["priority"])} style={input}>{(["Normal", "High", "Urgent"] as const).map((p) => <option key={p}>{p}</option>)}</select></label>
            <label><span style={fieldLabel}>Source</span><select value={source} onChange={(e) => setSource(e.target.value as Job["source"])} style={input}>{(["Phone", "WhatsApp", "Walk-in", "AMC Visit", "Customer App"] as const).map((p) => <option key={p}>{p}</option>)}</select></label>
          </div>
          {acId && (
            <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Assign technician now (optional)</span>
              <select value={techId} onChange={(e) => setTechId(e.target.value)} style={input}>
                <option value="">Leave unassigned</option>
                {rankTechs(db, draft).map(({ t, load, inArea }) => <option key={t.id} value={t.id}>{t.name} — {t.availability}, {load} jobs{inArea ? ", covers area" : ""}</option>)}
              </select>
            </label>
          )}
        </>
      )}
    </Modal>
  );
}

