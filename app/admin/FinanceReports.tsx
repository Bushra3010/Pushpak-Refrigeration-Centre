"use client";

import { useState } from "react";
import { round2 } from "../lib/calc/money";
import { isoDay, jobTotals, type Db } from "../lib/data";
import { buildPeriod, completedOn, computeMonth, logHours, monthsBetween, monthOf, type PeriodFilters } from "../lib/finance";
import { downloadCsv } from "./grid";
import { Btn, Panel, muted } from "./kit";
import { FilterBar, usePeriodFilters } from "./Profit";

/** One-click CSV exports for every finance report (open in Excel / Google Sheets). */
export function FinanceReports({ db }: { db: Db }) {
  const [f, setF] = usePeriodFilters(0);
  const [busy, setBusy] = useState(false);
  const tech = (id: string) => db.techs.find((t) => t.id === id)?.name ?? (id === "__unassigned__" ? "Unassigned" : id);
  const tag = `${f.from}_${f.to}`;
  const months = monthsBetween(f.from, f.to);
  const inRange = (d: string) => months.includes(monthOf(d));
  const run = (fn: (r: ReturnType<typeof buildPeriod>, f: PeriodFilters) => void) => { setBusy(true); try { fn(buildPeriod(db, f), f); } finally { setBusy(false); } };

  const reports: [string, () => void][] = [
    ["Job profitability", () => run((r) => downloadCsv(`job-profitability-${tag}`, [
      ["Job", "Customer", "Type", "Status", "Technicians", "Split", "Revenue ex GST", "Materials", "Direct labour", "Direct expenses", "Gross profit", "GM %", "Allocated tech shared", "Allocated overhead", "Allocated profit", "Flags"],
      ...r.jobs.map((j) => [j.job.id, j.job.customerName ?? "", j.job.jobType, j.job.status, j.job.technicians.map((t) => tech(t.technicianId)).join("; "), j.splitMethod, j.revenue, j.materials, j.labour, j.directExpenses, j.grossProfit, j.grossMarginPct == null ? "" : round2(j.grossMarginPct), j.sharedTechAlloc, j.companyOverheadAlloc, j.allocatedProfit,
        [j.flags.wip && "WIP", j.flags.notInvoiced && "Not invoiced", j.flags.incompleteTime && "Time pending", j.flags.pendingExpenses && "Claim pending"].filter(Boolean).join("; ")]),
    ]))],
    ["Technician profitability", () => run((r) => downloadCsv(`technician-profitability-${tag}`, [
      ["Technician", "Assigned", "Completed", "Productive h", "Travel h", "Salary to jobs", "Idle salary", "Overtime", "Incentives", "Direct job expenses", "Allocated allowances", "Unallocated allowances", "Materials", "Attributed revenue", "Gross contribution", "Fully allocated", "Callback rate %"],
      ...r.technicians.map((t) => [tech(t.technicianId), t.assignedJobs, t.completedJobs, round2(r.techCost[t.technicianId]?.productive ?? 0), round2(r.techCost[t.technicianId]?.travel ?? 0), t.labour, t.idleCost, r.techCost[t.technicianId]?.overtime ?? 0, r.techCost[t.technicianId]?.incentives ?? 0, t.attributedDirectExpenses, t.sharedAllocated, t.sharedUnallocated, t.attributedMaterials, t.attributedRevenue, t.grossContribution, t.fullyAllocatedContribution, t.callbackRatePct == null ? "" : round2(t.callbackRatePct)]),
    ]))],
    ["Payroll & allowances", () => downloadCsv(`payroll-allowances-${tag}`, [
      ["Month", "Technician", "Scheduled h", "₹/h", "Basic payable", "Attendance deduction", "Overtime", "Incentives", "Fixed allowances", "Shared pool", "Employer cost", "Net pay", "→ Job labour", "→ Idle", "→ Shared to jobs", "→ Unallocated"],
      ...months.flatMap((m) => computeMonth(db, m, false).map((x) => [m, x.name, x.result.scheduledHours, round2(x.result.hourlyCost), x.result.payableBase, x.result.attendanceDeduction, x.result.overtimePay, x.result.incentivesTotal, x.result.allowancesTotal, x.result.sharedPool, x.result.employerCost, x.result.payslip.netPay, x.result.directLabourTotal, x.result.idleCost, x.result.sharedAllocated, x.result.unallocatedShared])),
    ])],
    ["Material consumption", () => downloadCsv(`material-consumption-${tag}`, [
      ["Job", "Completed", "Part", "Qty", "Unit cost", "Cost", "Sale price", "Margin"],
      ...db.jobs.filter((j) => completedOn(j) && inRange(completedOn(j)!)).flatMap((j) => j.lines.filter((l) => l.kind === "Part").map((l) => {
        const c = l.unitCost ?? db.parts.find((p) => p.id === l.refId)?.cost ?? 0;
        return [j.id, completedOn(j)!, l.name, l.qty, c, round2(l.qty * c), round2(l.qty * l.price), round2(l.qty * (l.price - c))];
      })),
    ])],
    ["Inventory (stock & value)", () => downloadCsv(`inventory-${isoDay(0)}`, [
      ["SKU", "Part", "Unit", "Warehouse", "In vans", "Total", "Cost", "Stock value", "Min stock", "Low?"],
      ...db.parts.map((p) => { const vans = db.techs.reduce((a, t) => a + (t.van[p.id] ?? 0), 0); return [p.sku, p.name, p.unit, p.stock, vans, p.stock + vans, p.cost, round2((p.stock + vans) * p.cost), p.minStock, p.stock <= p.minStock ? "Yes" : ""]; }),
    ])],
    ["Customer receivables", () => downloadCsv(`receivables-${isoDay(0)}`, [
      ["Customer", "Job", "Invoice", "Invoice date", "Total", "Paid", "Due", "Days since invoice"],
      ...db.jobs.filter((j) => j.invoice && jobTotals(j, db.settings).due > 0).map((j) => { const t = jobTotals(j, db.settings); return [db.customers.find((c) => c.id === j.customerId)?.name ?? "", j.id, j.invoice!.no, j.invoice!.at.slice(0, 10), t.total, t.paid, t.due, Math.round((Date.now() - new Date(j.invoice!.at).getTime()) / 86_400_000)]; }),
    ])],
    ["Monthly operating profit", () => run((r) => downloadCsv(`monthly-profit-${tag}`, [["Month", "Revenue ex GST", "Direct cost", "Gross profit", "Net operating profit", "Cash collected"], ...r.monthly.map((m) => [m.month, m.revenue, m.directCost, m.grossProfit, m.netOperatingProfit, m.cash])]))],
    ["Estimated vs actual", () => run((r) => downloadCsv(`estimate-vs-actual-${tag}`, [
      ["Job", "Type", "Est. hours", "Actual work h", "Est. revenue", "Actual revenue", "Est. material cost", "Actual materials", "Est. gross profit", "Actual gross profit"],
      ...r.jobs.map((j) => [j.job.id, j.job.jobType, j.job.estimatedHours, round2(db.timeLogs.filter((l) => l.jobId === j.job.id && l.status === "Approved" && l.kind === "Work").reduce((a, l) => a + logHours(l), 0)), j.job.estimatedRevenue, j.revenue, j.job.estimatedCost, j.materials, j.estimatedProfit, j.grossProfit]),
    ]))],
  ];
  return (
    <Panel title="Finance reports (CSV / Excel)">
      <FilterBar db={db} f={f} setF={setF} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {reports.map(([name, fn]) => <Btn key={name} kind="ghost" disabled={busy} onClick={fn}>⬇ {name}</Btn>)}
      </div>
      <p style={{ ...muted, margin: "10px 0 0" }}>CSV files open directly in Excel and Google Sheets. Printable quotations and invoices are in the job drawer.</p>
    </Panel>
  );
}
