"use client";

import { useEffect, useState } from "react";
import { BottomSheet, PrimaryButton, card, field, label, sectionTitle, small } from "../components/ui";
import { fmtDateTime, inr, isOpen, isoDay, type Db, type Job, type Technician } from "../lib/data";
import { fmtH, fmtMonth, logHours } from "../lib/finance";
import { EXPENSE_CATEGORIES, type Expense, type TimeLog } from "../lib/finance-types";
import { addExpense, requestCorrection, timerAction, type TimerAction } from "../lib/store";

const clock = (since: string, now: number) => {
  const s = Math.max(0, Math.floor((now - new Date(since.length === 16 ? `${since}:00` : since).getTime()) / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

/** Travel / work / break timer for one job. Segments never overlap; corrections go through approval. */
export function TimerCard({ db, job, tech, flash }: { db: Db; job: Job; tech: Technician; flash: (m: string) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [claim, setClaim] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const running = db.timeLogs.find((l) => l.techId === tech.id && l.status === "Running");
  const here = running?.jobId === job.id;
  const mine = db.timeLogs.filter((l) => l.jobId === job.id && l.techId === tech.id);
  const total = (k: TimeLog["kind"]) => mine.filter((l) => l.kind === k).reduce((a, l) => a + logHours(l, now), 0);
  const act = (a: TimerAction, ok: string) => { const err = timerAction(tech.id, job.id, a, tech.name); flash(err ? `⚠ ${err}` : ok); };
  const btn = (a: TimerAction, text: string, bg: string, ok: string) => (
    <button onClick={() => act(a, ok)} className="press" style={{ flex: 1, minWidth: 120, border: "none", borderRadius: 14, padding: "13px 10px", fontSize: 14.5, fontWeight: 700, color: "white", background: bg, cursor: "pointer" }}>{text}</button>
  );
  const tone = running?.kind === "Work" ? "var(--success-text)" : running?.kind === "Travel" ? "var(--blue)" : "var(--gold)";
  return (
    <div style={{ ...card, padding: 14, marginTop: 12 }}>
      <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>⏱ Job timer</p>
      {running && (
        <div style={{ borderRadius: 12, padding: "10px 12px", marginBottom: 10, background: here ? tone : "var(--bg-secondary)", color: here ? "white" : "var(--ink)" }}>
          <p style={{ margin: 0, fontSize: 11.5, opacity: 0.85 }}>{here ? (running.kind === "Break" ? "On break" : running.kind) : `Running on ${running.jobId} (${running.kind})`}</p>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{clock(running.start, now)}</p>
        </div>
      )}
      {isOpen(job) ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!(here && running?.kind === "Travel") && btn("travel", "🚗 Start travel", "var(--blue)", "Travel started")}
          {(!here || running?.kind === "Travel") && btn("work", "🔧 Start work", "var(--success-text)", "Work started")}
          {here && running?.kind === "Work" && btn("pause", "⏸ Break", "var(--gold)", "Break started")}
          {here && running?.kind === "Break" && btn("resume", "▶ Resume", "var(--success-text)", "Work resumed")}
          {here && btn("stop", "⏹ Stop", "var(--ink-soft)", "Timer stopped")}
        </div>
      ) : <p style={small}>Job is {job.status} — timer closed.</p>}
      {running && !here && isOpen(job) && <p style={{ ...small, color: "var(--warning-text)" }}>Starting here stops your other running timer first — time never overlaps.</p>}
      <p style={{ ...small, marginTop: 10 }}>My time here: work {fmtH(total("Work"))} · travel {fmtH(total("Travel"))} · break {fmtH(total("Break"))}. Wrong time? Request a correction in Profile → My hours.</p>
      <button onClick={() => setClaim(true)} style={{ marginTop: 8, background: "none", border: "none", padding: 0, color: "var(--blue)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Add expense for this job (petrol, food, fare…)</button>
      {claim && <ClaimSheet db={db} tech={tech} jobId={job.id} onClose={() => setClaim(false)} flash={flash} />}
    </div>
  );
}

function ClaimSheet({ db, tech, jobId, onClose, flash }: { db: Db; tech: Technician; jobId: string | null; onClose: () => void; flash: (m: string) => void }) {
  const cats = EXPENSE_CATEGORIES.filter((c) => (jobId ? c.cls === "Direct job" : c.cls !== "Operating"));
  const [v, setV] = useState({ category: cats[0].name, amount: "", date: isoDay(0), paidBy: "Employee" as Expense["paidBy"], note: "", job: jobId ?? "" });
  const myJobs = db.jobs.filter((j) => j.techId === tech.id || (j.helpers ?? []).includes(tech.id)).slice(0, 40);
  const cls = EXPENSE_CATEGORIES.find((c) => c.name === v.category)!.cls;
  return (
    <BottomSheet title="Expense claim" onClose={onClose}>
      <label style={label}>Category</label>
      <select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} style={field}>{cats.map((c) => <option key={c.name}>{c.name}</option>)}</select>
      {!jobId && cls === "Direct job" && (<><label style={{ ...label, marginTop: 10 }}>Job</label><select value={v.job} onChange={(e) => setV({ ...v, job: e.target.value })} style={field}><option value="">Select job…</option>{myJobs.map((j) => <option key={j.id}>{j.id}</option>)}</select></>)}
      <label style={{ ...label, marginTop: 10 }}>Amount ₹</label>
      <input type="number" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} style={field} />
      <label style={{ ...label, marginTop: 10 }}>Date</label>
      <input type="date" max={isoDay(0)} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} style={field} />
      <label style={{ ...label, marginTop: 10 }}>Paid by</label>
      <select value={v.paidBy} onChange={(e) => setV({ ...v, paidBy: e.target.value as Expense["paidBy"] })} style={field}><option value="Employee">Me — please reimburse</option><option value="Company">Company / advance</option></select>
      <label style={{ ...label, marginTop: 10 }}>Note</label>
      <input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} style={field} />
      <PrimaryButton style={{ marginTop: 14 }} disabled={!(Number(v.amount) > 0)} onClick={() => {
        const err = addExpense({ date: v.date, category: v.category, cls, amount: Number(v.amount), jobId: cls === "Direct job" ? (jobId ?? (v.job || null)) : null, techId: tech.id, paidBy: v.paidBy, status: "Pending", note: v.note, submittedBy: tech.name }, tech.name);
        flash(err ? `⚠ ${err}` : "Claim sent for approval");
        if (!err) onClose();
      }}>Submit claim</PrimaryButton>
    </BottomSheet>
  );
}

