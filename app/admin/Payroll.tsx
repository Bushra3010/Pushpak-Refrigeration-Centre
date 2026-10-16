"use client";

import { useState } from "react";
import { sum } from "../lib/calc/money";
import { fmtDate, inr, isoDay, type Db } from "../lib/data";
import { addMonths, computeMonth, currentMonth, fmtH, fmtMonth, inr2 } from "../lib/finance";
import type { AttendanceStatus } from "../lib/finance-types";
import { addAdvance, addDeduction, addHoliday, addIncentive, approvePayroll, savePayroll, saveSalary, setAttendance } from "../lib/store";
import { DataGrid } from "./grid";
import { Badge, Btn, Panel, fieldLabel, input, muted } from "./kit";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DED = ["advance_recovery", "cost_recovery", "deduction"];

export function PayrollSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [month, setMonth] = useState(addMonths(currentMonth(), -1));
  const say = (err: string | null, ok: string) => notify(err ? `⚠ ${err}` : ok);
  const rows = computeMonth(db, month, true);
  const run = db.payrollRuns.find((r) => r.month === month);
  const locked = run?.status === "Approved";
  const pending = sum(rows.map((r) => r.pending));
  const f = db.fin;
  const tech = (id: string) => db.techs.find((t) => t.id === id)?.name ?? id;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Payroll month" actions={<>
        <input type="month" value={month} max={currentMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ ...input, width: "auto" }} />
        {run ? <Badge tone={locked ? "green" : "amber"}>{run.status}</Badge> : <Badge tone="grey">Not saved</Badge>}
      </>}>
        <p style={{ ...muted, margin: 0 }}>
          Hourly salary cost = monthly salary ÷ scheduled paid hours. Approved job hours × that rate go to jobs; the rest is <b>idle salary</b>, so 100% of pay is accounted for.
          Attendance {f.attendanceAffectsSalary ? "reduces" : "does not reduce"} pay · travel {f.labourIncludesTravel ? "counts" : "does not count"} as job labour · shared costs allocated by <b>{f.sharedBasis.replace(/_/g, " ")}</b> (Cost rules). Low job hours never cut salary.
        </p>
        {pending > 0 && !locked && <p style={{ margin: "8px 0 0", color: "var(--warning-text)", fontSize: 12.5, fontWeight: 600 }}>⚠ {pending} running/submitted time entr{pending === 1 ? "y" : "ies"} in {fmtMonth(month)} — approve them in Time Sheets before approving payroll.</p>}
        {locked && <p style={{ margin: "8px 0 0", color: "var(--success-text)", fontSize: 12.5, fontWeight: 600 }}>✓ Approved by {run.approvedBy} on {fmtDate(run.approvedAt ?? "")} — time, attendance, incentives and shared costs for {fmtMonth(month)} are locked.</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {!locked && <Btn kind="ghost" onClick={() => say(savePayroll(month, who), "Draft payroll saved with allocation details")}>{run ? "Recalculate draft" : "Save draft payroll"}</Btn>}
          {run?.status === "Draft" && <Btn onClick={() => { if (confirm(`Approve and lock payroll for ${fmtMonth(month)}?`)) say(approvePayroll(month, who), "Payroll approved and locked"); }}>Approve & lock</Btn>}
        </div>
      </Panel>

      <Panel title={locked ? `Payroll ${fmtMonth(month)} (live view; stored allocations are used in reports)` : `Payroll preview — ${fmtMonth(month)}`} pad={false}>
        <DataGrid exportName={`payroll-${month}`} rows={rows} rowKey={(r) => r.techId} cols={[
          { key: "n", head: "Technician", value: (r) => r.name },
          { key: "sh", head: "Scheduled h", value: (r) => r.result.scheduledHours, total: true },
          { key: "rate", head: "₹ / h", value: (r) => Math.round(r.result.hourlyCost * 100) / 100, money: true },
          { key: "wh", head: "Work h", value: (r) => Math.round(r.result.productiveHours * 100) / 100, total: true },
          { key: "jh", head: "Job h", value: (r) => Math.round(r.result.totalJobHours * 100) / 100, total: true, hidden: true },
          { key: "base", head: "Basic payable", value: (r) => r.result.payableBase, money: true, total: true },
          { key: "att", head: "Attendance ded.", value: (r) => r.result.attendanceDeduction, money: true, total: true, hidden: true },
          { key: "ot", head: "Overtime", value: (r) => r.result.overtimePay, money: true, total: true },
          { key: "inc", head: "Incentives", value: (r) => r.result.incentivesTotal, money: true, total: true },
          { key: "al", head: "Fixed allowances", value: (r) => r.result.allowancesTotal, money: true, total: true },
          { key: "re", head: "Reimbursements", value: (r) => sum(r.result.payslip.reimbursements.map((x) => x.amount)), money: true, total: true },
          { key: "de", head: "Deductions & advance rec.", value: (r) => sum(r.result.payslip.deductions.map((x) => x.amount)), money: true, total: true },
          { key: "net", head: "Net pay", value: (r) => r.result.payslip.netPay, money: true, total: true },
          { key: "emp", head: "Employer cost", value: (r) => r.result.employerCost, money: true, total: true },
          { key: "dl", head: "→ Job labour", value: (r) => r.result.directLabourTotal, money: true, total: true },
          { key: "idle", head: "→ Idle salary", value: (r) => r.result.idleCost, money: true, total: true },
          { key: "sa", head: "→ Shared to jobs", value: (r) => r.result.sharedAllocated, money: true, total: true },
          { key: "us", head: "→ Unallocated", value: (r) => r.result.unallocatedShared, money: true, total: true },
          { key: "ok", head: "Reconciles", value: (r) => (r.result.reconciliation.difference === 0 ? "✓" : String(r.result.reconciliation.difference)) },
        ]} />
      </Panel>

      <Panel title="Payslips">
        <div className="admin-grid-3">
          {rows.map((r) => {
            const stored = run?.status === "Approved" ? run.lines.filter((l) => l.techId === r.techId) : null;
            const lines = stored ?? [...r.result.payslip.earnings, ...r.result.payslip.reimbursements, ...r.result.payslip.deductions].map((l) => ({ type: l.type, label: l.label, amount: l.amount }));
            const net = sum(lines.map((l) => (DED.includes(l.type) ? -l.amount : l.amount)));
            return (
              <details key={r.techId} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13.5 }}>{r.name} — net {inr2(net)}</summary>
                <table style={{ width: "100%", fontSize: 12.5, marginTop: 8, borderCollapse: "collapse" }}><tbody>
                  {lines.map((l, i) => <tr key={i} style={{ borderTop: "1px solid var(--line)" }}><td style={{ padding: "4px 0" }}>{l.label}</td><td style={{ textAlign: "right", color: DED.includes(l.type) ? "var(--error-text)" : undefined }}>{DED.includes(l.type) ? "−" : ""}{inr2(l.amount)}</td></tr>)}
                  <tr style={{ borderTop: "1px solid var(--line)", fontWeight: 800 }}><td style={{ padding: "4px 0" }}>Net pay</td><td style={{ textAlign: "right" }}>{inr2(net)}</td></tr>
                </tbody></table>
                <p style={{ ...muted, margin: "8px 0 0" }}>Shared pool: {r.result.sharedPoolBreakdown.map((b) => `${b.label} ${inr(b.amount)}`).join(" · ") || "none"}. Reimbursements and advance recoveries settle cash only — they are not costs.</p>
              </details>
            );
          })}
        </div>
      </Panel>

      <div className="admin-grid-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <SalaryPanel db={db} who={who} say={say} />
        <AttendancePanel db={db} who={who} say={say} month={month} />
      </div>
      <div className="admin-grid-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <Panel title={`Incentives & deductions — ${fmtMonth(month)}`}>
          <Table2 rows={[
            ...db.incentives.filter((i) => i.month === month).map((i) => [tech(i.techId), "Incentive", i.jobId ?? "—", inr(i.amount), i.reason]),
            ...db.deductions.filter((x) => x.month === month).map((x) => [tech(x.techId), `Deduction · ${x.kind}`, "—", inr(x.amount), x.reason]),
          ]} head={["Technician", "Kind", "Job", "Amount", "Reason"]} />
          <AdjustForm db={db} month={month} onSave={(k, v) => say(k === "incentive" ? addIncentive({ ...v, month }, who) : addDeduction({ techId: v.techId, amount: v.amount, reason: v.reason, kind: k === "cost" ? "Cost recovery" : "Other", month }, who), "Saved")} />
        </Panel>
        <Panel title="Salary advances (recoverable — never an expense)">
          <Table2 head={["Technician", "Date", "Amount", "Recover / month", "Recovered", "Reason"]} rows={db.advances.map((a) => {
            const rec = sum(db.payrollRuns.filter((p) => p.status === "Approved").flatMap((p) => p.lines).filter((l) => l.type === "advance_recovery" && l.ref === a.id).map((l) => l.amount));
            return [tech(a.techId), fmtDate(a.date), inr(a.amount), inr(a.monthly), inr(rec), a.reason];
          })} />
          <AdvanceForm db={db} onSave={(v) => say(addAdvance(v, who), "Advance recorded")} />
        </Panel>
      </div>
    </div>
  );
}

