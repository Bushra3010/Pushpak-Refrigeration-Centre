import { describe, expect, it } from "vitest";
import {
  ATM_KPA, convertLength, feetInches, gstCalc, toFeetInches, airDeltaT, airflow, cableAssessment, convert, customerBill, drainPipe, electricityCost, extraMaterial, insulation, materialRequirement,
  gasWeightPrice, ptLookup, quoteTotals, refrigerantCharge, refrigerantUsage, replacementSavings, standCheck, summariseIntervals, superheatSubcool, toAbsKpa, travelClaim,
  type ChargeRule,
} from "@/app/lib/calc/tools";
import { calculatePipe } from "@/app/lib/calc/pipe";
import { priceFromMargin, priceFromMarkup } from "@/app/lib/calc/money";
import type { PtDataset, TravelPolicy } from "@/app/lib/tool-settings";

// TEST-ONLY fixtures — round numbers chosen for easy arithmetic, NOT real refrigerant or cable data.
const PURE: PtDataset = { id: "x", refrigerant: "TESTGAS", blend: "pure", verified: true, source: "test fixture", rows: [{ tempC: 0, bubbleKpaA: 800, dewKpaA: 800 }, { tempC: 10, bubbleKpaA: 1000, dewKpaA: 1000 }, { tempC: 40, bubbleKpaA: 2400, dewKpaA: 2400 }] };
const GLIDE: PtDataset = { id: "g", refrigerant: "TESTBLEND", blend: "zeotropic", verified: true, source: "test fixture", rows: [{ tempC: 0, bubbleKpaA: 500, dewKpaA: 400 }, { tempC: 10, bubbleKpaA: 700, dewKpaA: 600 }, { tempC: 40, bubbleKpaA: 1500, dewKpaA: 1300 }] };

describe("copper geometry & pricing (reused pipe engine)", () => {
  it("3/8\" × 0.032\" weighs ≈ 0.1994 kg/m (ASTM B280 table: 0.134 lb/ft)", () => {
    const r = calculatePipe({ od: 0.375, odUnit: "in", wallMm: 0.8128, length: 1, lengthUnit: "m", quantity: 1 }, { ratePerKg: 1000, wastagePct: 0, pricing: { mode: "markup", pct: 0 } });
    expect(r.idMm).toBeCloseTo(9.525 - 2 * 0.8128, 6);
    expect(r.kgPerM).toBeCloseTo(0.134 * 0.45359237 / 0.3048, 3);
  });
  it("markup and margin differ: 25% markup ≠ 25% margin", () => {
    expect(priceFromMarkup(100, 25)).toBe(125);
    expect(priceFromMargin(100, 25)).toBe(133.33);
  });
});

describe("unit conversions", () => {
  it("length, mass, temperature", () => {
    expect(convert("length-ft-m", 10, "ft")[0].value).toBeCloseTo(3.048, 9);
    expect(convert("length-in-mm", 1, "in")[0].value).toBe(25.4);
    expect(convert("mass", 1.25, "kg")[0].value).toBe(1250);
    expect(convert("temp", 35, "°C")[0].value).toBeCloseTo(95, 9);
    expect(() => convert("temp", -500, "°F")).toThrow(/absolute zero/);
  });
  it("pressure keeps the basis and shows the gauge ↔ absolute conversion", () => {
    const r = convert("pressure", 100, "psi", { basis: "gauge" });
    expect(r.find((x) => x.unit === "kPa")!.value).toBeCloseTo(689.4757, 3);
    expect(r.find((x) => x.unit.startsWith("kPa absolute"))!.value).toBeCloseTo(689.4757 + ATM_KPA, 3);
    expect(toAbsKpa(0, "psi", "gauge")).toBe(ATM_KPA);
  });
  it("cooling: 1 TR = 12,000 BTU/h = 3.517 kW cooling; airflow CFM ↔ m³/h", () => {
    const c = convert("cooling", 1, "TR");
    expect(c.find((x) => x.unit === "BTU/h")!.value).toBe(12000);
    expect(c.find((x) => x.unit === "kW cooling")!.value).toBeCloseTo(3.5169, 4);
    expect(convert("airflow", 100, "CFM")[0].value).toBeCloseTo(169.90, 2);
  });
});

