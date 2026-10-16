"use client";

import { useMemo, useState } from "react";
import { fmtDate, jobTotals, type Db, type Job } from "../lib/data";
import { addMonths, buildPeriod, completedOn, currentMonth, fmtH, fmtMonth, inr2, jobTechs, jobType, logHours, monthOf, monthsBetween, pct, type PeriodFilters, type PeriodReport } from "../lib/finance";
import { DataGrid, type GridCol } from "./grid";
import { Badge, Btn, Modal, Panel, muted } from "./kit";

const techName = (db: Db, id: string) => (id === "__unassigned__" ? "Unassigned" : db.techs.find((t) => t.id === id)?.name ?? id);
const custName = (db: Db, id: string) => db.customers.find((c) => c.id === id)?.name ?? "—";
const sel: React.CSSProperties = { border: "1.5px solid var(--line-strong)", borderRadius: 10, padding: "7px 9px", fontSize: 12.5, background: "var(--surface)", color: "var(--ink)" };

/* ───────────── shared filter bar ───────────── */

export function usePeriodFilters(defaultSpan = 0) {
  const now = currentMonth();
  return useState<PeriodFilters>({ from: addMonths(now, -defaultSpan), to: now });
}

export function FilterBar({ db, f, setF, show = ["tech", "customer", "type", "status"] }: { db: Db; f: PeriodFilters; setF: (f: PeriodFilters) => void; show?: ("tech" | "customer" | "type" | "status")[] }) {
  const now = currentMonth();
  const presets: [string, string, string][] = [["This month", now, now], ["Last month", addMonths(now, -1), addMonths(now, -1)], ["Last 3 months", addMonths(now, -2), now]];
  const types = [...new Set(db.jobs.map((j) => jobType(db, j)))].sort();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "10px 12px", boxShadow: "var(--shadow-card)" }}>
      {presets.map(([l, a, b]) => (
        <button key={l} onClick={() => setF({ ...f, from: a, to: b })} style={{ border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: f.from === a && f.to === b ? "var(--blue)" : "var(--bg-secondary)", color: f.from === a && f.to === b ? "white" : "var(--text-secondary)" }}>{l}</button>
      ))}
      <label style={{ ...muted, display: "flex", alignItems: "center", gap: 4 }}>From <input type="month" value={f.from} max={f.to} onChange={(e) => e.target.value && setF({ ...f, from: e.target.value })} style={sel} /></label>
      <label style={{ ...muted, display: "flex", alignItems: "center", gap: 4 }}>To <input type="month" value={f.to} min={f.from} onChange={(e) => e.target.value && setF({ ...f, to: e.target.value })} style={sel} /></label>
      {show.includes("tech") && <select value={f.techId ?? ""} onChange={(e) => setF({ ...f, techId: e.target.value || undefined })} style={sel} aria-label="Technician"><option value="">All technicians</option>{db.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
      {show.includes("customer") && <select value={f.customerId ?? ""} onChange={(e) => setF({ ...f, customerId: e.target.value || undefined })} style={sel} aria-label="Customer"><option value="">All customers</option>{db.customers.filter((c) => !c.mergedInto).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      {show.includes("type") && <select value={f.jobType ?? ""} onChange={(e) => setF({ ...f, jobType: e.target.value || undefined })} style={sel} aria-label="Job type"><option value="">All job types</option>{types.map((t) => <option key={t}>{t}</option>)}</select>}
      {show.includes("status") && <select value={f.status ?? ""} onChange={(e) => setF({ ...f, status: e.target.value || undefined })} style={sel} aria-label="Status"><option value="">All statuses</option>{[...new Set(db.jobs.map((j) => j.status))].map((s) => <option key={s}>{s}</option>)}</select>}
      {(f.techId || f.customerId || f.jobType || f.status) && <Btn small kind="ghost" onClick={() => setF({ from: f.from, to: f.to })}>Clear</Btn>}
    </div>
  );
}

/* ───────────── small charts (honest bars) ───────────── */

function PairBars({ rows, a, b }: { rows: { label: string; a: number; b: number }[]; a: string; b: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.a), Math.abs(r.b)]));
  return (
    <div>
      <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 8 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--blue)", marginRight: 5 }} />{a}</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--gold)", marginRight: 5 }} />{b}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 3, display: "flex", justifyContent: "space-between" }}><span>{r.label}</span><span style={muted}>{inr2(r.a)} · {inr2(r.b)}</span></div>
          {[["a", r.a, "var(--blue)"], ["b", r.b, "var(--gold)"]].map(([k, v, c]) => (
            <div key={k as string} title={`${k === "a" ? a : b}: ${inr2(v as number)}`} style={{ height: 7, borderRadius: 4, background: "var(--line)", marginTop: 3, position: "relative" }}>
              <div style={{ width: `${(Math.abs(v as number) / max) * 100}%`, height: "100%", borderRadius: 4, background: (v as number) < 0 ? "var(--error-text)" : (c as string) }} />
            </div>
          ))}
        </div>
      ))}
      {!rows.length && <p style={muted}>No data.</p>}
    </div>
  );
}

