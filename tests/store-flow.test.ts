// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/app/lib/data";
import { addMonths, currentMonth } from "@/app/lib/finance";
import {
  addExpense, approvePayroll, logCallback, reimburseExpense, requestCorrection, resetDemo, reviewCorrection, reviewExpense, reviewTime, saveCalc,
  savePayroll, setJobSplit, setJobTeam, timerAction,
} from "@/app/lib/store";

const db = (): Db => JSON.parse(localStorage.getItem("prc:db:v1")!);
beforeAll(() => resetDemo());

describe("technician timer", () => {
  it("runs travel → work → break → resume → stop without overlaps", () => {
    expect(timerAction("t1", "J-1042", "travel", "Rohit Kumar")).toBeNull();
    expect(timerAction("t1", "J-1042", "work", "Rohit Kumar")).toBeNull();
    expect(db().jobs.find((j) => j.id === "J-1042")!.status).toBe("Arrived");
    expect(timerAction("t1", null, "pause", "Rohit Kumar")).toBeNull();
    expect(timerAction("t1", null, "pause", "Rohit Kumar")).toMatch(/Already on a break/);
    expect(timerAction("t1", "J-1042", "resume", "Rohit Kumar")).toBeNull();
    expect(timerAction("t1", null, "stop", "Rohit Kumar")).toBeNull();
    const mine = db().timeLogs.filter((l) => l.jobId === "J-1042" && l.techId === "t1").sort((a, b) => a.start.localeCompare(b.start));
    expect(mine.map((l) => l.kind)).toEqual(["Travel", "Work", "Break", "Work"]);
    for (let i = 1; i < mine.length; i++) expect(mine[i].start >= mine[i - 1].end!).toBe(true);
    expect(db().timeLogs.filter((l) => l.techId === "t1" && l.status === "Running").length).toBe(0);
  });
  it("refuses jobs the technician is not on", () => {
    expect(timerAction("t3", "J-1042", "work", "Suresh Patel")).toMatch(/not assigned/);
  });
  it("approves submitted time; rejection needs a reason", () => {
    const ids = db().timeLogs.filter((l) => l.jobId === "J-1042" && l.status === "Submitted").map((l) => l.id);
    expect(reviewTime(ids, false, "", "Admin")).toMatch(/reason/);
    expect(reviewTime(ids, true, "", "Admin")).toBeNull();
  });
  it("corrections need a reason and another approver, and cannot overlap", () => {
    const log = db().timeLogs.find((l) => l.jobId === "J-1042" && l.kind === "Travel")!;
    expect(requestCorrection({ logId: log.id, techId: "t1", jobId: "J-1042", kind: "Travel", start: log.start, end: log.end!, reason: "x" }, "Rohit Kumar")).toMatch(/reason/);
    expect(requestCorrection({ logId: null, techId: "t1", jobId: "J-1042", kind: "Travel", start: `${log.start.slice(0, 10)}T05:00`, end: `${log.start.slice(0, 10)}T05:30`, reason: "Forgot to start travel" }, "Rohit Kumar")).toBeNull();
    const c = db().corrections[0];
    expect(reviewCorrection(c.id, true, "", "Rohit Kumar")).toMatch(/other than the requester/);
    expect(reviewCorrection(c.id, true, "ok", "Admin")).toBeNull();
    expect(db().timeLogs.some((l) => l.note?.startsWith("Added by correction"))).toBe(true);
  });
});

describe("expenses, payroll lock and duplicate-cost prevention", () => {
  const month = currentMonth();
  it("direct job expenses need a job; claims are approved once", () => {
    expect(addExpense({ date: `${month}-01`, category: "Petrol (job)", cls: "Direct job", amount: 100, jobId: null, techId: "t1", paidBy: "Employee", status: "Pending", note: "", submittedBy: "t1" }, "t1")).toMatch(/linked to a job/);
    expect(addExpense({ date: `${month}-01`, category: "Petrol (job)", cls: "Direct job", amount: 100, jobId: "J-1042", techId: "t1", paidBy: "Employee", status: "Pending", note: "test claim", submittedBy: "t1" }, "t1")).toBeNull();
    const e = db().expenses.find((x) => x.note === "test claim")!;
    expect(reviewExpense(e.id, "approve", "", "Admin")).toBeNull();
    expect(reviewExpense(e.id, "approve", "", "Admin")).toMatch(/already approved/);
    expect(reimburseExpense(e.id, "UPI 123", "Admin")).toBeNull();
    expect(reimburseExpense(e.id, "UPI 123", "Admin")).toMatch(/already reimbursed/);
    expect(reviewExpense(e.id, "reverse", "dup", "Admin")).toMatch(/reimbursed/);
  });
  it("last month's payroll is approved and locks that month", () => {
    const prev = addMonths(month, -1);
    expect(db().payrollRuns.find((r) => r.month === prev)?.status).toBe("Approved");
    expect(savePayroll(prev, "Admin")).toMatch(/locked/);
    expect(addExpense({ date: `${prev}-03`, category: "Room / accommodation", cls: "Technician shared", amount: 500, jobId: null, techId: "t1", paidBy: "Company", status: "Approved", note: "", submittedBy: "Admin" }, "Admin")).toMatch(/locked/);
  });
  it("payroll approval waits for pending time", () => {
    expect(savePayroll(month, "Admin")).toBeNull();
    const pending = db().timeLogs.some((l) => l.start.startsWith(month) && (l.status === "Submitted" || l.status === "Running"));
    if (pending) expect(approvePayroll(month, "Admin")).toMatch(/time entr/);
  });
});

describe("jobs: team, split, callback, calculator lines", () => {
  it("manual split must total 100%", () => {
    setJobTeam("J-1045", ["t2"], "Admin");
    expect(setJobSplit("J-1045", { t1: 70, t2: 20 }, "Admin")).toMatch(/100%/);
    expect(setJobSplit("J-1045", { t1: 70, t2: 30 }, "Admin")).toBeNull();
    expect(db().jobs.find((j) => j.id === "J-1045")!.splitApprovedBy).toBe("Admin");
  });
  it("logs a callback linked to the original job", () => {
    const id = logCallback("J-1036", `${currentMonth()}-28`, "9:00 – 11:00 AM", "Smell came back", "Admin");
    expect(db().jobs.find((j) => j.id === id)!.parentJobId).toBe("J-1036");
  });
  it("calculator lines go on an open estimate only, and never move stock", () => {
    const stock = db().parts.map((p) => p.stock);
    expect(saveCalc({ kind: "Copper pipe", title: "t", customerId: "c7", jobId: "J-1045", by: "Admin", inputs: {}, outputs: {} }, [{ id: "x1", kind: "Material", name: "Copper pipe", qty: 1, price: 1000 }])).toBeNull();
    expect(db().jobs.find((j) => j.id === "J-1045")!.lines.some((l) => l.id === "x1")).toBe(true);
    expect(db().parts.map((p) => p.stock)).toEqual(stock);
    expect(saveCalc({ kind: "Copper pipe", title: "t", customerId: null, jobId: "J-1036", by: "Admin", inputs: {}, outputs: {} }, [{ id: "x2", kind: "Material", name: "x", qty: 1, price: 1 }])).toMatch(/before the estimate is approved/);
  });
});
