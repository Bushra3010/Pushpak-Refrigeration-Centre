/* Finance add-on — types and defaults for time tracking, salary, expenses,
 * payroll allocation, profitability settings and saved calculator results.
 * Field names are chosen so they map 1:1 to future Supabase tables. */

import { DEFAULT_TONNAGE_COEFFICIENTS, type TonnageCoefficients } from "./calc/tonnage";
import { DEFAULT_COPPER_DENSITY, DEFAULT_DENSITY_SOURCE } from "./calc/pipe";

export type TimeKind = "Travel" | "Work" | "Break";
export type TimeStatus = "Running" | "Submitted" | "Approved" | "Rejected";

export interface TimeLog {
  id: string;
  techId: string;
  jobId: string | null;
  kind: TimeKind;
  start: string; // local ISO "2026-10-16T10:15" (seconds allowed)
  end: string | null;
  status: TimeStatus;
  note?: string;
  reviewedBy?: string;
}

export interface TimeCorrection {
  id: string;
  logId: string | null; // null = missing entry to add
  techId: string;
  jobId: string | null;
  kind: TimeKind;
  start: string;
  end: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewNote?: string;
}

export interface SalaryRecord {
  id: string;
  techId: string;
  from: string; // ISO date, effective-dated
  to: string | null;
  payType: "Monthly" | "Hourly";
  monthly: number;
  hourly: number;
  workingWeekdays: number[]; // 0 = Sunday
  hoursPerDay: number;
  otEnabled: boolean;
  otMultiplier: number;
  allowances: { name: string; amount: number }[]; // fixed monthly allowances
}

/** Direct job = charged to one job · Technician shared = monthly cost spread over jobs · Operating = company overhead. */
export type ExpenseClass = "Direct job" | "Technician shared" | "Operating";

export const EXPENSE_CATEGORIES: { name: string; cls: ExpenseClass }[] = [
  { name: "Petrol (job)", cls: "Direct job" },
  { name: "Travel / auto fare (job)", cls: "Direct job" },
  { name: "Food on job", cls: "Direct job" },
  { name: "Parking / toll (job)", cls: "Direct job" },
  { name: "Other job expense", cls: "Direct job" },
  { name: "Room / accommodation", cls: "Technician shared" },
  { name: "Food (monthly)", cls: "Technician shared" },
  { name: "Mobile recharge", cls: "Technician shared" },
  { name: "Petrol (monthly pool)", cls: "Technician shared" },
  { name: "Other technician cost", cls: "Technician shared" },
  { name: "Shop rent", cls: "Operating" },
  { name: "Electricity & internet", cls: "Operating" },
  { name: "Office staff salary", cls: "Operating" },
  { name: "Vehicle maintenance", cls: "Operating" },
  { name: "Marketing", cls: "Operating" },
  { name: "Tools & equipment", cls: "Operating" },
  { name: "Miscellaneous overhead", cls: "Operating" },
];

export interface Expense {
  id: string;
  date: string;
  category: string;
  cls: ExpenseClass;
  amount: number; // cost to business, excluding recoverable GST
  jobId: string | null;
  techId: string | null;
  paidBy: "Company" | "Employee";
  status: "Pending" | "Approved" | "Rejected" | "Reversed";
  note: string;
  submittedBy: string;
  reviewNote?: string;
  /** set once when an employee-paid claim is repaid — repayment is never a new expense */
  reimbursed?: { how: "Payroll" | "Direct"; ref: string; at: string };
}

/** Salary advance: a recoverable receivable, never an expense. */
export interface Advance { id: string; techId: string; date: string; amount: number; monthly: number; reason: string }
export interface Incentive { id: string; techId: string; month: string; amount: number; jobId: string | null; reason: string }
export interface Deduction { id: string; techId: string; month: string; amount: number; kind: "Cost recovery" | "Other"; reason: string }
export type AttendanceStatus = "Present" | "Absent" | "Paid leave" | "Unpaid leave" | "Half day";
export interface AttendanceMark { techId: string; date: string; status: AttendanceStatus }
export interface Holiday { date: string; name: string }

