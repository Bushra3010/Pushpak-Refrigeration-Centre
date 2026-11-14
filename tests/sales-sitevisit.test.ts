// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/app/lib/data";
import { registerSale, saveClaim, saveSiteVisit, submitSiteVisit, reviewSiteVisit, resetDemo, syncStaffTasks, updateSale } from "@/app/lib/store";
import { emptySale, emptyUnit, warrantyEnd, warrantyState, compressorEnd } from "@/app/lib/sales";
import { emptyVisit, extraPipeFt, visitProblems } from "@/app/lib/sitevisit";

const db = (): Db => JSON.parse(localStorage.getItem("prc:db:v1")!);
beforeAll(() => resetDemo());

describe("AC sales & warranty", () => {
  it("expiry = sales date + period, with status", () => {
    const x = { sale: { date: "2026-11-10", invoiceNo: "" }, warranty: { years: 1 as const, compressorYears: 5 as const, coverage: [], regNo: "", notes: "" } };
    expect(warrantyEnd(x)).toBe("2027-11-10");
    expect(compressorEnd(x)).toBe("2031-11-10");
    expect(warrantyState(x, "2027-06-01")).toBe("Active");
    expect(warrantyState(x, "2027-10-20")).toBe("Expiring Soon");
    expect(warrantyState(x, "2027-11-11")).toBe("Expired");
  });

  it("3 ACs for one customer → one profile, three Asset IDs, three ACs in the customer app", () => {
    const d = emptySale("2026-11-10");
    d.customer = { customerId: null, name: "Rahul Sharma", phone: "9840100000", address: "B-12, Anna Nagar, Chennai", area: "Anna Nagar" };
    d.sale.invoiceNo = "PRC/2026/001";
    d.units = ["Bedroom", "Hall / Living", "Master Bedroom"].map((room, i) => ({ ...emptyUnit(), room, model: "FTKM50", indoorSerial: `IDU00${i}`, outdoorSerial: `ODU00${i}`, amount: 38500 }));
    const r = registerSale(d, "Admin");
    expect("ids" in r && r.ids).toHaveLength(3);
    const s = db();
    const sales = s.acSales!.filter((x) => x.customer.phone === "9840100000");
    expect(new Set(sales.map((x) => x.customerId)).size).toBe(1);
    expect(s.customers.filter((c) => c.phone === "9840100000")).toHaveLength(1);
    expect(s.acs.filter((a) => a.customerId === sales[0].customerId)).toHaveLength(3);
    expect(s.acs.find((a) => a.id === sales[0].acId)!.serial).toMatch(/IDU00\d \/ ODU00\d/);
    // same serial again is refused
    const again = registerSale({ ...d, units: [d.units[0]] }, "Admin");
    expect("error" in again && again.error).toMatch(/already registered/);
  });

  it("needs indoor + outdoor serials; vendor edits are Admin-only; claims keep customer charges", () => {
    const d = emptySale("2026-11-10");
    d.customer = { customerId: null, name: "Neha", phone: "9811111111", address: "Mannikam Street, Choolai", area: "Choolai" };
    d.sale.invoiceNo = "PRC/2026/002";
    d.units = [{ ...emptyUnit(), model: "X1", indoorSerial: "A1" }];
    expect("error" in registerSale(d, "Admin") && "outdoor").toBeTruthy();
    d.units[0].outdoorSerial = "B1";
    const r = registerSale(d, "Admin");
    if (!("ids" in r)) throw new Error(r.error);
    const id = r.ids[0];
    expect(updateSale(id, { vendor: { name: "Daikin Dist", phone: "", gstin: "", purchaseInvoice: "", purchasePrice: 30000, purchaseDate: "" } }, "Accounts", false)).toMatch(/Only Admin/);
    expect(updateSale(id, { vendor: { name: "Daikin Dist", phone: "", gstin: "", purchaseInvoice: "", purchasePrice: 30000, purchaseDate: "" } }, "Admin", true)).toBeNull();
    expect(saveClaim(id, { date: "2026-12-01", issue: "PCB faulty", part: "Outdoor PCB", status: "Raised", companyRef: "", charges: { checking: 300, handling: 200, repair: 500, material: 0 }, notes: "" }, "Admin")).toBeNull();
    expect(db().acSales!.find((x) => x.id === id)!.claims[0]).toMatchObject({ id: "CLM-01", part: "Outdoor PCB" });
  });

  it("opens a warranty-expiry task for the staff 30 days before", () => {
    const sale = db().acSales![0];
    syncStaffTasks(warrantyEnd(sale));
    expect(db().staffTasks!.some((t) => t.key === `warranty:${sale.id}`)).toBe(true);
  });
});

