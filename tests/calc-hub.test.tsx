// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Db } from "@/app/lib/data";
import { createToolClaim, resetDemo, saveToolCalc } from "@/app/lib/store";
import { DB_VERSION, upgradeDb } from "@/app/lib/finance-seed";
import { CalculatorsHub, parseRoute, routeOf } from "@/app/technician/calc/Hub";
import { TOOLS, searchTools } from "@/app/technician/calc/registry";

const KEY = "prc:db:v1";
const db = (): Db => JSON.parse(localStorage.getItem(KEY)!);
const tech = (id: string) => db().techs.find((t) => t.id === id)!;
const noop = () => {};
beforeEach(() => resetDemo());
afterEach(cleanup);

/** Technician-facing text must never reveal internal pricing or other people's pay. */
const FORBIDDEN = /markup|margin|profit|purchase cost|unit cost|copper rate per kg|₹\s?850\b/i;

describe("hub", () => {
  it("shows all 27 calculators by default, grouped, each with an Open button", () => {
    render(<CalculatorsHub db={db()} tech={tech("t1")} tool={null} onOpen={noop} flash={noop} />);
    expect(TOOLS).toHaveLength(27);
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(27);
    for (const c of ["Installation & Quotation", "Service & Diagnostics", "Energy & Customer Planning", "Daily Work & Billing"]) expect(screen.getAllByText(c).length).toBeGreaterThan(0);
  });
  it("search by name or purpose, and category filter", () => {
    expect(searchTools("drain", "All").map((t) => t.id)).toContain("drain-pipe");
    expect(searchTools("slope fall", "All").map((t) => t.id)).toEqual(["drain-pipe"]);
    expect(searchTools("gas", "All").map((t) => t.id)).toEqual(expect.arrayContaining(["refrigerant-charge", "refrigerant-usage"]));
    expect(searchTools("", "Energy & Customer Planning")).toHaveLength(4);
    render(<CalculatorsHub db={db()} tech={tech("t1")} tool={null} onOpen={noop} flash={noop} />);
    fireEvent.change(screen.getByLabelText("Search calculators"), { target: { value: "petrol" } });
    expect(screen.getAllByRole("button", { name: /^Open / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Open Travel / Petrol Claim"]);
  });
  it("favourites are kept per technician and never hide other calculators", () => {
    const { rerender } = render(<CalculatorsHub db={db()} tech={tech("t1")} tool={null} onOpen={noop} flash={noop} />);
    fireEvent.click(screen.getByLabelText("Add Drain Pipe Calculator to favourites"));
    expect(db().techPrefs!.t1.fav).toEqual(["drain-pipe"]);
    rerender(<CalculatorsHub db={db()} tech={tech("t1")} tool={null} onOpen={noop} flash={noop} />);
    expect(screen.getByText("★ Favourites")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(27);
    expect(db().techPrefs!.t2).toBeUndefined();
  });
  it("routes: #calculators and #calculators/<id>; opening records recently used", () => {
    expect(parseRoute(routeOf("drain-pipe"))).toEqual({ hub: true, tool: "drain-pipe" });
    expect(parseRoute("#calculators")).toEqual({ hub: true, tool: null });
    expect(parseRoute("#calculators/nope")).toEqual({ hub: true, tool: null });
    render(<CalculatorsHub db={db()} tech={tech("t1")} tool="insulation" onOpen={noop} flash={noop} />);
    expect(db().techPrefs!.t1.recent[0]).toBe("insulation");
  });
});

describe("every calculator opens, calculates and resets without leaking internal pricing", () => {
  for (const t of TOOLS.filter((x) => x.id !== "gst")) // GST is live (no Calculate) — tested below
    it(`${t.no.toString().padStart(2, "0")} ${t.name}`, () => {
      render(<CalculatorsHub db={db()} tech={tech("t2")} tool={t.id} onOpen={noop} flash={noop} />);
      expect(screen.getByRole("heading", { name: t.name })).toBeTruthy();
      const demo = screen.queryByText("Load demo example");
      if (demo) fireEvent.click(demo);
      fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
      expect(screen.getByText("Result")).toBeTruthy(); // a result, a validation message, or "Assessment unavailable" — never a blank screen
      expect(document.body.textContent).not.toMatch(FORBIDDEN);
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      expect(screen.queryByText("Result")).toBeNull();
    });
});

describe("GST calculator updates as you type", () => {
  it("excluding → including, CGST + SGST → IGST, reset", () => {
    render(<CalculatorsHub db={db()} tech={tech("t2")} tool="gst" onOpen={noop} flash={noop} />);
    expect(screen.queryByRole("button", { name: "Calculate" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Amount (₹)"), { target: { value: "11800" } });
    expect(screen.getByText("₹13,924.00")).toBeTruthy(); // 11,800 + 18%
    expect(screen.getAllByText("₹1,062.00")).toHaveLength(2); // CGST 9% + SGST 9%
    fireEvent.click(screen.getByRole("button", { name: "Including GST" }));
    expect(screen.getByText("₹10,000.00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "IGST" }));
    expect(screen.getByText("IGST @ 18%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/Enter an amount/)).toBeTruthy();
  });
});

describe("quotation, diagnostics and claims actions", () => {
  it("Add to Estimate adds lines once — a second tap is refused", () => {
    render(<CalculatorsHub db={db()} tech={tech("t1")} tool="drain-pipe" onOpen={noop} flash={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    fireEvent.change(screen.getByLabelText("Job"), { target: { value: "J-1042" } });
    const before = db().jobs.find((j) => j.id === "J-1042")!.lines.length;
    const add = screen.getByRole("button", { name: "Add to Estimate" });
    fireEvent.click(add);
    expect(db().jobs.find((j) => j.id === "J-1042")!.lines.length).toBe(before + 2);
    expect((screen.getByRole("button", { name: "Add to Estimate" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Add to Estimate" }));
    expect(db().jobs.find((j) => j.id === "J-1042")!.lines.length).toBe(before + 2);
    // and the store refuses the same calculation id even if the UI were bypassed
    const c = db().calcs[0];
    expect(saveToolCalc({ ...c, tool: c.tool! }, { lines: [{ id: "x", kind: "Material", name: "x", qty: 1, price: 1 }] })).toMatch(/Already saved/);
    const j = db().jobs.find((x) => x.id === "J-1042")!;
    expect(j.invoice).toBeNull();
  });
  it("readings go to the job notes only; diagnostic tools have no Add to Estimate", () => {
    render(<CalculatorsHub db={db()} tech={tech("t1")} tool="air-delta-t" onOpen={noop} flash={noop} />);
    fireEvent.change(screen.getByLabelText("Return air (°C)"), { target: { value: "26" } });
    fireEvent.change(screen.getByLabelText("Supply air (°C)"), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.queryByRole("button", { name: /Add to Estimate/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Job"), { target: { value: "J-1042" } });
    const lines = db().jobs.find((j) => j.id === "J-1042")!.lines.length;
    fireEvent.click(screen.getByRole("button", { name: "Save Readings to Job" }));
    const j = db().jobs.find((x) => x.id === "J-1042")!;
    expect(j.notes.at(-1)!.text).toMatch(/13 K|Air ΔT/);
    expect(j.lines.length).toBe(lines);
  });
  it("superheat / subcooling shows Assessment unavailable without a verified table", () => {
    render(<CalculatorsHub db={db()} tech={tech("t1")} tool="superheat-subcooling" onOpen={noop} flash={noop} />);
    fireEvent.change(screen.getByLabelText("Suction pressure (psi)"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Suction-line temp (°C)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByText("Assessment unavailable")).toBeTruthy();
    expect(screen.queryByText(/^Superheat$/)).toBeNull();
  });
  it("claims are Pending, once per calculation, and mileage + actual for the same trip are refused", () => {
    const base = { date: "2026-10-16", category: "Petrol (job)", cls: "Direct job" as const, amount: 100, jobId: "J-1042", techId: "t1", paidBy: "Employee" as const, note: "", submittedBy: "Rohit" };
    expect(createToolClaim("c1", { ...base, claimMethod: "mileage" }, "Rohit")).toBeNull();
    expect(db().expenses[0]).toMatchObject({ status: "Pending", calcRef: "c1" });
    expect(db().expenses[0].reimbursed).toBeUndefined();
    expect(createToolClaim("c1", { ...base, claimMethod: "mileage" }, "Rohit")).toMatch(/already submitted/);
    expect(createToolClaim("c2", { ...base, claimMethod: "actual" }, "Rohit")).toMatch(/does not allow/);
  });
  it("helper-assigned jobs are selectable by the helper", () => {
    render(<CalculatorsHub db={db()} tech={tech("t1")} tool="customer-bill" onOpen={noop} flash={noop} />);
    const opts = within(screen.getByLabelText("Job")).getAllByRole("option").map((o) => o.textContent);
    expect(opts.some((o) => o?.startsWith("J-1024") && o.includes("(helper)"))).toBe(true);
  });
  it("material requests never change stock", () => {
    const stock = db().parts.map((p) => p.stock);
    const van = JSON.stringify(tech("t1").van);
    render(<CalculatorsHub db={db()} tech={tech("t1")} tool="material-requirement" onOpen={noop} flash={noop} />);
    fireEvent.click(screen.getByText("+ Add material"));
    fireEvent.change(screen.getByLabelText("Material"), { target: { value: db().parts[0].id } });
    fireEvent.change(screen.getByLabelText("Planned"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    fireEvent.click(screen.getByRole("button", { name: "Request shortage from office" }));
    expect(db().parts.map((p) => p.stock)).toEqual(stock);
    expect(JSON.stringify(tech("t1").van)).toBe(van);
    expect(db().notifications[0].title).toMatch(/Stock request/);
  });
});

describe("technician visibility", () => {
  it("overtime amount is hidden when salary is not shared with the technician", () => {
    render(<CalculatorsHub db={db()} tech={tech("t2")} tool="overtime" onOpen={noop} flash={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByText(/Hidden — salary details not shared/)).toBeTruthy();
    expect(screen.getByText(/Estimated eligible overtime/)).toBeTruthy();
  });
  it("saved history lists only the technician's own calculations", () => {
    saveToolCalc({ id: "other", tool: "insulation", kind: "Insulation Calculator", title: "Not mine", customerId: null, jobId: null, techId: "t3", by: "Suresh", inputs: {}, outputs: {} });
    render(<CalculatorsHub db={db()} tech={tech("t1")} tool="insulation" onOpen={noop} flash={noop} />);
    expect(screen.queryByText("Not mine")).toBeNull();
  });
});

describe("saved browser data migration", () => {
  it("v1 data (no version, no calculator settings) is upgraded and keeps everything", () => {
    const v2 = db();
    const v1 = structuredClone(v2) as Db & Record<string, unknown>;
    delete v1.version; delete v1.techPrefs; delete (v1.fin as Partial<typeof v1.fin>).tools;
    v1.settings.company = "Edited Co";
    v1.jobs[0].lines.push({ id: "keep", kind: "Service", name: "Kept line", qty: 1, price: 123 });
    const up = upgradeDb(v1);
    expect(up.version).toBe(DB_VERSION);
    expect(up.fin.tools.rates.length).toBeGreaterThan(10);
    expect(up.fin.tools.ptDatasets).toEqual([]); // nothing invented
    expect(up.techPrefs).toEqual({});
    expect(up.settings.company).toBe("Edited Co");
    expect(up.customers).toHaveLength(v2.customers.length);
    expect(up.jobs[0].lines.at(-1)!.id).toBe("keep");
    expect(upgradeDb(up)).toBe(up); // idempotent
  });
  it("keeps edited calculator settings when filling new keys", () => {
    const v1 = structuredClone(db());
    delete v1.version;
    (v1.fin.tools as unknown as Record<string, unknown>).maxTechDiscountPct = 4;
    delete (v1.fin.tools as unknown as Record<string, unknown>).travel;
    const up = upgradeDb(v1);
    expect(up.fin.tools.maxTechDiscountPct).toBe(4);
    expect(up.fin.tools.travel.mode).toBe("either");
  });
});
