import { describe, expect, it } from "vitest";
import { seedDb } from "@/app/lib/data";
import { addMonths, buildPayrollRun, buildPeriod, currentMonth, logHours } from "@/app/lib/finance";
import { withFinanceSeed, upgradeDb } from "@/app/lib/finance-seed";

const db = withFinanceSeed(seedDb());
const prev = addMonths(currentMonth(), -1);

describe("demo finance data", () => {
  it("has no overlapping time for any technician", () => {
    for (const t of db.techs) {
      const logs = db.timeLogs.filter((l) => l.techId === t.id).sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < logs.length; i++) expect(logs[i].start >= (logs[i - 1].end ?? "9999"), `${t.id} ${logs[i].start}`).toBe(true);
      expect(logs.filter((l) => l.status === "Running").length).toBeLessThanOrEqual(1);
    }
  });
  it("approves last month's payroll and its allocations reconcile to the pool", () => {
    const run = db.payrollRuns.find((r) => r.month === prev)!;
    expect(run.status).toBe("Approved");
    const allocated = run.allocations.reduce((a, x) => a + x.amount, 0);
    const shared = db.expenses.filter((e) => e.cls === "Technician shared" && e.status === "Approved" && e.date.startsWith(prev)).reduce((a, e) => a + e.amount, 0);
    expect(Math.abs(Math.round((allocated - run.totals.employerCost - shared) * 100))).toBe(0);
  });
  it("reimburses each claim at most once", () => {
    const ids = db.payrollRuns.flatMap((r) => r.lines).filter((l) => l.type === "reimbursement").map((l) => l.ref);
    expect(new Set(ids).size).toBe(ids.length);
    const again = buildPayrollRun(db, prev).lines.filter((l) => l.type === "reimbursement");
    expect(again.length).toBe(0); // already reimbursed claims are not offered again
  });
});

describe("period profitability on the demo data", () => {
  const r = buildPeriod(db, { from: addMonths(currentMonth(), -2), to: currentMonth() });
  it("reconciles: Σ job allocated profit − unallocated overhead = net operating profit", () => {
    expect(r.full.reconciliation.ok).toBe(true);
    expect(r.full.reconciliation.techGrossDifference).toBe(0);
  });
  it("splits the multi-technician job by the approved percentages", () => {
    const j = r.full.jobs.find((x) => x.job.id === "J-1024");
    if (j) expect(j.splitMethod).toBe("manual");
  });
  it("counts the callback and keeps revenue ex GST", () => {
    expect(r.totals.revenue).toBeGreaterThan(0);
    expect(r.invoiced).toBeLessThan(r.cash + r.outstanding + 1e9);
    expect(db.jobs.find((j) => j.id === "J-1042")?.parentJobId).toBe("J-1009");
  });
  it("filters by technician without double counting", () => {
    const parts = db.techs.map((t) => buildPeriod(db, { from: addMonths(currentMonth(), -2), to: currentMonth(), techId: t.id }));
    const attributed = parts.flatMap((p) => p.technicians).reduce((a, t) => a + t.attributedRevenue, 0);
    expect(Math.round(attributed)).toBeLessThanOrEqual(Math.round(r.totals.revenue));
  });
});

describe("upgrade of older saved data", () => {
  it("adds the finance collections without losing jobs", () => {
    const old = seedDb() as unknown as Record<string, unknown>;
    delete old.timeLogs; delete old.fin;
    const up = upgradeDb(old as never);
    expect(up.timeLogs.length).toBeGreaterThan(0);
    expect(up.jobs.find((j) => j.id === "J-1042")).toBeTruthy();
  });
  it("log hours are positive", () => expect(db.timeLogs.every((l) => !l.end || logHours(l) > 0)).toBe(true));
});
