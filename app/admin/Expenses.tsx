"use client";

import { useState } from "react";
import { fmtDate, fmtDateTime, inr, isoDay, type Db } from "../lib/data";
import { fmtH, logHours } from "../lib/finance";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseClass, type TimeLog } from "../lib/finance-types";
import { addExpense, reimburseExpense, requestCorrection, reviewCorrection, reviewExpense, reviewTime } from "../lib/store";
import { DataGrid } from "./grid";
import { Badge, Btn, Modal, Panel, fieldLabel, input, muted } from "./kit";

const CLS_TONE: Record<ExpenseClass, "amber" | "teal" | "grey"> = { "Direct job": "amber", "Technician shared": "teal", Operating: "grey" };
const ST_TONE = { Pending: "amber", Approved: "green", Rejected: "red", Reversed: "red", Running: "green", Submitted: "amber" } as const;

/* ───────────── Expenses & claims ───────────── */

export function ExpensesSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const say = (err: string | null, ok: string) => notify(err ? `⚠ ${err}` : ok);
  const [review, setReview] = useState<Expense | null>(null);
  const [adding, setAdding] = useState(false);
  const tech = (id: string | null) => (id ? db.techs.find((t) => t.id === id)?.name ?? id : "—");
  const pending = db.expenses.filter((e) => e.status === "Pending");
  const toRepay = db.expenses.filter((e) => e.paidBy === "Employee" && e.status === "Approved" && !e.reimbursed);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ borderRadius: 12, padding: "10px 12px", fontSize: 12.5, background: "var(--blue-tint)", color: "var(--blue-dark)" }}>
        Each expense is recorded <b>once</b> with a class: <Badge tone="amber">Direct job</Badge> charged to one job (never shared) · <Badge tone="teal">Technician shared</Badge> room, food, mobile — spread over that technician&apos;s jobs at payroll · <Badge tone="grey">Operating</Badge> company overhead.
        Repaying a claim or recovering an advance is a settlement, not a new expense.
      </div>
      <Panel title={`Waiting for review (${pending.length})`} actions={<Btn onClick={() => setAdding(true)}>+ Record expense</Btn>} pad={false}>
        <DataGrid exportName="pending-claims" rows={pending} rowKey={(e) => e.id} empty="No claims waiting." pageSize={8} cols={[
          { key: "d", head: "Date", value: (e) => e.date, render: (e) => fmtDate(e.date) },
          { key: "c", head: "Category", value: (e) => e.category }, { key: "cl", head: "Class", value: (e) => e.cls, render: (e) => <Badge tone={CLS_TONE[e.cls]}>{e.cls}</Badge> },
          { key: "j", head: "Job", value: (e) => e.jobId ?? "" }, { key: "t", head: "Technician", value: (e) => tech(e.techId) }, { key: "p", head: "Paid by", value: (e) => e.paidBy },
          { key: "n", head: "Note", value: (e) => e.note }, { key: "a", head: "Amount", value: (e) => e.amount, money: true, total: true },
          { key: "x", head: "", value: () => "", render: (e) => <Btn small onClick={() => setReview(e)}>Review</Btn> },
        ]} />
      </Panel>
      {toRepay.length > 0 && (
        <Panel title={`Approved claims to repay (${toRepay.length})`} pad={false}>
          <DataGrid exportName="claims-to-repay" rows={toRepay} rowKey={(e) => e.id} pageSize={8} cols={[
            { key: "d", head: "Date", value: (e) => e.date, render: (e) => fmtDate(e.date) }, { key: "t", head: "Technician", value: (e) => tech(e.techId), filter: true },
            { key: "c", head: "Category", value: (e) => e.category }, { key: "a", head: "Amount", value: (e) => e.amount, money: true, total: true },
            { key: "x", head: "", value: () => "", render: (e) => <Btn small kind="ghost" onClick={() => { const ref = prompt("Paid how? (UPI ref / voucher)"); if (ref) say(reimburseExpense(e.id, ref, who), "Marked reimbursed — not a new expense"); }}>Paid directly</Btn> },
          ]} />
          <p style={{ ...muted, padding: "0 16px 12px" }}>Claims not repaid directly are added to the technician&apos;s next payroll automatically — each claim can only be repaid once.</p>
        </Panel>
      )}
      <Panel title="All expenses" pad={false}>
        <DataGrid exportName="expenses" rows={db.expenses} rowKey={(e) => e.id} cols={[
          { key: "d", head: "Date", value: (e) => e.date, render: (e) => fmtDate(e.date) },
          { key: "c", head: "Category", value: (e) => e.category, filter: true },
          { key: "cl", head: "Class", value: (e) => e.cls, filter: true, render: (e) => <Badge tone={CLS_TONE[e.cls]}>{e.cls}</Badge> },
          { key: "j", head: "Job", value: (e) => e.jobId ?? "" },
          { key: "t", head: "Technician", value: (e) => tech(e.techId), filter: true },
          { key: "p", head: "Paid by", value: (e) => e.paidBy, filter: true },
          { key: "s", head: "Status", value: (e) => e.status, filter: true, render: (e) => <Badge tone={ST_TONE[e.status]}>{e.status}</Badge> },
          { key: "r", head: "Settlement", value: (e) => (e.reimbursed ? `Reimbursed (${e.reimbursed.how})` : e.paidBy === "Employee" && e.status === "Approved" ? "To repay" : ""), hidden: true },
          { key: "n", head: "Note", value: (e) => e.note, hidden: true },
          { key: "a", head: "Amount", value: (e) => e.amount, money: true, total: true },
          { key: "x", head: "", value: () => "", render: (e) => e.status === "Approved" && !e.reimbursed ? <Btn small kind="danger" onClick={() => { const why = prompt("Reason to reverse this expense?"); if (why) say(reviewExpense(e.id, "reverse", why, who), "Expense reversed"); }}>Reverse</Btn> : null },
        ]} />
      </Panel>
      {review && <ReviewModal db={db} e={review} onClose={() => setReview(null)} onDo={(a, note, patch) => { const err = reviewExpense(review.id, a, note, who, patch); say(err, a === "approve" ? "Expense approved" : "Expense rejected"); if (!err) setReview(null); }} />}
      {adding && <ExpenseForm db={db} who={who} onClose={() => setAdding(false)} onSave={(e) => { const err = addExpense(e, who); say(err, "Expense recorded"); if (!err) setAdding(false); }} />}
    </div>
  );
}

