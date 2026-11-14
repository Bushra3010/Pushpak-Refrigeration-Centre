/* PCB Board, Stabilizer & Indoor Coil repair register — items brought to the shop for repair,
 * repaired in-house or sent to an outside vendor (PCB and split-AC indoor coils). Entries are made
 * from either side: the technician who brings the item (technician app) or the shop staff who
 * receives it (admin panel). */

export const REPAIR_ITEM_TYPES = ["PCB Board", "Stabilizer", "Indoor Coil", "Other"] as const;
export type RepairItemType = (typeof REPAIR_ITEM_TYPES)[number];

export const REPAIR_MODES = ["In-house", "Out Source"] as const;
export type RepairMode = (typeof REPAIR_MODES)[number];
/** What the shop sends out: PCBs and split-AC indoor coils. */
export const OUTSOURCE_ITEMS: RepairItemType[] = ["PCB Board", "Indoor Coil", "Other"];

export const REPAIR_STATUSES = ["Received", "Under Diagnosis", "Repair Work in Progress", "Pending", "Repaired", "Repair Not Possible", "Returned"] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];
/** Screen names for the stored status values. */
export const STATUS_LABEL: Record<RepairStatus, string> = {
  Received: "Received", "Under Diagnosis": "Under Diagnosis", "Repair Work in Progress": "Repair In Progress", Pending: "On Hold",
  Repaired: "Repaired", "Repair Not Possible": "Repair Not Possible", Returned: "Returned",
};
/** What the repairing technician can set (Technician Repair Update). */
export const TECH_STATUSES: RepairStatus[] = ["Under Diagnosis", "Repair Work in Progress", "Repaired", "Pending", "Repair Not Possible"];
export const isHold = (s: RepairStatus) => s === "Pending" || s === "Repair Not Possible";
export const HOLD_REASONS = ["Fault Not Identified", "Part Not Available", "Board Damaged Beyond Repair", "Waiting for Vendor", "Customer Approval Pending", "Other"] as const;
export const NEXT_STEPS = ["Order Spare Part", "Send to Outside Repair Centre", "Second-Hand PCB", "New PCB", "Return Unrepaired to Customer", "Other"] as const;

export interface RepairPart { name: string; qty: number; unitCost: number }
/** Technician Repair Update — filled by the technician who repairs the item. */
export interface RepairWork {
  techId: string;
  techName: string;
  diagnosis: string;
  action: string;
  hold: { reason: string; nextStep: string; supplier: string; expectedDate: string; followUp: string } | null;
  parts: RepairPart[];
  hours: number | null;
  labour: number;
  other: number;
  updatedAt: string;
  by: string;
}
export const partsCost = (w: Pick<RepairWork, "parts">) => w.parts.reduce((s, p) => s + p.qty * p.unitCost, 0);
export const internalCost = (w: Pick<RepairWork, "parts" | "labour" | "other">) => partsCost(w) + (w.labour || 0) + (w.other || 0);
export const emptyWork = (): RepairWork => ({ techId: "", techName: "", diagnosis: "", action: "", hold: null, parts: [], hours: null, labour: 0, other: 0, updatedAt: "", by: "" });

export function validateWork(status: RepairStatus, w: RepairWork): string | null {
  if (!w.techName.trim()) return "Choose the technician doing the repair.";
  if (!TECH_STATUSES.includes(status)) return "Choose the repair status.";
  if (status !== "Under Diagnosis" && !w.diagnosis.trim()) return "Write the problem found / fault diagnosis.";
  if (status === "Repaired" && !w.action.trim()) return "Write the repair work done.";
  if (isHold(status)) {
    if (!w.hold?.reason) return "Choose the reason the repair failed / is on hold.";
    if (!w.hold.nextStep) return "Choose the next step.";
  }
  if (w.parts.some((p) => !p.name.trim() || !(p.qty > 0) || !(p.unitCost >= 0))) return "Each spare part needs a name, quantity and cost.";
  if ([w.labour, w.other].some((n) => !(n >= 0)) || (w.hours != null && !(w.hours >= 0))) return "Time and costs cannot be negative.";
  return null;
}

