/* Admin-controlled settings for the technician Calculators hub (Cost & Calc Rules → Technician calculators).
 *
 * Every rate here is a CUSTOMER selling rate (ex GST). Purchase costs, markups and margins never live
 * here, so nothing in this block can leak them to a technician screen or printout.
 *
 * Reference data (manufacturer refrigerant rules, pressure–temperature tables, cable current-rating
 * tables) ships EMPTY on purpose: those values must come from a cited manufacturer manual or standard
 * and be marked verified by the office. Calculators that need them show "Assessment unavailable"
 * until then — nothing here is invented. */

export interface RateItem {
  id: string;
  name: string;
  unit: string;
  /** customer price per unit, ex GST */
  price: number;
  group: "Copper & insulation" | "Electrical" | "Drain" | "Stand & accessories" | "Refrigerant" | "Labour & visit" | "Other";
  /** refrigerant rates: which gas */
  refrigerant?: string;
  /** cable rates: conductor material + size, used by the cable estimate */
  cable?: { material: "Copper" | "Aluminium"; sizeMm2: number };
}

export interface InstallPackage {
  id: string;
  name: string;
  acTypes: string[];
  /** largest capacity the package covers, TR */
  maxTons: number;
  price: number;
  /** materials included in the package price: rate id → quantity */
  includes: Record<string, number>;
  notes: string;
}

export interface AmcPlan {
  id: string;
  name: string;
  visitsPerYear: number;
  /** annual price per AC, by AC type, ex GST */
  ratePerAc: Record<string, number>;
  included: string[];
  exclusions: string[];
}

export interface DrainSlope { id: string; label: string; rise: number; run: number; source: string }

/** Manufacturer additional-refrigerant rule for one model — enter only from the model's installation manual. */
export interface RefrigerantRule {
  id: string;
  brand: string;
  model: string;
  refrigerant: string;
  factoryChargeG: number | null;
  /** pipe length (one way) already covered by the factory charge */
  includedLengthM: number;
  additionalGPerM: number;
  minLengthM: number | null;
  maxLengthM: number | null;
  /** only when the manual explicitly says to recover refrigerant for runs shorter than the included length */
  shortRunRemovalGPerM: number | null;
  source: string;
  verified: boolean;
  verifiedBy?: string;
}

/** Saturation table for one refrigerant. Pressures are ABSOLUTE kPa. Pure / azeotropic: bubble = dew. */
export interface PtDataset {
  id: string;
  refrigerant: string;
  blend: "pure" | "azeotropic" | "zeotropic";
  rows: { tempC: number; bubbleKpaA: number; dewKpaA: number }[];
  source: string;
  verified: boolean;
  verifiedBy?: string;
}

/** Approved current-carrying-capacity table (e.g. from IS 3961 / IEC 60364-5-52 / the cable maker's datasheet). */
export interface CableTable {
  id: string;
  name: string;
  material: "Copper" | "Aluminium";
  method: string;
  ambientC: number;
  rows: { sizeMm2: number; amps: number }[];
  source: string;
  verified: boolean;
  verifiedBy?: string;
}

export interface TravelPolicy {
  /** mileage = distance × rate · actual = receipts · either = technician picks one per trip · both = both allowed together */
  mode: "mileage" | "actual" | "either" | "both";
  ratePerKm: number;
  receiptsRequired: boolean;
  note: string;
}

export interface ToolSettings {
  rates: RateItem[];
  packages: InstallPackage[];
  amcPlans: AmcPlan[];
  /** most a technician may discount a quotation, % of subtotal */
  maxTechDiscountPct: number;
  drainSlopes: DrainSlope[];
  insulationPieceM: number;
  insulationWastagePct: number;
  drainWastagePct: number;
  cableWastagePct: number;
  refrigerantRules: RefrigerantRule[];
  ptDatasets: PtDataset[];
  cableTables: CableTable[];
  /** allowed voltage drop %, only used when a source is recorded */
  voltageDropLimitPct: number | null;
  voltageDropSource: string;
  /** stand rated load must be ≥ outdoor unit weight × this factor */
  standLoadFactor: number;
  travel: TravelPolicy;
  /** shown on every sample value so nobody mistakes it for an approved rate */
  sampleNote: string;
}

export const REFRIGERANTS = ["R32", "R410A", "R22", "R290", "R134a", "R407C"] as const;

