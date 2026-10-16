import { describe, expect, it } from "vitest";
import { computeProfitability, jobSplit, type JobInfo, type PeriodLedger } from "@/app/lib/calc/profitability";

const job = (id: string, techs: { technicianId: string; sharePct: number | null }[], extra: Partial<JobInfo> = {}): JobInfo => ({
  id, jobNo: id, jobType: "installation", status: "completed", isCallback: false, parentJobId: null,
  estimatedRevenue: 0, estimatedCost: 0, estimatedHours: 0, technicians: techs, sharesApproved: false, ...extra,
});
const empty = (): PeriodLedger => ({ revenue: [], materials: [], directExpenses: [], labour: [], sharedTech: [], idle: [], unallocatedShared: [], operatingExpenses: [], lifetimeHours: [] });

describe("reconciliation example from the specification", () => {
  const ledger: PeriodLedger = {
    ...empty(),
    revenue: [{ jobId: "J1", amount: 10000 }],
    materials: [{ jobId: "J1", amount: 2000 }],
    labour: [{ jobId: "J1", technicianId: "T1", amount: 1500, hours: 10 }],
    directExpenses: [{ jobId: "J1", amount: 500 }],
    operatingExpenses: [{ category: "Office rent", amount: 1000 }],
  };
  const r = computeProfitability([job("J1", [{ technicianId: "T1", sharePct: null }])], ledger, "revenue");

  it("gross profit ₹6,000", () => expect(r.jobs[0].grossProfit).toBe(6000));
  it("job allocated profit ₹5,000 after ₹1,000 overhead", () => {
    expect(r.jobs[0].allocatedOverhead).toBe(1000);
    expect(r.jobs[0].allocatedProfit).toBe(5000);
  });
  it("company deducts the ₹1,000 overhead once", () => {
    expect(r.totals.grossProfit).toBe(6000);
    expect(r.totals.remainingOpex).toBe(1000);
    expect(r.totals.netOperatingProfit).toBe(5000);
    expect(r.reconciliation.derivedNetOperatingProfit).toBe(5000);
    expect(r.reconciliation.ok).toBe(true);
  });
});

describe("multi-technician revenue split", () => {
  const ledger: PeriodLedger = {
    ...empty(),
    revenue: [{ jobId: "J", amount: 10000 }],
    labour: [
      { jobId: "J", technicianId: "A", amount: 600, hours: 6 },
      { jobId: "J", technicianId: "B", amount: 400, hours: 4 },
    ],
    lifetimeHours: [{ jobId: "J", technicianId: "A", hours: 6 }, { jobId: "J", technicianId: "B", hours: 4 }],
  };
  const techs = [{ technicianId: "A", sharePct: 70 }, { technicianId: "B", sharePct: 30 }];

  it("splits by approved labour hours by default", () => {
    const r = computeProfitability([job("J", techs.map((t) => ({ ...t, sharePct: null })))], ledger, "none");
    const a = r.technicians.find((t) => t.technicianId === "A")!;
    const b = r.technicians.find((t) => t.technicianId === "B")!;
    expect(a.attributedRevenue).toBe(6000);
    expect(b.attributedRevenue).toBe(4000);
    expect(a.attributedRevenue + b.attributedRevenue).toBe(r.totals.revenue);
  });
  it("uses approved manual percentages totalling 100%", () => {
    const r = computeProfitability([job("J", techs, { sharesApproved: true })], ledger, "none");
    expect(r.technicians.map((t) => t.attributedRevenue).sort()).toEqual([3000, 7000]);
    expect(r.reconciliation.techGrossDifference).toBe(0);
  });
  it("ignores manual percentages that are unapproved or don't total 100%", () => {
    expect(jobSplit(job("J", techs), { A: 6, B: 4 }).method).toBe("labour_hours");
    expect(jobSplit(job("J", [{ technicianId: "A", sharePct: 70 }, { technicianId: "B", sharePct: 20 }], { sharesApproved: true }), {}).method).toBe("equal");
  });
  it("never counts full job revenue against every technician", () => {
    const r = computeProfitability([job("J", techs.map((t) => ({ ...t, sharePct: null })))], ledger, "none");
    const total = r.technicians.reduce((s, t) => s + t.attributedRevenue, 0);
    expect(total).toBe(10000);
  });
});