function ReviewModal({ db, e, onClose, onDo }: { db: Db; e: Expense; onClose: () => void; onDo: (a: "approve" | "reject", note: string, patch: { cls: ExpenseClass; jobId: string | null }) => void }) {
  const [cls, setCls] = useState<ExpenseClass>(e.cls);
  const [jobId, setJobId] = useState(e.jobId ?? "");
  const [note, setNote] = useState("");
  return (
    <Modal title={`Review · ${e.category} · ${inr(e.amount)}`} onClose={onClose} footer={<><Btn kind="danger" onClick={() => onDo("reject", note, { cls, jobId: jobId || null })}>Reject</Btn><Btn onClick={() => onDo("approve", note, { cls, jobId: jobId || null })}>Approve</Btn></>}>
      <p style={{ ...muted, marginTop: 0 }}>{fmtDate(e.date)} · {db.techs.find((t) => t.id === e.techId)?.name ?? "Office"} · paid by {e.paidBy} · {e.note}</p>
      <label><span style={fieldLabel}>Classification</span><select value={cls} onChange={(x) => setCls(x.target.value as ExpenseClass)} style={input}>{(["Direct job", "Technician shared", "Operating"] as const).map((c) => <option key={c}>{c}</option>)}</select></label>
      {cls === "Direct job" && <label style={{ display: "block", marginTop: 10 }}><span style={fieldLabel}>Job</span><select value={jobId} onChange={(x) => setJobId(x.target.value)} style={input}><option value="">Select…</option>{db.jobs.filter((j) => j.status !== "Cancelled").slice(0, 300).map((j) => <option key={j.id}>{j.id}</option>)}</select></label>}
      <label style={{ display: "block", marginTop: 10 }}><span style={fieldLabel}>Note (required to reject)</span><input value={note} onChange={(x) => setNote(x.target.value)} style={input} /></label>
    </Modal>
  );
}

