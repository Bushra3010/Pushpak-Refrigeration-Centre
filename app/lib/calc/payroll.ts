import { allocate, round2, sum } from "./money";

/**
 * Monthly technician cost model. See docs/CALCULATION_MODEL.md §3.
 *
 * Employer cost pool for a technician-month
 *   = payable base pay + overtime pay + incentives + fixed allowances
 *     + employer-paid shared costs (room, food …) − cost recoveries from salary
 * is distributed, without remainder, into:
 *   direct job labour   (base salary at hourly cost × approved job hours, OT pay, job-linked incentives)
 *   idle / unallocated salary (payable base not covered by approved job hours, OT not on jobs)
 *   allocated shared costs (allowances, shared expenses, non-job incentives → jobs by the configured basis)
 *   unallocated shared costs (what the basis could not place, e.g. no hours that month)
 *
 * NOT in the pool (never become an expense here): salary advances (recoverable
 * receivable), advance recoveries, reimbursements of approved claims (the claim
 * itself is the expense, recorded once), and statutory/other deductions.
 */

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type SalaryStructure = {
  payType: "monthly" | "hourly";
  monthlySalary: number;
  hourlyRate: number;
  workingWeekdays: WeekdayIndex[];
  scheduledHoursPerDay: number;
  overtimeEnabled: boolean;
  overtimeMultiplier: number;
  fixedAllowances: { name: string; amount: number }[];
};

export type ApprovedTime = {
  jobId: string | null;
  kind: "work" | "travel";
  /** Local (Asia/Kolkata) date, YYYY-MM-DD */
  date: string;
  hours: number;
};

export type AttendanceStatus =
  | "present"
  | "absent"
  | "paid_leave"
  | "unpaid_leave"
  | "half_day"
  | "holiday"
  | "weekly_off";

export type PayrollSettings = {
  attendanceAffectsSalary: boolean;
  labourIncludesTravel: boolean;
  sharedAllocationBasis: "productive_hours" | "job_hours" | "completed_jobs" | "none";
};

export type TechMonthInput = {
  /** YYYY-MM */
  month: string;
  structure: SalaryStructure;
  holidays: string[];
  time: ApprovedTime[];
  attendance: { date: string; status: AttendanceStatus }[];
  incentives: { amount: number; jobId: string | null; reason: string }[];
  /** Employer-paid shared monthly costs for this technician (room, food, mobile …). */
  sharedCosts: { id: string; category: string; amount: number }[];
  /** Jobs this technician worked on that were completed in the month (for the completed_jobs basis). */
  completedJobIds: string[];
  /** Approved employee-paid claims being repaid in this payroll. */
  reimbursements: { expenseId: string; amount: number }[];
  advanceRecoveries: { advanceId: string; amount: number }[];
  otherDeductions: { amount: number; reason: string; kind: "cost_recovery" | "other" }[];
  settings: PayrollSettings;
};

export type PayslipLine = {
  type:
    | "basic"
    | "overtime"
    | "incentive"
    | "allowance"
    | "reimbursement"
    | "advance_recovery"
    | "cost_recovery"
    | "deduction";
  label: string;
  amount: number;
  ref?: string;
};

export type TechMonthResult = {
  scheduledDays: number;
  scheduledHours: number;
  hourlyCost: number;
  grossBase: number;
  lostDays: number;
  attendanceDeduction: number;
  payableBase: number;
  productiveHours: number;
  travelHours: number;
  jobHoursByJob: Record<string, number>;
  productiveHoursByJob: Record<string, number>;
  totalJobHours: number;
  nonJobHours: number;
  overtimeHours: number;
  overtimePay: number;
  incentivesTotal: number;
  allowancesTotal: number;
  allocatedBaseByJob: Record<string, number>;
  allocatedOvertimeByJob: Record<string, number>;
  jobIncentivesByJob: Record<string, number>;
  directLabourByJob: Record<string, number>;
  directLabourTotal: number;
  idleCost: number;
  sharedPool: number;
  sharedPoolBreakdown: { label: string; amount: number }[];
  sharedAllocByJob: Record<string, number>;
  sharedAllocated: number;
  unallocatedShared: number;
  employerCost: number;
  payslip: { earnings: PayslipLine[]; reimbursements: PayslipLine[]; deductions: PayslipLine[]; netPay: number };
  reconciliation: { pool: number; distributed: number; difference: number };
};

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() as WeekdayIndex;