export const AC_CAPACITIES = ["1 Ton", "1.5 Ton", "2 Ton", "Other"] as const;
export const AC_TECH = ["Inverter", "Non-Inverter", "Not Sure"] as const;
export const APPLIANCES = ["AC", "Refrigerator", "Washing Machine", "Oven", "Other"] as const;
export const AC_TYPE_OPTIONS = ["Split AC", "Window AC", "Cassette AC", "Tower AC", "Ductable AC"] as const;
export const PCB_TYPES = ["Indoor PCB", "Outdoor PCB", "Indoor & Outdoor"] as const;
export const STAB_KVA = ["0.5 KVA", "1 KVA", "2 KVA", "4 KVA", "5 KVA"] as const;
export const STAB_TYPES = ["Mainline", "AC Stabilizer", "Refrigerator Stabilizer", "TV Stabilizer", "Servo Stabilizer", "Other"] as const;
/** Shown on screen for the stored repair-method values. */
export const MODE_LABEL: Record<RepairMode, string> = { "In-house": "In-House", "Out Source": "Outsourced" };
export const STAB_BOOST = ["Single Boost", "Double Boost"] as const;
/** Older entries stored AC accessories under these keys. */
const LEGACY_ACCESSORY: Record<string, string> = { sensor: "Sensor", remote: "Remote", case: "Case", indoorMotor: "Indoor Motor", outdoorMotor: "Outdoor Motor" };
export type Appliance = (typeof APPLIANCES)[number];
/** "Items received along with PCB board" — changes with the appliance. */
export const PCB_ITEMS: Record<Appliance, readonly string[]> = {
  AC: ["Sensor", "Remote", "Case", "Indoor Motor", "Outdoor Motor", "Transformer"],
  Refrigerator: ["Sensor", "Display Board", "Relay / OLP", "Transformer", "Case"],
  "Washing Machine": ["Display / Control Panel", "Water Level Sensor", "Door Lock", "Transformer", "Case"],
  Oven: ["Keypad / Touch Panel", "Transformer", "Case"],
  Other: [],
};
export const FRIDGE_TYPES = ["Single Door", "Double Door", "Side-by-Side", "French Door", "Other"] as const;
export const WASHER_TYPES = ["Top Load", "Front Load", "Semi-Automatic"] as const;
export const WASHER_KG = ["6 KG", "6.5 KG", "7 KG", "7.5 KG", "8 KG", "9 KG", "10 KG +"] as const;
export const OVEN_TYPES = ["Solo", "Grill", "Convection", "OTG", "Other"] as const;

export interface PcbDetails {
  /** appliance the PCB is from (older entries: AC) */
  appliance?: Appliance;
  /** AC fields */
  acType: string; capacity: (typeof AC_CAPACITIES)[number]; pcbType: (typeof PCB_TYPES)[number];
  tech: (typeof AC_TECH)[number];
  /** Refrigerator / Washing Machine / Oven type */
  kind?: string;
  /** Refrigerator & Oven capacity in litres */
  litres?: string;
  /** Washing machine */
  model?: string; kg?: string;
  /** Appliance = Other */
  applianceName?: string; otherItems?: string;
  /** items received along with the PCB, by name (older entries: legacy keys) */
  accessories: Record<string, boolean>;
}
export interface StabilizerDetails { /** older entries: AC Stabilizer */ type?: (typeof STAB_TYPES)[number]; otherType?: string; kva: (typeof STAB_KVA)[number]; boost: (typeof STAB_BOOST)[number] }
export const COIL_ITEMS = ["Only Indoor Coil", "Complete Indoor Unit", "Coil With Casing"] as const;
export const GAS_TYPES = ["R22", "R32", "R410A", "R134a", "R407C", "R290", "Other", "Unknown"] as const;
export const COIL_ACCESSORIES = ["Blower", "Fan Motor", "Drain Tray", "Casing", "Sensors"] as const;
export interface CoilDetails {
  /** older entries: Only Indoor Coil */
  item?: (typeof COIL_ITEMS)[number];
  acType: string; capacity: (typeof AC_CAPACITIES)[number]; tech: (typeof AC_TECH)[number];
  gas?: (typeof GAS_TYPES)[number];
  accessories?: Record<string, boolean>;
}

export interface RepairEvent { at: string; status: RepairStatus; by: string; note?: string }

