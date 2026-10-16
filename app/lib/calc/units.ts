export const MM_PER_INCH = 25.4; // exact by definition
export const M_PER_FOOT = 0.3048; // exact by definition
export const FT_PER_M = 1 / M_PER_FOOT;

export type LengthUnit = "m" | "ft";
export type DiameterUnit = "mm" | "in";

export const inchToMm = (inch: number) => inch * MM_PER_INCH;
export const mmToInch = (mm: number) => mm / MM_PER_INCH;
export const ftToM = (ft: number) => ft * M_PER_FOOT;
export const mToFt = (m: number) => m / M_PER_FOOT;
export const mmToM = (mm: number) => mm / 1000;

export const diameterToMm = (v: number, unit: DiameterUnit) => (unit === "in" ? inchToMm(v) : v);
export const lengthToM = (v: number, unit: LengthUnit) => (unit === "ft" ? ftToM(v) : v);

/** 1 W = 3.412142 BTU/h (1 BTU/h = 0.29307107 W). */
export const BTUH_PER_WATT = 3.412142;
/** 1 refrigeration ton = 12,000 BTU/h by definition. */
export const BTUH_PER_TON = 12000;
export const SQFT_PER_SQM = 10.763910417;

/** Parse fractional inch strings such as "3/8", "1 1/8", "0.375". */
export function parseInches(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
