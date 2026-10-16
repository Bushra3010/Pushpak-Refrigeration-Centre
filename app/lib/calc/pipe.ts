import { marginPct, priceFromMargin, priceFromMarkup, round2, sum } from "./money";
import { diameterToMm, lengthToM, mmToM, M_PER_FOOT, type DiameterUnit, type LengthUnit } from "./units";

/** Default density of copper, kg/m³. Editable in Settings; source recorded with it. */
export const DEFAULT_COPPER_DENSITY = 8960;
export const DEFAULT_DENSITY_SOURCE =
  "Pure copper at ~20 °C, 8.96 g/cm³ (CRC Handbook of Chemistry and Physics). Alloyed / phosphorus-deoxidised ACR tube may differ slightly.";

export type GaugeRef = { standard: string; gauge: string; thicknessMm: number };

export type PricingRule = { mode: "markup" | "margin"; pct: number };

export type PipeInput = {
  label?: string;
  od: number;
  odUnit: DiameterUnit;
  /** Wall thickness in mm. Either this or `gauge` must be given. */
  wallMm?: number | null;
  gauge?: GaugeRef | null;
  length: number;
  lengthUnit: LengthUnit;
  quantity: number;
};

export type PipeCostInput = {
  ratePerKg: number;
  /** Optional supplier price per metre; when given it becomes the cost basis. */
  supplierRatePerMetre?: number | null;
  wastagePct: number;
  pricing: PricingRule;
  taxRatePct?: number | null;
  densityKgM3?: number;
};

export type PipeResult = {
  label?: string;
  odMm: number;
  thicknessMm: number;
  thicknessSource: string;
  idMm: number;
  lengthPerPieceM: number;
  totalLengthM: number;
  kgPerM: number;
  kgPerFt: number;
  netWeightKg: number;
  procurementWeightKg: number;
  procurementLengthM: number;
  weightBasedCost: number;
  supplierBasedCost: number | null;
  costBasis: "weight" | "supplier_per_metre";
  purchaseCost: number;
  sellingPrice: number;
  profit: number;
  marginPct: number | null;
  tax: number;
  totalWithTax: number;
};

export class PipeInputError extends Error {}

export function validatePipe(p: PipeInput): string[] {
  const errs: string[] = [];
  const odMm = diameterToMm(p.od, p.odUnit);
  const t = p.gauge ? p.gauge.thicknessMm : p.wallMm;
  if (!(p.od > 0)) errs.push("Outside diameter must be greater than zero.");
  if (t == null) errs.push("Enter wall thickness in mm or select a gauge.");
  else if (!(t > 0)) errs.push("Wall thickness must be greater than zero.");
  else if (2 * t >= odMm) errs.push("Twice the wall thickness must be less than the outside diameter.");
  if (!(p.length > 0)) errs.push("Length must be greater than zero.");
  if (!(p.quantity > 0) || !Number.isInteger(p.quantity)) errs.push("Quantity must be a positive whole number.");
  return errs;
}

export function validateCost(c: PipeCostInput): string[] {
  const errs: string[] = [];
  if (!(c.ratePerKg > 0) && !(c.supplierRatePerMetre && c.supplierRatePerMetre > 0))
    errs.push("Enter a copper rate per kg (or a supplier rate per metre).");
  if (c.ratePerKg < 0) errs.push("Rate per kg cannot be negative.");
  if (c.wastagePct < 0 || c.wastagePct >= 100) errs.push("Wastage must be between 0% and 99%.");
  if (c.pricing.mode === "margin" && (c.pricing.pct < 0 || c.pricing.pct >= 100))
    errs.push("Target margin must be between 0% and 99.99%.");
  if (c.pricing.mode === "markup" && c.pricing.pct < 0) errs.push("Markup cannot be negative.");
  if (c.densityKgM3 != null && !(c.densityKgM3 > 0)) errs.push("Density must be greater than zero.");
  if (c.taxRatePct != null && c.taxRatePct < 0) errs.push("Tax rate cannot be negative.");
  return errs;
}

/** Mass per metre of a tube: (π/4)(OD² − ID²) × ρ, dimensions in metres. */
export function kgPerMetre(odMm: number, idMm: number, density = DEFAULT_COPPER_DENSITY) {
  const od = mmToM(odMm);
  const id = mmToM(idMm);
  return (Math.PI / 4) * (od * od - id * id) * density;
}

export function priceFor(cost: number, rule: PricingRule) {
  return rule.mode === "markup" ? priceFromMarkup(cost, rule.pct) : priceFromMargin(cost, rule.pct);
}

