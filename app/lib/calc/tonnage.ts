import { BTUH_PER_TON, BTUH_PER_WATT, SQFT_PER_SQM, mToFt } from "./units";

/**
 * Preliminary room cooling-load estimate (rule-of-thumb method).
 *
 * Method (every coefficient below is editable in Settings → Tonnage coefficients):
 *   1. Base load      = floor area (ft²) × baseBtuPerSqft × (ceiling height ÷ referenceCeilingFt)
 *   2. Envelope       = base × climate × sunlight × roof exposure × insulation multipliers
 *   3. People         = occupants above `occupantsIncluded` × btuPerExtraOccupant
 *   4. Windows        = window area (ft²) × btuPerWindowSqft × sunlight multiplier
 *   5. Appliances     = appliance watts × 3.412 BTU/h per W (physical conversion)
 *   6. Kitchen        = kitchenBtu if the room is a kitchen
 *   7. Total BTU/h    = (2 + 3 + 4 + 5 + 6); tons = BTU/h ÷ 12,000
 *   8. Recommended    = smallest capacity in `availableTons` ≥ tons × (1 + safetyMarginPct)
 *
 * Calibration: the base BTU/ft² is set for Indian conditions so that a typical
 * 120 ft² room with a 10 ft ceiling in a hot city (two people, one window,
 * lights + TV) comes to ≈ 1 TR — the common Indian trade rule of thumb of
 * roughly 1 TR per 100–120 ft² (also what desiutility.com's calculator uses:
 * area ÷ 120, rounded up to a standard size). The earlier US ENERGY STAR base of
 * 20 BTU/ft² assumes temperate climates and under-sized Indian rooms ~4–5×.
 * Occupant (600 BTU/h each above two) and kitchen (+4,000 BTU/h) allowances
 * follow ENERGY STAR room AC guidance. All factors are company defaults to be
 * tuned from field experience. This is NOT a Manual J / ISHRAE heat-load
 * calculation and carries no accuracy claim.
 */
export type TonnageCoefficients = {
  baseBtuPerSqft: number;
  referenceCeilingFt: number;
  climate: Record<string, number>;
  sunlight: Record<"shaded" | "normal" | "heavy", number>;
  roof: Record<"intermediate_floor" | "top_floor_roof_exposed" | "single_storey_roof_exposed", number>;
  insulation: Record<"good" | "average" | "poor", number>;
  occupantsIncluded: number;
  btuPerExtraOccupant: number;
  btuPerWindowSqft: number;
  kitchenBtu: number;
  safetyMarginPct: number;
  availableTons: number[];
  source: string;
};

export const DEFAULT_TONNAGE_COEFFICIENTS: TonnageCoefficients = {
  baseBtuPerSqft: 70,
  referenceCeilingFt: 10,
  climate: {
    moderate: 1.0,
    warm_humid: 1.1,
    hot_dry: 1.2,
    extreme_hot: 1.3,
  },
  sunlight: { shaded: 0.9, normal: 1.0, heavy: 1.1 },
  roof: { intermediate_floor: 1.0, top_floor_roof_exposed: 1.15, single_storey_roof_exposed: 1.2 },
  insulation: { good: 0.9, average: 1.0, poor: 1.15 },
  occupantsIncluded: 2,
  btuPerExtraOccupant: 600,
  btuPerWindowSqft: 30,
  kitchenBtu: 4000,
  safetyMarginPct: 5,
  availableTons: [0.75, 1, 1.5, 2, 2.5, 3, 4, 5],
  source:
    "Company default rule of thumb calibrated to Indian sizing practice (≈ 1 TR per 120 ft² at a 10 ft ceiling in a hot city). Occupant and kitchen allowances per ENERGY STAR room AC guidance; every factor is an editable assumption.",
};

/** Earlier shipped defaults (US ENERGY STAR base); saved settings still on these are upgraded. */
export const LEGACY_TONNAGE_BASE = { baseBtuPerSqft: 20, referenceCeilingFt: 8 } as const;

export const CLIMATE_LABELS: Record<string, string> = {
  moderate: "Moderate (e.g. Bengaluru, Pune)",
  warm_humid: "Warm & humid coastal (e.g. Mumbai, Chennai, Kolkata)",
  hot_dry: "Hot & dry (e.g. Delhi NCR, Jaipur, Nagpur)",
  extreme_hot: "Extreme summer heat (e.g. Rajasthan desert belt)",
};

/** City → climate zone shortcut. Choose "Other" and pick the zone directly for unlisted towns. */
export const CITY_CLIMATE: [city: string, zone: string][] = [
  ["Delhi / NCR", "hot_dry"], ["Jaipur", "hot_dry"], ["Lucknow", "hot_dry"], ["Ahmedabad", "hot_dry"], ["Nagpur", "hot_dry"],
  ["Hyderabad", "hot_dry"], ["Chandigarh", "hot_dry"], ["Jodhpur / Bikaner", "extreme_hot"], ["Mumbai", "warm_humid"],
  ["Chennai", "warm_humid"], ["Kolkata", "warm_humid"], ["Kochi", "warm_humid"], ["Visakhapatnam", "warm_humid"],
  ["Bengaluru", "moderate"], ["Pune", "moderate"], ["Dehradun", "moderate"],
];

