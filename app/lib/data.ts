/* Pushpak Refrigeration Centre — domain model + demo seed.
 *
 * Every screen (customer app, technician app, admin panel) reads the same
 * shapes from here. Field names map 1:1 to the Supabase tables we'll add later
 * (customers, ac_units, jobs, technicians, parts, …), so swapping the demo
 * store for real queries should not touch the screens. */

/* ───────────────────────── Types ───────────────────────── */

import {
  DEFAULT_FINANCE_SETTINGS, type Advance, type AttendanceMark, type Deduction, type Expense, type FinanceSettings, type Holiday,
  type Incentive, type PayrollRun, type SalaryRecord, type SavedCalc, type TimeCorrection, type TimeLog,
} from "./finance-types";

export type CustomerType = "Residential" | "Office" | "Shop" | "Commercial" | "Other";
export type ContactPref = "Call" | "WhatsApp";

export interface AmcPlan {
  plan: "Basic" | "Comprehensive";
  from: string; // ISO date
  to: string;
  visitsLeft: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  altPhone: string;
  address: string;
  area: string;
  gps: string; // "lat,lng"
  type: CustomerType;
  status: "New" | "Existing";
  contactPref: ContactPref;
  createdAt: string;
  amc: AmcPlan | null;
  mergedInto?: string; // set when an admin merges a duplicate record
}

export const APPLICATIONS = ["Bedroom", "Hall", "Office", "Shop", "Server Room", "Commercial", "Other"] as const;
export const AC_TYPES = ["Split", "Window", "Cassette", "Tower", "Ductable"] as const;
export const CAPACITIES = ["1 Ton", "1.5 Ton", "2 Ton", "Other"] as const;
export const USAGE = ["Occasional", "Regular", "Heavy", "24×7"] as const;
export const BRANDS = ["Daikin", "LG", "Voltas", "Samsung", "Blue Star", "Hitachi", "Carrier", "Panasonic", "Lloyd", "Godrej", "Other"];

export interface AcUnit {
  id: string;
  customerId: string;
  application: (typeof APPLICATIONS)[number];
  acType: (typeof AC_TYPES)[number];
  capacity: (typeof CAPACITIES)[number];
  brand: string;
  model: string;
  serial: string;
  inverter: boolean;
  ageYears: number;
  installAgeYears: number;
  purchased: "New" | "Used";
  warranty: "Yes" | "No" | "Don't Know";
  dailyHours: number;
  usage: (typeof USAGE)[number];
}

/** PRD §4 — captured in the customer's words before any diagnosis. */
export const COMPLAINTS = [
  "No Cooling", "Less Cooling", "Water Leakage", "Ice Formation", "Noise", "Vibration", "AC Not Starting",
  "Automatically Switching Off", "Indoor Fan Problem", "Outdoor Not Running", "Error Code", "Bad Smell",
  "High Electricity Consumption", "Remote Problem", "Gas Leakage Suspected", "Other",
] as const;
export type ComplaintIssue = (typeof COMPLAINTS)[number];

export interface Complaint {
  issues: ComplaintIssue[];
  notes: string; // customer's own words
  errorCode: string;
}

/** PRD §5 — pre-work history questionnaire. Empty string = not answered yet. */
export interface PreWork {
  occurrence: "" | "First Time" | "Repeat Problem";
  prevTechVisit: "" | "Yes" | "No";
  prevDiagnosis: string;
  prevWork: string;
  prevPartChanged: string;
  gasChargedBefore: "" | "Yes" | "No" | "Don't Know";
  gasChargedWhen: string;
  coolingLastedAfterGas: string;
  majorExpense: "" | "Yes" | "No";
  majorExpenseDetails: string;
  lastService: string;
  recentlyShifted: "" | "Yes" | "No";
  voltageProblem: "" | "Yes" | "No";
  unusualSoundSmell: "" | "Yes" | "No";
  leakageBefore: "" | "Yes" | "No";
  coolingTrend: "" | "Was good, now reduced" | "Always low";
}

export const EMPTY_PREWORK: PreWork = {
  occurrence: "", prevTechVisit: "", prevDiagnosis: "", prevWork: "", prevPartChanged: "", gasChargedBefore: "",
  gasChargedWhen: "", coolingLastedAfterGas: "", majorExpense: "", majorExpenseDetails: "", lastService: "",
  recentlyShifted: "", voltageProblem: "", unusualSoundSmell: "", leakageBefore: "", coolingTrend: "",
};

export const ROOT_CAUSES = [
  "Low refrigerant / gas leak", "Dirty coil / filter", "Capacitor failure", "Compressor fault", "Fan motor fault",
  "PCB / electrical fault", "Sensor / thermistor fault", "Drain blockage", "Installation issue", "Voltage fluctuation",
  "Remote / user settings", "No fault found", "Other",
] as const;

export interface Diagnosis {
  observed: string; // what the technician saw — kept apart from the customer's complaint
  notes: string;
  rootCause: string;
  errorCode: string;
  voltage: string; // volts at the socket
  ampere: string;
  gasStatus: "" | "Normal" | "Low" | "Empty" | "Overcharged" | "Not checked";
  suctionPsi: string;
  ventTempC: string;
  indoorObs: string;
  outdoorObs: string;
  photos: number;
  recommendation: string;
}

export const EMPTY_DIAGNOSIS: Diagnosis = {
  observed: "", notes: "", rootCause: "", errorCode: "", voltage: "", ampere: "", gasStatus: "", suctionPsi: "",
  ventTempC: "", indoorObs: "", outdoorObs: "", photos: 0, recommendation: "",
};

export type LineKind = "Service" | "Part" | "Labour" | "Material";

export interface QuoteLine {
  id: string;
  kind: LineKind;
  name: string;
  qty: number;
  price: number; // per unit, before GST
  refId?: string; // part / service catalogue id
  upsell?: boolean; // added from a recommendation
  addOn?: boolean; // added after the first approval (needs its own approval)
  unitCost?: number; // parts: cost per unit snapshotted when the part is consumed (job material cost)
}

export interface Quote {
  no: string;
  at: string;
  revision: number;
  status: "Draft" | "Pending" | "Approved" | "Rejected";
  approvedVia?: "Customer App" | "OTP" | "Digital Signature";
  decidedAt?: string;
  approvedTotal?: number;
}

export type PayMethod = "Cash" | "UPI" | "Card" | "Online";
export interface Payment { id: string; amount: number; method: PayMethod; ref: string; at: string; by: string; refund?: boolean }
export type PaymentStatus = "Pending" | "Partially Paid" | "Paid" | "Refunded";