describe("length: every unit, feet + inches", () => {
  const at = (v: number, from: Parameters<typeof convertLength>[1]) => Object.fromEntries(convertLength(v, from).map((r) => [r.unit, r.value]));
  it("inch, feet, metre, mm, cm", () => {
    expect(at(1, "in")).toMatchObject({ mm: 25.4, cm: 2.54 });
    expect(at(12, "in").ft).toBeCloseTo(1, 12);
    expect(at(10, "ft").m).toBeCloseTo(3.048, 12);
    expect(at(1, "ft").in).toBeCloseTo(12, 12);
    expect(at(1, "ft").mm).toBe(304.8);
    expect(at(1, "ft").cm).toBeCloseTo(30.48, 12);
    expect(at(1, "m").ft).toBeCloseTo(3.2808, 4);
    expect(at(1, "m").in).toBeCloseTo(39.3701, 4);
    expect(at(25.4, "mm").in).toBeCloseTo(1, 12);
    expect(at(100, "cm").ft).toBeCloseTo(3.2808, 4);
    expect(() => convertLength(-1, "m")).toThrow(/negative/);
  });
  it("5' 8\" → mm, cm, m, decimal feet", () => {
    const r = feetInches(5, 8);
    expect(r.totalIn).toBe(68);
    expect(r.mm).toBeCloseTo(1727.2, 9);
    expect(r.cm).toBeCloseTo(172.72, 9);
    expect(r.m).toBeCloseTo(1.7272, 9);
    expect(r.decimalFt).toBeCloseTo(5.6667, 4);
    expect(toFeetInches(68)).toEqual({ ft: 5, inch: 8 });
    expect(toFeetInches(11.999)).toEqual({ ft: 1, inch: 0 });
  });
});

describe("more units: area, volume, weight, vacuum, power, energy, airflow, speed", () => {
  const find = (rows: { unit: string; value: number }[], u: string) => rows.find((r) => r.unit === u)!.value;
  it("tables", () => {
    expect(find(convert("area", 100, "sq ft"), "m²")).toBeCloseTo(9.2903, 4);
    expect(find(convert("volume", 1, "gal (US)"), "L")).toBeCloseTo(3.7854, 4);
    expect(find(convert("mass", 1, "lb"), "g")).toBeCloseTo(453.592, 3);
    expect(find(convert("temp", 25, "°C"), "K")).toBeCloseTo(298.15, 9);
    expect(find(convert("pressure", 1, "bar"), "kg/cm²")).toBeCloseTo(1.01972, 5);
    expect(find(convert("vacuum", 500, "micron"), "Pa")).toBeCloseTo(66.66, 2);
    expect(find(convert("power", 1, "HP"), "W")).toBeCloseTo(745.7, 1);
    expect(find(convert("cooling", 1, "TR"), "kcal/h")).toBeCloseTo(3024, 0);
    expect(find(convert("energy", 1, "kWh"), "MJ")).toBeCloseTo(3.6, 9);
    expect(find(convert("airflow", 1, "L/s"), "m³/h")).toBeCloseTo(3.6, 9);
    expect(find(convert("velocity", 1, "m/s"), "ft/min")).toBeCloseTo(196.85, 2);
    expect(find(convert("time", 1.5, "h"), "min")).toBe(90);
    expect(Object.fromEntries(convertLength(1, "mile").map((r) => [r.unit, r.value])).km).toBeCloseTo(1.609344, 9);
  });
});

describe("GST calculator", () => {
  it("excluding: GST added on top, CGST + SGST halves", () => {
    const r = gstCalc(10000, 2, 18, "exclusive", "intra");
    expect(r).toMatchObject({ taxable: 20000, tax: 3600, cgst: 1800, sgst: 1800, igst: 0, total: 23600 });
  });
  it("including: GST taken out, IGST, parts add up to the total", () => {
    const r = gstCalc(11800, 1, 18, "inclusive", "inter");
    expect(r).toMatchObject({ taxable: 10000, tax: 1800, igst: 1800, total: 11800 });
    const odd = gstCalc(99.99, 1, 18, "inclusive", "intra");
    expect(odd.cgst + odd.sgst).toBeCloseTo(odd.tax, 9);
    expect(odd.taxable + odd.tax).toBeCloseTo(99.99, 9);
    expect(() => gstCalc(100, 0, 18, "exclusive", "intra")).toThrow(/Quantity/);
  });
});