const r = (id: string, name: string, unit: string, price: number, group: RateItem["group"], extra: Partial<RateItem> = {}): RateItem => ({ id, name, unit, price, group, ...extra });

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  rates: [
    r("cu-pair", "Copper pipe pair, extra (per metre)", "m", 900, "Copper & insulation"),
    r("ins-piece", "Insulation tube (per piece)", "piece", 90, "Copper & insulation"),
    r("ins-m", "Insulation, extra (per metre)", "m", 60, "Copper & insulation"),
    r("fit-set", "Flare nuts / fittings set", "set", 350, "Copper & insulation"),
    r("cab-cu-1.5", "Copper cable 1.5 mm² 3-core (per metre)", "m", 75, "Electrical", { cable: { material: "Copper", sizeMm2: 1.5 } }),
    r("cab-cu-2.5", "Copper cable 2.5 mm² 3-core (per metre)", "m", 110, "Electrical", { cable: { material: "Copper", sizeMm2: 2.5 } }),
    r("cab-cu-4", "Copper cable 4 mm² 3-core (per metre)", "m", 165, "Electrical", { cable: { material: "Copper", sizeMm2: 4 } }),
    r("cab-extra", "Interconnect cable, extra (per metre)", "m", 90, "Electrical"),
    r("drain-16", "Drain pipe 16 mm (per metre)", "m", 40, "Drain"),
    r("drain-fit", "Drain fitting (elbow / joint)", "piece", 30, "Drain"),
    r("stand-angle", "Outdoor stand, MS angle", "piece", 1200, "Stand & accessories"),
    r("stand-heavy", "Outdoor bracket, heavy duty", "piece", 1650, "Stand & accessories"),
    r("fasteners", "Anchor fasteners set", "set", 150, "Stand & accessories"),
    r("pads", "Anti-vibration pads (set of 4)", "set", 250, "Stand & accessories"),
    r("gas-r32", "Refrigerant R32 (per kg)", "kg", 1800, "Refrigerant", { refrigerant: "R32" }),
    r("gas-r410a", "Refrigerant R410A (per kg)", "kg", 1650, "Refrigerant", { refrigerant: "R410A" }),
    r("gas-r22", "Refrigerant R22 (per kg)", "kg", 1300, "Refrigerant", { refrigerant: "R22" }),
    r("lab-hour", "Service labour (per hour)", "hour", 400, "Labour & visit"),
    r("lab-inst", "Installation labour (outside package)", "job", 1500, "Labour & visit"),
    r("visit", "Visit charge", "visit", 299, "Labour & visit"),
    r("transport", "Transport", "trip", 300, "Labour & visit"),
  ],
  packages: [
    { id: "pk-split-15", name: "Split AC standard installation (up to 1.5 TR)", acTypes: ["Split"], maxTons: 1.5, price: 1500, includes: { "cu-pair": 3, "cab-extra": 3, "drain-16": 3, "ins-m": 3 }, notes: "Includes 3 m copper pair, cable, drain and insulation." },
    { id: "pk-split-25", name: "Split AC standard installation (2–2.5 TR)", acTypes: ["Split"], maxTons: 2.5, price: 1900, includes: { "cu-pair": 3, "cab-extra": 3, "drain-16": 3, "ins-m": 3 }, notes: "Includes 3 m copper pair, cable, drain and insulation." },
    { id: "pk-window", name: "Window AC installation", acTypes: ["Window"], maxTons: 2, price: 800, includes: {}, notes: "Fixing in an existing opening. Frame work extra." },
  ],
  amcPlans: [
    { id: "amc-basic", name: "Basic AMC", visitsPerYear: 2, ratePerAc: { Split: 1499, Window: 1199, Cassette: 2999, Tower: 2499, Ductable: 4999 }, included: ["2 preventive services (filter, coil wash, drain)", "Gas pressure check", "Priority booking"], exclusions: ["Spare parts", "Refrigerant top-up", "Outdoor stand or pipe work"] },
    { id: "amc-comp", name: "Comprehensive AMC", visitsPerYear: 3, ratePerAc: { Split: 3999, Window: 3299, Cassette: 6999, Tower: 5999, Ductable: 9999 }, included: ["3 preventive services", "Breakdown visits", "Listed spare parts (PCB, capacitor, fan motor)", "Refrigerant top-up once a year"], exclusions: ["Compressor", "Physical / water damage", "Installation & relocation"] },
  ],
  maxTechDiscountPct: 10,
  drainSlopes: [
    { id: "s100", label: "1 : 100", rise: 1, run: 100, source: "Company default. Use the slope in the AC manufacturer's installation manual where it differs." },
    { id: "s50", label: "1 : 50", rise: 1, run: 50, source: "Company option for long or blockage-prone runs. Confirm against the manufacturer's manual." },
  ],
  insulationPieceM: 1.83,
  insulationWastagePct: 5,
  drainWastagePct: 5,
  cableWastagePct: 5,
  refrigerantRules: [],
  ptDatasets: [],
  cableTables: [],
  voltageDropLimitPct: null,
  voltageDropSource: "",
  standLoadFactor: 2,
  travel: { mode: "either", ratePerKm: 4, receiptsRequired: true, note: "Pick mileage OR actual fuel for a trip, not both." },
  sampleNote: "Sample demo rates — replace with your approved customer rates before use.",
};
