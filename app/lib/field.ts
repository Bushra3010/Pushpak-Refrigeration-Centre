/* Field rules managed in Admin → Settings: service categories, technician geo-location, nearby search,
 * arrival radius (geofence), visit OTP, in-app calling and break limits. */

export const SERVICE_CATEGORIES = ["AC", "Fridge", "Washing Machine", "Oven"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
export const CATEGORY_ICON: Record<ServiceCategory, string> = { AC: "❄️", Fridge: "🧊", "Washing Machine": "🫧", Oven: "🍲" };

/** Problems the customer can pick, per category (AC keeps the original list in data.ts). */
export const CATEGORY_COMPLAINTS: Record<Exclude<ServiceCategory, "AC">, string[]> = {
  Fridge: ["Not Cooling", "Less Cooling", "Ice Build-up", "Water Leakage", "Noise", "Not Starting", "Door Not Closing", "Bad Smell", "Error Code", "Other"],
  "Washing Machine": ["Not Starting", "Not Spinning", "Water Not Draining", "Water Not Filling", "Leakage", "Noise / Vibration", "Door Locked", "Error Code", "Other"],
  Oven: ["Not Heating", "Not Starting", "Turntable Not Rotating", "Sparking", "Door Problem", "Buttons Not Working", "Error Code", "Other"],
};

export interface FieldRules {
  categories: ServiceCategory[];   // offered in the customer app
  geofenceM: number;               // technician must be within this many metres to mark Arrived
  nearbyKm: number;                // dispatch "nearby" search radius
  visitOtp: boolean;               // customer's visit OTP needed before work starts
  inAppCall: boolean;              // customer ↔ technician call inside the app, numbers hidden
  maxBreakMin: number;             // daily break limit per technician
}

export const DEFAULT_FIELD_RULES: FieldRules = { categories: [...SERVICE_CATEGORIES], geofenceM: 100, nearbyKm: 5, visitOtp: true, inAppCall: true, maxBreakMin: 60 };

export type LatLng = { lat: number; lng: number };

/** "28.59,77.04" → {lat,lng}; null when missing or malformed. */
export function parseGps(s: string | undefined | null): LatLng | null {
  const m = (s ?? "").match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);

/** 4-digit visit code, shown to the customer and entered by the technician on arrival. */
export const newVisitOtp = () => String(Math.floor(1000 + Math.random() * 9000));

export interface CallLog { id: string; at: string; jobId: string | null; from: string; to: string; seconds: number; via: "In-app" }

export const PROPERTY_TYPES = [
  "Apartment / Flat", "Residential Building", "Independent House", "Individual Villa", "Commercial Building", "Commercial Complex",
  "Shopping Complex", "Shop / Showroom", "Office", "Factory / Industrial", "Warehouse / Godown", "Other",
] as const;
export const PROPERTY_ICON: Record<string, string> = {
  "Apartment / Flat": "🏢", "Residential Building": "🏢", "Independent House": "🏠", "Individual Villa": "🏡", "Commercial Building": "🏬", "Commercial Complex": "🏬",
  "Shopping Complex": "🛍️", "Shop / Showroom": "🏪", Office: "💼", "Factory / Industrial": "🏭", "Warehouse / Godown": "📦", Other: "📍",
};
export const FLOORS = ["Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor", "5th Floor", "6th – 10th Floor", "Above 10th Floor"] as const;
export const AREA_CATEGORIES = ["Residential Area", "Commercial Area", "Congested Commercial Area", "Industrial Area"] as const;
/** Congested areas get the access checklist (also matches the older "Congested Area" value). */
export const isCongested = (areaType?: string) => !!areaType && /congested/i.test(areaType);
export const CONGESTED_CHECKLIST = ["Narrow lane — van cannot reach", "No parking nearby", "Heavy traffic / market area", "Ladder must be carried by hand", "Stairs only, no lift", "Society entry permission needed"] as const;

/** Break minutes today and whether a break is running, from the technician's timer logs. */
export function breakToday(logs: { techId: string; kind: string; start: string; end: string | null; status: string }[], techId: string, day: string, nowMs = Date.now()) {
  const mine = logs.filter((l) => l.techId === techId && l.kind === "Break" && l.start.slice(0, 10) === day && l.status !== "Rejected");
  const minutes = mine.reduce((m, l) => m + Math.max(0, ((l.end ? Date.parse(l.end) : nowMs) - Date.parse(l.start)) / 60000), 0);
  return { minutes: Math.round(minutes), onBreak: mine.some((l) => !l.end) };
}