describe("quotations: GST, discounts, limits", () => {
  const lines = [{ name: "Package", kind: "Labour" as const, qty: 1, unit: "job", rate: 1500 }, { name: "Copper", kind: "Material" as const, qty: 2.5, unit: "m", rate: 900 }, { name: "Zero", kind: "Material" as const, qty: 0, unit: "m", rate: 50 }];
  it("subtotal, discount, GST on taxable value", () => {
    const q = quoteTotals(lines, 300, 18, 10);
    expect(q.lines).toHaveLength(2);
    expect(q.subtotal).toBe(3750);
    expect(q.taxable).toBe(3450);
    expect(q.gst).toBe(621);
    expect(q.total).toBe(4071);
  });
  it("blocks discounts above the technician limit, above subtotal, and missing rates", () => {
    expect(() => quoteTotals(lines, 400, 18, 10)).toThrow(/office approval/);
    expect(() => quoteTotals(lines, 9999, 18)).toThrow(/more than the subtotal/);
    expect(() => quoteTotals([{ ...lines[0], rate: NaN }], 0, 18)).toThrow(/Rate/);
  });
});

describe("extra material allowance", () => {
  it("charges only beyond the allowance and never negative", () => {
    const r = extraMaterial([{ name: "Copper", unit: "m", included: 3, actual: 5.5, rate: 900 }, { name: "Drain", unit: "m", included: 3, actual: 1, rate: 40 }]);
    expect(r.rows[0].chargeable).toBe(2.5);
    expect(r.rows[1].chargeable).toBe(0);
    expect(r.rows[1].unused).toBe(2);
    expect(r.total).toBe(2250);
    expect(() => extraMaterial([{ name: "X", unit: "m", included: -1, actual: 1, rate: 1 }])).toThrow();
  });
});

describe("drain, insulation, cable, stand", () => {
  it("drain: 1:100 over 4 m drops 40 mm", () => {
    const r = drainPipe({ routeM: 4, rise: 1, run: 100, fittings: 2, wastagePct: 5, ratePerM: 40, fittingRate: 30, stockLengthM: 3 });
    expect(r.dropMm).toBeCloseTo(40, 9);
    expect(r.pipeM).toBeCloseTo(4.2, 9);
    expect(r.pieces).toBe(2);
    expect(r.total).toBe(228);
  });
  it("insulation: bore = pipe OD, pieces rounded up", () => {
    const r = insulation({ pipeOdMm: 12.7, thicknessMm: 9, pipeLengthM: 3.5, pieceLengthM: 1.83, wastagePct: 5, ratePerPiece: 90 });
    expect(r.requiredIdMm).toBe(12.7);
    expect(r.outerDiaMm).toBeCloseTo(30.7, 9);
    expect(r.pieces).toBe(3);
    expect(r.price).toBe(270);
    expect(() => insulation({ pipeOdMm: 12.7, thicknessMm: 9, pipeLengthM: 3, pieceLengthM: 0, wastagePct: 5, ratePerPiece: 90 })).toThrow();
  });
  it("cable: voltage drop computed; rating unavailable without an approved table", () => {
    const a = cableAssessment({ currentA: 10, voltage: 230, phase: "single", lengthM: 20, material: "Copper", sizeMm2: 2.5, conductorTempC: 20, method: "conduit", deratingFactor: 1, tables: [], dropLimitPct: null, dropLimitSource: "" });
    expect(a.dropV).toBeCloseTo(2 * 10 * (0.017241 * 20) / 2.5, 9);
    expect(a.capacity.status).toBe("unavailable");
    expect(a.dropAssessment.status).toBe("unavailable");
    const withTable = cableAssessment({ currentA: 10, voltage: 230, phase: "single", lengthM: 20, material: "Copper", sizeMm2: 2.5, conductorTempC: 20, method: "conduit", deratingFactor: 0.8, tables: [{ id: "t", name: "TEST", material: "Copper", method: "conduit", ambientC: 40, rows: [{ sizeMm2: 2.5, amps: 11 }], source: "test", verified: true }], dropLimitPct: 3, dropLimitSource: "test" });
    expect(withTable.capacity.status).toBe("exceeds"); // 11 × 0.8 = 8.8 A < 10 A
    expect(withTable.dropAssessment.status).toBe("ok");
    expect(() => cableAssessment({ currentA: 0, voltage: 230, phase: "single", lengthM: 1, material: "Copper", sizeMm2: 1, conductorTempC: 20, method: "", deratingFactor: 1, tables: [], dropLimitPct: null, dropLimitSource: "" })).toThrow(/nameplate/);
  });
  it("stand: no verified rating → not assessed; never certifies from weight alone", () => {
    expect(standCheck({ unitWeightKg: 40, ratedLoadKg: 100, ratingVerified: false, ratingSource: "", factor: 2 }).status).toBe("unverified");
    expect(standCheck({ unitWeightKg: 40, ratedLoadKg: 100, ratingVerified: true, ratingSource: "label", factor: 2 }).status).toBe("ok");
    expect(standCheck({ unitWeightKg: 60, ratedLoadKg: 100, ratingVerified: true, ratingSource: "label", factor: 2 }).status).toBe("fail");
  });
});