function Bars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(([, v]) => Math.abs(v)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map(([k, v]) => (
        <div key={k} title={`${k}: ${inr2(v)}`}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}><span>{k}</span><b style={{ color: v < 0 ? "var(--error-text)" : undefined }}>{inr2(v)}</b></div>
          <div style={{ height: 7, borderRadius: 4, background: "var(--line)" }}><div style={{ width: `${(Math.abs(v) / max) * 100}%`, height: "100%", borderRadius: 4, background: v < 0 ? "var(--error-text)" : "var(--blue)" }} /></div>
        </div>
      ))}
      {!rows.length && <p style={muted}>No data.</p>}
    </div>
  );
}

function Card({ label, value, sub, tone, onClick }: { label: string; value: string; sub?: React.ReactNode; tone: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="press" style={{ textAlign: "left", cursor: onClick ? "pointer" : "default", background: "var(--surface)", borderRadius: 16, padding: "14px 16px", boxShadow: "var(--shadow-card)", border: "1px solid var(--line)", borderTop: `3px solid ${tone}`, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)", fontWeight: 500, display: "flex", justifyContent: "space-between" }}>{label}{onClick && <span style={{ color: "var(--ink-mute)" }}>›</span>}</p>
      <p style={{ margin: "4px 0 0", fontSize: 21, fontWeight: 800, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {sub && <div style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-mute)" }}>{sub}</div>}
    </button>
  );
}

/* ───────────── drill-down records ───────────── */

type Drill = { title: string; body: React.ReactNode } | null;

function jobCols(db: Db, openJob: (id: string) => void): GridCol<PeriodReport["jobs"][number]>[] {
  return [
    { key: "id", head: "Job", value: (r) => r.job.id, render: (r) => <button onClick={() => openJob(r.job.id)} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontWeight: 700, cursor: "pointer" }}>{r.job.id}</button> },
    { key: "cust", head: "Customer", value: (r) => r.job.customerName ?? "", filter: true },
    { key: "type", head: "Job type", value: (r) => r.job.jobType, filter: true },
    { key: "status", head: "Status", value: (r) => r.job.status, filter: true },
    { key: "tech", head: "Technicians", value: (r) => r.job.technicians.map((t) => techName(db, t.technicianId)).join(", ") },
    { key: "rev", head: "Revenue (ex GST)", value: (r) => r.revenue, money: true, total: true },
    { key: "mat", head: "Materials", value: (r) => r.materials, money: true, total: true },
    { key: "lab", head: "Direct labour", value: (r) => r.labour, money: true, total: true },
    { key: "dex", head: "Direct expenses", value: (r) => r.directExpenses, money: true, total: true },
    { key: "gp", head: "Gross profit", value: (r) => r.grossProfit, money: true, total: true },
    { key: "gm", head: "GM %", value: (r) => (r.grossMarginPct == null ? null : Math.round(r.grossMarginPct * 10) / 10), align: "right" },
    { key: "sh", head: "Allocated tech shared", value: (r) => r.sharedTechAlloc, money: true, total: true, hidden: true },
    { key: "oh", head: "Allocated overhead", value: (r) => r.companyOverheadAlloc, money: true, total: true, hidden: true },
    { key: "ap", head: "Allocated profit", value: (r) => r.allocatedProfit, money: true, total: true },
    { key: "hrs", head: "Work hours", value: (r) => Math.round(r.labourHours * 100) / 100, total: true, hidden: true },
    { key: "est", head: "Est. profit", value: (r) => r.estimatedProfit, money: true, hidden: true },
    { key: "split", head: "Split", value: (r) => r.splitMethod, hidden: true },
    { key: "flags", head: "Flags", value: (r) => [r.flags.wip && "WIP", r.flags.notInvoiced && "Not invoiced", r.flags.incompleteTime && "Time pending", r.flags.pendingExpenses && "Claim pending", r.flags.missingMaterialCost && "No part cost"].filter(Boolean).join(", ") },
  ];
}

function JobList({ db, jobs, openJob, name }: { db: Db; jobs: Job[]; openJob: (id: string) => void; name: string }) {
  return (
    <DataGrid exportName={name} rows={jobs} rowKey={(j) => j.id} cols={[
      { key: "id", head: "Job", value: (j) => j.id, render: (j) => <button onClick={() => openJob(j.id)} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontWeight: 700, cursor: "pointer" }}>{j.id}</button> },
      { key: "date", head: "Date", value: (j) => j.date, render: (j) => fmtDate(j.date) },
      { key: "c", head: "Customer", value: (j) => custName(db, j.customerId), filter: true },
      { key: "type", head: "Type", value: (j) => jobType(db, j), filter: true },
      { key: "st", head: "Status", value: (j) => j.status, filter: true },
      { key: "t", head: "Technicians", value: (j) => jobTechs(j).map((t) => techName(db, t)).join(", ") },
      { key: "v", head: "Value (ex GST)", value: (j) => jobTotals(j, db.settings).taxable, money: true, total: true },
      { key: "due", head: "Due", value: (j) => jobTotals(j, db.settings).due, money: true, total: true, hidden: true },
    ]} />
  );
}