describe("AC site visit", () => {
  it("flags missing items, extra pipe and needs marking photos", () => {
    const v = emptyVisit("2026-11-11");
    expect(visitProblems(v).length).toBeGreaterThan(10);
    Object.assign(v, {
      customer: { name: "Rahul", phone: "9840100000", address: "B-12 Anna Nagar Chennai" }, wallType: "RCC", beamColumn: "No", indoorFinal: true, fixing: "Direct Wall", ceilingGap: "Yes",
      pipeType: "Concealed", chasing: "Yes", chasingFt: 12, chasingRouteMarked: true, drainWork: "Yes", drainClear: "Yes", drainSlope: "No", drainPump: "Yes", pumpReasons: ["No Proper Slope"],
      coreCut: "Yes", holes: 1, diaMm: 63, coreMarked: true, pipeMeasured: true, pipeFt: 25, pipeRoute: "Through False Ceiling", coreMarking: "Yes", chasingMarking: "Yes",
    });
    expect(extraPipeFt(v)).toBe(15);
    expect(visitProblems(v)).toEqual(["7. Piping type confirmed", "9. Reason for extra copper pipe", "9. Marking photos clicked", "9. Special site challenges noted", "9. All markings clearly visible"]);
    Object.assign(v, { pipingConfirmed: true, extraReasons: ["False Ceiling"], photos: ["data:image/png;base64,x"], photosTaken: true, allVisible: true, challengesNoted: true });
    expect(visitProblems(v)).toEqual([]);
    const { id } = saveSiteVisit(null, "t1", v);
    expect(submitSiteVisit(id, v)).toEqual([]);
    expect(reviewSiteVisit(id, false, "", "Admin")).toMatch(/correct/);
    expect(reviewSiteVisit(id, true, "Order 25 ft pipe + drain pump", "Admin")).toBeNull();
    expect(db().siteVisits!.find((x) => x.id === id)!.status).toBe("Reviewed");
  });
});

describe("Technician repair update", () => {
  it("auto-fills from the inward entry, needs hold reason + next step, makes a follow-up task and adds up cost", async () => {
    const { addRepair, saveRepairWork } = await import("@/app/lib/store");
    const { emptyWork, internalCost } = await import("@/app/lib/repair");
    const { emptyDraft } = await import("@/app/components/repair");
    const r = addRepair({ ...emptyDraft("Shop", "Shop Staff"), customerName: "Rajesh Kumar", customerPhone: "9840000001", techName: "Suresh", brand: "Daikin", model: "FTKM50", issue: "AC not starting" }, "Shop");
    if (!("id" in r)) throw new Error(r.error);
    expect(r.id).toMatch(/^PRC-REP-\d{4}$/);
    const w = { ...emptyWork(), techId: "t1", techName: "Rohit Kumar", diagnosis: "SMPS IC damaged" };
    expect(saveRepairWork(r.id, "Pending", w, "Rohit")).toMatch(/reason/);
    const held = { ...w, hold: { reason: "Part Not Available", nextStep: "Second-Hand PCB", supplier: "Lajpat market", expectedDate: "2026-11-16", followUp: "2026-11-15" }, parts: [{ name: "IC", qty: 2, unitCost: 150 }], labour: 250, other: 50, hours: 2.5 };
    expect(saveRepairWork(r.id, "Pending", held, "Rohit")).toBeNull();
    expect(internalCost(held)).toBe(600);
    expect(db().staffTasks!.some((t) => t.key === `repair:${r.id}:2026-11-15` && t.status === "Open")).toBe(true);
    expect(saveRepairWork(r.id, "Repaired", { ...held, action: "Replaced IC" }, "Rohit")).toBeNull();
    const after = db();
    expect(after.repairs!.find((x) => x.id === r.id)!.status).toBe("Repaired");
    expect(after.staffTasks!.find((t) => t.key === `repair:${r.id}:2026-11-15`)!.status).toBe("Done");
  });
});