export interface RepairEntry {
  id: string;
  createdAt: string;
  enteredBy: string;
  enteredAs: "Technician" | "Shop Staff";
  receivedDate: string;      // yyyy-mm-dd
  returnDate: string | null; // actual / promised return
  customerName: string;
  customerPhone: string;
  customerId?: string | null;
  techName: string;          // who brought the item in
  itemType: RepairItemType;
  /** name of the item when itemType is "Other" */
  otherItem?: string;
  brand: string;
  /** model number of the appliance (optional) */
  model?: string;
  issue: string;
  pcb?: PcbDetails;
  stabilizer?: StabilizerDetails;
  coil?: CoilDetails;
  /** small JPEG data URLs (demo: resized in the browser) */
  photos: string[];
  mode: RepairMode;
  vendor?: { name: string; phone: string; sentDate: string; expectedDate: string; charge: number | null };
  status: RepairStatus;
  pendingReason: string;
  delayReason: string;
  charge: number | null;     // amount charged to the customer, if known
  timeline: RepairEvent[];
  /** Technician Repair Update */
  work?: RepairWork;
  /** After "Repaired": testing → independent verification → physical shop return */
  qc?: RepairQc;
}

export const EMPTY_PCB: PcbDetails = { appliance: "AC", acType: "Split AC", capacity: "1.5 Ton", tech: "Inverter", pcbType: "Indoor PCB", accessories: {} };
export const EMPTY_STAB: StabilizerDetails = { type: "Mainline", kva: "4 KVA", boost: "Single Boost" };
export const EMPTY_COIL: CoilDetails = { item: "Only Indoor Coil", acType: "Split AC", capacity: "1.5 Ton", tech: "Inverter", gas: "R32", accessories: {} };

export type RepairDraft = Omit<RepairEntry, "id" | "createdAt" | "timeline" | "status" | "pendingReason" | "delayReason" | "work">;

export function validateRepair(d: RepairDraft): string | null {
  if (!d.customerName.trim()) return "Enter the customer name.";
  if (!/^\d{10}$/.test(d.customerPhone.replace(/\D/g, ""))) return "Enter a 10-digit mobile number.";
  if (!d.techName.trim()) return "Enter who brought the item.";
  if (d.itemType === "Stabilizer" && d.stabilizer?.type === "Other" && !d.stabilizer.otherType?.trim()) return "Enter the stabilizer type.";
  if (d.itemType === "Other" && !d.otherItem?.trim()) return "Enter the name of the item received.";
  if (d.itemType === "PCB Board" && d.pcb?.appliance === "Other" && !d.pcb.applianceName?.trim()) return "Enter the appliance name.";
  if (!d.brand.trim()) return "Enter the brand name.";
  if (!d.issue.trim()) return "Describe the reported problem.";
  if (!d.receivedDate) return "Enter the receive date.";
  if (d.mode === "Out Source" && !d.vendor?.name.trim()) return "Enter the outside vendor's name.";
  return null;
}

/** One-line description for lists and WhatsApp messages. */
export function repairItemLabel(r: RepairEntry): string {
  if (r.itemType === "PCB Board" && r.pcb) return (r.pcb.appliance ?? "AC") === "AC" ? `${r.brand} ${r.pcb.capacity} ${r.pcb.tech} · ${r.pcb.pcbType}` : `${r.brand} ${r.pcb.appliance === "Other" ? r.pcb.applianceName : r.pcb.appliance} PCB${r.pcb.kind ? ` · ${r.pcb.kind}` : ""}`;
  if (r.itemType === "Other") return `${r.brand} ${r.otherItem ?? ""}`.trim();
  if (r.itemType === "Stabilizer" && r.stabilizer) return `${r.brand} ${r.stabilizer.type === "Other" ? r.stabilizer.otherType || "Stabilizer" : r.stabilizer.type ?? "AC Stabilizer"} ${r.stabilizer.kva} · ${r.stabilizer.boost}`;
  if (r.itemType === "Indoor Coil" && r.coil) return `${r.brand} ${r.coil.capacity} ${r.coil.tech} · ${r.coil.item ?? "Only Indoor Coil"}${r.coil.gas ? ` · ${r.coil.gas}` : ""}`;
  return r.brand;
}

