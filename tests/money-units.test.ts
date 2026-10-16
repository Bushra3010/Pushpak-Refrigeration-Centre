import { describe, expect, it } from "vitest";
import { allocate, formatINR, marginPct, markupPct, priceFromMargin, priceFromMarkup, sum } from "@/app/lib/calc/money";
import { ftToM, inchToMm, mToFt, parseInches } from "@/app/lib/calc/units";

describe("unit conversions", () => {
  it("converts inches and feet exactly", () => {
    expect(inchToMm(1)).toBe(25.4);
    expect(inchToMm(3 / 8)).toBeCloseTo(9.525, 10);
    expect(ftToM(10)).toBeCloseTo(3.048, 10);
    expect(mToFt(ftToM(37.5))).toBeCloseTo(37.5, 10);
  });
  it("parses fractional inch sizes", () => {
    expect(parseInches("3/8")).toBe(0.375);
    expect(parseInches("1 1/8")).toBe(1.125);
    expect(parseInches("0.25")).toBe(0.25);
    expect(parseInches("abc")).toBeNull();
  });
});

describe("markup versus margin", () => {
  it("25% markup is not 25% margin", () => {
    const p = priceFromMarkup(1000, 25);
    expect(p).toBe(1250);
    expect(marginPct(p, 1000)).toBeCloseTo(20, 10);
  });
  it("25% target margin needs 33.33% markup", () => {
    const p = priceFromMargin(1000, 25);
    expect(p).toBe(1333.33);
    expect(markupPct(1333.33, 1000)).toBeCloseTo(33.333, 2);
    expect(marginPct(p, 1000)).toBeCloseTo(25, 2);
  });
  it("rejects impossible margins", () => {
    expect(() => priceFromMargin(100, 100)).toThrow();
    expect(() => priceFromMarkup(100, -1)).toThrow();
  });
});

describe("allocation", () => {
  it("allocates in paise with no rounding leak", () => {
    const { parts, unallocated } = allocate(100, { a: 1, b: 1, c: 1 });
    expect(sum(Object.values(parts))).toBe(100);
    expect(Object.values(parts).sort()).toEqual([33.33, 33.33, 33.34]);
    expect(unallocated).toBe(0);
  });
  it("returns the full amount as unallocated when there is no basis", () => {
    expect(allocate(500, {})).toEqual({ parts: {}, unallocated: 500 });
    expect(allocate(500, { a: 0 }).unallocated).toBe(500);
  });
  it("formats INR with Indian grouping", () => {
    expect(formatINR(1234567.5)).toBe("₹12,34,567.50");
  });
});