describe("refrigerant charge follows the manufacturer rule only", () => {
  const rule: ChargeRule = { refrigerant: "R32", factoryChargeG: 1000, includedLengthM: 7.5, additionalGPerM: 15, minLengthM: 3, maxLengthM: 20, shortRunRemovalGPerM: null, source: "test manual p.1" };
  it("needs manufacturer data", () => {
    expect("unavailable" in refrigerantCharge(null, 10)).toBe(true);
    expect("unavailable" in refrigerantCharge({ ...rule, source: " " }, 10)).toBe(true);
  });
  it("adds for longer runs and gives the target total", () => {
    const r = refrigerantCharge(rule, 10) as { additionalG: number; targetG: number };
    expect(r.additionalG).toBeCloseTo(37.5, 9);
    expect(r.targetG).toBeCloseTo(1037.5, 9);
  });
  it("does NOT subtract for shorter runs unless the rule says so", () => {
    expect((refrigerantCharge(rule, 5) as { additionalG: number }).additionalG).toBe(0);
    expect((refrigerantCharge({ ...rule, shortRunRemovalGPerM: 10 }, 5) as { additionalG: number }).additionalG).toBe(-25);
  });
  it("refuses runs outside the manufacturer limits; no target without factory charge", () => {
    expect(() => refrigerantCharge(rule, 25)).toThrow(/maximum/);
    expect(() => refrigerantCharge(rule, 2)).toThrow(/minimum/);
    expect((refrigerantCharge({ ...rule, factoryChargeG: null }, 10) as { targetG: number | null }).targetG).toBeNull();
  });
  it("usage: flags ending weight above starting weight", () => {
    expect(refrigerantUsage(12.4, 11.6, 1800)).toMatchObject({ usedG: expect.closeTo(800, 6), charge: 1440 });
    expect(() => refrigerantUsage(11, 11.5, 1800)).toThrow(/greater than the starting/);
  });
  it("gas weight ↔ price at ₹1,200/kg", () => {
    expect(gasWeightPrice("weight", 1200, 650, 0)).toEqual({ grams: 650, base: 780, gst: 0, total: 780 });
    expect(gasWeightPrice("price", 1200, 500, 0).grams).toBeCloseTo(416.67, 2);
    expect(gasWeightPrice("weight", 1200, 650, 18)).toEqual({ grams: 650, base: 780, gst: 140.4, total: 920.4 });
    const b = gasWeightPrice("price", 1200, 500, 18);
    expect(b).toMatchObject({ base: 423.73, gst: 76.27, total: 500 });
    expect(b.grams).toBeCloseTo(353.11, 2);
    expect(() => gasWeightPrice("weight", 0, 650, 0)).toThrow(/rate/);
    expect(() => gasWeightPrice("price", 1200, NaN, 0)).toThrow(/budget/);
  });
});