export function ExpenseForm({ db, who, onClose, onSave, techId, jobId }: { db: Db; who: string; onClose: () => void; onSave: (e: Omit<Expense, "id">) => void; techId?: string; jobId?: string }) {
  const [v, setV] = useState({ date: isoDay(0), category: EXPENSE_CATEGORIES[0].name, amount: 0, jobId: jobId ?? "", techId: techId ?? "", paidBy: "Company" as Expense["paidBy"], note: "", approve: !techId });
  const cls = EXPENSE_CATEGORIES.find((c) => c.name === v.category)!.cls;
  return (
    <Modal title="Record expense" onClose={onClose} footer={<Btn onClick={() => onSave({ date: v.date, category: v.category, cls, amount: v.amount, jobId: v.jobId || null, techId: v.techId || null, paidBy: v.paidBy, status: v.approve ? "Approved" : "Pending", note: v.note, submittedBy: who })}>Save</Btn>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label><span style={fieldLabel}>Date</span><input type="date" max={isoDay(0)} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Amount ₹ (cost, ex recoverable GST)</span><input type="number" min={0} value={v.amount || ""} onChange={(e) => setV({ ...v, amount: Number(e.target.value) })} style={input} /></label>
        <label style={{ gridColumn: "span 2" }}><span style={fieldLabel}>Category</span><select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} style={input}>
          {(["Direct job", "Technician shared", "Operating"] as const).map((g) => <optgroup key={g} label={g}>{EXPENSE_CATEGORIES.filter((c) => c.cls === g).map((c) => <option key={c.name}>{c.name}</option>)}</optgroup>)}
        </select></label>
        <label><span style={fieldLabel}>Job {cls === "Direct job" ? "*" : ""}</span><select value={v.jobId} onChange={(e) => setV({ ...v, jobId: e.target.value })} style={input}><option value="">—</option>{db.jobs.filter((j) => j.status !== "Cancelled").slice(0, 300).map((j) => <option key={j.id}>{j.id}</option>)}</select></label>
        <label><span style={fieldLabel}>Technician</span><select value={v.techId} disabled={Boolean(techId)} onChange={(e) => setV({ ...v, techId: e.target.value })} style={input}><option value="">—</option>{db.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label><span style={fieldLabel}>Paid by</span><select value={v.paidBy} onChange={(e) => setV({ ...v, paidBy: e.target.value as Expense["paidBy"] })} style={input}><option>Company</option><option value="Employee">Employee (reimburse)</option></select></label>
        <label><span style={fieldLabel}>Note</span><input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} style={input} /></label>
        {!techId && <label style={{ gridColumn: "span 2", fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={v.approve} onChange={(e) => setV({ ...v, approve: e.target.checked })} /> Approve now</label>}
      </div>
      <p style={{ ...muted, marginBottom: 0 }}>Class: <Badge tone={CLS_TONE[cls]}>{cls}</Badge></p>
    </Modal>
  );
}

/* ───────────── Time sheets ───────────── */

export function TimeSheetsSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const say = (err: string | null, ok: string) => notify(err ? `⚠ ${err}` : ok);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [add, setAdd] = useState(false);
  const tech = (id: string) => db.techs.find((t) => t.id === id)?.name ?? id;
  const submitted = db.timeLogs.filter((l) => l.status === "Submitted").sort((a, b) => a.start.localeCompare(b.start));
  const running = db.timeLogs.filter((l) => l.status === "Running");
  const pendingC = db.corrections.filter((c) => c.status === "Pending");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {running.length > 0 && <Panel title="Running now"><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{running.map((l) => <Badge key={l.id} tone="green">{tech(l.techId)} · {l.jobId ?? "—"} · {l.kind} since {fmtDateTime(l.start)}</Badge>)}</div></Panel>}
      <Panel title={`Waiting for approval (${submitted.length})`} actions={<>
        <input placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...input, width: 220 }} />
        <Btn disabled={!sel.size} onClick={() => { say(reviewTime([...sel], true, note, who), `${sel.size} approved`); setSel(new Set()); }}>Approve {sel.size || ""}</Btn>
        <Btn kind="danger" disabled={!sel.size} onClick={() => { const err = reviewTime([...sel], false, note, who); say(err, "Rejected"); if (!err) setSel(new Set()); }}>Reject</Btn>
      </>} pad={false}>
        <DataGrid exportName="time-to-approve" rows={submitted} rowKey={(l) => l.id} empty="Nothing waiting." cols={[
          { key: "s", head: "", value: () => "", render: (l: TimeLog) => <input type="checkbox" aria-label="Select" checked={sel.has(l.id)} onChange={() => { const n = new Set(sel); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); setSel(n); }} /> },
          { key: "t", head: "Technician", value: (l) => tech(l.techId), filter: true }, { key: "j", head: "Job", value: (l) => l.jobId ?? "" },
          { key: "k", head: "Kind", value: (l) => l.kind, filter: true }, { key: "a", head: "Start", value: (l) => l.start, render: (l) => fmtDateTime(l.start) },
          { key: "b", head: "End", value: (l) => l.end ?? "", render: (l) => fmtDateTime(l.end ?? "") }, { key: "h", head: "Hours", value: (l) => Math.round(logHours(l) * 100) / 100, total: true },
        ]} toolbar={<Btn small kind="ghost" onClick={() => setSel(new Set(submitted.map((l) => l.id)))}>Select all</Btn>} />
      </Panel>
      <Panel title={`Correction requests (${pendingC.length})`} actions={<Btn kind="ghost" onClick={() => setAdd(true)}>+ Record missing time</Btn>}>
        {pendingC.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ flex: 1, minWidth: 240, fontSize: 13 }}>
              <b>{tech(c.techId)}</b> · {c.jobId ?? "—"} · {c.kind} · {c.logId ? "edit entry" : "missing entry"}<br />
              <span style={muted}>{fmtDateTime(c.start)} → {fmtDateTime(c.end)} ({fmtH(logHours(c))}) · “{c.reason}” · by {c.requestedBy}</span>
            </div>
            <Btn small onClick={() => say(reviewCorrection(c.id, true, "", who), "Correction applied")}>Approve</Btn>
            <Btn small kind="danger" onClick={() => { const why = prompt("Reason to reject?") ?? ""; say(reviewCorrection(c.id, false, why, who), "Correction rejected"); }}>Reject</Btn>
          </div>
        ))}
        {!pendingC.length && <p style={muted}>No pending corrections. Corrections always need a reason and someone other than the requester to approve.</p>}
      </Panel>
      <Panel title="All time entries" pad={false}>
        <DataGrid exportName="time-entries" rows={[...db.timeLogs].sort((a, b) => b.start.localeCompare(a.start))} rowKey={(l) => l.id} cols={[
          { key: "t", head: "Technician", value: (l) => tech(l.techId), filter: true }, { key: "j", head: "Job", value: (l) => l.jobId ?? "" },
          { key: "k", head: "Kind", value: (l) => l.kind, filter: true }, { key: "d", head: "Date", value: (l) => l.start.slice(0, 10), render: (l) => fmtDate(l.start) },
          { key: "a", head: "Start", value: (l) => l.start, render: (l) => fmtDateTime(l.start), hidden: true }, { key: "b", head: "End", value: (l) => l.end ?? "", render: (l) => fmtDateTime(l.end ?? ""), hidden: true },
          { key: "h", head: "Hours", value: (l) => Math.round(logHours(l) * 100) / 100, total: true },
          { key: "s", head: "Status", value: (l) => l.status, filter: true, render: (l) => <Badge tone={l.status === "Rejected" ? "red" : ST_TONE[l.status as keyof typeof ST_TONE] ?? "blue"}>{l.status}</Badge> },
          { key: "n", head: "Note", value: (l) => l.note ?? "", hidden: true },
        ]} />
      </Panel>
      {add && <CorrectionModal db={db} onClose={() => setAdd(false)} onSave={(c) => { const err = requestCorrection(c, who); say(err, "Correction requested — needs approval by someone else"); if (!err) setAdd(false); }} />}
    </div>
  );
}