export type TonnageInput = {
  lengthValue: number;
  widthValue: number;
  dimensionUnit: "ft" | "m";
  ceilingValue: number;
  climate: string;
  occupants: number;
  sunlight: keyof TonnageCoefficients["sunlight"];
  roof: keyof TonnageCoefficients["roof"];
  insulation: keyof TonnageCoefficients["insulation"];
  windowAreaSqft: number;
  applianceWatts: number;
  isKitchen: boolean;
};

export type TonnageResult = {
  floorAreaSqft: number;
  floorAreaSqm: number;
  volumeCuft: number;
  steps: { label: string; btuh: number; detail: string }[];
  totalBtuh: number;
  tons: number;
  tonsWithMargin: number;
  recommendedTons: number | null;
  recommendationNote: string;
  disclaimer: string;
};

export const TONNAGE_DISCLAIMER =
  "Preliminary estimate only. Large, glass-heavy, commercial, server/kitchen or otherwise complex sites need a professional heat-load assessment before equipment is selected.";

export function validateTonnage(i: TonnageInput, c: TonnageCoefficients): string[] {
  const e: string[] = [];
  if (!(i.lengthValue > 0) || !(i.widthValue > 0)) e.push("Room length and width must be greater than zero.");
  if (!(i.ceilingValue > 0)) e.push("Ceiling height must be greater than zero.");
  if (!(i.occupants >= 0) || !Number.isInteger(i.occupants)) e.push("Occupants must be a whole number ≥ 0.");
  if (!(i.windowAreaSqft >= 0)) e.push("Window area must be a number ≥ 0.");
  if (!(i.applianceWatts >= 0)) e.push("Appliance heat must be a number ≥ 0 W.");
  if (c.climate[i.climate] == null) e.push("Select a climate zone.");
  return e;
}

export function estimateTonnage(i: TonnageInput, c: TonnageCoefficients = DEFAULT_TONNAGE_COEFFICIENTS): TonnageResult {
  const errs = validateTonnage(i, c);
  if (errs.length) throw new Error(errs.join(" "));
  const toFt = (v: number) => (i.dimensionUnit === "m" ? mToFt(v) : v);
  const L = toFt(i.lengthValue);
  const W = toFt(i.widthValue);
  const H = toFt(i.ceilingValue);
  const area = L * W;
  const heightFactor = H / c.referenceCeilingFt;
  const base = area * c.baseBtuPerSqft * heightFactor;
  const mClimate = c.climate[i.climate];
  const mSun = c.sunlight[i.sunlight];
  const mRoof = c.roof[i.roof];
  const mIns = c.insulation[i.insulation];
  const envelope = base * mClimate * mSun * mRoof * mIns;
  const extraPeople = Math.max(0, i.occupants - c.occupantsIncluded);
  const people = extraPeople * c.btuPerExtraOccupant;
  const windows = i.windowAreaSqft * c.btuPerWindowSqft * mSun;
  const appliances = i.applianceWatts * BTUH_PER_WATT;
  const kitchen = i.isKitchen ? c.kitchenBtu : 0;
  const total = envelope + people + windows + appliances + kitchen;
  const tons = total / BTUH_PER_TON;
  const withMargin = tons * (1 + c.safetyMarginPct / 100);
  const sorted = [...c.availableTons].sort((a, b) => a - b);
  const rec = sorted.find((t) => t >= withMargin - 1e-9) ?? null;
  return {
    floorAreaSqft: area,
    floorAreaSqm: area / SQFT_PER_SQM,
    volumeCuft: area * H,
    steps: [
      {
        label: "Room envelope",
        btuh: envelope,
        detail: `${area.toFixed(1)} ft² × ${c.baseBtuPerSqft} BTU/ft² × height ${heightFactor.toFixed(2)} × climate ${mClimate} × sun ${mSun} × roof ${mRoof} × insulation ${mIns}`,
      },
      { label: "Occupants", btuh: people, detail: `${extraPeople} above ${c.occupantsIncluded} × ${c.btuPerExtraOccupant} BTU/h` },
      { label: "Windows", btuh: windows, detail: `${i.windowAreaSqft} ft² × ${c.btuPerWindowSqft} BTU/ft² × sun ${mSun}` },
      { label: "Appliances", btuh: appliances, detail: `${i.applianceWatts} W × ${BTUH_PER_WATT} BTU/h per W` },
      { label: "Kitchen allowance", btuh: kitchen, detail: i.isKitchen ? `+${c.kitchenBtu} BTU/h` : "Not a kitchen" },
    ],
    totalBtuh: total,
    tons,
    tonsWithMargin: withMargin,
    recommendedTons: rec,
    recommendationNote:
      rec == null
        ? `Load exceeds the largest configured capacity (${sorted.at(-1)} TR). Consider multiple units or a ducted/VRF system after a professional assessment.`
        : `Smallest configured capacity ≥ ${withMargin.toFixed(2)} TR (estimate + ${c.safetyMarginPct}% safety allowance).`,
    disclaimer: TONNAGE_DISCLAIMER,
  };
}

