/* Finance add-on — derivations over the shared Db:
 *  • technician month cost model (salary → jobs, idle salary, shared allowances)
 *  • payroll run payload (payslip lines + stored allocations)
 *  • period profitability: job / technician / company, reconciled
 * The maths lives in ./calc (unit-tested); this file only gathers the inputs.
 * Rules are documented in docs/PROFITABILITY.md. */

import { round2, sum } from "./calc/money";
import { computeTechnicianMonth, type AttendanceStatus as CalcAttendance, type TechMonthResult, type WeekdayIndex } from "./calc/payroll";
import { computeProfitability, type JobInfo, type PeriodLedger, type ProfitabilityResult } from "./calc/profitability";
import { isDone, isOpen, jobTotals, type Db, type Job } from "./data";
import type { CostAllocation, PayrollLine, PayrollRun, SalaryRecord, TimeLog } from "./finance-types";

/* ───────────── dates & hours ───────────── */

export const monthOf = (iso: string) => iso.slice(0, 7);
export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export function addMonths(m: string, n: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 36; m = addMonths(m, 1)) out.push(m);
  return out;
}
export const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtMonth = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const ms = (iso: string) => new Date(iso.length === 16 ? `${iso}:00` : iso).getTime();
export const logHours = (l: Pick<TimeLog, "start" | "end">, now = Date.now()) => Math.max(0, ((l.end ? ms(l.end) : now) - ms(l.start)) / 3_600_000);
export const fmtH = (h: number) => `${(Math.round(h * 100) / 100).toLocaleString("en-IN")} h`;
export const inr2 = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(1)}%`);

/** Date a job's work was completed (local ISO date), if it has been. */
export function completedOn(j: Job): string | null {
  const e = [...j.timeline].reverse().find((t) => t.status === "Work Completed");
  return e ? e.at.slice(0, 10) : isDone(j) ? (j.invoice?.at ?? j.date).slice(0, 10) : null;
}
export const jobTechs = (j: Job) => [j.techId, ...(j.helpers ?? [])].filter((x): x is string => Boolean(x));

/** Job type for reporting: callback, AMC, or the category of the first service line. */
export function jobType(db: Db, j: Job): string {
  if (j.parentJobId) return "Callback";
  if (j.source === "AMC Visit") return "AMC visit";
  const svc = j.lines.find((l) => l.kind === "Service" && l.refId);
  const cat = svc ? db.services.find((s) => s.id === svc.refId)?.category : undefined;
  return ({ Visit: "Inspection", Service: "Servicing", Repair: "Repair", Gas: "Gas charging", Installation: "Installation", AMC: "AMC visit" } as Record<string, string>)[cat ?? ""] ?? (j.work.serviceType || "Repair");
}

/* ───────────── payroll / technician cost ───────────── */

export function salaryFor(db: Db, techId: string, month: string): SalaryRecord | null {
  const s = `${month}-01`;
  const e = monthEnd(month);
  return db.salaries.filter((r) => r.techId === techId && r.from <= e && (!r.to || r.to >= s)).sort((a, b) => b.from.localeCompare(a.from))[0] ?? null;
}

export const isPayrollLocked = (db: Db, isoDate: string) => db.payrollRuns.some((r) => r.month === monthOf(isoDate) && r.status === "Approved");

const ATT: Record<string, CalcAttendance> = { Present: "present", Absent: "absent", "Paid leave": "paid_leave", "Unpaid leave": "unpaid_leave", "Half day": "half_day" };

export interface TechMonth { techId: string; name: string; month: string; result: TechMonthResult; pending: number }

/** Cost model for every technician with a salary record in `month`. `settle` adds reimbursements & advance recoveries (payroll runs). */
export function computeMonth(db: Db, month: string, settle = false): TechMonth[] {
  const f = db.fin;
  const out: TechMonth[] = [];
  for (const t of db.techs) {
    const st = salaryFor(db, t.id, month);
    if (!st) continue;
    const logs = db.timeLogs.filter((l) => l.techId === t.id && monthOf(l.start) === month);
    const inMonth = (d: string) => monthOf(d) === month;
    const recovered = (advId: string) =>
      sum(db.payrollRuns.filter((r) => r.status === "Approved" && r.month !== month).flatMap((r) => r.lines).filter((l) => l.type === "advance_recovery" && l.ref === advId).map((l) => l.amount));
    const result = computeTechnicianMonth({
      month,
      structure: {
        payType: st.payType === "Monthly" ? "monthly" : "hourly", monthlySalary: st.monthly, hourlyRate: st.hourly,
        workingWeekdays: st.workingWeekdays as WeekdayIndex[], scheduledHoursPerDay: st.hoursPerDay, overtimeEnabled: st.otEnabled,
        overtimeMultiplier: st.otMultiplier, fixedAllowances: st.allowances,
      },
      holidays: db.holidays.map((h) => h.date),
      time: logs.filter((l) => l.status === "Approved" && l.kind !== "Break" && l.end)
        .map((l) => ({ jobId: l.jobId, kind: l.kind === "Work" ? "work" : "travel", date: l.start.slice(0, 10), hours: logHours(l) })),
      attendance: db.attendance.filter((a) => a.techId === t.id && inMonth(a.date)).map((a) => ({ date: a.date, status: ATT[a.status] })),
      incentives: db.incentives.filter((i) => i.techId === t.id && i.month === month).map((i) => ({ amount: i.amount, jobId: i.jobId, reason: i.reason })),
      sharedCosts: db.expenses.filter((e) => e.cls === "Technician shared" && e.status === "Approved" && e.techId === t.id && inMonth(e.date))
        .map((e) => ({ id: e.id, category: e.category, amount: e.amount })),
      completedJobIds: db.jobs.filter((j) => jobTechs(j).includes(t.id) && completedOn(j)?.startsWith(month)).map((j) => j.id),
      reimbursements: settle
        ? db.expenses.filter((e) => e.paidBy === "Employee" && e.techId === t.id && e.status === "Approved" && !e.reimbursed && e.date <= monthEnd(month)).map((e) => ({ expenseId: e.id, amount: e.amount }))
        : [],
      advanceRecoveries: settle
        ? db.advances.filter((a) => a.techId === t.id && a.date <= monthEnd(month))
            .map((a) => ({ advanceId: a.id, amount: round2(Math.min(a.amount - recovered(a.id), a.monthly || a.amount)) })).filter((a) => a.amount > 0)
        : [],
      otherDeductions: db.deductions.filter((d) => d.techId === t.id && d.month === month)
        .map((d) => ({ amount: d.amount, reason: d.reason, kind: d.kind === "Cost recovery" ? "cost_recovery" : "other" })),
      settings: { attendanceAffectsSalary: f.attendanceAffectsSalary, labourIncludesTravel: f.labourIncludesTravel, sharedAllocationBasis: f.sharedBasis },
    });
    out.push({ techId: t.id, name: t.name, month, result, pending: logs.filter((l) => l.status === "Running" || l.status === "Submitted").length });
  }
  return out;
}

export function buildPayrollRun(db: Db, month: string): PayrollRun {
  const rows = computeMonth(db, month, true);
  const lines: PayrollLine[] = [];
  const allocations: CostAllocation[] = [];
  for (const { techId, result: r } of rows) {
    for (const l of [...r.payslip.earnings, ...r.payslip.reimbursements, ...r.payslip.deductions]) lines.push({ techId, type: l.type, label: l.label, amount: l.amount, ref: l.ref });
    const push = (component: CostAllocation["component"], rec: Record<string, number>, basis: string, hours?: Record<string, number>) => {
      for (const [jobId, amount] of Object.entries(rec)) if (amount) allocations.push({ techId, jobId, component, amount, hours: hours?.[jobId], basis });
    };
    push("Base salary", r.allocatedBaseByJob, `₹${r.hourlyCost.toFixed(2)}/h × approved job hours`, r.productiveHoursByJob);
    push("Overtime", r.allocatedOvertimeByJob, "overtime pay by job hours");
    push("Incentive", r.jobIncentivesByJob, "job-linked incentive");
    push("Shared", r.sharedAllocByJob, `shared costs by ${db.fin.sharedBasis.replace(/_/g, " ")}`);
    if (r.idleCost) allocations.push({ techId, jobId: null, component: "Idle", amount: r.idleCost, basis: "salary not covered by approved job hours" });
    if (r.unallocatedShared) allocations.push({ techId, jobId: null, component: "Unallocated shared", amount: r.unallocatedShared, basis: "no allocation basis this month" });
  }
  return {
    month, status: "Draft", savedAt: new Date().toISOString(), lines, allocations,
    totals: {
      employerCost: sum(rows.map((r) => r.result.employerCost)), netPay: sum(rows.map((r) => r.result.payslip.netPay)),
      directLabour: sum(rows.map((r) => r.result.directLabourTotal)), idle: sum(rows.map((r) => r.result.idleCost)), sharedPool: sum(rows.map((r) => r.result.sharedPool)),
    },
  };
}

/* ───────────── period profitability ───────────── */

export interface PeriodFilters { from: string; to: string; techId?: string; customerId?: string; jobType?: string; status?: string }
type Tagged<T> = T & { month: string };

export interface MonthPoint { month: string; revenue: number; directCost: number; grossProfit: number; netOperatingProfit: number; cash: number }

export interface PeriodReport {
  months: string[];
  filtered: boolean;
  full: ProfitabilityResult;
  jobs: ProfitabilityResult["jobs"];
  technicians: ProfitabilityResult["technicians"];
  totals: ProfitabilityResult["totals"];
  invoiced: number;
  cash: number;
  outstanding: number;
  monthly: MonthPoint[];
  expenseCats: { name: string; cls: string; amount: number }[];
  stats: { created: number; completed: number; pending: number; callbacks: number; estHours: number; actualHours: number };
  utilisation: { scheduled: number; productive: number; pct: number | null };
  techCost: Record<string, { overtime: number; incentives: number; allowances: number; scheduled: number; productive: number; travel: number }>;
  provisional: string[];
  warnings: string[];
}

export function buildPeriod(db: Db, f: PeriodFilters): PeriodReport {
  const months = monthsBetween(f.from, f.to);
  const inRange = (d: string) => months.includes(monthOf(d));
  const s = db.settings;
  const gstFactor = s.gstEnabled ? 1 + s.gstPercent / 100 : 1;

  // revenue: earned when invoiced (this app invoices only after work is completed); refunds reverse revenue (ex GST)
  const revenue: Tagged<{ jobId: string | null; amount: number }>[] = [];
  const materials: Tagged<{ jobId: string; amount: number; missingCost?: boolean }>[] = [];
  let cash = 0;
  for (const j of db.jobs) {
    if (j.invoice) {
      const t = jobTotals(j, s);
      if (inRange(j.invoice.at)) revenue.push({ jobId: j.id, amount: t.taxable, month: monthOf(j.invoice.at) });
    }
    for (const p of j.payments) {
      if (!inRange(p.at)) continue;
      cash += p.refund ? -p.amount : p.amount;
      if (p.refund) revenue.push({ jobId: j.id, amount: -round2(p.amount / gstFactor), month: monthOf(p.at) });
    }
    const done = completedOn(j);
    if (done && inRange(done) && j.status !== "Cancelled")
      for (const l of j.lines.filter((x) => x.kind === "Part")) {
        const cost = l.unitCost ?? db.parts.find((p) => p.id === l.refId)?.cost;
        materials.push({ jobId: j.id, amount: round2(l.qty * (cost ?? 0)), missingCost: cost == null, month: monthOf(done) });
      }
  }
  const approvedExp = db.expenses.filter((e) => e.status === "Approved" && inRange(e.date));
  const directExpenses = approvedExp.filter((e) => e.cls === "Direct job" && e.jobId).map((e) => ({ jobId: e.jobId!, amount: e.amount, month: monthOf(e.date) }));
  const operating = approvedExp.filter((e) => e.cls === "Operating").map((e) => ({ category: e.category, amount: e.amount, month: monthOf(e.date) }));

  // technician cost: stored allocations for approved payroll months, live (provisional) otherwise
  const labour: Tagged<PeriodLedger["labour"][number]>[] = [];
  const sharedTech: Tagged<PeriodLedger["sharedTech"][number]>[] = [];
  const idle: Tagged<PeriodLedger["idle"][number]>[] = [];
  const unallocatedShared: Tagged<PeriodLedger["unallocatedShared"][number]>[] = [];
  const techCost: PeriodReport["techCost"] = {};
  const provisional: string[] = [];
  let scheduled = 0, productive = 0;
  const addLabour = (month: string, jobId: string, techId: string, amount: number, hours: number, travel = 0) => {
    const ex = labour.find((l) => l.month === month && l.jobId === jobId && l.technicianId === techId);
    if (ex) { ex.amount = round2(ex.amount + amount); ex.hours += hours; ex.travelHours = (ex.travelHours ?? 0) + travel; }
    else labour.push({ month, jobId, technicianId: techId, amount, hours, travelHours: travel });
  };
  for (const month of months) {
    const rows = computeMonth(db, month);
    for (const r of rows) {
      const tc = (techCost[r.techId] ??= { overtime: 0, incentives: 0, allowances: 0, scheduled: 0, productive: 0, travel: 0 });
      tc.overtime = round2(tc.overtime + r.result.overtimePay); tc.incentives = round2(tc.incentives + r.result.incentivesTotal);
      tc.allowances = round2(tc.allowances + r.result.allowancesTotal); tc.scheduled += r.result.scheduledHours;
      tc.productive += r.result.productiveHours; tc.travel += r.result.travelHours;
      scheduled += r.result.scheduledHours; productive += r.result.productiveHours;
    }
    const run = db.payrollRuns.find((x) => x.month === month && x.status === "Approved");
    if (run) {
      for (const a of run.allocations) {
        if (a.component === "Idle") idle.push({ month, technicianId: a.techId, amount: a.amount });
        else if (a.component === "Unallocated shared") unallocatedShared.push({ month, technicianId: a.techId, amount: a.amount });
        else if (a.component === "Shared") sharedTech.push({ month, jobId: a.jobId!, technicianId: a.techId, amount: a.amount });
        else addLabour(month, a.jobId!, a.techId, a.amount, a.component === "Base salary" ? a.hours ?? 0 : 0);
      }
    } else {
      if (rows.length) provisional.push(month);
      for (const { techId, result: r } of rows) {
        for (const [job, amt] of Object.entries(r.directLabourByJob)) addLabour(month, job, techId, amt, r.productiveHoursByJob[job] ?? 0, (r.jobHoursByJob[job] ?? 0) - (r.productiveHoursByJob[job] ?? 0));
        for (const [job, amt] of Object.entries(r.sharedAllocByJob)) if (amt) sharedTech.push({ month, jobId: job, technicianId: techId, amount: amt });
        if (r.idleCost) idle.push({ month, technicianId: techId, amount: r.idleCost });
        if (r.unallocatedShared) unallocatedShared.push({ month, technicianId: techId, amount: r.unallocatedShared });
      }
    }
  }

  const lifetimeHours = db.timeLogs
    .filter((l) => l.status === "Approved" && l.jobId && l.end && (l.kind === "Work" || (l.kind === "Travel" && db.fin.labourIncludesTravel)))
    .map((l) => ({ jobId: l.jobId!, technicianId: l.techId, hours: logHours(l) }));
  const infos: JobInfo[] = db.jobs.map((j) => {
    const t = jobTotals(j, s);
    return {
      id: j.id, jobNo: j.id, jobType: jobType(db, j), status: j.status, customerName: db.customers.find((c) => c.id === j.customerId)?.name,
      isCallback: Boolean(j.parentJobId), parentJobId: j.parentJobId ?? null, estimatedRevenue: t.taxable,
      estimatedCost: round2(j.lines.reduce((x, l) => x + (l.kind === "Part" ? l.qty * (l.unitCost ?? db.parts.find((p) => p.id === l.refId)?.cost ?? 0) : 0), 0)),
      estimatedHours: j.estHours ?? 0,
      technicians: jobTechs(j).map((id) => ({ technicianId: id, sharePct: j.splitApprovedBy && j.split ? j.split[id] ?? null : null })),
      sharesApproved: Boolean(j.splitApprovedBy && j.split),
    };
  });
  const completedIn = (ms: string[]) => new Set(db.jobs.filter((j) => { const c = completedOn(j); return c && ms.includes(monthOf(c)); }).map((j) => j.id));
  const meta = (ms: string[]) => ({
    completedInPeriod: completedIn(ms),
    hasInvoice: new Set(db.jobs.filter((j) => j.invoice).map((j) => j.id)),
    incompleteTime: new Set(db.timeLogs.filter((l) => (l.status === "Running" || l.status === "Submitted") && l.jobId).map((l) => l.jobId!)),
    pendingExpenses: new Set(db.expenses.filter((e) => e.status === "Pending" && e.jobId).map((e) => e.jobId!)),
  });
  const ledger = (ms: string[]): PeriodLedger => {
    const pick = <T extends { month: string }>(xs: T[]) => xs.filter((x) => ms.includes(x.month));
    return { revenue: pick(revenue), materials: pick(materials), directExpenses: pick(directExpenses), labour: pick(labour), sharedTech: pick(sharedTech), idle: pick(idle), unallocatedShared: pick(unallocatedShared), operatingExpenses: pick(operating), lifetimeHours };
  };
  const full = computeProfitability(infos, ledger(months), db.fin.overheadBasis, meta(months));
  const monthly = months.map((m) => {
    const r = computeProfitability(infos, ledger([m]), db.fin.overheadBasis, meta([m]));
    const cashM = sum(db.jobs.flatMap((j) => j.payments).filter((p) => monthOf(p.at) === m).map((p) => (p.refund ? -p.amount : p.amount)));
    return { month: m, revenue: r.totals.revenue, directCost: round2(r.totals.materials + r.totals.labour + r.totals.directExpenses), grossProfit: r.totals.grossProfit, netOperatingProfit: r.totals.netOperatingProfit, cash: cashM };
  });

  // filters → job-level view (overhead shown as the jobs' allocated share)
  const filtered = Boolean(f.techId || f.customerId || f.jobType || f.status);
  const jobById = new Map(db.jobs.map((j) => [j.id, j]));
  const keep = (id: string) => {
    const j = jobById.get(id);
    if (!j) return !filtered;
    return (!f.techId || jobTechs(j).includes(f.techId)) && (!f.customerId || j.customerId === f.customerId) && (!f.jobType || jobType(db, j) === f.jobType) && (!f.status || j.status === f.status);
  };
  const jobs = full.jobs.filter((r) => keep(r.job.id));
  let totals = full.totals;
  if (filtered) {
    const rev = sum(jobs.map((r) => r.revenue)), gp = sum(jobs.map((r) => r.grossProfit)), oh = sum(jobs.map((r) => r.allocatedOverhead));
    totals = {
      ...full.totals, revenue: rev, jobRevenue: rev, nonJobRevenue: 0, materials: sum(jobs.map((r) => r.materials)), labour: sum(jobs.map((r) => r.labour)),
      directExpenses: sum(jobs.map((r) => r.directExpenses)), grossProfit: gp, grossMarginPct: rev ? (gp / rev) * 100 : null,
      operatingExpenses: oh, idleSalary: 0, technicianSharedCosts: 0, remainingOpex: oh, netOperatingProfit: round2(gp - oh), netMarginPct: rev ? ((gp - oh) / rev) * 100 : null,
    };
  }

  const cats = new Map<string, { name: string; cls: string; amount: number }>();
  for (const e of approvedExp) {
    const c = cats.get(e.category) ?? { name: e.category, cls: e.cls, amount: 0 };
    c.amount = round2(c.amount + e.amount);
    cats.set(e.category, c);
  }
  const fJobs = db.jobs.filter((j) => keep(j.id));
  const doneSet = completedIn(months);
  const doneJobs = fJobs.filter((j) => doneSet.has(j.id) && j.estHours);
  const actualByJob: Record<string, number> = {};
  for (const h of lifetimeHours) actualByJob[h.jobId] = (actualByJob[h.jobId] ?? 0) + h.hours;
  const warnings: string[] = [];
  if (provisional.length) warnings.push(`Labour and technician costs for ${provisional.map(fmtMonth).join(", ")} are provisional — payroll not yet approved.`);
  const noSalary = db.techs.filter((t) => t.active && months.every((m) => !salaryFor(db, t.id, m)));
  if (noSalary.length) warnings.push(`No salary record for ${noSalary.map((t) => t.name).join(", ")} — their labour cost is missing.`);
  const notInv = full.jobs.filter((j) => j.flags.notInvoiced).length;
  if (notInv) warnings.push(`${notInv} completed job(s) not invoiced — revenue not recognised yet.`);
  const pendingTime = meta(months).incompleteTime.size;
  if (pendingTime) warnings.push(`${pendingTime} job(s) have running or unapproved time.`);
  const pendingExp = meta(months).pendingExpenses.size;
  if (pendingExp) warnings.push(`${pendingExp} job(s) have pending expense claims not yet in costs.`);
  if (!full.reconciliation.ok) warnings.push(`Reconciliation difference ₹${full.reconciliation.difference}.`);

  return {
    months, filtered, full, jobs, technicians: full.technicians.filter((t) => !f.techId || t.technicianId === f.techId), totals,
    invoiced: round2(sum(revenue.filter((r) => r.amount > 0).map((r) => r.amount))),
    cash: round2(cash),
    outstanding: round2(sum(db.jobs.filter((j) => j.invoice).map((j) => jobTotals(j, s).due))),
    monthly,
    expenseCats: [...cats.values()].sort((a, b) => b.amount - a.amount),
    stats: {
      created: fJobs.filter((j) => inRange(j.createdAt)).length,
      completed: fJobs.filter((j) => doneSet.has(j.id)).length,
      pending: fJobs.filter(isOpen).length,
      callbacks: fJobs.filter((j) => j.parentJobId && inRange(j.createdAt)).length,
      estHours: sum(doneJobs.map((j) => j.estHours ?? 0)),
      actualHours: round2(doneJobs.reduce((a, j) => a + (actualByJob[j.id] ?? 0), 0)),
    },
    utilisation: { scheduled, productive, pct: scheduled ? (productive / scheduled) * 100 : null },
    techCost,
    provisional,
    warnings,
  };
}