/** Profile block: my hours, corrections, claims and — if the owner allows — my salary. */
export function MyFinance({ db, tech, flash }: { db: Db; tech: Technician; flash: (m: string) => void }) {
  const [corr, setCorr] = useState(false);
  const [claim, setClaim] = useState(false);
  const month = isoDay(0).slice(0, 7);
  const logs = db.timeLogs.filter((l) => l.techId === tech.id).sort((a, b) => b.start.localeCompare(a.start));
  const hrs = (k: TimeLog["kind"], st?: TimeLog["status"]) => logs.filter((l) => l.kind === k && l.start.startsWith(month) && (!st || l.status === st)).reduce((a, l) => a + logHours(l), 0);
  const claims = db.expenses.filter((e) => e.techId === tech.id && (e.paidBy === "Employee" || e.submittedBy === tech.name)).slice(0, 15);
  const canSeePay = db.fin.salaryVisibleTo.includes(tech.id);
  const runs = db.payrollRuns.filter((r) => r.status === "Approved");
  const sal = db.salaries.filter((s) => s.techId === tech.id).sort((a, b) => b.from.localeCompare(a.from))[0];
  const DED = ["advance_recovery", "cost_recovery", "deduction"];
  return (
    <>
      <h3 style={sectionTitle}>My hours — {fmtMonth(month)}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[["Approved work", fmtH(hrs("Work", "Approved"))], ["Approved travel", fmtH(hrs("Travel", "Approved"))], ["Awaiting approval", fmtH(logs.filter((l) => l.status === "Submitted" && l.kind !== "Break").reduce((a, l) => a + logHours(l), 0))]].map(([k, v]) => (
          <div key={k} style={{ ...card, padding: 10 }}><p style={{ margin: 0, fontSize: 10.5, color: "var(--ink-mute)", fontWeight: 600 }}>{k}</p><p style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>{v}</p></div>
        ))}
      </div>
      <div style={{ ...card, padding: 12, marginTop: 8 }}>
        {logs.slice(0, 8).map((l) => <p key={l.id} style={{ ...small, margin: "0 0 4px" }}>{l.kind} · {l.jobId ?? "—"} · {fmtDateTime(l.start)} · {fmtH(logHours(l))} · <b>{l.status}</b></p>)}
        <button onClick={() => setCorr(true)} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Request a time correction</button>
        {db.corrections.filter((c) => c.techId === tech.id).slice(0, 4).map((c) => <p key={c.id} style={{ ...small, margin: "4px 0 0" }}>Correction · {c.reason} · <b>{c.status}</b></p>)}
      </div>
      <h3 style={sectionTitle}>My expense claims</h3>
      <div style={{ ...card, padding: 12 }}>
        {claims.map((e) => <p key={e.id} style={{ ...small, margin: "0 0 4px" }}>{e.category} · {inr(e.amount)} · {e.jobId ?? "monthly"} · <b>{e.status}</b>{e.reimbursed ? ` · reimbursed (${e.reimbursed.how})` : e.status === "Approved" && e.paidBy === "Employee" ? " · to be repaid" : ""}</p>)}
        {!claims.length && <p style={small}>No claims yet.</p>}
        <button onClick={() => setClaim(true)} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ New claim (room, food, mobile…)</button>
      </div>
      {canSeePay && (
        <>
          <h3 style={sectionTitle}>My salary</h3>
          <div style={{ ...card, padding: 12 }}>
            {sal && <p style={{ ...small, margin: 0 }}>{sal.payType === "Monthly" ? `${inr(sal.monthly)} / month` : `${inr(sal.hourly)} / hour`} · {sal.hoursPerDay} h/day · allowances {sal.allowances.map((a) => `${a.name} ${inr(a.amount)}`).join(", ") || "none"}</p>}
            {runs.map((r) => {
              const ls = r.lines.filter((l) => l.techId === tech.id);
              if (!ls.length) return null;
              const net = ls.reduce((a, l) => a + (DED.includes(l.type) ? -l.amount : l.amount), 0);
              return (
                <details key={r.month} style={{ marginTop: 8 }}>
                  <summary style={{ fontWeight: 700, fontSize: 13 }}>{fmtMonth(r.month)} payslip — net {inr(net)}</summary>
                  {ls.map((l, i) => <p key={i} style={{ ...small, margin: "2px 0", display: "flex", justifyContent: "space-between" }}><span>{l.label}</span><span>{DED.includes(l.type) ? "−" : ""}{inr(l.amount)}</span></p>)}
                </details>
              );
            })}
          </div>
        </>
      )}
      {corr && <CorrectionSheet db={db} tech={tech} onClose={() => setCorr(false)} flash={flash} />}
      {claim && <ClaimSheet db={db} tech={tech} jobId={null} onClose={() => setClaim(false)} flash={flash} />}
    </>
  );
}