describe("no double counting of salary, allowances and overhead", () => {
  it("idle salary and shared allowances appear once in company totals", () => {
    const ledger: PeriodLedger = {
      ...empty(),
      revenue: [{ jobId: "J1", amount: 8000 }, { jobId: "J2", amount: 2000 }, { jobId: null, amount: 500 }],
      labour: [{ jobId: "J1", technicianId: "T", amount: 3000, hours: 30 }, { jobId: "J2", technicianId: "T", amount: 1000, hours: 10 }],
      sharedTech: [{ jobId: "J1", technicianId: "T", amount: 750 }, { jobId: "J2", technicianId: "T", amount: 250 }],
      unallocatedShared: [{ technicianId: "T", amount: 100 }],
      idle: [{ technicianId: "T", amount: 16800 }],
      operatingExpenses: [{ category: "Rent", amount: 2000 }],
    };
    const r = computeProfitability([job("J1", [{ technicianId: "T", sharePct: null }]), job("J2", [{ technicianId: "T", sharePct: null }])], ledger, "labour_hours");
    expect(r.totals.labour).toBe(4000);
    expect(r.totals.remainingOpex).toBe(2000 + 16800 + 1100);
    expect(r.totals.netOperatingProfit).toBe(10500 - 4000 - 19900);
    expect(r.reconciliation.difference).toBe(0);
    expect(r.reconciliation.allocatedOverhead).toBe(19900);
    const t = r.technicians.find((x) => x.technicianId === "T")!;
    expect(t.fullyAllocatedContribution).toBe(10000 - 4000 - 1100 - 16800);
  });

  it("keeps overhead unallocated (but still deducted once) when there is no basis", () => {
    const ledger: PeriodLedger = { ...empty(), operatingExpenses: [{ category: "Rent", amount: 1000 }] };
    const r = computeProfitability([], ledger, "revenue");
    expect(r.reconciliation.unallocatedOverhead).toBe(1000);
    expect(r.totals.netOperatingProfit).toBe(-1000);
    expect(r.reconciliation.ok).toBe(true);
  });

  it("flags work in progress and completed-but-not-invoiced jobs", () => {
    const ledger: PeriodLedger = { ...empty(), materials: [{ jobId: "W", amount: 100, missingCost: true }] };
    const r = computeProfitability([job("W", [], { status: "in_progress" }), job("C", [], { status: "completed" })], ledger, "none", {
      completedInPeriod: new Set(["C"]), hasInvoice: new Set(), incompleteTime: new Set(["W"]), pendingExpenses: new Set(),
    });
    const w = r.jobs.find((j) => j.job.id === "W")!;
    expect(w.flags.wip && w.flags.incompleteTime && w.flags.missingMaterialCost).toBe(true);
    expect(r.jobs.find((j) => j.job.id === "C")!.flags.notInvoiced).toBe(true);
  });

  it("callbacks are charged to the original job's technicians", () => {
    const r = computeProfitability(
      [job("O", [{ technicianId: "A", sharePct: null }]), job("CB", [{ technicianId: "B", sharePct: null }], { isCallback: true, parentJobId: "O" })],
      { ...empty(), revenue: [{ jobId: "O", amount: 1000 }] }, "none",
      { completedInPeriod: new Set(["O", "CB"]), hasInvoice: new Set(["O"]), incompleteTime: new Set(), pendingExpenses: new Set() },
    );
    const a = r.technicians.find((t) => t.technicianId === "A")!;
    expect(a.callbacks).toBe(1);
    expect(a.callbackRatePct).toBe(100);
  });
});