function Table2({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="no-scroll" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 460 }}>
        <thead><tr>{head.map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--ink-mute)", textTransform: "uppercase", borderBottom: "1px solid var(--line)" }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: "7px 8px", borderBottom: "1px solid var(--line)" }}>{c}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={head.length} style={{ padding: 14, color: "var(--ink-mute)", textAlign: "center" }}>None.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SalaryPanel({ db, who, say }: { db: Db; who: string; say: (e: string | null, ok: string) => void }) {
  const [v, setV] = useState({ techId: db.techs[0]?.id ?? "", from: `${currentMonth()}-01`, payType: "Monthly" as "Monthly" | "Hourly", monthly: 0, hourly: 0, hoursPerDay: 8, otEnabled: false, otMultiplier: 1.5, workingWeekdays: [1, 2, 3, 4, 5, 6], a1: "Fixed travel allowance", a1v: 0, a2: "Mobile allowance", a2v: 0 });
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });
  return (
    <Panel title="Salary records (effective-dated)">
      <Table2 head={["Technician", "From", "To", "Pay", "h/day", "Days", "OT", "Allowances"]} rows={[...db.salaries].sort((a, b) => b.from.localeCompare(a.from)).map((s) => [
        db.techs.find((t) => t.id === s.techId)?.name ?? s.techId, fmtDate(s.from), s.to ? fmtDate(s.to) : "—", s.payType === "Monthly" ? `${inr(s.monthly)}/mo` : `${inr(s.hourly)}/h`,
        s.hoursPerDay, s.workingWeekdays.map((d) => DAYS[d]).join(" "), s.otEnabled ? `×${s.otMultiplier}` : "No", s.allowances.map((a) => `${a.name} ${inr(a.amount)}`).join(", ") || "—",
      ])} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, marginTop: 12 }}>
        <label><span style={fieldLabel}>Technician</span><select value={v.techId} onChange={(e) => set({ techId: e.target.value })} style={input}>{db.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label><span style={fieldLabel}>Effective from</span><input type="date" value={v.from} onChange={(e) => set({ from: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Pay type</span><select value={v.payType} onChange={(e) => set({ payType: e.target.value as "Monthly" | "Hourly" })} style={input}><option>Monthly</option><option>Hourly</option></select></label>
        <label><span style={fieldLabel}>{v.payType === "Monthly" ? "Monthly salary ₹" : "Hourly rate ₹"}</span><input type="number" min={0} value={(v.payType === "Monthly" ? v.monthly : v.hourly) || ""} onChange={(e) => set(v.payType === "Monthly" ? { monthly: Number(e.target.value) } : { hourly: Number(e.target.value) })} style={input} /></label>
        <label><span style={fieldLabel}>Scheduled h/day</span><input type="number" min={1} step={0.5} value={v.hoursPerDay} onChange={(e) => set({ hoursPerDay: Number(e.target.value) })} style={input} /></label>
        <label><span style={fieldLabel}>Overtime ×</span><span style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={v.otEnabled} onChange={(e) => set({ otEnabled: e.target.checked })} /><input type="number" step={0.25} min={1} value={v.otMultiplier} onChange={(e) => set({ otMultiplier: Number(e.target.value) })} style={input} /></span></label>
        <label style={{ gridColumn: "span 2" }}><span style={fieldLabel}>Allowance 1 (₹/month)</span><span style={{ display: "flex", gap: 6 }}><input value={v.a1} onChange={(e) => set({ a1: e.target.value })} style={input} /><input type="number" min={0} value={v.a1v || ""} onChange={(e) => set({ a1v: Number(e.target.value) })} style={{ ...input, width: 100 }} /></span></label>
        <label style={{ gridColumn: "span 2" }}><span style={fieldLabel}>Allowance 2 (₹/month)</span><span style={{ display: "flex", gap: 6 }}><input value={v.a2} onChange={(e) => set({ a2: e.target.value })} style={input} /><input type="number" min={0} value={v.a2v || ""} onChange={(e) => set({ a2v: Number(e.target.value) })} style={{ ...input, width: 100 }} /></span></label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0" }}>
        {DAYS.map((d, i) => <label key={d} style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={v.workingWeekdays.includes(i)} onChange={(e) => set({ workingWeekdays: e.target.checked ? [...v.workingWeekdays, i].sort() : v.workingWeekdays.filter((x) => x !== i) })} />{d}</label>)}
      </div>
      <Btn onClick={() => say(saveSalary({
        techId: v.techId, from: v.from, payType: v.payType, monthly: v.monthly, hourly: v.hourly, workingWeekdays: v.workingWeekdays, hoursPerDay: v.hoursPerDay,
        otEnabled: v.otEnabled, otMultiplier: v.otMultiplier, allowances: [[v.a1, v.a1v], [v.a2, v.a2v]].filter(([n, a]) => n && Number(a) > 0).map(([n, a]) => ({ name: String(n), amount: Number(a) })),
      }, who), "Salary record saved (previous one closed the day before)")}>Add salary record</Btn>
    </Panel>
  );
}

function AttendancePanel({ db, who, say, month }: { db: Db; who: string; say: (e: string | null, ok: string) => void; month: string }) {
  const [v, setV] = useState({ techId: db.techs[0]?.id ?? "", date: isoDay(0), status: "Absent" as AttendanceStatus });
  const [h, setH] = useState({ date: "", name: "" });
  return (
    <Panel title="Attendance & holidays">
      <Table2 head={["Technician", "Date", "Status"]} rows={db.attendance.filter((a) => a.date.startsWith(month)).map((a) => [db.techs.find((t) => t.id === a.techId)?.name ?? a.techId, fmtDate(a.date), a.status])} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
        <select value={v.techId} onChange={(e) => setV({ ...v, techId: e.target.value })} style={{ ...input, width: "auto" }}>{db.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} style={{ ...input, width: "auto" }} />
        <select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as AttendanceStatus })} style={{ ...input, width: "auto" }}>{(["Present", "Absent", "Paid leave", "Unpaid leave", "Half day"] as const).map((s) => <option key={s}>{s}</option>)}</select>
        <Btn kind="ghost" onClick={() => say(setAttendance(v, who), "Attendance saved")}>Save</Btn>
      </div>
      <p style={{ ...muted, margin: "14px 0 6px" }}>Paid holidays (excluded from scheduled hours): {db.holidays.map((x) => `${fmtDate(x.date)} ${x.name}`).join(" · ") || "none"}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} style={{ ...input, width: "auto" }} />
        <input placeholder="Holiday name" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} style={{ ...input, width: 180 }} />
        <Btn kind="ghost" disabled={!h.date || !h.name} onClick={() => say(addHoliday(h, who), "Holiday added")}>Add holiday</Btn>
      </div>
      <p style={{ ...muted, margin: "10px 0 0" }}>Hourly salary cost example: {(() => { const r = computeMonth(db, month)[0]; return r ? `${r.name} ${inr2(r.result.hourlyCost)}/h over ${fmtH(r.result.scheduledHours)}` : "—"; })()}</p>
    </Panel>
  );
}