function CorrectionSheet({ db, tech, onClose, flash }: { db: Db; tech: Technician; onClose: () => void; flash: (m: string) => void }) {
  const logs = db.timeLogs.filter((l) => l.techId === tech.id && l.status !== "Running").sort((a, b) => b.start.localeCompare(a.start)).slice(0, 30);
  const jobs = db.jobs.filter((j) => j.techId === tech.id || (j.helpers ?? []).includes(tech.id)).slice(0, 40);
  const [v, setV] = useState({ logId: "", jobId: "", kind: "Work" as TimeLog["kind"], start: "", end: "", reason: "" });
  return (
    <BottomSheet title="Time correction" onClose={onClose}>
      <label style={label}>Entry</label>
      <select value={v.logId} onChange={(e) => { const l = logs.find((x) => x.id === e.target.value); setV({ ...v, logId: e.target.value, jobId: l?.jobId ?? "", kind: l?.kind ?? v.kind, start: l?.start.slice(0, 16) ?? "", end: l?.end?.slice(0, 16) ?? "" }); }} style={field}>
        <option value="">Missing entry — add new</option>{logs.map((l) => <option key={l.id} value={l.id}>{l.kind} · {l.jobId} · {fmtDateTime(l.start)}</option>)}
      </select>
      {!v.logId && (<><label style={{ ...label, marginTop: 10 }}>Job</label><select value={v.jobId} onChange={(e) => setV({ ...v, jobId: e.target.value })} style={field}><option value="">—</option>{jobs.map((j) => <option key={j.id}>{j.id}</option>)}</select></>)}
      <label style={{ ...label, marginTop: 10 }}>Kind</label>
      <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as TimeLog["kind"] })} style={field}><option>Work</option><option>Travel</option><option>Break</option></select>
      <label style={{ ...label, marginTop: 10 }}>Correct start</label><input type="datetime-local" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} style={field} />
      <label style={{ ...label, marginTop: 10 }}>Correct end</label><input type="datetime-local" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} style={field} />
      <label style={{ ...label, marginTop: 10 }}>Reason</label><input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} style={field} />
      <PrimaryButton style={{ marginTop: 14 }} onClick={() => {
        const err = requestCorrection({ logId: v.logId || null, techId: tech.id, jobId: v.jobId || null, kind: v.kind, start: v.start, end: v.end, reason: v.reason }, tech.name);
        flash(err ? `⚠ ${err}` : "Sent to office for approval");
        if (!err) onClose();
      }}>Send for approval</PrimaryButton>
    </BottomSheet>
  );
}