describe("diagnostic reference availability & dew/bubble selection", () => {
  it("unavailable without a verified table (and unverified tables are ignored)", () => {
    expect("unavailable" in ptLookup([], "R32", { tempC: 10 })).toBe(true);
    expect("unavailable" in ptLookup([{ ...PURE, refrigerant: "R32", verified: false }], "R32", { tempC: 10 })).toBe(true);
    expect("unavailable" in superheatSubcool([], "R32", { suctionKpaA: 900, suctionLineC: 12 })).toBe(true);
  });
  it("interpolates within range and refuses outside it", () => {
    const r = ptLookup([PURE], "TESTGAS", { pressureKpaA: 900 });
    expect("tempC" in r && r.tempC!.dew).toBeCloseTo(5, 9);
    const half = ptLookup([GLIDE], "TESTBLEND", { pressureKpaA: 1400 }); // above the dew range, inside the bubble range
    expect("tempC" in half && half.tempC!.dew).toBeNull();
    expect("tempC" in half && half.tempC!.bubble).toBeCloseTo(36.25, 9);
    expect("unavailable" in ptLookup([PURE], "TESTGAS", { pressureKpaA: 5000 })).toBe(true);
  });
  it("superheat uses DEW point, subcooling uses BUBBLE point for blends", () => {
    const r = superheatSubcool([GLIDE], "TESTBLEND", { suctionKpaA: 600, suctionLineC: 16, liquidKpaA: 1500, liquidLineC: 35 });
    if (!("dataset" in r)) throw new Error("expected data");
    expect(r.superheat).toMatchObject({ satC: 10, value: 6 }); // dew at 600 kPa(a) = 10 °C (bubble would be 5 °C)
    expect(r.subcool).toMatchObject({ satC: 40, value: 5 }); // bubble at 1500 kPa(a) = 40 °C
  });
  it("air ΔT and airflow", () => {
    expect(airDeltaT(26, 14, "cooling").deltaC).toBe(12);
    expect(airDeltaT(26, 30, "cooling").unexpected).toBe(true);
    expect(airflow({ velocity: 2, velocityUnit: "m/s", area: 0.1, areaUnit: "m²", areaKind: "effective", freeAreaFactor: null }).m3h).toBeCloseTo(720, 9);
    expect(() => airflow({ velocity: 2, velocityUnit: "m/s", area: 0.1, areaUnit: "m²", areaKind: "gross", freeAreaFactor: null })).toThrow(/free-area/);
    expect(airflow({ velocity: 2, velocityUnit: "m/s", area: 0.1, areaUnit: "m²", areaKind: "gross", freeAreaFactor: 0.5 }).m3h).toBeCloseTo(360, 9);
  });
});

describe("energy", () => {
  it("electricity cost from electrical input", () => {
    const r = electricityCost(1.2, 8, 30, 7.5);
    expect(r.kwh).toBeCloseTo(288, 9);
    expect(r.period).toBe(2160);
    expect(() => electricityCost(0, 8, 30, 7)).toThrow(/electrical INPUT/);
  });
  it("no misleading payback when there are no savings", () => {
    expect(replacementSavings(1650, 980, 7.5, 42000, true).paybackYears).toBeCloseTo(42000 / 5025, 9);
    expect(replacementSavings(900, 1000, 7.5, 42000, true).paybackYears).toBeNull();
    expect(() => replacementSavings(1650, 980, 7.5, 42000, false)).toThrow(/same usage/);
  });
});