export const JOB_FLOW = [
  "New Request", "Assigned", "Accepted", "On the Way", "Arrived", "Diagnosis", "Estimate Prepared",
  "Approved", "Work Started", "Work Completed", "Invoiced", "Closed",
] as const;
export type JobStatus = (typeof JOB_FLOW)[number] | "Cancelled";

export interface TimelineEntry { status: string; at: string; by: string; note?: string }

export interface Job {
  id: string;
  customerId: string;
  acId: string;
  techId: string | null;
  status: JobStatus;
  priority: "Normal" | "High" | "Urgent";
  source: "Customer App" | "Phone" | "WhatsApp" | "Walk-in" | "AMC Visit";
  createdAt: string;
  date: string; // scheduled ISO date
  slot: string;
  complaint: Complaint;
  preWork: PreWork;
  customerVerified: boolean;
  arrivedAt?: string;
  diagnosis: Diagnosis;
  lines: QuoteLine[];
  discount: number;
  quote: Quote | null;
  work: { serviceType: string; before: string; after: string; remarks: string };
  invoice: { no: string; at: string } | null;
  payments: Payment[];
  followUp: { date: string; note: string } | null;
  rating?: number;
  notes: { at: string; by: string; text: string }[];
  timeline: TimelineEntry[];
  cancelReason?: string;
  /** Finance add-on: extra technicians on the job (techId is the lead). */
  helpers?: string[];
  /** Approved manual revenue split, techId → % (must total 100); otherwise split by approved hours. */
  split?: Record<string, number>;
  splitApprovedBy?: string;
  /** Callback: the earlier job this visit is a repeat of. */
  parentJobId?: string;
  estHours?: number;
}

export interface Technician {
  id: string;
  name: string;
  phone: string;
  skills: string[];
  area: string;
  availability: "Available" | "On Job" | "Off Duty";
  active: boolean;
  rating: number;
  joined: string;
  van: Record<string, number>; // partId → qty issued to this technician
}

export interface Part {
  id: string;
  sku: string;
  name: string;
  category: "Compressor" | "Electrical" | "Motor" | "Gas" | "Plumbing" | "Accessory" | "Consumable";
  cost: number;
  price: number;
  stock: number; // warehouse
  minStock: number;
  unit: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  category: "Visit" | "Service" | "Repair" | "Gas" | "Installation" | "AMC";
  price: number;
  active: boolean;
}

export interface AppNotification {
  id: string;
  at: string;
  to: string; // "admin" | "tech:<id>" | "customer:<id>"
  title: string;
  body: string;
  jobId?: string;
  read: boolean;
}

export interface AuditEntry { id: string; at: string; who: string; action: string; detail: string }

export type LeadStatus = "Open" | "Contacted" | "Converted" | "Dismissed";

export interface Settings {
  company: string;
  phone: string;
  address: string;
  gstin: string;
  gstEnabled: boolean;
  gstPercent: number;
  reminderDays: number; // service reminder after last service
  amcBasic: number;
  amcComprehensive: number;
  approvalMode: "Customer App or OTP" | "OTP only";
}

export interface Db {
  seq: number;
  customers: Customer[];
  acs: AcUnit[];
  jobs: Job[];
  techs: Technician[];
  parts: Part[];
  services: ServiceItem[];
  notifications: AppNotification[];
  audit: AuditEntry[];
  leads: Record<string, LeadStatus>;
  settings: Settings;
  // ── finance add-on (app/lib/finance*.ts) ──
  timeLogs: TimeLog[];
  corrections: TimeCorrection[];
  salaries: SalaryRecord[];
  expenses: Expense[];
  advances: Advance[];
  incentives: Incentive[];
  deductions: Deduction[];
  attendance: AttendanceMark[];
  holidays: Holiday[];
  payrollRuns: PayrollRun[];
  calcs: SavedCalc[];
  fin: FinanceSettings;
  /** technician Calculators hub: favourites & recently used, per technician */
  techPrefs?: Record<string, { fav: string[]; recent: string[] }>;
  /** saved-data schema version (see upgradeDb) */
  version?: number;
}

/* ───────────────────────── Helpers ───────────────────────── */

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const pad = (n: number) => String(n).padStart(2, "0");
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local ISO date, `offset` days from today. */
export const isoDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toIsoDate(d);
};
export const today = () => isoDay(0);

