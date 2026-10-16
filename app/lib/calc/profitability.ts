import { allocate, round2, sum } from "./money";

/**
 * Period profitability. See docs/CALCULATION_MODEL.md §4–§6.
 *
 * Everything is on an activity-date basis for the selected period, so job rows
 * always add up to the company totals:
 *   revenue     — invoice / credit-note lines recognised in the period (ex tax)
 *   materials   — stock consumed to the job in the period (moving-average cost)
 *   labour      — direct job labour from the payroll cost model for the period
 *   direct exp. — approved expenses classified "direct job" dated in the period
 *
 *   Job gross profit       = revenue − materials − direct labour − direct expenses
 *   Company gross profit   = Σ job gross profit + non-job sales
 *   Remaining opex         = operating expenses + idle salary + technician shared costs
 *   Net operating profit   = company gross profit − remaining opex
 *   Job allocated profit   = job gross profit − allocated overhead
 *
 * Allocated overhead is a reporting split of "remaining opex"; it is never added
 * to company costs. The reconciliation block proves:
 *   Σ job allocated profit + non-job gross profit − unallocated overhead = net operating profit
 */

export type OverheadBasis = "revenue" | "labour_hours" | "direct_cost" | "none";

export type JobInfo = {
  id: string;
  jobNo: string;
  jobType: string;
  status: string;
  customerName?: string;
  isCallback: boolean;
  parentJobId: string | null;
  estimatedRevenue: number;
  estimatedCost: number;
  estimatedHours: number;
  /** Assigned technicians; sharePct only used when every share is set, approved and totals 100. */
  technicians: { technicianId: string; sharePct: number | null }[];
  sharesApproved: boolean;
};

export type PeriodLedger = {
  revenue: { jobId: string | null; amount: number }[];
  materials: { jobId: string; amount: number; missingCost?: boolean }[];
  directExpenses: { jobId: string; amount: number }[];
  labour: { jobId: string; technicianId: string; amount: number; hours: number; travelHours?: number }[];
  sharedTech: { jobId: string; technicianId: string; amount: number }[];
  idle: { technicianId: string; amount: number }[];
  unallocatedShared: { technicianId: string; amount: number }[];
  operatingExpenses: { category: string; amount: number }[];
  /** Approved labour hours on each job across its life — the default revenue-split basis. */
  lifetimeHours: { jobId: string; technicianId: string; hours: number }[];
};

export type JobFlags = {
  wip: boolean;
  notInvoiced: boolean;
  incompleteTime: boolean;
  pendingExpenses: boolean;
  missingMaterialCost: boolean;
};

export type JobRow = {
  job: JobInfo;
  revenue: number;
  materials: number;
  labour: number;
  directExpenses: number;
  directCost: number;
  grossProfit: number;
  grossMarginPct: number | null;
  sharedTechAlloc: number;
  companyOverheadAlloc: number;
  allocatedOverhead: number;
  allocatedProfit: number;
  labourHours: number;
  estimatedProfit: number;
  split: Record<string, number>;
  splitMethod: "manual" | "labour_hours" | "equal" | "unassigned";
  flags: JobFlags;
};

export type TechRow = {
  technicianId: string;
  assignedJobs: number;
  completedJobs: number;
  callbacks: number;
  callbackRatePct: number | null;
  productiveHours: number;
  travelHours: number;
  avgHoursPerCompletedJob: number | null;
  labour: number;
  attributedRevenue: number;
  attributedMaterials: number;
  attributedDirectExpenses: number;
  grossContribution: number;
  sharedAllocated: number;
  sharedUnallocated: number;
  idleCost: number;
  fullyAllocatedContribution: number;
};

export type CompanyTotals = {
  revenue: number;
  jobRevenue: number;
  nonJobRevenue: number;
  materials: number;
  labour: number;
  directExpenses: number;
  grossProfit: number;
  grossMarginPct: number | null;
  operatingExpenses: number;
  idleSalary: number;
  technicianSharedCosts: number;
  remainingOpex: number;
  netOperatingProfit: number;
  netMarginPct: number | null;
};

