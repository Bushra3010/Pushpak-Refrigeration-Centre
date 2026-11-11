/* AC Sales & Warranty — from the sale to warranty expiry and every service after.
 * One customer profile, one asset (own Asset ID) per AC sold. Expiry, status, reminders and the AC record
 * in the customer's app are all worked out automatically. Vendor details are Admin-only. */

import { addDays } from "./samples";

export const WARRANTY_YEARS = [1, 2, 5, 10] as const;
export const COMPRESSOR_YEARS = [0, 5, 10] as const;
export const SALE_AC_TYPES = ["Split", "Window", "Cassette", "Tower", "Ductable"] as const;
export const SALE_CAPACITIES = ["0.75 Ton", "1 Ton", "1.2 Ton", "1.5 Ton", "1.8 Ton", "2 Ton", "Other"] as const;
export const SALE_BRANDS = ["Daikin", "LG", "Voltas", "Samsung", "Blue Star", "Hitachi", "Carrier", "Panasonic", "Lloyd", "Godrej", "Other"] as const;
export const INSTALL_ROOMS = ["Bedroom", "Master Bedroom", "Hall / Living", "Kitchen", "Office Cabin", "Shop Floor", "Server Room", "Other"] as const;

/** What the brand warranty covers — admin ticks the points that apply to this model. */
export const COVERAGE_POINTS = [
  "Manufacturing defects in indoor & outdoor unit",
  "Compressor (as per compressor warranty period)",
  "PCB / control board",
  "Indoor & outdoor fan motor",
  "Condenser / evaporator coil (manufacturing leak)",
  "Remote control (manufacturing defect)",
  "Display / sensors",
] as const;

/** Never covered — printed on every warranty record. */
export const EXCLUSIONS = [
  "Checking / visit charges",
  "Handling & transport charges",
  "Repair / labour charges",
  "Related material — gas charging, copper pipe, stand, wiring, drain pipe, consumables",
  "Physical damage, burning, voltage fluctuation, water / pest damage",
  "Plastic parts, cosmetic damage and normal wear",
] as const;

/** Company warranty process (shown on every record and to the customer). */
export const COMPANY_PROCESS = [
  "Customer reports the problem (app / call / WhatsApp).",
  "Technician visits, checks the AC and confirms which part is faulty.",
  "Shop raises the claim with the brand using the invoice, Asset ID and indoor / outdoor serial numbers.",
  "Brand approves the claim and sends only the guaranteed part.",
  "Technician replaces the part — the brand gives only the part.",
  "Checking, handling, repair and related material costs are charged to the customer as per the bill.",
] as const;

