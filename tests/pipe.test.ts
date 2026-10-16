import { describe, expect, it } from "vitest";
import { calculatePipe, calculatePipeSet, kgPerMetre, validatePipe, type PipeCostInput } from "@/app/lib/calc/pipe";

const cost: PipeCostInput = { ratePerKg: 900, wastagePct: 5, pricing: { mode: "markup", pct: 20 }, taxRatePct: 18 };

describe("copper pipe weight", () => {
  it("matches the closed-form formula", () => {
    // OD 9.525 mm (3/8"), wall 0.8 mm → ID 7.925 mm
    const kg = kgPerMetre(9.525, 7.925, 8960);
    const expected = (Math.PI / 4) * (0.009525 ** 2 - 0.007925 ** 2) * 8960;
    expect(kg).toBeCloseTo(expected, 12);
    expect(kg).toBeCloseTo(0.1966, 3);
  });

  it("computes a full line with wastage, markup and separate tax", () => {
    const r = calculatePipe({ od: 3 / 8, odUnit: "in", wallMm: 0.8, length: 10, lengthUnit: "m", quantity: 2 }, cost);
    expect(r.idMm).toBeCloseTo(7.925, 10);
    expect(r.totalLengthM).toBe(20);
    expect(r.netWeightKg).toBeCloseTo(r.kgPerM * 20, 10);
    expect(r.procurementWeightKg).toBeCloseTo(r.netWeightKg * 1.05, 10);
    expect(r.kgPerFt).toBeCloseTo(r.kgPerM * 0.3048, 10);
    expect(r.purchaseCost).toBeCloseTo(r.procurementWeightKg * 900, 1);
    expect(r.sellingPrice).toBeCloseTo(r.purchaseCost * 1.2, 1);
    expect(r.tax).toBeCloseTo(r.sellingPrice * 0.18, 1);
    expect(r.costBasis).toBe("weight");
  });

  it("feet length gives the same weight as the equivalent metres", () => {
    const a = calculatePipe({ od: 6.35, odUnit: "mm", wallMm: 0.71, length: 50, lengthUnit: "ft", quantity: 1 }, cost);
    const b = calculatePipe({ od: 6.35, odUnit: "mm", wallMm: 0.71, length: 15.24, lengthUnit: "m", quantity: 1 }, cost);
    expect(a.netWeightKg).toBeCloseTo(b.netWeightKg, 10);
  });

  it("uses the selected gauge thickness and records its standard", () => {
    const r = calculatePipe(
      { od: 0.5, odUnit: "in", gauge: { standard: "SWG", gauge: "22", thicknessMm: 0.7112 }, length: 3, lengthUnit: "m", quantity: 1 },
      cost,
    );
    expect(r.thicknessMm).toBe(0.7112);
    expect(r.thicknessSource).toContain("SWG");
  });

  it("supplier rate per metre becomes the cost basis", () => {
    const r = calculatePipe({ od: 6.35, odUnit: "mm", wallMm: 0.7, length: 10, lengthUnit: "m", quantity: 1 }, { ...cost, supplierRatePerMetre: 100 });
    expect(r.costBasis).toBe("supplier_per_metre");
    expect(r.purchaseCost).toBe(1050); // 10 m × 1.05 × ₹100
  });

  it("rejects invalid geometry", () => {
    expect(validatePipe({ od: 6, odUnit: "mm", wallMm: 3, length: 1, lengthUnit: "m", quantity: 1 })).toContain(
      "Twice the wall thickness must be less than the outside diameter.",
    );
    expect(validatePipe({ od: -1, odUnit: "mm", wallMm: 0.5, length: 0, lengthUnit: "m", quantity: 0 }).length).toBeGreaterThanOrEqual(3);
    expect(() => calculatePipe({ od: 6, odUnit: "mm", wallMm: 3, length: 1, lengthUnit: "m", quantity: 1 }, cost)).toThrow();
  });

  it("sums paired liquid + suction lines and extras", () => {
    const set = calculatePipeSet(
      [
        { label: "Liquid", od: 0.25, odUnit: "in", wallMm: 0.71, length: 5, lengthUnit: "m", quantity: 1 },
        { label: "Suction", od: 0.5, odUnit: "in", wallMm: 0.81, length: 5, lengthUnit: "m", quantity: 1 },
      ],
      { ...cost, pricing: { mode: "margin", pct: 25 } },
      [{ kind: "insulation", description: "Insulation 9 mm", quantity: 10, unit: "m", unitCost: 30 }, { kind: "labour", description: "Installation", quantity: 1, unit: "job", unitCost: 1200, pricing: { mode: "markup", pct: 50 } }],
    );
    const p = set.pipes;
    expect(set.totals.cost).toBeCloseTo(p[0].purchaseCost + p[1].purchaseCost + 300 + 1200, 2);
    expect(set.extras[1].price).toBe(1800);
    expect(set.totals.netWeightKg).toBeCloseTo(p[0].netWeightKg + p[1].netWeightKg, 10);
  });
});