describe("time intervals", () => {
  it("does not double count overlaps; break inside work reduces work", () => {
    const s = summariseIntervals([
      { kind: "Travel", start: "2026-10-16T09:00", end: "2026-10-16T09:30" },
      { kind: "Work", start: "2026-10-16T09:30", end: "2026-10-16T12:00" },
      { kind: "Break", start: "2026-10-16T11:00", end: "2026-10-16T11:30" },
      { kind: "Work", start: "2026-10-16T11:45", end: "2026-10-16T12:15" }, // overlaps the first work block
    ]);
    expect(s.travel).toBeCloseTo(0.5, 9);
    expect(s.break).toBeCloseTo(0.5, 9);
    expect(s.work).toBeCloseTo(2.25, 9);
    expect(s.duty).toBeCloseTo(3.25, 9);
    expect(s.overlaps.length).toBe(2);
  });
  it("supports overnight entries and rejects end before start", () => {
    const s = summariseIntervals([{ kind: "Work", start: "2026-10-16T22:00", end: "2026-10-17T02:30" }]);
    expect(s.work).toBeCloseTo(4.5, 9);
    expect(s.overnight).toBe(true);
    expect(() => summariseIntervals([{ kind: "Work", start: "2026-10-16T10:00", end: "2026-10-16T09:00" }])).toThrow();
  });
});

describe("travel claims follow the policy", () => {
  const P: TravelPolicy = { mode: "either", ratePerKm: 4, receiptsRequired: true, note: "" };
  it("mileage OR actual; both only when allowed; receipts required", () => {
    expect(travelClaim(P, { method: "mileage", km: 25, actual: 0, receiptRef: "" }).amount).toBe(100);
    expect(() => travelClaim(P, { method: "both", km: 25, actual: 300, receiptRef: "r1" })).toThrow(/not allow/);
    expect(() => travelClaim(P, { method: "actual", km: 0, actual: 300, receiptRef: "" })).toThrow(/Receipt/);
    expect(travelClaim({ ...P, mode: "both" }, { method: "both", km: 25, actual: 300, receiptRef: "r1" }).amount).toBe(400);
    expect(() => travelClaim({ ...P, mode: "mileage" }, { method: "actual", km: 0, actual: 300, receiptRef: "r" })).toThrow(/mileage claims only/);
  });
});

describe("material issue / return boundaries", () => {
  it("shortage and unused-for-return; consumed + returned can't exceed issued", () => {
    const [r] = materialRequirement([{ name: "Capacitor", unit: "pc", planned: 3, van: 1, issued: 2, consumed: 1, returned: 0 }]);
    expect(r.stillNeeded).toBe(2);
    expect(r.shortage).toBe(0); // 1 held for job + 1 in van
    const [u] = materialRequirement([{ name: "Gas", unit: "kg", planned: 1, van: 0, issued: 3, consumed: 1, returned: 0.5 }]);
    expect(u.unusedForReturn).toBe(1.5);
    expect(() => materialRequirement([{ name: "X", unit: "pc", planned: 1, van: 0, issued: 1, consumed: 1, returned: 1 }])).toThrow(/more than issued/);
  });
});

describe("customer bill", () => {
  const lines = [{ id: "a", name: "Service", qty: 1, price: 1000, approved: true }, { id: "b", name: "Gas", qty: 1, price: 2000, approved: true }, { id: "b", name: "Gas (again)", qty: 1, price: 2000, approved: true }, { id: "c", name: "Add-on", qty: 1, price: 500, approved: false }];
  it("bills approved lines once, splits GST, shows balance after advances", () => {
    const b = customerBill(lines, 200, true, 18, [{ amount: 1000 }]);
    expect(b.duplicates).toHaveLength(1);
    expect(b.pending.map((l) => l.id)).toEqual(["c"]);
    expect(b.subtotal).toBe(3000);
    expect(b.taxable).toBe(2800);
    expect(b.gst).toBe(504);
    expect(b.cgst + b.sgst).toBe(504);
    expect(b.total).toBe(3304);
    expect(b.balance).toBe(2304);
  });
  it("overpayment becomes customer credit; refunds reduce paid", () => {
    expect(customerBill(lines, 0, true, 18, [{ amount: 4000 }]).credit).toBe(460);
    expect(customerBill(lines, 0, true, 18, [{ amount: 4000 }, { amount: 1000, refund: true }]).balance).toBe(540);
  });
});