export type Reconciliation = {
  allocatedOverhead: number;
  unallocatedOverhead: number;
  sumJobAllocatedProfit: number;
  nonJobGrossProfit: number;
  derivedNetOperatingProfit: number;
  difference: number;
  techGrossContributionTotal: number;
  techGrossDifference: number;
  ok: boolean;
};

export type ProfitabilityResult = {
  jobs: JobRow[];
  technicians: TechRow[];
  totals: CompanyTotals;
  reconciliation: Reconciliation;
};

export type JobMeta = {
  completedInPeriod: Set<string>;
  hasInvoice: Set<string>;
  incompleteTime: Set<string>;
  pendingExpenses: Set<string>;
};

const pct = (num: number, den: number) => (den === 0 ? null : (num / den) * 100);

function group<T>(rows: T[], key: (r: T) => string, val: (r: T) => number) {
  const out: Record<string, number> = {};
  for (const r of rows) out[key(r)] = round2((out[key(r)] ?? 0) + val(r));
  return out;
}

/** Revenue split weights for one job. Always totals the job; never counts full revenue per technician. */
export function jobSplit(job: JobInfo, lifetimeHours: Record<string, number>) {
  const techs = job.technicians;
  if (techs.length === 0) return { method: "unassigned" as const, weights: {} as Record<string, number> };
  const manual = techs.every((t) => t.sharePct != null && t.sharePct >= 0);
  const manualTotal = sum(techs.map((t) => t.sharePct ?? 0));
  if (manual && job.sharesApproved && Math.abs(manualTotal - 100) < 0.001)
    return { method: "manual" as const, weights: Object.fromEntries(techs.map((t) => [t.technicianId, t.sharePct!])) };
  const hrs = Object.fromEntries(techs.map((t) => [t.technicianId, lifetimeHours[t.technicianId] ?? 0]));
  if (Object.values(hrs).some((h) => h > 0)) return { method: "labour_hours" as const, weights: hrs };
  return { method: "equal" as const, weights: Object.fromEntries(techs.map((t) => [t.technicianId, 1])) };
}