function AdjustForm({ db, month, onSave }: { db: Db; month: string; onSave: (kind: "incentive" | "cost" | "other", v: { techId: string; amount: number; reason: string; jobId: string | null }) => void }) {
  const [v, setV] = useState({ kind: "incentive" as "incentive" | "cost" | "other", techId: db.techs[0]?.id ?? "", amount: 0, reason: "", jobId: "" });
  const jobs = db.jobs.filter((j) => j.date.startsWith(month) && (j.techId === v.techId || (j.helpers ?? []).includes(v.techId)));
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as typeof v.kind })} style={{ ...input, width: "auto" }}><option value="incentive">Incentive (employer cost)</option><option value="cost">Deduction: cost recovery</option><option value="other">Deduction: other</option></select>
      <select value={v.techId} onChange={(e) => setV({ ...v, techId: e.target.value })} style={{ ...input, width: "auto" }}>{db.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      {v.kind === "incentive" && <select value={v.jobId} onChange={(e) => setV({ ...v, jobId: e.target.value })} style={{ ...input, width: "auto" }}><option value="">Not job-linked</option>{jobs.map((j) => <option key={j.id}>{j.id}</option>)}</select>}
      <input type="number" min={0} placeholder="₹" value={v.amount || ""} onChange={(e) => setV({ ...v, amount: Number(e.target.value) })} style={{ ...input, width: 100 }} />
      <input placeholder="Reason" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} style={{ ...input, width: 180 }} />
      <Btn kind="ghost" onClick={() => onSave(v.kind, { techId: v.techId, amount: v.amount, reason: v.reason, jobId: v.jobId || null })}>Add</Btn>
    </div>
  );
}

function AdvanceForm({ db, onSave }: { db: Db; onSave: (v: { techId: string; date: string; amount: number; monthly: number; reason: string }) => void }) {
  const [v, setV] = useState({ techId: db.techs[0]?.id ?? "", date: isoDay(0), amount: 0, monthly: 0, reason: "" });
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      <select value={v.techId} onChange={(e) => setV({ ...v, techId: e.target.value })} style={{ ...input, width: "auto" }}>{db.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} style={{ ...input, width: "auto" }} />
      <input type="number" min={0} placeholder="Amount ₹" value={v.amount || ""} onChange={(e) => setV({ ...v, amount: Number(e.target.value) })} style={{ ...input, width: 110 }} />
      <input type="number" min={0} placeholder="₹ / month" value={v.monthly || ""} onChange={(e) => setV({ ...v, monthly: Number(e.target.value) })} style={{ ...input, width: 110 }} />
      <input placeholder="Reason" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} style={{ ...input, width: 160 }} />
      <Btn kind="ghost" onClick={() => onSave(v)}>Record advance</Btn>
    </div>
  );
}