export function scheduledWorkingDays(month: string, workingWeekdays: WeekdayIndex[], holidays: string[]): string[] {
  const hol = new Set(holidays);
  return daysInMonth(month).filter((d) => workingWeekdays.includes(weekday(d)) && !hol.has(d));
}

/** Monthly salary ÷ scheduled paid hours for that month. */
export function hourlySalaryCost(monthlySalary: number, scheduledHours: number) {
  if (!(scheduledHours > 0)) throw new Error("Scheduled paid hours for the month must be greater than zero.");
  return monthlySalary / scheduledHours;
}

function addTo(rec: Record<string, number>, k: string, v: number) {
  rec[k] = (rec[k] ?? 0) + v;
}

export function computeTechnicianMonth(input: TechMonthInput): TechMonthResult {
  const { structure: s, settings } = input;
  const workDays = scheduledWorkingDays(input.month, s.workingWeekdays, input.holidays);
  const workDaySet = new Set(workDays);
  const scheduledHours = workDays.length * s.scheduledHoursPerDay;

  // --- hours -------------------------------------------------------------
  const jobHoursByJob: Record<string, number> = {};
  const productiveHoursByJob: Record<string, number> = {};
  const hoursByDate: Record<string, number> = {};
  let productiveHours = 0;
  let travelHours = 0;
  let nonJobHours = 0;
  for (const t of input.time) {
    if (!(t.hours > 0)) continue;
    addTo(hoursByDate, t.date, t.hours);
    if (t.kind === "work") productiveHours += t.hours;
    else travelHours += t.hours;
    const countsAsJob = t.jobId && (t.kind === "work" || settings.labourIncludesTravel);
    if (countsAsJob) addTo(jobHoursByJob, t.jobId!, t.hours);
    else nonJobHours += t.hours;
    if (t.jobId && t.kind === "work") addTo(productiveHoursByJob, t.jobId, t.hours);
  }
  const totalJobHours = Object.values(jobHoursByJob).reduce((a, b) => a + b, 0);

  // --- base pay & attendance --------------------------------------------
  let hourlyCost: number;
  let grossBase: number;
  let lostDays = 0;
  let attendanceDeduction = 0;
  let overtimeHours = 0;
  if (s.overtimeEnabled) {
    for (const [date, h] of Object.entries(hoursByDate)) {
      const allowed = workDaySet.has(date) ? s.scheduledHoursPerDay : 0;
      overtimeHours += Math.max(0, h - allowed);
    }
  }
  if (s.payType === "monthly") {
    hourlyCost = scheduledHours > 0 ? hourlySalaryCost(s.monthlySalary, scheduledHours) : 0;
    grossBase = round2(s.monthlySalary);
    if (settings.attendanceAffectsSalary && workDays.length > 0) {
      for (const a of input.attendance) {
        if (!workDaySet.has(a.date)) continue;
        if (a.status === "absent" || a.status === "unpaid_leave") lostDays += 1;
        else if (a.status === "half_day") lostDays += 0.5;
      }
      attendanceDeduction = round2((s.monthlySalary / workDays.length) * lostDays);
    }
  } else {
    hourlyCost = s.hourlyRate;
    const paidHours = productiveHours + travelHours;
    grossBase = round2(s.hourlyRate * Math.max(0, paidHours - overtimeHours));
  }
  const payableBase = round2(grossBase - attendanceDeduction);
  const overtimePay = round2(overtimeHours * hourlyCost * (s.overtimeEnabled ? s.overtimeMultiplier : 0));

  // --- direct labour -----------------------------------------------------
  const baseToJobs = round2(Math.min(payableBase, hourlyCost * totalJobHours));
  const { parts: allocatedBaseByJob } = allocate(baseToJobs, jobHoursByJob);
  const ot = allocate(overtimePay, jobHoursByJob);
  const allocatedOvertimeByJob = ot.parts;

  const jobIncentivesByJob: Record<string, number> = {};
  let nonJobIncentives = 0;
  for (const inc of input.incentives) {
    if (inc.jobId) jobIncentivesByJob[inc.jobId] = round2((jobIncentivesByJob[inc.jobId] ?? 0) + inc.amount);
    else nonJobIncentives += inc.amount;
  }
  const directLabourByJob: Record<string, number> = {};
  for (const rec of [allocatedBaseByJob, allocatedOvertimeByJob, jobIncentivesByJob])
    for (const [k, v] of Object.entries(rec)) directLabourByJob[k] = round2((directLabourByJob[k] ?? 0) + v);
  const directLabourTotal = sum(Object.values(directLabourByJob));
  const idleCost = round2(payableBase - baseToJobs + ot.unallocated);

  // --- shared costs ------------------------------------------------------
  const allowancesTotal = sum(s.fixedAllowances.map((a) => a.amount));
  const costRecoveries = sum(input.otherDeductions.filter((d) => d.kind === "cost_recovery").map((d) => d.amount));
  const sharedPoolBreakdown = [
    ...s.fixedAllowances.map((a) => ({ label: `Allowance: ${a.name}`, amount: round2(a.amount) })),
    ...input.sharedCosts.map((c) => ({ label: c.category, amount: round2(c.amount) })),
    ...(nonJobIncentives ? [{ label: "Incentives (not job-linked)", amount: round2(nonJobIncentives) }] : []),
    ...(costRecoveries ? [{ label: "Less: recovered from salary", amount: -costRecoveries }] : []),
  ];
  const sharedPool = sum(sharedPoolBreakdown.map((b) => b.amount));
  let weights: Record<string, number> = {};
  if (settings.sharedAllocationBasis === "productive_hours") weights = productiveHoursByJob;
  else if (settings.sharedAllocationBasis === "job_hours") weights = jobHoursByJob;
  else if (settings.sharedAllocationBasis === "completed_jobs")
    weights = Object.fromEntries(input.completedJobIds.map((id) => [id, 1]));
  const shared = allocate(sharedPool, weights);
  const sharedAllocated = sum(Object.values(shared.parts));

  // --- payslip -----------------------------------------------------------
  const incentivesTotal = sum(input.incentives.map((i) => i.amount));
  const earnings: PayslipLine[] = [
    { type: "basic", label: s.payType === "monthly" ? "Basic salary" : "Hourly wages", amount: payableBase },
    ...(overtimePay ? [{ type: "overtime" as const, label: `Overtime ${overtimeHours.toFixed(2)} h`, amount: overtimePay }] : []),
    ...input.incentives.map((i) => ({ type: "incentive" as const, label: `Incentive: ${i.reason}`, amount: round2(i.amount), ref: i.jobId ?? undefined })),
    ...s.fixedAllowances.map((a) => ({ type: "allowance" as const, label: a.name, amount: round2(a.amount) })),
  ];
  const reimbursements: PayslipLine[] = input.reimbursements.map((r) => ({
    type: "reimbursement",
    label: "Expense claim reimbursement",
    amount: round2(r.amount),
    ref: r.expenseId,
  }));
  const deductions: PayslipLine[] = [
    ...input.advanceRecoveries.map((a) => ({ type: "advance_recovery" as const, label: "Advance recovery", amount: round2(a.amount), ref: a.advanceId })),
    ...input.otherDeductions.map((d) => ({
      type: d.kind === "cost_recovery" ? ("cost_recovery" as const) : ("deduction" as const),
      label: d.reason,
      amount: round2(d.amount),
    })),
  ];
  const netPay = round2(
    sum(earnings.map((e) => e.amount)) + sum(reimbursements.map((r) => r.amount)) - sum(deductions.map((d) => d.amount)),
  );

  const employerCost = round2(payableBase + overtimePay + incentivesTotal + allowancesTotal);
  const pool = round2(employerCost + sum(input.sharedCosts.map((c) => c.amount)) - costRecoveries);
  const distributed = round2(directLabourTotal + idleCost + sharedAllocated + shared.unallocated);

  return {
    scheduledDays: workDays.length,
    scheduledHours,
    hourlyCost,
    grossBase,
    lostDays,
    attendanceDeduction,
    payableBase,
    productiveHours,
    travelHours,
    jobHoursByJob,
    productiveHoursByJob,
    totalJobHours,
    nonJobHours,
    overtimeHours,
    overtimePay,
    incentivesTotal,
    allowancesTotal,
    allocatedBaseByJob,
    allocatedOvertimeByJob,
    jobIncentivesByJob,
    directLabourByJob,
    directLabourTotal,
    idleCost,
    sharedPool,
    sharedPoolBreakdown,
    sharedAllocByJob: shared.parts,
    sharedAllocated,
    unallocatedShared: shared.unallocated,
    employerCost,
    payslip: { earnings, reimbursements, deductions, netPay },
    reconciliation: { pool, distributed, difference: round2(pool - distributed) },
  };
}