export function accessoriesText(p: PcbDetails): string {
  const yes = [...Object.keys(p.accessories).filter((k) => p.accessories[k]).map((k) => LEGACY_ACCESSORY[k] ?? k), ...(p.otherItems?.trim() ? [p.otherItems.trim()] : [])];
  return yes.length ? `With ${yes.join(", ")}` : "No items with the PCB";
}

/** "Refrigerator · Double Door · 260 L · Inverter" — the appliance line for any PCB entry. */
export function pcbApplianceLine(p: PcbDetails): string {
  const a = p.appliance ?? "AC";
  if (a === "AC") return `${p.acType} · ${p.capacity} · ${p.pcbType} · ${p.tech}`;
  if (a === "Refrigerator") return ["Refrigerator", p.kind, p.litres && `${p.litres} L`, p.tech].filter(Boolean).join(" · ");
  if (a === "Washing Machine") return ["Washing Machine", p.kind, p.kg, p.model, p.tech].filter(Boolean).join(" · ");
  if (a === "Oven") return ["Oven", p.kind, p.litres && `${p.litres} L`, p.tech].filter(Boolean).join(" · ");
  return [p.applianceName || "Other appliance", p.tech].filter(Boolean).join(" · ");
}

/** Days an item has been with the shop (or with the vendor), from the receive date. */
export const daysHeld = (r: RepairEntry, today: string) => Math.max(0, Math.round((Date.parse(today) - Date.parse(r.receivedDate)) / 86400000));

/** Open for more than 7 days and not yet repaired/returned. */
export const isDelayed = (r: RepairEntry, today: string) => !["Repaired", "Returned", "Repair Not Possible"].includes(r.status) && daysHeld(r, today) > 7;

export function seedRepairs(today: (offset: number) => string, now: string): RepairEntry[] {
  const ev = (status: RepairStatus, by: string, daysAgo: number, note?: string): RepairEvent => ({ at: `${today(-daysAgo)}T10:30:00`, status, by, note });
  return [
    {
      id: "R-101", createdAt: `${today(-9)}T11:05:00`, enteredBy: "Rohit Kumar", enteredAs: "Technician", receivedDate: today(-9), returnDate: null,
      customerName: "Rajesh Sharma", customerPhone: "9876543210", customerId: "c1", techName: "Rohit Kumar", itemType: "PCB Board", brand: "Daikin", issue: "Indoor unit not powering on, no display. Suspect burnt PCB track.",
      pcb: { acType: "Split AC", capacity: "1.5 Ton", tech: "Inverter", pcbType: "Indoor PCB", accessories: { sensor: true, remote: false, case: true, indoorMotor: false, outdoorMotor: false } },
      photos: [], mode: "Out Source", vendor: { name: "Sharma Electronics, Lajpat Nagar", phone: "9811000111", sentDate: today(-8), expectedDate: today(-2), charge: 1800 },
      status: "Pending", pendingReason: "Vendor waiting for IC from Delhi market", delayReason: "Part not available — expected 3 more days", charge: 2800,
      timeline: [ev("Received", "Rohit Kumar", 9), ev("Repair Work in Progress", "Shop Staff", 8, "Sent to Sharma Electronics"), ev("Pending", "Shop Staff", 3, "Vendor waiting for IC")],
    },
    {
      id: "R-102", createdAt: `${today(-4)}T16:20:00`, enteredBy: "Shop Staff", enteredAs: "Shop Staff", receivedDate: today(-4), returnDate: null,
      customerName: "Priya Mehta", customerPhone: "9876543211", customerId: "c2", techName: "Amit Sharma", itemType: "Stabilizer", brand: "V-Guard", issue: "Output voltage fluctuating; relay clicking continuously.",
      stabilizer: { kva: "5 KVA", boost: "Double Boost" }, photos: [], mode: "In-house", status: "Repair Work in Progress", pendingReason: "", delayReason: "", charge: 650,
      timeline: [ev("Received", "Shop Staff", 4), ev("Repair Work in Progress", "Shop Staff", 2, "Relay and transformer tap being replaced")],
    },
    {
      id: "R-103", createdAt: `${today(-12)}T09:40:00`, enteredBy: "Rohit Kumar", enteredAs: "Technician", receivedDate: today(-12), returnDate: today(-5),
      customerName: "Imran Khan", customerPhone: "9876543213", customerId: null, techName: "Rohit Kumar", itemType: "Indoor Coil", brand: "LG", issue: "Gas leak at the U-bend of the indoor coil; two pinholes found on pressure test.",
      coil: { acType: "Split AC", capacity: "1 Ton", tech: "Non-Inverter" }, photos: [], mode: "Out Source",
      vendor: { name: "Coil Care Works, Okhla", phone: "9899000222", sentDate: today(-11), expectedDate: today(-6), charge: 1200 },
      status: "Returned", pendingReason: "", delayReason: "", charge: 2200,
      timeline: [ev("Received", "Rohit Kumar", 12), ev("Repair Work in Progress", "Shop Staff", 11, "Sent to Coil Care Works"), ev("Repaired", "Shop Staff", 6, "Brazed and pressure tested at 350 psi"), ev("Returned", "Rohit Kumar", 5, "Fitted back at customer site")],
    },
    {
      id: "R-104", createdAt: `${today(0)}T09:10:00`, enteredBy: "Shop Staff", enteredAs: "Shop Staff", receivedDate: today(0), returnDate: null,
      customerName: "Sunita Verma", customerPhone: "9810098765", customerId: "c4", techName: "Walk-in customer", itemType: "PCB Board", brand: "Voltas", issue: "Outdoor unit compressor not starting; PCB relay burnt.",
      pcb: { acType: "Split AC", capacity: "2 Ton", tech: "Non-Inverter", pcbType: "Outdoor PCB", accessories: { sensor: false, remote: false, case: false, indoorMotor: false, outdoorMotor: false } },
      photos: [], mode: "In-house", status: "Received", pendingReason: "", delayReason: "", charge: null,
      timeline: [{ at: now, status: "Received", by: "Shop Staff" }],
    },
  ];
}