/** Local ISO date-time ("2026-09-30T10:15"), `offset` days from today at `hm`. */
export const isoAt = (offset: number, hm: string) => `${isoDay(offset)}T${hm}`;
export const nowIso = () => {
  const d = new Date();
  return `${toIsoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-30" → "30 Sep 2026" */
export const fmtDate = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
/** "2026-09-30T14:05" → "30 Sep 2026, 2:05 PM" */
export const fmtDateTime = (iso: string) => {
  if (!iso) return "—";
  const [, t = "00:00"] = iso.split("T");
  const [h, min] = t.split(":").map(Number);
  return `${fmtDate(iso)}, ${((h + 11) % 12) + 1}:${pad(min)} ${h < 12 ? "AM" : "PM"}`;
};
export const fmtTime = (iso: string) => fmtDateTime(iso).split(", ")[1] ?? "";
/** Today / Tomorrow / Yesterday / 30 Sep 2026 */
export const relDay = (iso: string) => {
  const d = iso.slice(0, 10);
  if (d === isoDay(0)) return "Today";
  if (d === isoDay(1)) return "Tomorrow";
  if (d === isoDay(-1)) return "Yesterday";
  return fmtDate(d);
};
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export const SLOTS = ["9:00 – 11:00 AM", "11:00 AM – 1:00 PM", "1:00 – 3:00 PM", "3:00 – 5:00 PM", "5:00 – 7:00 PM"];

export const acLabel = (ac: AcUnit) => `${ac.brand} ${ac.capacity} ${ac.acType}`;
export const acShort = (ac: AcUnit) => `${ac.application} · ${ac.brand} ${ac.capacity.replace(" Ton", "T")}`;

export interface Totals { subtotal: number; discount: number; taxable: number; gst: number; total: number; paid: number; due: number }

export function jobTotals(job: Job, s: Settings): Totals {
  const subtotal = job.lines.reduce((t, l) => t + l.qty * l.price, 0);
  const discount = Math.min(job.discount, subtotal);
  const taxable = subtotal - discount;
  const gst = s.gstEnabled ? Math.round((taxable * s.gstPercent) / 100) : 0;
  const total = taxable + gst;
  const paid = job.payments.reduce((t, p) => t + (p.refund ? -p.amount : p.amount), 0);
  return { subtotal, discount, taxable, gst, total, paid, due: Math.max(0, total - paid) };
}

export function paymentStatus(job: Job, s: Settings): PaymentStatus {
  if (job.payments.some((p) => p.refund)) return "Refunded";
  const t = jobTotals(job, s);
  if (t.total === 0) return "Paid";
  if (t.paid <= 0) return "Pending";
  return t.paid >= t.total ? "Paid" : "Partially Paid";
}

export const OPEN_STATUSES: JobStatus[] = [
  "New Request", "Assigned", "Accepted", "On the Way", "Arrived", "Diagnosis", "Estimate Prepared", "Approved", "Work Started", "Work Completed",
];
export const isOpen = (j: Job) => OPEN_STATUSES.includes(j.status);
export const isDone = (j: Job) => j.status === "Invoiced" || j.status === "Closed";
export const stepOf = (s: JobStatus) => JOB_FLOW.indexOf(s as (typeof JOB_FLOW)[number]);

/** Jobs for one AC, newest first. */
export const acJobs = (db: Db, acId: string) =>
  db.jobs.filter((j) => j.acId === acId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export interface AcSummary {
  visits: number;
  spend: number;
  lastService: string | null;
  gasCharges: string[]; // ISO dates
  partsReplaced: { name: string; at: string }[];
  repeatIssues: string[]; // complaint issues that came back
  lastGas: string | null;
}

/** Service-history roll-up for one AC (PRD §10). */
export function acSummary(db: Db, acId: string): AcSummary {
  const done = acJobs(db, acId).filter(isDone);
  const spend = done.reduce((t, j) => t + jobTotals(j, db.settings).total, 0);
  const gasCharges = done.filter((j) => j.lines.some((l) => /gas/i.test(l.name) && l.kind !== "Material")).map((j) => j.date);
  const partsReplaced = done.flatMap((j) => j.lines.filter((l) => l.kind === "Part").map((l) => ({ name: l.name, at: j.date })));
  const seen = new Map<string, number>();
  acJobs(db, acId).forEach((j) => j.complaint.issues.forEach((i) => seen.set(i, (seen.get(i) ?? 0) + 1)));
  const repeatIssues = [...seen].filter(([, n]) => n > 1).map(([i]) => i);
  return { visits: done.length, spend, lastService: done[0]?.date ?? null, gasCharges, partsReplaced, repeatIssues, lastGas: gasCharges[0] ?? null };
}

/* ───────────────────────── Recommendation engine (PRD §7) ───────────────────────── */

export interface Recommendation {
  id: string;
  title: string;
  reason: string;
  price: number;
  kind: LineKind | "AMC" | "Lead";
  refId?: string;
}

/** Suggestions for a job, from the AC's age, usage, history and today's diagnosis.
 *  They are only suggestions — the customer approves anything chargeable. */
export function recommend(db: Db, job: Job): Recommendation[] {
  const ac = db.acs.find((a) => a.id === job.acId);
  const cust = db.customers.find((c) => c.id === job.customerId);
  if (!ac || !cust) return [];
  const sum = acSummary(db, ac.id);
  const svc = (id: string) => db.services.find((s) => s.id === id);
  const part = (id: string) => db.parts.find((p) => p.id === id);
  const out: Recommendation[] = [];
  const issues = job.complaint.issues;
  const d = job.diagnosis;
  const cooling = issues.includes("Less Cooling") || issues.includes("No Cooling");

  const monthsSinceService = sum.lastService ? daysBetween(sum.lastService, today()) / 30 : 99;
  if (monthsSinceService >= 6 && !job.lines.some((l) => l.refId === "sv-jet")) {
    out.push({ id: "jet", title: svc("sv-jet")!.name, price: svc("sv-jet")!.price, kind: "Service", refId: "sv-jet",
      reason: sum.lastService ? `Last serviced ${Math.round(monthsSinceService)} months ago — dirty coils cut cooling and raise the power bill.` : "No service on record for this AC." });
  }
  if (cooling && sum.gasCharges.length > 0) {
    const m = Math.round(daysBetween(sum.lastGas!, today()) / 30);
    out.push({ id: "leak", title: svc("sv-leak")!.name, price: svc("sv-leak")!.price, kind: "Service", refId: "sv-leak",
      reason: `Gas was charged ${m} months ago and cooling is dropping again — a refill alone will leak out. Find and braze the leak first.` });
  }
  if (cooling && (d.gasStatus === "Low" || d.gasStatus === "Empty") && !job.lines.some((l) => l.refId === "sv-gas")) {
    out.push({ id: "gas", title: svc("sv-gas")!.name, price: svc("sv-gas")!.price, kind: "Service", refId: "sv-gas",
      reason: `Gas pressure measured ${d.gasStatus.toLowerCase()}${d.suctionPsi ? ` (${d.suctionPsi} psi suction)` : ""}.` });
  }
  const lowVolt = Number(d.voltage) > 0 && Number(d.voltage) < 200;
  if (lowVolt || job.preWork.voltageProblem === "Yes") {
    out.push({ id: "stab", title: part("p-stab")!.name, price: part("p-stab")!.price, kind: "Part", refId: "p-stab",
      reason: lowVolt ? `Socket voltage read ${d.voltage} V — below the safe 200 V for the compressor.` : "Customer reported recent voltage problems." });
  }
  if (issues.includes("Remote Problem")) {
    out.push({ id: "remote", title: part("p-remote")!.name, price: part("p-remote")!.price, kind: "Part", refId: "p-remote", reason: "Customer complained about the remote." });
  }
  if (issues.includes("Water Leakage") || job.preWork.leakageBefore === "Yes") {
    out.push({ id: "drain", title: svc("sv-drain")!.name, price: svc("sv-drain")!.price, kind: "Service", refId: "sv-drain",
      reason: job.preWork.leakageBefore === "Yes" ? "Leakage has happened before — clean and re-slope the drain line." : "Water leakage reported." });
  }
  if (!cust.amc && (ac.usage === "Heavy" || ac.usage === "24×7" || db.acs.filter((a) => a.customerId === cust.id).length > 1 || sum.visits >= 2)) {
    out.push({ id: "amc", title: "AMC — Annual Maintenance Plan", price: db.settings.amcBasic, kind: "AMC",
      reason: `${sum.visits} paid visit${sum.visits === 1 ? "" : "s"} on this AC${ac.usage === "Heavy" || ac.usage === "24×7" ? `, ${ac.usage.toLowerCase()} usage` : ""}. AMC covers 3 services a year and discounted repairs.` });
  }
  if (ac.ageYears >= 8 || sum.spend >= 15000) {
    out.push({ id: "replace", title: "New AC replacement consultation", price: 0, kind: "Lead",
      reason: ac.ageYears >= 8 ? `This AC is ${ac.ageYears} years old — a 5-star inverter AC could pay for itself in power savings.` : `${inr(sum.spend)} already spent on repairs.` });
  }
  const others = db.acs.filter((a) => a.customerId === cust.id && a.id !== ac.id);
  others.forEach((o) => {
    const s = acSummary(db, o.id);
    const due = s.lastService ? daysBetween(s.lastService, today()) >= db.settings.reminderDays : true;
    if (due) out.push({ id: `other-${o.id}`, title: `Service the ${o.application.toLowerCase()} AC too`, price: svc("sv-service")!.price, kind: "Service", refId: "sv-service",
      reason: `${acLabel(o)} — ${s.lastService ? `last serviced ${fmtDate(s.lastService)}` : "never serviced by us"}. Same visit, no extra visit charge.` });
  });
  return out.filter((r) => !job.lines.some((l) => l.upsell && l.name === r.title));
}

/* ───────────────────────── Demo seed ───────────────────────── */

export const ADMIN_DEMO = { email: "admin@pushpak.in", password: "pushpak@demo" };
export const TECH_DEMO_ID = "t1";
export const CUSTOMER_DEMO_PHONE = "9876543210";
export const DEMO_OTP = "1234";

const SERVICES: ServiceItem[] = [
  { id: "sv-visit", name: "Inspection / visit charge", category: "Visit", price: 300, active: true },
  { id: "sv-service", name: "General service (wet wash)", category: "Service", price: 599, active: true },
  { id: "sv-jet", name: "Deep jet cleaning", category: "Service", price: 899, active: true },
  { id: "sv-gas", name: "Gas charging (full)", category: "Gas", price: 2800, active: true },
  { id: "sv-gastop", name: "Gas top-up", category: "Gas", price: 1500, active: true },
  { id: "sv-leak", name: "Gas leak detection & brazing", category: "Repair", price: 1200, active: true },
  { id: "sv-pcb", name: "PCB repair", category: "Repair", price: 1800, active: true },
  { id: "sv-drain", name: "Drain line cleaning", category: "Repair", price: 350, active: true },
  { id: "sv-install", name: "Installation (split)", category: "Installation", price: 1500, active: true },
  { id: "sv-uninstall", name: "Uninstallation", category: "Installation", price: 700, active: true },
];

const PARTS: Part[] = [
  { id: "p-comp15", sku: "CMP-15R32", name: "Compressor 1.5T (R32)", category: "Compressor", cost: 9500, price: 12000, stock: 3, minStock: 2, unit: "pc" },
  { id: "p-cap", sku: "CAP-4505", name: "Capacitor 45+5 MFD", category: "Electrical", cost: 180, price: 450, stock: 24, minStock: 10, unit: "pc" },
  { id: "p-fanin", sku: "MTR-IDU", name: "Indoor fan motor", category: "Motor", cost: 1900, price: 2800, stock: 4, minStock: 3, unit: "pc" },
  { id: "p-fanout", sku: "MTR-ODU", name: "Outdoor fan motor", category: "Motor", cost: 2300, price: 3200, stock: 2, minStock: 3, unit: "pc" },
  { id: "p-pcb", sku: "PCB-UNI", name: "Universal PCB kit", category: "Electrical", cost: 2400, price: 3500, stock: 5, minStock: 2, unit: "pc" },
  { id: "p-r32", sku: "GAS-R32", name: "Refrigerant R32", category: "Gas", cost: 650, price: 1300, stock: 18, minStock: 8, unit: "kg" },
  { id: "p-r22", sku: "GAS-R22", name: "Refrigerant R22", category: "Gas", cost: 700, price: 1400, stock: 6, minStock: 8, unit: "kg" },
  { id: "p-filter", sku: "FLT-MESH", name: "Air filter mesh", category: "Accessory", cost: 250, price: 800, stock: 45, minStock: 15, unit: "pc" },
  { id: "p-copper", sku: "CU-1438", name: "Copper pipe 1/4 + 3/8", category: "Plumbing", cost: 110, price: 180, stock: 120, minStock: 40, unit: "ft" },
  { id: "p-drain", sku: "DRN-16", name: "Drain pipe", category: "Plumbing", cost: 30, price: 120, stock: 60, minStock: 20, unit: "m" },
  { id: "p-remote", sku: "RMT-UNI", name: "Universal AC remote", category: "Accessory", cost: 180, price: 450, stock: 7, minStock: 5, unit: "pc" },
  { id: "p-stab", sku: "STB-4K", name: "Stabilizer 4 kVA", category: "Electrical", cost: 1700, price: 2400, stock: 4, minStock: 2, unit: "pc" },
  { id: "p-sensor", sku: "SNS-THM", name: "Thermistor sensor", category: "Electrical", cost: 120, price: 350, stock: 1, minStock: 6, unit: "pc" },
  { id: "p-contactor", sku: "CTR-32A", name: "Contactor 32A", category: "Electrical", cost: 340, price: 650, stock: 9, minStock: 4, unit: "pc" },
  { id: "p-tape", sku: "TPE-INS", name: "Insulation tape", category: "Consumable", cost: 25, price: 60, stock: 80, minStock: 20, unit: "roll" },
];

const TECHS: Technician[] = [
  { id: "t1", name: "Rohit Kumar", phone: "9871234560", skills: ["Split", "Window", "Gas charging", "PCB repair"], area: "Dwarka, Janakpuri", availability: "Available", active: true, rating: 4.8, joined: "2022-04-11",
    van: { "p-cap": 6, "p-r32": 4, "p-filter": 8, "p-copper": 20, "p-drain": 10, "p-remote": 2, "p-tape": 10, "p-sensor": 1, "p-contactor": 2, "p-fanin": 1 } },
  { id: "t2", name: "Amit Sharma", phone: "9871234561", skills: ["Split", "Cassette", "Ductable", "Compressor"], area: "Rajouri Garden, Punjabi Bagh", availability: "On Job", active: true, rating: 4.6, joined: "2021-08-02",
    van: { "p-cap": 5, "p-r32": 3, "p-r22": 2, "p-filter": 6, "p-copper": 30, "p-tape": 8, "p-contactor": 2 } },
  { id: "t3", name: "Suresh Patel", phone: "9871234562", skills: ["Window", "Split", "Installation"], area: "Uttam Nagar, Vikaspuri", availability: "Available", active: true, rating: 4.5, joined: "2023-01-16",
    van: { "p-cap": 4, "p-r32": 2, "p-filter": 5, "p-copper": 40, "p-drain": 8, "p-tape": 6 } },
  { id: "t4", name: "Manoj Yadav", phone: "9871234563", skills: ["Tower", "Cassette", "Commercial"], area: "Dwarka, Palam", availability: "Off Duty", active: true, rating: 4.3, joined: "2024-06-20",
    van: { "p-cap": 3, "p-r22": 2, "p-tape": 5 } },
];

const C = (id: string, name: string, phone: string, address: string, area: string, type: CustomerType, extra: Partial<Customer> = {}): Customer => ({
  id, name, phone, altPhone: "", address, area, gps: "", type, status: "Existing", contactPref: "WhatsApp", createdAt: isoAt(-400, "11:00"), amc: null, ...extra,
});

const CUSTOMERS: Customer[] = [
  C("c1", "Rajesh Sharma", "9876543210", "B-42, Sector 7, Dwarka, New Delhi 110075", "Dwarka", "Residential", { altPhone: "9811122233", gps: "28.5921,77.0460", createdAt: isoAt(-780, "10:00") }),
  C("c2", "Priya Mehta", "9876532109", "3rd Floor, Aggarwal Plaza, Janakpuri, New Delhi 110058", "Janakpuri", "Office", { contactPref: "Call", gps: "28.6219,77.0878",
    amc: { plan: "Comprehensive", from: isoDay(-200), to: isoDay(165), visitsLeft: 2 } }),
  C("c3", "Amit Singh", "9876543219", "Shop 14, Main Market, Rajouri Garden, New Delhi 110027", "Rajouri Garden", "Shop", { gps: "28.6415,77.1209" }),
  C("c4", "Sunita Verma", "9810098765", "C-9, Vikaspuri, New Delhi 110018", "Vikaspuri", "Residential", { contactPref: "Call" }),
  C("c5", "Vikram Joshi", "9899001122", "Plot 7, Udyog Vihar Ph-1, Dwarka Sec 21, New Delhi 110077", "Dwarka", "Commercial", { gps: "28.5530,77.0580",
    amc: { plan: "Basic", from: isoDay(-352), to: isoDay(13), visitsLeft: 1 } }),
  C("c6", "Neha Gupta", "9812345678", "Flat 1203, Sunrise Apartments, Sector 12, Dwarka 110078", "Dwarka", "Residential", { status: "New", createdAt: isoAt(-1, "18:20") }),
  C("c7", "Imran Khan", "9958123456", "WZ-112, Uttam Nagar, New Delhi 110059", "Uttam Nagar", "Residential"),
  C("c8", "Kavita Rao", "9818765432", "A-5, Punjabi Bagh West, New Delhi 110026", "Punjabi Bagh", "Residential", { contactPref: "Call" }),
  C("c9", "Deepak Chauhan", "9711223344", "Chauhan Sweets, Palam Village, New Delhi 110045", "Palam", "Shop"),
  C("c10", "Rajesh Sharma", "9876543211", "B-42, Sector 7, Dwarka", "Dwarka", "Residential", { status: "New", createdAt: isoAt(-20, "09:10") }), // duplicate of c1 — for the merge demo
];

const A = (id: string, customerId: string, application: AcUnit["application"], acType: AcUnit["acType"], capacity: AcUnit["capacity"], brand: string, ageYears: number, extra: Partial<AcUnit> = {}): AcUnit => ({
  id, customerId, application, acType, capacity, brand, model: "", serial: "", inverter: true, ageYears, installAgeYears: ageYears,
  purchased: "New", warranty: ageYears <= 1 ? "Yes" : "No", dailyHours: 8, usage: "Regular", ...extra,
});

const ACS: AcUnit[] = [
  A("ac1", "c1", "Bedroom", "Split", "1.5 Ton", "Daikin", 6, { model: "FTKF50TV", serial: "DK50T8821A", dailyHours: 10, usage: "Heavy" }),
  A("ac2", "c1", "Hall", "Split", "2 Ton", "LG", 3, { model: "PS-Q24ENZE", serial: "LG24Q55012", dailyHours: 6 }),
  A("ac3", "c2", "Office", "Cassette", "2 Ton", "Blue Star", 4, { model: "IC324YATU", serial: "BS324Y0192", dailyHours: 11, usage: "Heavy" }),
  A("ac4", "c2", "Office", "Split", "1.5 Ton", "Voltas", 5, { model: "183V DZX", serial: "VL183D4410", dailyHours: 11, usage: "Heavy" }),
  A("ac5", "c3", "Shop", "Split", "1.5 Ton", "Voltas", 9, { model: "185 CZMS", serial: "VL185C0021", inverter: false, installAgeYears: 7, purchased: "Used", dailyHours: 12, usage: "Heavy" }),
  A("ac6", "c4", "Bedroom", "Window", "1.5 Ton", "Lloyd", 11, { model: "GLW18C3YWSEW", inverter: false, dailyHours: 5, usage: "Occasional" }),
  A("ac7", "c5", "Server Room", "Split", "2 Ton", "Hitachi", 4, { model: "RSOG224HDEA", serial: "HT224H7781", dailyHours: 24, usage: "24×7" }),
  A("ac8", "c5", "Server Room", "Split", "2 Ton", "Hitachi", 4, { model: "RSOG224HDEA", serial: "HT224H7782", dailyHours: 24, usage: "24×7" }),
  A("ac9", "c5", "Office", "Tower", "Other", "Blue Star", 6, { model: "Tower 4T", dailyHours: 10, usage: "Heavy" }),
  A("ac10", "c6", "Bedroom", "Split", "1 Ton", "Samsung", 1, { model: "AR12CY3ZAWK", dailyHours: 8, warranty: "Yes" }),
  A("ac11", "c7", "Hall", "Split", "1.5 Ton", "Carrier", 7, { dailyHours: 9 }),
  A("ac12", "c8", "Bedroom", "Split", "1.5 Ton", "Panasonic", 2, { dailyHours: 7 }),
  A("ac13", "c9", "Shop", "Cassette", "2 Ton", "Daikin", 5, { dailyHours: 13, usage: "Heavy" }),
];

let seedSeq = 1000;
const L = (kind: LineKind, name: string, price: number, qty = 1, extra: Partial<QuoteLine> = {}): QuoteLine => ({ id: `l${++seedSeq}`, kind, name, qty, price, ...extra });

const flowUntil = (status: JobStatus, start: string, techName: string, doneOffsetMin = 0): TimelineEntry[] => {
  if (status === "Cancelled") return [{ status: "New Request", at: start, by: "Customer" }, { status: "Cancelled", at: start, by: "Service Coordinator" }];
  const last = stepOf(status);
  const [d, t] = start.split("T");
  const [h, m] = t.split(":").map(Number);
  return JOB_FLOW.slice(0, last + 1).map((s, i) => {
    const mins = h * 60 + m + (i === 0 ? 0 : 20 + i * 12 + doneOffsetMin);
    const at = `${d}T${pad(Math.min(23, Math.floor(mins / 60)))}:${pad(mins % 60)}`;
    const by = i === 0 ? "Customer" : i === 1 ? "Service Coordinator" : s === "Approved" ? "Customer" : techName;
    return { status: s, at, by };
  });
};

interface JobSeed {
  id: string; customerId: string; acId: string; techId: string | null; status: JobStatus; day: number; slot?: number;
  issues: ComplaintIssue[]; notes: string; priority?: Job["priority"]; source?: Job["source"];
  lines?: QuoteLine[]; discount?: number; diagnosis?: Partial<Diagnosis>; preWork?: Partial<PreWork>;
  paid?: number | "full"; method?: PayMethod; rating?: number; work?: Partial<Job["work"]>; followUp?: Job["followUp"]; cancelReason?: string;
}

function mkJob(s: JobSeed): Job {
  const tech = TECHS.find((t) => t.id === s.techId);
  const start = isoAt(s.day, `${pad(9 + (s.slot ?? 0) * 2)}:15`);
  const step = s.status === "Cancelled" ? -1 : stepOf(s.status);
  const quoted = step >= stepOf("Estimate Prepared");
  const invoiced = step >= stepOf("Invoiced");
  const lines = s.lines ?? [];
  const job: Job = {
    id: s.id, customerId: s.customerId, acId: s.acId, techId: s.techId, status: s.status,
    priority: s.priority ?? "Normal", source: s.source ?? "Phone", createdAt: isoAt(s.day - (step >= 2 ? 1 : 0), "10:05"),
    date: isoDay(s.day), slot: SLOTS[s.slot ?? 0],
    complaint: { issues: s.issues, notes: s.notes, errorCode: "" },
    preWork: { ...EMPTY_PREWORK, ...s.preWork },
    customerVerified: step >= stepOf("Arrived"),
    arrivedAt: step >= stepOf("Arrived") ? isoAt(s.day, `${pad(9 + (s.slot ?? 0) * 2)}:55`) : undefined,
    diagnosis: { ...EMPTY_DIAGNOSIS, ...s.diagnosis },
    lines, discount: s.discount ?? 0,
    quote: quoted ? {
      no: `QTN-${s.id.slice(2)}`, at: isoAt(s.day, "12:10"), revision: 1,
      status: step >= stepOf("Approved") ? "Approved" : "Pending",
      approvedVia: step >= stepOf("Approved") ? "OTP" : undefined,
      decidedAt: step >= stepOf("Approved") ? isoAt(s.day, "12:25") : undefined,
    } : null,
    work: { serviceType: "", before: "", after: "", remarks: "", ...s.work },
    invoice: invoiced ? { no: `INV-${s.id.slice(2)}`, at: isoAt(s.day, "14:30") } : null,
    payments: [], followUp: s.followUp ?? null, rating: s.rating, notes: [],
    timeline: flowUntil(s.status, start, tech?.name ?? "Technician"),
    cancelReason: s.cancelReason,
  };
  if (job.quote?.status === "Approved") job.quote.approvedTotal = jobTotals(job, SETTINGS).total;
  if (s.paid) {
    const total = jobTotals(job, SETTINGS).total;
    job.payments.push({ id: `pay${++seedSeq}`, amount: s.paid === "full" ? total : s.paid, method: s.method ?? "UPI", ref: s.method === "Cash" ? "" : `UPI${400000 + seedSeq}`, at: isoAt(s.day, "14:40"), by: tech?.name ?? "Office" });
  }
  return job;
}

const SETTINGS: Settings = {
  company: "Pushpak Refrigeration Centre", phone: "+91 98100 12345", address: "Shop 3, Main Road, Sector 6, Dwarka, New Delhi 110075",
  gstin: "07ABCPP1234K1Z5", gstEnabled: true, gstPercent: 18, reminderDays: 120, amcBasic: 2499, amcComprehensive: 4999,
  approvalMode: "Customer App or OTP",
};

const JOBS: Job[] = [
  // ── Rajesh (demo customer) — Bedroom Daikin: history of repeat cooling problems ──
  mkJob({ id: "J-1001", customerId: "c1", acId: "ac1", techId: "t2", status: "Closed", day: -763, issues: ["Indoor Fan Problem", "Noise"], notes: "Indoor unit making grinding sound and fan stops sometimes.",
    lines: [L("Service", "Inspection / visit charge", 300, 1, { refId: "sv-visit" }), L("Part", "Indoor fan motor", 2800, 1, { refId: "p-fanin" }), L("Labour", "Fan motor replacement labour", 500)],
    diagnosis: { observed: "Indoor blower bearing worn, motor overheating", rootCause: "Fan motor fault", gasStatus: "Normal" }, paid: "full", method: "Cash", rating: 5,
    work: { serviceType: "Repair", remarks: "Replaced indoor fan motor. Tested 30 min." } }),
  mkJob({ id: "J-1009", customerId: "c1", acId: "ac1", techId: "t1", status: "Closed", day: -202, issues: ["Less Cooling"], notes: "AC is not cooling properly since summer started.",
    lines: [L("Service", "Inspection / visit charge", 300, 1, { refId: "sv-visit" }), L("Service", "Gas top-up", 1500, 1, { refId: "sv-gastop" }), L("Part", "Refrigerant R32", 1300, 1, { refId: "p-r32" })],
    diagnosis: { observed: "Suction pressure 90 psi, vent temp 19°C", rootCause: "Low refrigerant / gas leak", gasStatus: "Low", suctionPsi: "90" }, paid: "full", rating: 4,
    work: { serviceType: "Gas charging", remarks: "Topped up R32. Leak test not done — customer declined." } }),
  mkJob({ id: "J-1042", customerId: "c1", acId: "ac1", techId: "t1", status: "Assigned", day: 0, slot: 1, source: "Customer App", priority: "High",
    issues: ["Less Cooling", "Water Leakage"], notes: "AC is not cooling properly since morning and some water dripping from indoor unit.",
    preWork: { occurrence: "Repeat Problem", prevTechVisit: "Yes", prevDiagnosis: "Low gas", prevWork: "Gas top-up", gasChargedBefore: "Yes", gasChargedWhen: "About 7 months ago", coolingLastedAfterGas: "4–5 months", coolingTrend: "Was good, now reduced" } }),

  // ── Rajesh — Hall LG: estimate waiting for his approval (customer-app demo) ──
  mkJob({ id: "J-1040", customerId: "c1", acId: "ac2", techId: "t2", status: "Estimate Prepared", day: 0, slot: 0, source: "Customer App",
    issues: ["AC Not Starting"], notes: "AC not turning on with remote, only blinking light.",
    diagnosis: { observed: "Outdoor unit not starting, capacitor bulged", notes: "Indoor PCB healthy. Capacitor failed, contactor pitted.", rootCause: "Capacitor failure", voltage: "228", ampere: "0", gasStatus: "Normal", indoorObs: "PCB OK, fan OK", outdoorObs: "Capacitor bulged, contactor pitted", recommendation: "Replace capacitor and contactor" },
    lines: [L("Service", "Inspection / visit charge", 300, 1, { refId: "sv-visit" }), L("Part", "Capacitor 45+5 MFD", 450, 1, { refId: "p-cap" }), L("Part", "Contactor 32A", 650, 1, { refId: "p-contactor" }), L("Labour", "Electrical repair labour", 400)],
    preWork: { occurrence: "First Time", prevTechVisit: "No", voltageProblem: "No", lastService: "Last year, April" } }),

  // ── Technician Rohit's day ──
  mkJob({ id: "J-1041", customerId: "c2", acId: "ac3", techId: "t1", status: "Accepted", day: 0, slot: 0, source: "AMC Visit",
    issues: ["Water Leakage"], notes: "Water dripping from the cassette onto the reception desk.", preWork: { occurrence: "Repeat Problem", leakageBefore: "Yes", lastService: "4 months ago" } }),
  mkJob({ id: "J-1045", customerId: "c7", acId: "ac11", techId: "t1", status: "Assigned", day: 1, slot: 2, issues: ["Noise", "Vibration"], notes: "Outdoor unit makes loud rattling sound at night." }),
  mkJob({ id: "J-1036", customerId: "c8", acId: "ac12", techId: "t1", status: "Closed", day: -1, slot: 2, issues: ["Bad Smell"], notes: "Smell coming when AC starts.",
    lines: [L("Service", "Deep jet cleaning", 899, 1, { refId: "sv-jet" }), L("Part", "Air filter mesh", 800, 1, { refId: "p-filter" })],
    diagnosis: { observed: "Fungus on evaporator coil, filter clogged", rootCause: "Dirty coil / filter", gasStatus: "Normal" }, paid: "full", rating: 5, work: { serviceType: "Service", remarks: "Jet cleaned, anti-bacterial spray, new filter." } }),
  mkJob({ id: "J-1033", customerId: "c4", acId: "ac6", techId: "t1", status: "Closed", day: -3, issues: ["No Cooling"], notes: "Window AC only blowing air.",
    lines: [L("Service", "Inspection / visit charge", 300, 1, { refId: "sv-visit" }), L("Service", "Gas charging (full)", 2800, 1, { refId: "sv-gas" }), L("Part", "Refrigerant R22", 1400, 1, { refId: "p-r22" }), L("Service", "Gas leak detection & brazing", 1200, 1, { refId: "sv-leak", upsell: true })],
    diagnosis: { observed: "Zero pressure, oil stain at service valve", rootCause: "Low refrigerant / gas leak", gasStatus: "Empty" }, paid: "full", method: "Cash", rating: 4,
    work: { serviceType: "Gas charging", remarks: "Brazed valve joint leak, vacuumed and charged R22." } }),

  // ── Amit Sharma: live job ──
  mkJob({ id: "J-1039", customerId: "c5", acId: "ac7", techId: "t2", status: "Work Started", day: 0, slot: 0, priority: "Urgent", source: "AMC Visit",
    issues: ["Automatically Switching Off", "Error Code"], notes: "Server room AC tripping every 2 hours, shows E4.",
    diagnosis: { observed: "High pressure trip, condenser choked with dust", rootCause: "Dirty coil / filter", errorCode: "E4", voltage: "226", gasStatus: "Normal" },
    lines: [L("Service", "Deep jet cleaning", 899, 1, { refId: "sv-jet" }), L("Part", "Thermistor sensor", 350, 1, { refId: "p-sensor" })] }),

  // ── Waiting to be dispatched ──
  mkJob({ id: "J-1046", customerId: "c6", acId: "ac10", techId: null, status: "New Request", day: 0, slot: 3, source: "Customer App", issues: ["Remote Problem", "Less Cooling"], notes: "Remote not working and cooling feels low." }),
  mkJob({ id: "J-1047", customerId: "c9", acId: "ac13", techId: null, status: "New Request", day: 0, slot: 2, priority: "Urgent", source: "WhatsApp", issues: ["No Cooling"], notes: "Shop AC stopped cooling, customers complaining. Please send someone today." }),
  mkJob({ id: "J-1048", customerId: "c3", acId: "ac5", techId: null, status: "New Request", day: 1, slot: 0, issues: ["High Electricity Consumption", "Less Cooling"], notes: "Bill has gone up a lot, AC runs full day." }),

  // ── Billing: work done, payment pending ──
  mkJob({ id: "J-1037", customerId: "c3", acId: "ac5", techId: "t3", status: "Invoiced", day: -2, issues: ["AC Not Starting"], notes: "AC dead since morning.",
    lines: [L("Service", "Inspection / visit charge", 300, 1, { refId: "sv-visit" }), L("Part", "Universal PCB kit", 3500, 1, { refId: "p-pcb" }), L("Labour", "PCB fitting labour", 500)],
    diagnosis: { observed: "PCB burnt near relay", rootCause: "PCB / electrical fault", voltage: "184" }, paid: 2000, method: "Cash", work: { serviceType: "Repair", remarks: "Replaced PCB. Advised stabilizer." } }),
  mkJob({ id: "J-1034", customerId: "c9", acId: "ac13", techId: "t2", status: "Invoiced", day: -5, issues: ["Water Leakage"], notes: "Water coming from ceiling unit.",
    lines: [L("Service", "Drain line cleaning", 350, 1, { refId: "sv-drain" }), L("Part", "Drain pipe", 120, 3, { refId: "p-drain" })],
    diagnosis: { observed: "Drain pump weak, pipe sagging", rootCause: "Drain blockage" }, work: { serviceType: "Repair" } }),

  // ── More history for reports ──
  mkJob({ id: "J-1030", customerId: "c5", acId: "ac8", techId: "t2", status: "Closed", day: -6, source: "AMC Visit", issues: ["Less Cooling"], notes: "AMC quarterly service.",
    lines: [L("Service", "General service (wet wash)", 599, 1, { refId: "sv-service" })], discount: 599, diagnosis: { rootCause: "Dirty coil / filter", gasStatus: "Normal" }, work: { serviceType: "AMC service" }, rating: 5 }),
  mkJob({ id: "J-1028", customerId: "c7", acId: "ac11", techId: "t3", status: "Closed", day: -8, issues: ["Less Cooling"], notes: "Cooling low.",
    lines: [L("Service", "Gas top-up", 1500, 1, { refId: "sv-gastop" }), L("Part", "Refrigerant R32", 1300, 1, { refId: "p-r32" }), L("Service", "Deep jet cleaning", 899, 1, { refId: "sv-jet", upsell: true })],
    diagnosis: { rootCause: "Low refrigerant / gas leak", gasStatus: "Low" }, paid: "full", rating: 4, work: { serviceType: "Gas charging" },
    followUp: { date: isoDay(22), note: "Check cooling a month after gas top-up" } }),
  mkJob({ id: "J-1026", customerId: "c2", acId: "ac4", techId: "t1", status: "Closed", day: -10, source: "AMC Visit", issues: ["Noise"], notes: "Rattle from outdoor unit.",
    lines: [L("Part", "Capacitor 45+5 MFD", 450, 1, { refId: "p-cap" }), L("Labour", "Mounting bolts tightened", 200)], diagnosis: { rootCause: "Installation issue" }, paid: "full", rating: 5, work: { serviceType: "Repair" } }),
  mkJob({ id: "J-1024", customerId: "c8", acId: "ac12", techId: "t3", status: "Closed", day: -12, source: "Walk-in", issues: ["Other"], notes: "New AC installation.",
    lines: [L("Service", "Installation (split)", 1500, 1, { refId: "sv-install" }), L("Part", "Copper pipe 1/4 + 3/8", 180, 6, { refId: "p-copper" }), L("Part", "Stabilizer 4 kVA", 2400, 1, { refId: "p-stab", upsell: true })],
    paid: "full", rating: 5, work: { serviceType: "Installation" } }),
  mkJob({ id: "J-1021", customerId: "c4", acId: "ac6", techId: "t3", status: "Closed", day: -13, issues: ["Noise"], notes: "Loud humming.",
    lines: [L("Service", "Inspection / visit charge", 300, 1, { refId: "sv-visit" }), L("Part", "Capacitor 45+5 MFD", 450, 1, { refId: "p-cap" })], diagnosis: { rootCause: "Capacitor failure" }, paid: "full", method: "Cash", work: { serviceType: "Repair" } }),
  mkJob({ id: "J-1019", customerId: "c3", acId: "ac5", techId: "t2", status: "Closed", day: -40, issues: ["Less Cooling"], notes: "Cooling less.",
    lines: [L("Service", "Gas charging (full)", 2800, 1, { refId: "sv-gas" }), L("Part", "Refrigerant R22", 1400, 2, { refId: "p-r22" })], diagnosis: { rootCause: "Low refrigerant / gas leak", gasStatus: "Empty" }, paid: "full", work: { serviceType: "Gas charging" } }),
  mkJob({ id: "J-1015", customerId: "c3", acId: "ac5", techId: "t1", status: "Closed", day: -120, issues: ["Outdoor Not Running"], notes: "Outdoor fan not moving.",
    lines: [L("Part", "Outdoor fan motor", 3200, 1, { refId: "p-fanout" }), L("Labour", "Motor replacement labour", 500)], diagnosis: { rootCause: "Fan motor fault" }, paid: "full", work: { serviceType: "Repair" } }),
  mkJob({ id: "J-1044", customerId: "c4", acId: "ac6", techId: null, status: "Cancelled", day: -1, issues: ["Noise"], notes: "Noise again.", cancelReason: "Customer fixed it themselves" }),
];

function seedNotifications(): AppNotification[] {
  return [
    { id: "n1", at: isoAt(0, "08:40"), to: "tech:t1", title: "New job assigned", body: "J-1042 · Rajesh Sharma · Less Cooling (repeat problem)", jobId: "J-1042", read: false },
    { id: "n2", at: isoAt(0, "12:10"), to: "customer:c1", title: "Quotation ready for approval", body: "Hall AC (LG 2T) · QTN-1040. Tap to review and approve.", jobId: "J-1040", read: false },
    { id: "n3", at: isoAt(0, "08:05"), to: "customer:c1", title: "Technician assigned", body: "Rohit Kumar will visit today, 11:00 AM – 1:00 PM.", jobId: "J-1042", read: true },
    { id: "n4", at: isoAt(0, "09:02"), to: "admin", title: "Urgent request from WhatsApp", body: "J-1047 · Chauhan Sweets · No Cooling — not yet assigned.", jobId: "J-1047", read: false },
    { id: "n5", at: isoAt(0, "07:30"), to: "admin", title: "Low stock", body: "Thermistor sensor (1 left), Refrigerant R22 (6 kg), Outdoor fan motor (2).", read: false },
    { id: "n6", at: isoAt(-1, "19:00"), to: "admin", title: "Payment pending", body: "J-1037 · Amit Singh · ₹2,484 due.", jobId: "J-1037", read: true },
  ];
}

function seedAudit(): AuditEntry[] {
  return [
    { id: "a1", at: isoAt(-2, "17:20"), who: "Admin", action: "Price edit", detail: "Deep jet cleaning ₹799 → ₹899" },
    { id: "a2", at: isoAt(-1, "10:02"), who: "Service Coordinator", action: "Job reassigned", detail: "J-1036 Suresh Patel → Rohit Kumar" },
    { id: "a3", at: isoAt(-1, "15:45"), who: "Admin", action: "Stock adjustment", detail: "Capacitor 45+5 MFD +20 (purchase bill #PB-778)" },
  ];
}

/** Fresh demo database. Dates are relative to today so the demo never goes stale. */
export function seedDb(): Db {
  return {
    seq: 1048,
    customers: CUSTOMERS.map((c) => ({ ...c })),
    acs: ACS.map((a) => ({ ...a })),
    jobs: JOBS.map((j) => structuredClone(j)),
    techs: TECHS.map((t) => ({ ...t, van: { ...t.van } })),
    parts: PARTS.map((p) => ({ ...p })),
    services: SERVICES.map((s) => ({ ...s })),
    notifications: seedNotifications(),
    audit: seedAudit(),
    leads: {},
    settings: { ...SETTINGS },
    timeLogs: [], corrections: [], salaries: [], expenses: [], advances: [], incentives: [], deductions: [],
    attendance: [], holidays: [], payrollRuns: [], calcs: [], fin: structuredClone(DEFAULT_FINANCE_SETTINGS),
  };
}

/** Revenue history for the admin chart (earlier days come from reporting). */
export const REVENUE_HISTORY = [18400, 22600, 15800, 27400, 24100, 19900, 31200, 26800, 21500, 29900, 33100, 24700, 28600];
