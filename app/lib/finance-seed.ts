/* Demo data for the finance add-on, layered on top of the base seed:
 * salary records, time logs for every worked job, ~6 weeks of routine visits,
 * expenses (direct / shared / operating), an advance, incentives, attendance,
 * a multi-technician job with an approved split, a callback, and last month's
 * payroll approved. Also upgrades data saved by older versions of the demo. */

import { SLOTS, isDone, isoAt, isoDay, jobTotals, stepOf, type Db, type Job, type QuoteLine } from "./data";
import { DEFAULT_FINANCE_SETTINGS, type Expense, type TimeLog } from "./finance-types";
import { addMonths, buildPayrollRun, completedOn, currentMonth, monthOf } from "./finance";
import { DEFAULT_TONNAGE_COEFFICIENTS, LEGACY_TONNAGE_BASE } from "./calc/tonnage";
import { DEFAULT_TOOL_SETTINGS } from "./tool-settings";
import { seedRepairs } from "./repair";
import { seedPromo } from "./promo";
import { seedInspections } from "./shifting";

const pad = (n: number) => String(n).padStart(2, "0");
const at = (date: string, minutes: number) => `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const mins = (iso: string) => { const [h, m] = iso.slice(11, 16).split(":").map(Number); return h * 60 + m; };

/** Time logs for a job, derived from its timeline (travel → arrived → work → completed). */
function logsFor(j: Job, techId: string, idx: number, today: string, offsetMin = 0): TimeLog[] {
  const find = (s: string) => j.timeline.find((t) => t.status === s)?.at;
  const step = stepOf(j.status);
  if (j.status === "Cancelled" || step < stepOf("Arrived")) return [];
  const arrived = find("Arrived") ?? j.arrivedAt ?? `${j.date}T10:00`;
  const day = arrived.slice(0, 10);
  const a = mins(arrived) + offsetMin;
  const workStart = a + 5;
  const completed = find("Work Completed");
  const last = j.timeline[j.timeline.length - 1]?.at;
  const workEnd = completed ? Math.max(mins(completed) + offsetMin, workStart + 45)
    : j.status === "Work Started" ? null : last ? Math.max(mins(last) + offsetMin, workStart + 30) : workStart + 60;
  const status = (end: string | null): TimeLog["status"] => (!end ? "Running" : day < today ? "Approved" : "Submitted");
  const out: TimeLog[] = [
    { id: `tl-${j.id}-${idx}-t`, techId, jobId: j.id, kind: "Travel", start: at(day, a - 35), end: at(day, a), status: day < today ? "Approved" : "Submitted" },
  ];
  const end = workEnd != null ? at(day, Math.min(workEnd, 23 * 60 + 30)) : null;
  out.push({ id: `tl-${j.id}-${idx}-w`, techId, jobId: j.id, kind: "Work", start: at(day, workStart), end, status: status(end) });
  return out;
}

const VISITS: { svc: string; name: string; price: number; part?: [string, string, number, number]; hrs: number; issue: string; cause: string }[] = [
  { svc: "sv-service", name: "General service (wet wash)", price: 599, hrs: 1.25, issue: "Less Cooling", cause: "Dirty coil / filter" },
  { svc: "sv-jet", name: "Deep jet cleaning", price: 899, hrs: 1.75, issue: "Bad Smell", cause: "Dirty coil / filter" },
  { svc: "sv-service", name: "General service (wet wash)", price: 599, hrs: 1.25, issue: "Less Cooling", cause: "Dirty coil / filter" },
  { svc: "sv-gastop", name: "Gas top-up", price: 1500, part: ["p-r32", "Refrigerant R32", 1300, 1], hrs: 1.5, issue: "Less Cooling", cause: "Low refrigerant / gas leak" },
  { svc: "sv-visit", name: "Inspection / visit charge", price: 300, part: ["p-cap", "Capacitor 45+5 MFD", 450, 1], hrs: 1, issue: "AC Not Starting", cause: "Capacitor failure" },
  { svc: "sv-drain", name: "Drain line cleaning", price: 350, hrs: 1, issue: "Water Leakage", cause: "Drain blockage" },
];

export function withFinanceSeed(db: Db): Db {
  const today = isoDay(0);
  const thisMonth = currentMonth();
  const prev = addMonths(thisMonth, -1);
  db.fin = structuredClone(DEFAULT_FINANCE_SETTINGS);
  db.techPrefs = {};
  db.repairs = seedRepairs(isoDay, `${today}T09:10:00`);
  ({ banners: db.promoBanners, enquiries: db.partEnquiries } = seedPromo(`${today}T09:00:00`));
  db.inspections = seedInspections(`${today}T10:15:00`);
  db.inspectionRules = { faultPhotoRequired: true };
  db.version = DB_VERSION;
  db.holidays = [{ date: `${today.slice(0, 4)}-08-15`, name: "Independence Day" }, { date: `${today.slice(0, 4)}-10-02`, name: "Gandhi Jayanti" }];

  db.salaries = [
    { id: "sal-t1", techId: "t1", from: `${prev}-01`, to: null, payType: "Monthly", monthly: 18000, hourly: 0, workingWeekdays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, otEnabled: false, otMultiplier: 1.5, allowances: [{ name: "Fixed travel allowance", amount: 1500 }] },
    { id: "sal-t2", techId: "t2", from: `${prev}-01`, to: null, payType: "Monthly", monthly: 22000, hourly: 0, workingWeekdays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, otEnabled: true, otMultiplier: 1.5, allowances: [{ name: "Fixed travel allowance", amount: 1500 }, { name: "Tool allowance", amount: 500 }] },
    { id: "sal-t3", techId: "t3", from: `${prev}-01`, to: null, payType: "Monthly", monthly: 16000, hourly: 0, workingWeekdays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, otEnabled: false, otMultiplier: 1.5, allowances: [{ name: "Mobile allowance", amount: 300 }] },
    { id: "sal-t4", techId: "t4", from: `${prev}-01`, to: null, payType: "Hourly", monthly: 0, hourly: 120, workingWeekdays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, otEnabled: true, otMultiplier: 1.5, allowances: [] },
  ];

  // material cost snapshot on completed jobs, multi-technician job, callback, estimates
  for (const j of db.jobs) {
    if (completedOn(j)) j.lines.forEach((l) => { if (l.kind === "Part") l.unitCost ??= db.parts.find((p) => p.id === l.refId)?.cost; });
    j.estHours ??= Math.max(1, Math.round(j.lines.length * 0.75 * 4) / 4) || 1.5;
  }
  const inst = db.jobs.find((j) => j.id === "J-1024");
  if (inst) { inst.helpers = ["t1"]; inst.split = { t3: 60, t1: 40 }; inst.splitApprovedBy = "Admin"; inst.estHours = 4; }
  const cb = db.jobs.find((j) => j.id === "J-1042");
  if (cb) cb.parentJobId = "J-1009";

  // time logs for the curated jobs
  const logs: TimeLog[] = [];
  const overlaps = (l: TimeLog) => logs.some((o) => o.techId === l.techId && o.start < (l.end ?? "9999") && l.start < (o.end ?? "9999"));
  for (const j of db.jobs) jobTechs(j).forEach((t, i) => {
    const mine = logsFor(j, t, i, today, i * 3);
    if (!mine.some(overlaps)) logs.push(...mine);
  });

  // routine visit history: two visits a day per technician for ~6 weeks
  const busy = new Set(logs.map((l) => `${l.techId}|${l.start.slice(0, 10)}`));
  const pool = db.acs.filter((a) => !["c1", "c2", "c6", "c10"].includes(a.customerId));
  let n = 0;
  const expenses: Expense[] = [];
  const startOff = Math.round((new Date(`${prev}-01T12:00`).getTime() - new Date(`${today}T12:00`).getTime()) / 86_400_000);
  for (let off = startOff; off <= -1; off++) {
    const date = isoDay(off);
    if (new Date(`${date}T12:00`).getDay() === 0 || db.holidays.some((h) => h.date === date)) continue;
    for (const techId of ["t1", "t2", "t3", "t4"]) {
      if (busy.has(`${techId}|${date}`)) continue;
      if (techId === "t4" && off % 3 !== 0) continue; // part-time helper
      for (const slot of [0, 1]) {
        n++;
        const v = VISITS[n % VISITS.length];
        const ac = pool[n % pool.length];
        const start = slot === 0 ? 10 * 60 : 14 * 60 + 30;
        const lines: QuoteLine[] = [{ id: `hl${n}a`, kind: "Service", name: v.name, qty: 1, price: v.price, refId: v.svc }];
        if (v.part) lines.push({ id: `hl${n}b`, kind: "Part", name: v.part[1], qty: v.part[3], price: v.part[2], refId: v.part[0], unitCost: db.parts.find((p) => p.id === v.part![0])?.cost });
        const id = `J-${2000 + n}`;
        const workEnd = start + Math.round(v.hrs * 60);
        const unpaid = n % 11 === 0;
        const job: Job = {
          id, customerId: ac.customerId, acId: ac.id, techId, status: unpaid ? "Invoiced" : "Closed", priority: "Normal", source: n % 4 === 0 ? "WhatsApp" : "Phone",
          createdAt: `${date}T08:30`, date, slot: SLOTS[slot === 0 ? 0 : 2], complaint: { issues: [v.issue as Job["complaint"]["issues"][number]], notes: "Routine visit (demo history)", errorCode: "" },
          preWork: db.jobs[0].preWork, customerVerified: true, arrivedAt: at(date, start),
          diagnosis: { ...db.jobs[0].diagnosis, observed: "", notes: "", rootCause: v.cause, recommendation: "" }, lines, discount: 0,
          quote: { no: `QTN-${2000 + n}`, at: at(date, start + 15), revision: 1, status: "Approved", approvedVia: "OTP", decidedAt: at(date, start + 20) },
          work: { serviceType: v.name, before: "", after: "", remarks: "" }, invoice: { no: `INV-${2000 + n}`, at: at(date, workEnd + 5) },
          payments: [], followUp: null, notes: [], estHours: v.hrs,
          timeline: [
            { status: "New Request", at: `${date}T08:30`, by: "Customer" }, { status: "Assigned", at: `${date}T08:45`, by: "Service Coordinator" },
            { status: "On the Way", at: at(date, start - 35), by: "Technician" }, { status: "Arrived", at: at(date, start), by: "Technician" },
            { status: "Work Started", at: at(date, start + 25), by: "Technician" }, { status: "Work Completed", at: at(date, workEnd), by: "Technician" },
            { status: "Invoiced", at: at(date, workEnd + 5), by: "Technician" }, ...(unpaid ? [] : [{ status: "Closed", at: at(date, workEnd + 10), by: "Technician" }]),
          ],
        };
        job.quote!.approvedTotal = jobTotals(job, db.settings).total;
        if (!unpaid) job.payments.push({ id: `hp${n}`, amount: jobTotals(job, db.settings).total, method: n % 2 ? "UPI" : "Cash", ref: n % 2 ? `UPI${700000 + n}` : "", at: at(date, workEnd + 8), by: "Technician" });
        db.jobs.push(job);
        logs.push(
          { id: `tl-${id}-t`, techId, jobId: id, kind: "Travel", start: at(date, start - 35), end: at(date, start), status: "Approved" },
          { id: `tl-${id}-w`, techId, jobId: id, kind: "Work", start: at(date, start + 5), end: at(date, workEnd), status: "Approved" },
        );
        if (n % 3 === 0) expenses.push({ id: `ex-p${n}`, date, category: "Petrol (job)", cls: "Direct job", amount: 60 + (n % 5) * 20, jobId: id, techId, paidBy: "Employee", status: "Approved", note: "Bike petrol", submittedBy: techId, reimbursed: off < -20 ? { how: "Direct", ref: "Cash voucher", at: at(isoDay(off + 2), 18 * 60) } : undefined });
      }
    }
  }
  db.seq = Math.max(db.seq, 2000 + n);

  // monthly costs: shared technician costs and operating overhead
  for (const m of [prev, thisMonth]) {
    const d1 = `${m}-01`;
    expenses.push(
      { id: `ex-room1-${m}`, date: d1, category: "Room / accommodation", cls: "Technician shared", amount: 4000, jobId: null, techId: "t1", paidBy: "Company", status: "Approved", note: "Shared room rent", submittedBy: "Admin" },
      { id: `ex-room2-${m}`, date: d1, category: "Room / accommodation", cls: "Technician shared", amount: 4000, jobId: null, techId: "t2", paidBy: "Company", status: "Approved", note: "Shared room rent", submittedBy: "Admin" },
      { id: `ex-food3-${m}`, date: d1, category: "Food (monthly)", cls: "Technician shared", amount: 2500, jobId: null, techId: "t3", paidBy: "Company", status: "Approved", note: "Mess charges", submittedBy: "Admin" },
      { id: `ex-rent-${m}`, date: d1, category: "Shop rent", cls: "Operating", amount: 15000, jobId: null, techId: null, paidBy: "Company", status: "Approved", note: "Dwarka shop", submittedBy: "Admin" },
      { id: `ex-elec-${m}`, date: `${m}-05`, category: "Electricity & internet", cls: "Operating", amount: 2600, jobId: null, techId: null, paidBy: "Company", status: "Approved", note: "", submittedBy: "Admin" },
      { id: `ex-office-${m}`, date: `${m}-01`, category: "Office staff salary", cls: "Operating", amount: 12000, jobId: null, techId: null, paidBy: "Company", status: "Approved", note: "Coordinator", submittedBy: "Admin" },
    );
  }
  expenses.push(
    { id: "ex-food-1033", date: isoDay(-3), category: "Food on job", cls: "Direct job", amount: 120, jobId: "J-1033", techId: "t1", paidBy: "Employee", status: "Approved", note: "Lunch during brazing", submittedBy: "t1" },
    { id: "ex-auto-1039", date: isoDay(0), category: "Travel / auto fare (job)", cls: "Direct job", amount: 180, jobId: "J-1039", techId: "t2", paidBy: "Employee", status: "Pending", note: "Auto with tools to Udyog Vihar", submittedBy: "t2" },
  );
  db.expenses = expenses.filter((e) => e.date <= today);
  db.timeLogs = logs;
  db.advances = [{ id: "adv-t2", techId: "t2", date: `${prev}-05`, amount: 5000, monthly: 2500, reason: "Festival advance" }];
  db.incentives = [
    { id: "inc-1", techId: "t1", month: prev, amount: 500, jobId: db.jobs.find((j) => j.techId === "t1" && monthOf(j.date) === prev && isDone(j))?.id ?? null, reason: "AMC renewal referral" },
    { id: "inc-2", techId: "t2", month: prev, amount: 300, jobId: null, reason: "Full attendance bonus" },
  ];
  db.attendance = [{ techId: "t4", date: `${prev}-10`, status: "Absent" }, { techId: "t3", date: `${prev}-14`, status: "Paid leave" }];

  // last month's payroll, approved (stored allocations are used by every report)
  if (!db.timeLogs.some((l) => monthOf(l.start) === prev && (l.status === "Running" || l.status === "Submitted"))) {
    const run = buildPayrollRun(db, prev);
    run.status = "Approved"; run.approvedAt = isoAt(-1, "18:00"); run.approvedBy = "Admin";
    for (const l of run.lines.filter((x) => x.type === "reimbursement")) {
      const e = db.expenses.find((x) => x.id === l.ref);
      if (e) e.reimbursed = { how: "Payroll", ref: `Payroll ${prev}`, at: run.approvedAt };
    }
    db.payrollRuns = [run];
  }
  return db;
}

const jobTechs = (j: Job) => [j.techId, ...(j.helpers ?? [])].filter((x): x is string => Boolean(x));

/** Data saved by an older demo version has no finance collections — add the demo ones. */
/** Saved-data schema version. Bump and add a step below whenever the shape of saved demo data changes. */
export const DB_VERSION = 5;

/** Upgrades data saved by older versions of the demo, step by step, keeping every customer, job, estimate and setting. */
export function upgradeDb(db: Db): Db {
  if (!(Array.isArray(db.timeLogs) && db.fin)) db = withFinanceSeed({ ...db, jobs: db.jobs.filter((j) => !/^J-2\d{3}$/.test(j.id)) } as Db);
  const v = db.version ?? 1;
  // v2 → v3: repair register (keep any entries already saved)
  if (!Array.isArray(db.repairs)) db = { ...db, repairs: seedRepairs(isoDay, `${isoDay(0)}T09:10:00`) };
  // v3 → v4: spare-parts promo banners + enquiries (keep any already saved)
  // v4 → v5: AC shifting pre-removal inspections
  if (!Array.isArray(db.inspections)) db = { ...db, inspections: seedInspections(`${isoDay(0)}T10:15:00`), inspectionRules: db.inspectionRules ?? { faultPhotoRequired: true } };
  if (!Array.isArray(db.promoBanners)) { const p = seedPromo(`${isoDay(0)}T09:00:00`); db = { ...db, promoBanners: p.banners, partEnquiries: db.partEnquiries ?? p.enquiries }; }
  if (v >= DB_VERSION && db.fin.tools) return db;
  let fin = db.fin;
  // v1 → v2 (a): tonnage coefficients still on the old US base (20 BTU/ft² at 8 ft) under-size Indian rooms ~4–5×
  const t = fin.tonnage;
  if (!t || (t.baseBtuPerSqft === LEGACY_TONNAGE_BASE.baseBtuPerSqft && t.referenceCeilingFt === LEGACY_TONNAGE_BASE.referenceCeilingFt))
    fin = { ...fin, tonnage: structuredClone(DEFAULT_TONNAGE_COEFFICIENTS) };
  // v1 → v2 (b): technician Calculators hub — admin rates & reference data (fill any missing keys, keep edited ones)
  fin = { ...fin, tools: { ...structuredClone(DEFAULT_TOOL_SETTINGS), ...(fin.tools ?? {}) } };
  return { ...db, fin, techPrefs: db.techPrefs ?? {}, version: DB_VERSION };
}

