import { describe, expect, it } from "vitest";
import { DEFAULT_TONNAGE_COEFFICIENTS as C, estimateTonnage, type TonnageInput } from "@/app/lib/calc/tonnage";

const base: TonnageInput = {
  lengthValue: 12, widthValue: 10, dimensionUnit: "ft", ceilingValue: 8, climate: "moderate", occupants: 2,
  sunlight: "normal", roof: "intermediate_floor", insulation: "average", windowAreaSqft: 0, applianceWatts: 0, isKitchen: false,
};

describe("tonnage estimator", () => {
  it("uses 12,000 BTU/h per ton", () => {
    const r = estimateTonnage(base);
    expect(r.totalBtuh).toBe(120 * 20);
    expect(r.tons).toBe(0.2);
  });
  it("adds occupants above two, appliances and windows", () => {
    const r = estimateTonnage({ ...base, occupants: 4, applianceWatts: 1000, windowAreaSqft: 20 });
    expect(r.totalBtuh).toBeCloseTo(2400 + 1200 + 3412.142 + 600, 3);
  });
  it("applies multipliers and picks the next configured size with margin", () => {
    const r = estimateTonnage({ ...base, lengthValue: 20, widthValue: 15, climate: "hot_dry", sunlight: "heavy", roof: "top_floor_roof_exposed", occupants: 3 });
    const env = 300 * 20 * 1.2 * 1.1 * 1.15;
    expect(r.totalBtuh).toBeCloseTo(env + 600, 6);
    expect(r.recommendedTons).toBe(1);
    expect(r.tonsWithMargin).toBeCloseTo(((env + 600) / 12000) * 1.1, 6);
  });
  it("metre input equals feet input", () => {
    const m = estimateTonnage({ ...base, dimensionUnit: "m", lengthValue: 3.6576, widthValue: 3.048, ceilingValue: 2.4384 });
    expect(m.totalBtuh).toBeCloseTo(2400, 6);
  });
  it("flags loads above the largest configured capacity", () => {
    const r = estimateTonnage({ ...base, lengthValue: 100, widthValue: 60 }, C);
    expect(r.recommendedTons).toBeNull();
    expect(r.disclaimer).toMatch(/Preliminary/);
  });
  it("validates inputs", () => {
    expect(() => estimateTonnage({ ...base, lengthValue: 0 })).toThrow();
  });
});