/* ───────────── Profitability dashboard ───────────── */

export function ProfitSection({ db, openJob }: { db: Db; openJob: (id: string) => void }) {
  const [f, setF] = usePeriodFilters(0);
  const [drill, setDrill] = useState<Drill>(null);
  const r = useMemo(() => buildPeriod(db, f), [db, f]);
  const t = r.totals;
  const months = monthsBetween(f.from, f.to);
  const inRange = (d: string) => months.includes(monthOf(d));
  const period = f.from === f.to ? fmtMonth(f.from) : `${fmtMonth(f.from)} – ${fmtMonth(f.to)}`;
  const open = (title: string, body: React.ReactNode) => setDrill({ title, body });
  const jobsBy = (ids: Set<string> | ((j: Job) => boolean)) => db.jobs.filter(typeof ids === "function" ? ids : (j) => ids.has(j.id));
  const okJob = (j: Job) => (!f.techId || jobTechs(j).includes(f.techId)) && (!f.customerId || j.customerId === f.customerId) && (!f.jobType || jobType(db, j) === f.jobType) && (!f.status || j.status === f.status);

  const byType = new Map<string, number>();
  r.jobs.forEach((j) => byType.set(j.job.jobType, (byType.get(j.job.jobType) ?? 0) + j.grossProfit));
  const catList: [string, number][] = [...r.expenseCats.map((c): [string, number] => [c.name, c.amount]), ["Direct labour (salary to jobs)", t.labour], ["Materials consumed", t.materials]];
  if (!r.filtered) catList.push(["Idle salary", t.idleSalary]);
  const cats = catList.filter(([, v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const rc = r.full.reconciliation;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <FilterBar db={db} f={f} setF={setF} />
      <p style={{ ...muted, margin: 0 }}>Profitability for <b>{period}</b> · revenue excludes GST · every card opens its records.</p>
      {r.filtered && <div style={note("blue")}>Filtered view — company overhead appears as the selected jobs&apos; allocated share (a reporting allocation, deducted once).</div>}
      {r.warnings.map((w) => <div key={w} style={note("amber")}>⚠ {w}</div>)}

      <div className="admin-grid-4">
        <Card tone="var(--blue)" label="Revenue (ex GST)" value={inr2(t.revenue)} sub={`Invoiced ${inr2(r.invoiced)}`} onClick={() => open("Revenue by job", <DataGrid exportName="revenue" rows={r.jobs.filter((j) => j.revenue)} rowKey={(x) => x.job.id} cols={jobCols(db, openJob)} />)} />
        <Card tone="var(--success-text)" label="Payments collected" value={inr2(r.cash)} sub="Cash in, net of refunds (incl. GST)" onClick={() => open("Payments collected", <DataGrid exportName="payments" rows={db.jobs.filter(okJob).flatMap((j) => j.payments.filter((p) => inRange(p.at)).map((p) => ({ ...p, job: j })))} rowKey={(p) => p.id} cols={[
          { key: "at", head: "Date", value: (p) => p.at, render: (p) => fmtDate(p.at) }, { key: "j", head: "Job", value: (p) => p.job.id }, { key: "c", head: "Customer", value: (p) => custName(db, p.job.customerId), filter: true },
          { key: "m", head: "Method", value: (p) => p.method, filter: true }, { key: "r", head: "Ref", value: (p) => p.ref }, { key: "a", head: "Amount", value: (p) => (p.refund ? -p.amount : p.amount), money: true, total: true },
        ]} />)} />
        <Card tone="var(--gold)" label="Outstanding balances" value={inr2(r.outstanding)} sub="All open invoices (incl. GST)" onClick={() => open("Outstanding customer balances", <JobList db={db} name="outstanding" openJob={openJob} jobs={db.jobs.filter((j) => j.invoice && jobTotals(j, db.settings).due > 0)} />)} />
        <Card tone="var(--purple)" label="Gross profit" value={inr2(t.grossProfit)} sub={`Gross margin ${pct(t.grossMarginPct)}`} onClick={() => open("Job profitability", <DataGrid exportName="job-profitability" rows={r.jobs} rowKey={(x) => x.job.id} cols={jobCols(db, openJob)} />)} />
        <Card tone="var(--info-text)" label="Direct material cost" value={inr2(t.materials)} sub="Parts consumed on jobs (at cost)" onClick={() => open("Materials consumed", <DataGrid exportName="materials" rows={db.jobs.filter((j) => okJob(j) && completedOn(j) && inRange(completedOn(j)!)).flatMap((j) => j.lines.filter((l) => l.kind === "Part").map((l) => ({ l, j, cost: l.unitCost ?? db.parts.find((p) => p.id === l.refId)?.cost ?? 0 })))} rowKey={(x) => x.j.id + x.l.id} cols={[
          { key: "j", head: "Job", value: (x) => x.j.id }, { key: "d", head: "Completed", value: (x) => completedOn(x.j) ?? "", render: (x) => fmtDate(completedOn(x.j) ?? "") }, { key: "p", head: "Part", value: (x) => x.l.name, filter: true },
          { key: "q", head: "Qty", value: (x) => x.l.qty, total: true }, { key: "u", head: "Unit cost", value: (x) => x.cost, money: true }, { key: "t", head: "Cost", value: (x) => x.l.qty * x.cost, money: true, total: true },
        ]} />)} />
        <Card tone="var(--blue-dark)" label="Direct labour cost" value={inr2(t.labour)} sub="Salary/h × approved job hours + OT" onClick={() => open("Direct labour by job", <DataGrid exportName="labour" rows={r.jobs.filter((j) => j.labour)} rowKey={(x) => x.job.id} cols={jobCols(db, openJob)} />)} />
        <Card tone="var(--ink-soft)" label="Direct job expenses" value={inr2(t.directExpenses)} sub="Petrol, travel, food on jobs" onClick={() => open("Direct job expenses", <ExpenseList db={db} rows={db.expenses.filter((e) => e.cls === "Direct job" && e.status === "Approved" && inRange(e.date) && (!e.jobId || okJob(db.jobs.find((j) => j.id === e.jobId) ?? db.jobs[0])))} />)} />
        <Card tone="var(--error-text)" label="Operating expenses" value={inr2(t.remainingOpex)} sub={r.filtered ? "Allocated share" : `Overhead ${inr2(t.operatingExpenses)} · idle salary ${inr2(t.idleSalary)} · tech shared ${inr2(t.technicianSharedCosts)}`} onClick={() => open("Operating expenses (deducted once)", <ExpenseList db={db} rows={db.expenses.filter((e) => e.cls !== "Direct job" && e.status === "Approved" && inRange(e.date))} extra={`Plus idle / unallocated salary ${inr2(t.idleSalary)} — see Payroll.`} />)} />
      </div>

      <div className="admin-grid-2">
        <div style={{ background: "var(--surface)", borderRadius: 16, padding: 18, boxShadow: "var(--shadow-card)", border: "1px solid var(--line)", borderTop: `3px solid ${t.netOperatingProfit < 0 ? "var(--error-text)" : "var(--success-text)"}` }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Net operating profit</p>
          <p style={{ margin: "4px 0", fontSize: 28, fontWeight: 800, color: t.netOperatingProfit < 0 ? "var(--error-text)" : "var(--ink)" }}>{inr2(t.netOperatingProfit)}</p>
          <p style={{ ...muted, margin: 0 }}>Net margin {pct(t.netMarginPct)} · gross profit {inr2(t.grossProfit)} − operating {inr2(t.remainingOpex)}</p>
          {!r.filtered && (
            <div style={{ marginTop: 10, background: "var(--bg-secondary)", borderRadius: 10, padding: 10, fontSize: 12 }}>
              <b>Reconciliation</b><br />Σ job allocated profit {inr2(rc.sumJobAllocatedProfit)} − unallocated overhead {inr2(rc.unallocatedOverhead)} = {inr2(rc.derivedNetOperatingProfit)}
              <br /><span style={{ color: rc.ok ? "var(--success-text)" : "var(--error-text)", fontWeight: 700 }}>{rc.ok ? "✓ Matches — every rupee of overhead deducted once" : `Difference ${inr2(rc.difference)}`}</span>
            </div>
          )}
        </div>
        <div className="admin-grid-4" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
          <Card tone="var(--blue)" label="Jobs · completed · pending" value={`${r.stats.created} · ${r.stats.completed} · ${r.stats.pending}`} sub="Created / completed in period · open now" onClick={() => open("Jobs", <JobList db={db} name="jobs" openJob={openJob} jobs={jobsBy((j) => okJob(j) && (inRange(j.createdAt) || Boolean(completedOn(j) && inRange(completedOn(j)!))))} />)} />
          <Card tone="var(--error-text)" label="Callbacks" value={String(r.stats.callbacks)} sub="Repeat visits logged" onClick={() => open("Callbacks", <JobList db={db} name="callbacks" openJob={openJob} jobs={jobsBy((j) => Boolean(j.parentJobId) && okJob(j))} />)} />
          <Card tone="var(--purple)" label="Actual vs estimated hours" value={`${fmtH(r.stats.actualHours)} / ${fmtH(r.stats.estHours)}`} sub="Completed jobs with an estimate" onClick={() => open("Estimated vs actual", <DataGrid exportName="estimate-vs-actual" rows={r.jobs.filter((j) => j.job.estimatedHours)} rowKey={(x) => x.job.id} cols={[
            ...jobCols(db, openJob).slice(0, 4),
            { key: "eh", head: "Est. hours", value: (x) => x.job.estimatedHours, total: true },
            { key: "ah", head: "Actual work h", value: (x) => Math.round(db.timeLogs.filter((l) => l.jobId === x.job.id && l.status === "Approved" && l.kind === "Work").reduce((a, l) => a + logHours(l), 0) * 100) / 100, total: true },
            { key: "ep", head: "Est. profit", value: (x) => x.estimatedProfit, money: true, total: true }, { key: "gp", head: "Actual gross profit", value: (x) => x.grossProfit, money: true, total: true },
          ]} />)} />
          <Card tone="var(--success-text)" label="Technician utilisation" value={pct(r.utilisation.pct)} sub={`${fmtH(r.utilisation.productive)} productive of ${fmtH(r.utilisation.scheduled)} scheduled`} onClick={() => open("Utilisation", <DataGrid exportName="utilisation" rows={Object.entries(r.techCost)} rowKey={([id]) => id} cols={[
            { key: "t", head: "Technician", value: ([id]) => techName(db, id) }, { key: "s", head: "Scheduled h", value: ([, c]) => c.scheduled, total: true },
            { key: "p", head: "Productive h", value: ([, c]) => Math.round(c.productive * 100) / 100, total: true }, { key: "tr", head: "Travel h", value: ([, c]) => Math.round(c.travel * 100) / 100, total: true },
            { key: "u", head: "Utilisation %", value: ([, c]) => (c.scheduled ? Math.round((c.productive / c.scheduled) * 1000) / 10 : null), align: "right" },
          ]} />)} />
        </div>
      </div>

      <div className="admin-grid-2">
        <Panel title="Revenue vs direct cost (monthly)"><PairBars a="Revenue" b="Direct cost" rows={r.monthly.map((m) => ({ label: fmtMonth(m.month), a: m.revenue, b: m.directCost }))} /></Panel>
        <Panel title="Monthly profit"><PairBars a="Gross profit" b="Net operating profit" rows={r.monthly.map((m) => ({ label: fmtMonth(m.month), a: m.grossProfit, b: m.netOperatingProfit }))} /></Panel>
      </div>
      <div className="admin-grid-3">
        <Panel title="Gross profit by job type"><Bars rows={[...byType].sort((a, b) => b[1] - a[1])} /></Panel>
        <Panel title="Cost & expense categories"><Bars rows={cats} /></Panel>
        <Panel title="Technician performance"><PairBars a="Attributed revenue" b="Fully allocated contribution" rows={r.technicians.filter((x) => x.technicianId !== "__unassigned__").map((x) => ({ label: techName(db, x.technicianId), a: x.attributedRevenue, b: x.fullyAllocatedContribution }))} /></Panel>
      </div>
      <Panel title="Job profitability" pad={false}><DataGrid exportName="job-profitability" rows={r.jobs} rowKey={(x) => x.job.id} cols={jobCols(db, openJob)} /></Panel>

      {drill && <Modal title={drill.title} onClose={() => setDrill(null)} width={1100}><div style={{ margin: -18 }}>{drill.body}</div></Modal>}
    </div>
  );
}

function ExpenseList({ db, rows, extra }: { db: Db; rows: Db["expenses"]; extra?: string }) {
  return (
    <>
      <DataGrid exportName="expenses" rows={rows} rowKey={(e) => e.id} cols={[
        { key: "d", head: "Date", value: (e) => e.date, render: (e) => fmtDate(e.date) }, { key: "c", head: "Category", value: (e) => e.category, filter: true },
        { key: "cl", head: "Class", value: (e) => e.cls, filter: true }, { key: "j", head: "Job", value: (e) => e.jobId ?? "" }, { key: "t", head: "Technician", value: (e) => (e.techId ? techName(db, e.techId) : "") },
        { key: "a", head: "Amount", value: (e) => e.amount, money: true, total: true },
      ]} />
      {extra && <p style={{ ...muted, padding: "0 16px 12px" }}>{extra}</p>}
    </>
  );
}

const note = (tone: "amber" | "blue"): React.CSSProperties => ({
  borderRadius: 12, padding: "9px 12px", fontSize: 12.5, fontWeight: 500,
  background: tone === "amber" ? "var(--gold-tint)" : "var(--blue-tint)", color: tone === "amber" ? "var(--gold-dark)" : "var(--blue-dark)",
});

/* ───────────── Technician profitability ───────────── */

export function TechProfitSection({ db }: { db: Db }) {
  const [f, setF] = usePeriodFilters(0);
  const r = useMemo(() => buildPeriod(db, { from: f.from, to: f.to, techId: f.techId }), [db, f]);
  const rc = r.full.reconciliation;
  const rows = r.technicians;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <FilterBar db={db} f={f} setF={setF} show={["tech"]} />
      {r.warnings.filter((w) => /provisional|salary/.test(w)).map((w) => <div key={w} style={note("amber")}>⚠ {w}</div>)}
      <div style={note("blue")}>
        Multi-technician jobs split revenue by approved labour hours (or an approved manual %), never the full amount per technician. Σ technician gross contribution {inr2(rc.techGrossContributionTotal)} = company job gross profit {rc.techGrossDifference === 0 ? "✓" : `(difference ${inr2(rc.techGrossDifference)})`}
      </div>
      <Panel title="Technician profitability" pad={false}>
        <DataGrid exportName="technician-profitability" rows={rows} rowKey={(x) => x.technicianId} cols={[
          { key: "n", head: "Technician", value: (x) => techName(db, x.technicianId) },
          { key: "as", head: "Assigned jobs", value: (x) => x.assignedJobs, total: true },
          { key: "co", head: "Completed", value: (x) => x.completedJobs, total: true },
          { key: "ph", head: "Productive h", value: (x) => Math.round((r.techCost[x.technicianId]?.productive ?? x.productiveHours) * 100) / 100, total: true },
          { key: "th", head: "Travel h", value: (x) => Math.round((r.techCost[x.technicianId]?.travel ?? x.travelHours) * 100) / 100, total: true },
          { key: "lab", head: "Salary to jobs", value: (x) => x.labour, money: true, total: true },
          { key: "idle", head: "Idle salary", value: (x) => x.idleCost, money: true, total: true },
          { key: "ot", head: "Overtime", value: (x) => r.techCost[x.technicianId]?.overtime ?? 0, money: true, total: true },
          { key: "inc", head: "Incentives", value: (x) => r.techCost[x.technicianId]?.incentives ?? 0, money: true, total: true },
          { key: "dex", head: "Direct allowances (job exp.)", value: (x) => x.attributedDirectExpenses, money: true, total: true },
          { key: "sh", head: "Allocated allowances", value: (x) => x.sharedAllocated, money: true, total: true },
          { key: "ush", head: "Unallocated allowances", value: (x) => x.sharedUnallocated, money: true, total: true, hidden: true },
          { key: "mat", head: "Materials", value: (x) => x.attributedMaterials, money: true, total: true },
          { key: "rev", head: "Attributed revenue", value: (x) => x.attributedRevenue, money: true, total: true },
          { key: "gc", head: "Gross contribution", value: (x) => x.grossContribution, money: true, total: true },
          { key: "fc", head: "Fully allocated", value: (x) => x.fullyAllocatedContribution, money: true, total: true },
          { key: "cb", head: "Callback rate %", value: (x) => (x.callbackRatePct == null ? null : Math.round(x.callbackRatePct * 10) / 10), align: "right" },
          { key: "avg", head: "Avg h / job", value: (x) => (x.avgHoursPerCompletedJob == null ? null : Math.round(x.avgHoursPerCompletedJob * 100) / 100), align: "right" },
        ]} />
      </Panel>
      <p style={{ ...muted, margin: 0 }}>Gross contribution = attributed revenue − attributed materials − attributed direct job expenses − own salary on jobs (incl. OT & job incentives). Fully allocated = gross − allocated/unallocated allowances & shared costs − idle salary. Company overhead is not charged to technicians. <Badge tone="grey">Unassigned</Badge> collects jobs with no technician.</p>
    </div>
  );
}
