import { describe, expect, it } from "vitest";
import { DEFAULT_TONNAGE_COEFFICIENTS as C, estimateTonnage, type TonnageInput } from "@/app/lib/calc/tonnage";
import { upgradeDb } from "@/app/lib/finance-seed";
import type { Db } from "@/app/lib/data";

// arithmetic tests use fixed, explicit coefficients so they don't move when the defaults are re-tuned
const K = { ...C, baseBtuPerSqft: 20, referenceCeilingFt: 8, safetyMarginPct: 10 };

const base: TonnageInput = {
  lengthValue: 12, widthValue: 10, dimensionUnit: "ft", ceilingValue: 8, climate: "moderate", occupants: 2,
  sunlight: "normal", roof: "intermediate_floor", insulation: "average", windowAreaSqft: 0, applianceWatts: 0, isKitchen: false,
};

describe("tonnage estimator", () => {
  it("uses 12,000 BTU/h per ton", () => {
    const r = estimateTonnage(base, K);
    expect(r.totalBtuh).toBe(120 * 20);
    expect(r.tons).toBe(0.2);
  });
  it("adds occupants above two, appliances and windows", () => {
    const r = estimateTonnage({ ...base, occupants: 4, applianceWatts: 1000, windowAreaSqft: 20 }, K);
    expect(r.totalBtuh).toBeCloseTo(2400 + 1200 + 3412.142 + 600, 3);
  });
  it("applies multipliers and picks the next configured size with margin", () => {
    const r = estimateTonnage({ ...base, lengthValue: 20, widthValue: 15, climate: "hot_dry", sunlight: "heavy", roof: "top_floor_roof_exposed", occupants: 3 }, K);
    const env = 300 * 20 * 1.2 * 1.1 * 1.15;
    expect(r.totalBtuh).toBeCloseTo(env + 600, 6);
    expect(r.recommendedTons).toBe(1);
    expect(r.tonsWithMargin).toBeCloseTo(((env + 600) / 12000) * 1.1, 6);
  });
  it("metre input equals feet input", () => {
    const m = estimateTonnage({ ...base, dimensionUnit: "m", lengthValue: 3.6576, widthValue: 3.048, ceilingValue: 2.4384 }, K);
    expect(m.totalBtuh).toBeCloseTo(2400, 6);
  });
  it("flags loads above the largest configured capacity", () => {
    const r = estimateTonnage({ ...base, lengthValue: 100, widthValue: 60 }, K);
    expect(r.recommendedTons).toBeNull();
    expect(r.disclaimer).toMatch(/Preliminary/);
  });
  it("validates inputs, including blank (NaN) fields", () => {
    expect(() => estimateTonnage({ ...base, lengthValue: 0 })).toThrow();
    expect(() => estimateTonnage({ ...base, windowAreaSqft: NaN })).toThrow(/Window/);
    expect(() => estimateTonnage({ ...base, applianceWatts: NaN })).toThrow(/Appliance/);
    expect(() => estimateTonnage({ ...base, occupants: NaN })).toThrow(/Occupants/);
  });
});

describe("default calibration matches Indian sizing practice (~1 TR per 120 ft²)", () => {
  // typical room: 10 ft ceiling, hot city, 2 people, one 15 ft² window, lights + TV (250 W)
  const room = (l: number, w: number, extra: Partial<TonnageInput> = {}) =>
    estimateTonnage({ ...base, lengthValue: l, widthValue: w, ceilingValue: 10, climate: "hot_dry", windowAreaSqft: 15, applianceWatts: 250, ...extra });
  it("120 ft² bedroom in Delhi → 1 TR", () => {
    const r = room(12, 10);
    expect(r.tons).toBeGreaterThan(0.85);
    expect(r.tons).toBeLessThan(1.0);
    expect(r.recommendedTons).toBe(1);
  });
  it("150 ft² room → 1.5 TR", () => expect(room(15, 10).recommendedTons).toBe(1.5));
  it("120 ft² top floor → 1.5 TR (roof exposure pushes it up a size)", () =>
    expect(room(12, 10, { roof: "top_floor_roof_exposed" }).recommendedTons).toBe(1.5));
  it("100 ft² room in a moderate city → 0.75 TR", () => expect(room(10, 10, { climate: "moderate" }).recommendedTons).toBe(0.75));
  // reference rule: 250 ÷ 120 + 0.1 (extra people) = 2.18 T → rounds up to 2.5
  it("250 ft² hall with 4 people → 2.5 TR", () => expect(room(25, 10, { occupants: 4 }).recommendedTons).toBe(2.5));
  it("200 ft² room → 2 TR", () => expect(room(20, 10).recommendedTons).toBe(2));
  it("result is identical whether the room is entered in feet or metres", () => {
    const ft = room(12, 10);
    const m = room(3.6576, 3.048, { dimensionUnit: "m", ceilingValue: 3.048 });
    expect(m.totalBtuh).toBeCloseTo(ft.totalBtuh, 6);
  });
});

describe("saved settings upgrade", () => {
  it("moves coefficients still on the old US base to the calibrated defaults, keeps tuned ones", () => {
    const db = (t: object) => ({ timeLogs: [], fin: { tonnage: t } }) as unknown as Db;
    expect(upgradeDb(db({ ...C, baseBtuPerSqft: 20, referenceCeilingFt: 8 })).fin.tonnage.baseBtuPerSqft).toBe(C.baseBtuPerSqft);
    expect(upgradeDb(db({ ...C, baseBtuPerSqft: 85 })).fin.tonnage.baseBtuPerSqft).toBe(85);
  });
});