export function CorrectionModal({ db, techId, onClose, onSave }: { db: Db; techId?: string; onClose: () => void; onSave: (c: { logId: string | null; techId: string; jobId: string | null; kind: TimeLog["kind"]; start: string; end: string; reason: string }) => void }) {
  const [v, setV] = useState({ techId: techId ?? db.techs[0]?.id ?? "", logId: "", jobId: "", kind: "Work" as TimeLog["kind"], start: "", end: "", reason: "" });
  const logs = db.timeLogs.filter((l) => l.techId === v.techId && l.status !== "Running").sort((a, b) => b.start.localeCompare(a.start)).slice(0, 40);
  const jobs = db.jobs.filter((j) => j.techId === v.techId || (j.helpers ?? []).includes(v.techId)).slice(0, 60);
  return (
    <Modal title="Time correction" onClose={onClose} footer={<Btn onClick={() => onSave({ ...v, logId: v.logId || null, jobId: v.jobId || null })}>Send for approval</Btn>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {!techId && <label><span style={fieldLabel}>Technician</span><select value={v.techId} onChange={(e) => setV({ ...v, techId: e.target.value })} style={input}>{db.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
        <label><span style={fieldLabel}>Entry to fix</span><select value={v.logId} onChange={(e) => { const l = logs.find((x) => x.id === e.target.value); setV({ ...v, logId: e.target.value, jobId: l?.jobId ?? v.jobId, kind: l?.kind ?? v.kind }); }} style={input}><option value="">Missing entry (add new)</option>{logs.map((l) => <option key={l.id} value={l.id}>{l.kind} · {fmtDateTime(l.start)}</option>)}</select></label>
        <label><span style={fieldLabel}>Job</span><select value={v.jobId} onChange={(e) => setV({ ...v, jobId: e.target.value })} style={input}><option value="">—</option>{jobs.map((j) => <option key={j.id}>{j.id}</option>)}</select></label>
        <label><span style={fieldLabel}>Kind</span><select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as TimeLog["kind"] })} style={input}><option>Work</option><option>Travel</option><option>Break</option></select></label>
        <label><span style={fieldLabel}>Start</span><input type="datetime-local" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>End</span><input type="datetime-local" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} style={input} /></label>
        <label style={{ gridColumn: "span 2" }}><span style={fieldLabel}>Reason *</span><input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} style={input} /></label>
      </div>
    </Modal>
  );
}