export function computeProfitability(
  jobs: JobInfo[],
  ledger: PeriodLedger,
  overheadBasis: OverheadBasis,
  meta: JobMeta = { completedInPeriod: new Set(), hasInvoice: new Set(), incompleteTime: new Set(), pendingExpenses: new Set() },
): ProfitabilityResult {
  const rev = group(ledger.revenue.filter((r) => r.jobId), (r) => r.jobId!, (r) => r.amount);
  const nonJobRevenue = sum(ledger.revenue.filter((r) => !r.jobId).map((r) => r.amount));
  const mat = group(ledger.materials, (r) => r.jobId, (r) => r.amount);
  const missingCost = new Set(ledger.materials.filter((m) => m.missingCost).map((m) => m.jobId));
  const dexp = group(ledger.directExpenses, (r) => r.jobId, (r) => r.amount);
  const lab = group(ledger.labour, (r) => r.jobId, (r) => r.amount);
  const labHours = group(ledger.labour, (r) => r.jobId, (r) => r.hours);
  const shTech = group(ledger.sharedTech, (r) => r.jobId, (r) => r.amount);

  const operatingExpenses = sum(ledger.operatingExpenses.map((o) => o.amount));
  const idleSalary = sum(ledger.idle.map((i) => i.amount));
  const sharedTotal = sum([...ledger.sharedTech.map((s) => s.amount), ...ledger.unallocatedShared.map((s) => s.amount)]);
  const sharedAllocatedTotal = sum(ledger.sharedTech.map((s) => s.amount));
  const pool = round2(operatingExpenses + idleSalary + (sharedTotal - sharedAllocatedTotal));

  // include any job that has activity in the ledger even if not in `jobs`
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const activeIds = new Set([...Object.keys(rev), ...Object.keys(mat), ...Object.keys(dexp), ...Object.keys(lab), ...Object.keys(shTech)]);
  const rowsJobs = jobs.filter((j) => activeIds.has(j.id) || meta.completedInPeriod.has(j.id));
  for (const id of activeIds)
    if (!jobById.has(id))
      rowsJobs.push({ id, jobNo: id.slice(0, 8), jobType: "unknown", status: "unknown", isCallback: false, parentJobId: null, estimatedRevenue: 0, estimatedCost: 0, estimatedHours: 0, technicians: [], sharesApproved: false });

  const weights: Record<string, number> = {};
  for (const j of rowsJobs) {
    const w =
      overheadBasis === "revenue"
        ? Math.max(0, rev[j.id] ?? 0)
        : overheadBasis === "labour_hours"
          ? labHours[j.id] ?? 0
          : overheadBasis === "direct_cost"
            ? (mat[j.id] ?? 0) + (lab[j.id] ?? 0) + (dexp[j.id] ?? 0)
            : 0;
    if (w > 0) weights[j.id] = w;
  }
  const oh = allocate(pool, weights);

  const lifetime: Record<string, Record<string, number>> = {};
  for (const h of ledger.lifetimeHours) {
    lifetime[h.jobId] ??= {};
    lifetime[h.jobId][h.technicianId] = (lifetime[h.jobId][h.technicianId] ?? 0) + h.hours;
  }

  const jobRows: JobRow[] = rowsJobs.map((job) => {
    const revenue = rev[job.id] ?? 0;
    const materials = mat[job.id] ?? 0;
    const labour = lab[job.id] ?? 0;
    const directExpenses = dexp[job.id] ?? 0;
    const directCost = round2(materials + labour + directExpenses);
    const grossProfit = round2(revenue - directCost);
    const sharedTechAlloc = shTech[job.id] ?? 0;
    const companyOverheadAlloc = oh.parts[job.id] ?? 0;
    const allocatedOverhead = round2(sharedTechAlloc + companyOverheadAlloc);
    const split = jobSplit(job, lifetime[job.id] ?? {});
    const closedish = ["completed", "invoiced", "closed"].includes(job.status);
    return {
      job,
      revenue,
      materials,
      labour,
      directExpenses,
      directCost,
      grossProfit,
      grossMarginPct: pct(grossProfit, revenue),
      sharedTechAlloc,
      companyOverheadAlloc,
      allocatedOverhead,
      allocatedProfit: round2(grossProfit - allocatedOverhead),
      labourHours: labHours[job.id] ?? 0,
      estimatedProfit: round2(job.estimatedRevenue - job.estimatedCost),
      split: split.weights,
      splitMethod: split.method,
      flags: {
        wip: !closedish && job.status !== "cancelled",
        notInvoiced: closedish && !meta.hasInvoice.has(job.id),
        incompleteTime: meta.incompleteTime.has(job.id),
        pendingExpenses: meta.pendingExpenses.has(job.id),
        missingMaterialCost: missingCost.has(job.id),
      },
    };
  });

  const jobRevenue = sum(jobRows.map((r) => r.revenue));
  const materials = sum(jobRows.map((r) => r.materials));
  const labour = sum(jobRows.map((r) => r.labour));
  const directExpenses = sum(jobRows.map((r) => r.directExpenses));
  const revenue = round2(jobRevenue + nonJobRevenue);
  const grossProfit = round2(revenue - materials - labour - directExpenses);
  const remainingOpex = round2(operatingExpenses + idleSalary + sharedTotal);
  const netOperatingProfit = round2(grossProfit - remainingOpex);

  // --- technicians -------------------------------------------------------
  const techIds = new Set<string>();
  for (const j of rowsJobs) j.technicians.forEach((t) => techIds.add(t.technicianId));
  [...ledger.labour, ...ledger.idle, ...ledger.unallocatedShared, ...ledger.sharedTech].forEach((r) => techIds.add(r.technicianId));
  const tech: Record<string, TechRow> = {};
  const T = (id: string) =>
    (tech[id] ??= {
      technicianId: id, assignedJobs: 0, completedJobs: 0, callbacks: 0, callbackRatePct: null, productiveHours: 0, travelHours: 0,
      avgHoursPerCompletedJob: null, labour: 0, attributedRevenue: 0, attributedMaterials: 0, attributedDirectExpenses: 0,
      grossContribution: 0, sharedAllocated: 0, sharedUnallocated: 0, idleCost: 0, fullyAllocatedContribution: 0,
    });
  techIds.forEach(T);
  const UNASSIGNED = "__unassigned__";
  for (const r of jobRows) {
    const ids = Object.keys(r.split);
    const parts = (amt: number) => (ids.length ? allocate(amt, r.split).parts : { [UNASSIGNED]: amt });
    const pr = parts(r.revenue);
    const pm = parts(r.materials);
    const pd = parts(r.directExpenses);
    for (const id of new Set([...Object.keys(pr), ...Object.keys(pm), ...Object.keys(pd)])) {
      const t = T(id);
      t.attributedRevenue = round2(t.attributedRevenue + (pr[id] ?? 0));
      t.attributedMaterials = round2(t.attributedMaterials + (pm[id] ?? 0));
      t.attributedDirectExpenses = round2(t.attributedDirectExpenses + (pd[id] ?? 0));
    }
    for (const a of r.job.technicians) {
      const t = T(a.technicianId);
      t.assignedJobs += 1;
      if (meta.completedInPeriod.has(r.job.id)) t.completedJobs += 1;
    }
  }
  // callbacks are charged to technicians of the original job
  for (const j of rowsJobs) {
    if (!j.isCallback || !j.parentJobId) continue;
    const parent = jobById.get(j.parentJobId);
    parent?.technicians.forEach((t) => (T(t.technicianId).callbacks += 1));
  }
  for (const l of ledger.labour) {
    const t = T(l.technicianId);
    t.labour = round2(t.labour + l.amount);
    t.productiveHours += l.hours;
    t.travelHours += l.travelHours ?? 0;
  }
  for (const s of ledger.sharedTech) T(s.technicianId).sharedAllocated = round2(T(s.technicianId).sharedAllocated + s.amount);
  for (const s of ledger.unallocatedShared) T(s.technicianId).sharedUnallocated = round2(T(s.technicianId).sharedUnallocated + s.amount);
  for (const s of ledger.idle) T(s.technicianId).idleCost = round2(T(s.technicianId).idleCost + s.amount);
  for (const t of Object.values(tech)) {
    t.grossContribution = round2(t.attributedRevenue - t.attributedMaterials - t.attributedDirectExpenses - t.labour);
    t.fullyAllocatedContribution = round2(t.grossContribution - t.sharedAllocated - t.sharedUnallocated - t.idleCost);
    t.callbackRatePct = t.completedJobs ? (t.callbacks / t.completedJobs) * 100 : null;
    t.avgHoursPerCompletedJob = t.completedJobs ? t.productiveHours / t.completedJobs : null;
  }

  const sumJobAllocatedProfit = sum(jobRows.map((r) => r.allocatedProfit));
  const derived = round2(sumJobAllocatedProfit + nonJobRevenue - oh.unallocated);
  const techGross = sum(Object.values(tech).map((t) => t.grossContribution));
  return {
    jobs: jobRows,
    technicians: Object.values(tech).filter((t) => t.technicianId !== UNASSIGNED || t.attributedRevenue || t.attributedMaterials),
    totals: {
      revenue, jobRevenue, nonJobRevenue, materials, labour, directExpenses, grossProfit,
      grossMarginPct: pct(grossProfit, revenue),
      operatingExpenses, idleSalary, technicianSharedCosts: sharedTotal, remainingOpex, netOperatingProfit,
      netMarginPct: pct(netOperatingProfit, revenue),
    },
    reconciliation: {
      allocatedOverhead: round2(sharedAllocatedTotal + sum(Object.values(oh.parts))),
      unallocatedOverhead: oh.unallocated,
      sumJobAllocatedProfit,
      nonJobGrossProfit: nonJobRevenue,
      derivedNetOperatingProfit: derived,
      difference: round2(netOperatingProfit - derived),
      techGrossContributionTotal: techGross,
      techGrossDifference: round2(grossProfit - nonJobRevenue - techGross),
      ok: Math.abs(netOperatingProfit - derived) < 0.005 && Math.abs(grossProfit - nonJobRevenue - techGross) < 0.005,
    },
  };
}

export const UNASSIGNED_TECH = "__unassigned__";
