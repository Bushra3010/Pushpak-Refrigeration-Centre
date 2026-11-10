import { describe, expect, it } from "vitest";
import { dueTasks, lpgStats, type LpgCylinder, type RentRoom } from "../app/lib/welfare";
import { issueStatus, missingOf, rentalCalc, validateReturn, type ToolIssue } from "../app/lib/tools";
import { locationProblem, propertyLine } from "../app/customer/SiteForm";

const cyl = (id: string, start: string, end: string | null, people = 6): LpgCylinder => ({ id, no: id, sizeKg: "14.2", start, end, people, cost: 900, vendor: "", note: "", by: "x", byRole: "Admin", createdAt: start });

describe("LPG cylinder tracking", () => {
  it("averages finished cylinders and estimates the balance", () => {
    const list = [cyl("c3", "2026-11-02", null), cyl("c2", "2026-10-02", "2026-11-02"), cyl("c1", "2026-08-31", "2026-10-01")];
    const s = lpgStats(list, "2026-11-05");
    expect(s.avg).toBe(31);
    expect(s.used).toBe(3);
    expect(s.balance).toBe(28);
    expect(s.expectedEnd).toBe("2026-12-03");
    expect(s.perYearMin).toBeGreaterThanOrEqual(11);
  });
  it("opens a refill task when about 3 days are left, once", () => {
    const list = [cyl("c2", "2026-10-10", null), cyl("c1", "2026-09-10", "2026-10-10")];
    const t = dueTasks({ rooms: [], cylinders: list, tasks: [] }, "2026-11-07");
    expect(t).toHaveLength(1);
    expect(t[0].kind).toBe("LPG Refill");
    expect(dueTasks({ rooms: [], cylinders: list, tasks: [{ ...t[0], id: "x", createdAt: "", status: "Open" }] }, "2026-11-07")).toHaveLength(0);
  });
});

describe("Room rent tasks", () => {
  const room: RentRoom = { id: "r1", label: "Tech room", landlord: "Sharma", phone: "", amount: 8000, dueDay: 10, remindBefore: 2, assignTo: "Accounts", active: true, note: "" };
  it("appears for the staff only from (due date − reminder days)", () => {
    expect(dueTasks({ rooms: [room], cylinders: [], tasks: [] }, "2026-11-07")).toHaveLength(0);
    const t = dueTasks({ rooms: [room], cylinders: [], tasks: [] }, "2026-11-08");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: "Room Rent", due: "2026-11-10", assignTo: "Accounts", key: "rent:r1:2026-11" });
    expect(dueTasks({ rooms: [{ ...room, active: false }], cylinders: [], tasks: [] }, "2026-11-08")).toHaveLength(0);
  });
});

describe("Tool rental calculation", () => {
  it("matches the register example: 3 days × ₹500 + 2 late days × ₹100 = ₹1,700", () => {
    const c = rentalCalc({ qty: 1, hireDate: "2026-11-06", expectedReturn: "2026-11-09", returnDate: "2026-11-11", ratePerDay: 500, lateRatePerDay: 100, deposit: 2000, depositRefund: 0, status: "In Use" }, "2026-11-10");
    expect(c).toMatchObject({ rentalDays: 3, base: 1500, lateDays: 2, late: 200, total: 1700, depositPending: 2000 });
  });
  it("charges only the days used when returned early", () => {
    const c = rentalCalc({ qty: 2, hireDate: "2026-11-06", expectedReturn: "2026-11-09", returnDate: "2026-11-07", ratePerDay: 500, lateRatePerDay: 100, deposit: 2000, depositRefund: 2000, status: "Returned" }, "2026-11-10");
    expect(c).toMatchObject({ rentalDays: 1, base: 1000, lateDays: 0, total: 1000, depositPending: 0 });
  });
});

describe("Shop tools issue / return", () => {
  const x: ToolIssue = { id: "TI-0001", tool: "Vacuum Pump", qty: 1, issueDate: "2026-11-06", techId: "t1", techName: "Rohit", site: "Dwarka", handedBy: "Amit", location: "Rack A1", expectedReturn: "2026-11-09", condition: "Good / Working", accessories: ["Power Cable", "Hose"], otherAccessories: "", remarks: "", createdAt: "", createdBy: "", ret: null };
  it("goes overdue after the expected return date", () => {
    expect(issueStatus(x, "2026-11-09")).toBe("At Site");
    expect(issueStatus(x, "2026-11-10")).toBe("Overdue");
  });
  it("needs a remark when an accessory is missing and then shows for checking", () => {
    const r = { date: "2026-11-09", receivedBy: "Amit", qty: 1, condition: "Good / Working" as const, accessories: ["Power Cable"], remarks: "", resolved: false };
    expect(validateReturn(x, r)).toMatch(/remark/);
    const back = { ...x, ret: { ...r, remarks: "Hose lost at site" } };
    expect(missingOf(back)).toEqual(["Hose"]);
    expect(issueStatus(back, "2026-11-10")).toBe("Returned – Check");
  });
});

describe("Service location details", () => {
  it("needs the area category and premises type; congested checklist shows in the summary", () => {
    expect(locationProblem({})).toMatch(/area category/);
    expect(locationProblem({ areaType: "Residential Area" })).toMatch(/premises/);
    expect(locationProblem({ areaType: "Residential Area", propertyType: "Apartment / Flat" })).toBeNull();
    expect(propertyLine({ areaType: "Congested Commercial Area", propertyType: "Shop / Showroom", floor: "1st Floor", congested: ["No parking nearby"] }))
      .toBe("Shop / Showroom · 1st Floor · Congested Commercial Area (No parking nearby)");
  });
});