export function calculatePipe(p: PipeInput, c: PipeCostInput): PipeResult {
  const errs = [...validatePipe(p), ...validateCost(c)];
  if (errs.length) throw new PipeInputError(errs.join(" "));
  const density = c.densityKgM3 ?? DEFAULT_COPPER_DENSITY;
  const odMm = diameterToMm(p.od, p.odUnit);
  const thicknessMm = (p.gauge ? p.gauge.thicknessMm : p.wallMm)!;
  const idMm = odMm - 2 * thicknessMm;
  const lengthPerPieceM = lengthToM(p.length, p.lengthUnit);
  const totalLengthM = lengthPerPieceM * p.quantity;
  const kgM = kgPerMetre(odMm, idMm, density);
  const netWeightKg = kgM * totalLengthM;
  const w = 1 + c.wastagePct / 100;
  const procurementWeightKg = netWeightKg * w;
  const procurementLengthM = totalLengthM * w;
  const weightBasedCost = round2(procurementWeightKg * (c.ratePerKg || 0));
  const supplierBasedCost =
    c.supplierRatePerMetre && c.supplierRatePerMetre > 0 ? round2(procurementLengthM * c.supplierRatePerMetre) : null;
  const purchaseCost = supplierBasedCost ?? weightBasedCost;
  const sellingPrice = priceFor(purchaseCost, c.pricing);
  const tax = round2(sellingPrice * ((c.taxRatePct ?? 0) / 100));
  return {
    label: p.label,
    odMm,
    thicknessMm,
    thicknessSource: p.gauge ? `${p.gauge.gauge} (${p.gauge.standard})` : "Entered wall thickness",
    idMm,
    lengthPerPieceM,
    totalLengthM,
    kgPerM: kgM,
    kgPerFt: kgM * M_PER_FOOT,
    netWeightKg,
    procurementWeightKg,
    procurementLengthM,
    weightBasedCost,
    supplierBasedCost,
    costBasis: supplierBasedCost != null ? "supplier_per_metre" : "weight",
    purchaseCost,
    sellingPrice,
    profit: round2(sellingPrice - purchaseCost),
    marginPct: marginPct(sellingPrice, purchaseCost),
    tax,
    totalWithTax: round2(sellingPrice + tax),
  };
}

export type ExtraLine = {
  kind: "insulation" | "fittings" | "labour" | "other";
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  /** Per-line pricing; falls back to the pipe pricing rule. */
  pricing?: PricingRule;
};

export type PipeSetResult = {
  pipes: PipeResult[];
  extras: (ExtraLine & { cost: number; price: number; tax: number })[];
  totals: {
    netWeightKg: number;
    procurementWeightKg: number;
    cost: number;
    price: number;
    profit: number;
    marginPct: number | null;
    tax: number;
    totalWithTax: number;
  };
};

/** Paired liquid + suction lines (or any number of pipes) with extra line items. */
export function calculatePipeSet(pipes: PipeInput[], cost: PipeCostInput, extras: ExtraLine[] = []): PipeSetResult {
  const results = pipes.map((p) => calculatePipe(p, cost));
  const extraRows = extras.map((e) => {
    if (e.quantity < 0 || e.unitCost < 0) throw new PipeInputError(`Invalid quantity or cost for "${e.description}".`);
    const lineCost = round2(e.quantity * e.unitCost);
    const price = priceFor(lineCost, e.pricing ?? cost.pricing);
    return { ...e, cost: lineCost, price, tax: round2(price * ((cost.taxRatePct ?? 0) / 100)) };
  });
  const totalCost = sum([...results.map((r) => r.purchaseCost), ...extraRows.map((e) => e.cost)]);
  const totalPrice = sum([...results.map((r) => r.sellingPrice), ...extraRows.map((e) => e.price)]);
  const totalTax = sum([...results.map((r) => r.tax), ...extraRows.map((e) => e.tax)]);
  return {
    pipes: results,
    extras: extraRows,
    totals: {
      netWeightKg: results.reduce((a, r) => a + r.netWeightKg, 0),
      procurementWeightKg: results.reduce((a, r) => a + r.procurementWeightKg, 0),
      cost: totalCost,
      price: totalPrice,
      profit: round2(totalPrice - totalCost),
      marginPct: marginPct(totalPrice, totalCost),
      tax: totalTax,
      totalWithTax: round2(totalPrice + totalTax),
    },
  };
}