export const CLAIM_STATUSES = ["Raised", "Sent to Company", "Approved", "Part Received", "Part Replaced", "Rejected", "Closed"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface StoredFile { name: string; data: string; type: string; size: number }

export interface SaleUnit {
  room: (typeof INSTALL_ROOMS)[number] | string;
  brand: string;
  acType: (typeof SALE_AC_TYPES)[number];
  capacity: (typeof SALE_CAPACITIES)[number];
  model: string;
  indoorSerial: string;
  outdoorSerial: string;
  inverter: boolean;
  amount: number;
}

export interface WarrantyClaim {
  id: string;
  date: string;
  issue: string;
  part: string;
  status: ClaimStatus;
  companyRef: string;
  /** what the customer pays — never covered by the brand */
  charges: { checking: number; handling: number; repair: number; material: number };
  notes: string;
  by: string;
  updatedAt: string;
}

export interface AcSale {
  id: string; // Asset ID — PRC-AST-0001
  acId: string; // the AC in db.acs (customer app, service history)
  customerId: string;
  customer: { name: string; phone: string; address: string; area: string };
  install: { location: string; status: "Pending" | "Installed"; date: string; techId: string; techName: string; report: string; pipeFt: number | null; reportAt?: string };
  unit: SaleUnit;
  sale: { date: string; invoiceNo: string };
  warranty: { years: (typeof WARRANTY_YEARS)[number]; compressorYears: (typeof COMPRESSOR_YEARS)[number]; coverage: string[]; regNo: string; notes: string };
  docs: { invoice: StoredFile | null; registration: StoredFile | null };
  /** Admin only */
  vendor: { name: string; phone: string; gstin: string; purchaseInvoice: string; purchasePrice: number | null; purchaseDate: string };
  claims: WarrantyClaim[];
  createdAt: string;
  createdBy: string;
}

export interface SaleDraft {
  customer: { customerId: string | null; name: string; phone: string; address: string; area: string };
  units: SaleUnit[];
  sale: { date: string; installDate: string; invoiceNo: string; status: "Pending" | "Installed"; techId: string };
  warranty: AcSale["warranty"];
  docs: AcSale["docs"];
  vendor: AcSale["vendor"];
}

export const emptyUnit = (): SaleUnit => ({ room: "Bedroom", brand: "Daikin", acType: "Split", capacity: "1.5 Ton", model: "", indoorSerial: "", outdoorSerial: "", inverter: true, amount: 0 });
export const emptyVendor = (): AcSale["vendor"] => ({ name: "", phone: "", gstin: "", purchaseInvoice: "", purchasePrice: null, purchaseDate: "" });
export const emptySale = (today: string): SaleDraft => ({
  customer: { customerId: null, name: "", phone: "", address: "", area: "" },
  units: [emptyUnit()],
  sale: { date: today, installDate: today, invoiceNo: "", status: "Pending", techId: "" },
  warranty: { years: 1, compressorYears: 5, coverage: [...COVERAGE_POINTS], regNo: "", notes: "" },
  docs: { invoice: null, registration: null },
  vendor: emptyVendor(),
});

const addYears = (iso: string, y: number) => { const d = new Date(`${iso}T12:00:00`); d.setFullYear(d.getFullYear() + y); return d.toISOString().slice(0, 10); };
/** Warranty expiry = sales date + period (1 year from 10 Nov 2026 → 10 Nov 2027). Verify against the brand's terms. */
export const warrantyEnd = (s: Pick<AcSale, "sale" | "warranty">) => addYears(s.sale.date, s.warranty.years);
export const compressorEnd = (s: Pick<AcSale, "sale" | "warranty">) => (s.warranty.compressorYears ? addYears(s.sale.date, s.warranty.compressorYears) : null);
export const EXPIRY_ALERT_DAYS = 30;

export type WarrantyState = "Active" | "Expiring Soon" | "Expired";
export function warrantyState(s: Pick<AcSale, "sale" | "warranty">, today: string): WarrantyState {
  const end = warrantyEnd(s);
  if (end < today) return "Expired";
  return addDays(today, EXPIRY_ALERT_DAYS) >= end ? "Expiring Soon" : "Active";
}
export const daysLeft = (s: Pick<AcSale, "sale" | "warranty">, today: string) => Math.round((Date.parse(warrantyEnd(s)) - Date.parse(today)) / 86_400_000);
export const claimCharges = (c: WarrantyClaim) => c.charges.checking + c.charges.handling + c.charges.repair + c.charges.material;
export const openClaims = (s: AcSale) => s.claims.filter((c) => !["Closed", "Rejected", "Part Replaced"].includes(c.status));

export function validateSale(d: SaleDraft): string | null {
  if (d.customer.name.trim().length < 2) return "Enter the customer name.";
  if (!/^[6-9]\d{9}$/.test(d.customer.phone)) return "Enter a valid 10-digit mobile number.";
  if (d.customer.address.trim().length < 8) return "Enter the customer address (installation address).";
  if (!d.units.length) return "Add at least one AC.";
  for (const [i, u] of d.units.entries()) {
    const n = d.units.length > 1 ? `AC ${i + 1}: ` : "";
    if (!u.model.trim()) return `${n}enter the model number.`;
    if (!u.indoorSerial.trim()) return `${n}enter the indoor unit serial number.`;
    if (u.acType !== "Window" && !u.outdoorSerial.trim()) return `${n}enter the outdoor unit serial number.`;
    if (!(u.amount >= 0)) return `${n}sale amount cannot be negative.`;
  }
  const serials = d.units.flatMap((u) => [u.indoorSerial.trim().toUpperCase(), u.outdoorSerial.trim().toUpperCase()]).filter(Boolean);
  if (new Set(serials).size !== serials.length) return "The same serial number is entered twice.";
  if (!d.sale.date) return "Pick the sales date.";
  if (!d.sale.invoiceNo.trim()) return "Enter the invoice number.";
  if (d.sale.status === "Installed" && (!d.sale.installDate || d.sale.installDate < d.sale.date)) return "Installation date must be on or after the sales date.";
  if (d.vendor.phone && !/^\d{10}$/.test(d.vendor.phone)) return "Vendor mobile must be 10 digits.";
  return null;
}

/** Serial numbers already registered (catches the same AC sold twice). */
export function duplicateSerial(sales: AcSale[], d: SaleDraft): string | null {
  const have = new Map(sales.flatMap((s) => [[s.unit.indoorSerial.toUpperCase(), s.id], [s.unit.outdoorSerial.toUpperCase(), s.id]] as [string, string][]).filter(([k]) => k));
  for (const u of d.units) for (const sn of [u.indoorSerial, u.outdoorSerial]) {
    const hit = sn.trim() && have.get(sn.trim().toUpperCase());
    if (hit) return `Serial ${sn.trim()} is already registered on ${hit}.`;
  }
  return null;
}

export const MAX_FILE_BYTES = 1_500_000;