export interface PayrollLine { techId: string; type: string; label: string; amount: number; ref?: string }
export interface CostAllocation { techId: string; jobId: string | null; component: "Base salary" | "Overtime" | "Incentive" | "Shared" | "Idle" | "Unallocated shared"; amount: number; hours?: number; basis: string }

export interface PayrollRun {
  month: string; // YYYY-MM
  status: "Draft" | "Approved";
  savedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  lines: PayrollLine[];
  allocations: CostAllocation[];
  totals: { employerCost: number; netPay: number; directLabour: number; idle: number; sharedPool: number };
}

export interface GaugeStandard {
  id: string;
  code: string;
  name: string;
  source: string;
  verified: boolean;
  sizes: { gauge: string; mm: number }[];
}

export interface SavedCalc {
  id: string;
  kind: "Copper pipe" | "Tonnage";
  title: string;
  customerId: string | null;
  jobId: string | null; // quotation = the job's estimate
  at: string;
  by: string;
  inputs: unknown;
  outputs: unknown;
}

export interface FinanceSettings {
  attendanceAffectsSalary: boolean;
  labourIncludesTravel: boolean;
  sharedBasis: "productive_hours" | "job_hours" | "completed_jobs" | "none";
  overheadBasis: "revenue" | "labour_hours" | "direct_cost" | "none";
  copperDensity: number;
  densitySource: string;
  copperRatePerKg: number;
  wastagePct: number;
  /** markup the technician-app pipe calculator uses for customer prices (technicians never see cost or margin) */
  pipeMarkupPct: number;
  tonnage: TonnageCoefficients;
  gauges: GaugeStandard[];
  /** technician ids allowed to see their own salary & payslips in the technician app */
  salaryVisibleTo: string[];
}

const inch = (v: number) => Math.round(v * 25.4 * 10000) / 10000;

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  attendanceAffectsSalary: false,
  labourIncludesTravel: true,
  sharedBasis: "productive_hours",
  overheadBasis: "revenue",
  copperDensity: DEFAULT_COPPER_DENSITY,
  densitySource: DEFAULT_DENSITY_SOURCE,
  copperRatePerKg: 850,
  wastagePct: 5,
  pipeMarkupPct: 25,
  tonnage: DEFAULT_TONNAGE_COEFFICIENTS,
  gauges: [
    {
      id: "g-swg", code: "SWG", name: "British Imperial Standard Wire Gauge",
      source: "Imperial Standard Wire Gauge, Board of Trade Order (1883) / BS 3737:1964 — inch values converted at 25.4 mm/in. Confirm the supplier's actual wall thickness before relying on a gauge number.",
      verified: false,
      sizes: [["16", 0.064], ["17", 0.056], ["18", 0.048], ["19", 0.04], ["20", 0.036], ["21", 0.032], ["22", 0.028], ["23", 0.024], ["24", 0.022]]
        .map(([g, i]) => ({ gauge: String(g), mm: inch(Number(i)) })),
    },
  ],
  salaryVisibleTo: ["t1"],
};

/** ASTM B280 ACR nominal OD × wall presets (inches), for quick entry. Verify against the current standard. */
export const PIPE_PRESETS = [
  ['1/4" × 0.030"', 0.25, 0.03], ['3/8" × 0.032"', 0.375, 0.032], ['1/2" × 0.032"', 0.5, 0.032], ['5/8" × 0.035"', 0.625, 0.035],
  ['3/4" × 0.042"', 0.75, 0.042], ['7/8" × 0.045"', 0.875, 0.045],
].map(([label, od, w]) => ({ label: String(label), odMm: inch(Number(od)), wallMm: inch(Number(w)) }));