/* ───────────── After repair: testing → independent verification → shop return ───────────── */

/** Bench tests by item type. */
export const TEST_CHECKS: Record<RepairItemType, readonly string[]> = {
  "PCB Board": ["Power ON / display working", "Output voltages OK", "Relays & sensors responding", "Load / running test done", "No heating or burning smell"],
  Stabilizer: ["Input / output voltage OK", "Cut-off & time delay working", "Relay switching OK", "Load test done", "Display / indicators working"],
  "Indoor Coil": ["Pressure test passed (no leak)", "Vacuum held", "Fins & U-bends OK", "Drain path clear"],
  Other: ["Basic function test passed", "No heating / noise", "Load test done"],
};
export const VERIFY_CHECKS = ["Test result re-checked and confirmed", "Physical condition OK — no new damage", "All received accessories present", "Repair ID tag / label attached", "Packed and ready to hand over"] as const;
export const RETURN_TO = ["Customer (walk-in)", "Technician — for fitting at site", "Courier / delivery"] as const;
export const PAY_MODES = ["Cash", "UPI", "Card", "Bank Transfer", "Pending / Credit", "No charge (warranty)"] as const;

export interface RepairQc {
  test?: { by: string; date: string; checks: string[]; minutes: number | null; result: "Pass" | "Fail"; remarks: string; at: string };
  verify?: { by: string; date: string; checks: string[]; result: "Approved" | "Rejected"; remarks: string; at: string };
  outward?: { to: (typeof RETURN_TO)[number]; receivedBy: string; receivedPhone: string; handedBy: string; date: string; accessories: string[]; charge: number | null; payMode: (typeof PAY_MODES)[number]; remarks: string; at: string };
}

export type QcStage = "Testing" | "Verification" | "Ready for Return" | "Returned";
/** Where a repaired item is in the after-repair flow (null while still being repaired). */
export function qcStage(r: Pick<RepairEntry, "status" | "qc">): QcStage | null {
  if (r.status === "Returned") return "Returned";
  if (r.status !== "Repaired") return null;
  if (!r.qc?.test || r.qc.test.result === "Fail") return "Testing";
  if (!r.qc.verify || r.qc.verify.result === "Rejected") return "Verification";
  return "Ready for Return";
}

/** Items that came in with the entry (for the return checklist). */
export function receivedItems(r: RepairEntry): string[] {
  if (r.pcb) { const t = accessoriesText(r.pcb); return t.startsWith("With ") ? t.slice(5).split(", ") : []; }
  if (r.coil) return Object.keys(r.coil.accessories ?? {}).filter((k) => r.coil!.accessories![k]);
  return [];
}
