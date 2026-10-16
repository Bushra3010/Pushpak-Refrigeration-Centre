import { describe, expect, it } from "vitest";
import { computeTechnicianMonth, scheduledWorkingDays, type TechMonthInput } from "@/app/lib/calc/payroll";

const MON_SAT = [1, 2, 3, 4, 5, 6] as const;

function base(over: Partial<TechMonthInput> = {}): TechMonthInput {
  return {
    month: "2026-09",
    structure: {
      payType: "monthly", monthlySalary: 20800, hourlyRate: 0, workingWeekdays: [...MON_SAT], scheduledHoursPerDay: 8,
      overtimeEnabled: false, overtimeMultiplier: 1.5, fixedAllowances: [{ name: "Fixed travel allowance", amount: 2000 }],
    },
    holidays: [],
    time: [
      { jobId: "A", kind: "work", date: "2026-09-01", hours: 6 },
      { jobId: "A", kind: "work", date: "2026-09-02", hours: 6 },
      { jobId: "B", kind: "work", date: "2026-09-03", hours: 4 },
      { jobId: "A", kind: "travel", date: "2026-09-02", hours: 1 },
    ],
    attendance: [],
    incentives: [],
    sharedCosts: [{ id: "room", category: "Room / accommodation", amount: 3000 }],
    completedJobIds: ["A", "B"],
    reimbursements: [],
    advanceRecoveries: [],
    otherDeductions: [],
    settings: { attendanceAffectsSalary: false, labourIncludesTravel: true, sharedAllocationBasis: "productive_hours" },
    ...over,
  };
}

describe("scheduled hours", () => {
  it("counts Mon–Sat working days in September 2026", () => {
    expect(scheduledWorkingDays("2026-09", [...MON_SAT], [])).toHaveLength(26);
    expect(scheduledWorkingDays("2026-09", [...MON_SAT], ["2026-09-14"])).toHaveLength(25);
  });
});

describe("salary allocation", () => {
  it("hourly salary cost = monthly salary / scheduled paid hours, and full salary is accounted for", () => {
    const r = computeTechnicianMonth(base());
    expect(r.scheduledHours).toBe(208);
    expect(r.hourlyCost).toBe(100);
    expect(r.jobHoursByJob).toEqual({ A: 13, B: 4 });
    expect(r.allocatedBaseByJob).toEqual({ A: 1300, B: 400 });
    expect(r.idleCost).toBe(20800 - 1700);
    expect(r.allocatedBaseByJob.A + r.allocatedBaseByJob.B + r.idleCost).toBe(20800);
    expect(r.reconciliation.difference).toBe(0);
  });

  it("travel can be excluded from job labour", () => {
    const r = computeTechnicianMonth(base({ settings: { attendanceAffectsSalary: false, labourIncludesTravel: false, sharedAllocationBasis: "productive_hours" } }));
    expect(r.jobHoursByJob).toEqual({ A: 12, B: 4 });
    expect(r.nonJobHours).toBe(1);
  });

  it("allocates shared room + fixed allowance by productive hours and reports the method", () => {
    const r = computeTechnicianMonth(base());
    expect(r.sharedPool).toBe(5000);
    expect(r.sharedAllocByJob).toEqual({ A: 3750, B: 1250 }); // 12h : 4h
    expect(r.unallocatedShared).toBe(0);
  });

  it("keeps shared costs unallocated when there are no hours", () => {
    const r = computeTechnicianMonth(base({ time: [] }));
    expect(r.unallocatedShared).toBe(5000);
    expect(r.idleCost).toBe(20800);
    expect(r.reconciliation.difference).toBe(0);
  });

  it("does not reduce salary because job hours are low", () => {
    const r = computeTechnicianMonth(base({ time: [{ jobId: "A", kind: "work", date: "2026-09-01", hours: 1 }] }));
    expect(r.payableBase).toBe(20800);
    expect(r.payslip.earnings.find((e) => e.type === "basic")?.amount).toBe(20800);
  });

  it("reduces payable salary for absences only when configured", () => {
    const att = [{ date: "2026-09-04", status: "absent" as const }, { date: "2026-09-05", status: "unpaid_leave" as const }, { date: "2026-09-07", status: "half_day" as const }];
    expect(computeTechnicianMonth(base({ attendance: att })).attendanceDeduction).toBe(0);
    const r = computeTechnicianMonth(base({ attendance: att, settings: { attendanceAffectsSalary: true, labourIncludesTravel: true, sharedAllocationBasis: "productive_hours" } }));
    expect(r.lostDays).toBe(2.5);
    expect(r.attendanceDeduction).toBe(2000); // 20800 / 26 × 2.5
    expect(r.payableBase).toBe(18800);
    expect(r.reconciliation.difference).toBe(0);
  });

  it("pays overtime beyond scheduled daily hours and charges it to the jobs worked", () => {
    const r = computeTechnicianMonth(base({
      structure: { ...base().structure, overtimeEnabled: true },
      time: [{ jobId: "A", kind: "work", date: "2026-09-01", hours: 10 }, { jobId: "B", kind: "work", date: "2026-09-06", hours: 2 }], // 6th is Sunday
    }));
    expect(r.overtimeHours).toBe(4);
    expect(r.overtimePay).toBe(600);
    expect(r.allocatedOvertimeByJob).toEqual({ A: 500, B: 100 });
    expect(r.reconciliation.difference).toBe(0);
  });

  it("job-linked incentives are direct labour; others are shared", () => {
    const r = computeTechnicianMonth(base({ incentives: [{ amount: 500, jobId: "B", reason: "AMC upsell" }, { amount: 400, jobId: null, reason: "Monthly target" }] }));
    expect(r.directLabourByJob.B).toBe(400 + 500);
    expect(r.sharedPool).toBe(5400);
    expect(r.reconciliation.difference).toBe(0);
  });

  it("hourly technicians are paid for approved hours", () => {
    const r = computeTechnicianMonth(base({ structure: { ...base().structure, payType: "hourly", hourlyRate: 150, fixedAllowances: [] } }));
    expect(r.payableBase).toBe(150 * 17);
    expect(r.idleCost).toBe(0);
  });
});

describe("advances, reimbursements and deductions never duplicate cost", () => {
  it("advances and reimbursements change net pay but not employer cost", () => {
    const plain = computeTechnicianMonth(base());
    const r = computeTechnicianMonth(base({
      advanceRecoveries: [{ advanceId: "adv1", amount: 1000 }],
      reimbursements: [{ expenseId: "exp1", amount: 500 }],
    }));
    expect(r.employerCost).toBe(plain.employerCost);
    expect(r.employerCost).toBe(22800);
    expect(r.payslip.netPay).toBe(20800 + 2000 + 500 - 1000);
    expect(r.directLabourTotal + r.idleCost + r.sharedAllocated + r.unallocatedShared).toBe(plain.reconciliation.pool);
  });
  it("cost recovery from salary offsets the shared pool once", () => {
    const r = computeTechnicianMonth(base({ otherDeductions: [{ amount: 1000, reason: "Room share recovered", kind: "cost_recovery" }] }));
    expect(r.sharedPool).toBe(4000);
    expect(r.reconciliation.difference).toBe(0);
    expect(r.payslip.netPay).toBe(20800 + 2000 - 1000);
  });
});
