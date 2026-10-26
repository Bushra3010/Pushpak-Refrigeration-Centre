/* PCB Board, Stabilizer & Indoor Coil repair register — items brought to the shop for repair,
 * repaired in-house or sent to an outside vendor (PCB and split-AC indoor coils). Entries are made
 * from either side: the technician who brings the item (technician app) or the shop staff who
 * receives it (admin panel). */

export const REPAIR_ITEM_TYPES = ["PCB Board", "Stabilizer", "Indoor Coil"] as const;
export type RepairItemType = (typeof REPAIR_ITEM_TYPES)[number];

export const REPAIR_MODES = ["In-house", "Out Source"] as const;
export type RepairMode = (typeof REPAIR_MODES)[number];
/** What the shop sends out: PCBs and split-AC indoor coils. */
export const OUTSOURCE_ITEMS: RepairItemType[] = ["PCB Board", "Indoor Coil"];

export const REPAIR_STATUSES = ["Received", "Repair Work in Progress", "Pending", "Repaired", "Returned"] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export const AC_CAPACITIES = ["1 Ton", "1.5 Ton", "2 Ton"] as const;
export const AC_TECH = ["Inverter", "Non-Inverter"] as const;
export const PCB_TYPES = ["Indoor PCB", "Outdoor PCB", "Indoor & Outdoor"] as const;
export const STAB_KVA = ["4 KVA", "5 KVA"] as const;
export const STAB_BOOST = ["Single Boost", "Double Boost"] as const;
export const PCB_ACCESSORIES = { sensor: "Sensor", remote: "Remote", case: "Case", indoorMotor: "Indoor Motor", outdoorMotor: "Outdoor Motor" } as const;
export type PcbAccessory = keyof typeof PCB_ACCESSORIES;

export interface PcbDetails { acType: string; capacity: (typeof AC_CAPACITIES)[number]; tech: (typeof AC_TECH)[number]; pcbType: (typeof PCB_TYPES)[number]; accessories: Record<PcbAccessory, boolean> }
export interface StabilizerDetails { kva: (typeof STAB_KVA)[number]; boost: (typeof STAB_BOOST)[number] }
export interface CoilDetails { acType: string; capacity: (typeof AC_CAPACITIES)[number]; tech: (typeof AC_TECH)[number] }

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
  brand: string;
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
}

export const EMPTY_PCB: PcbDetails = { acType: "Split AC", capacity: "1.5 Ton", tech: "Inverter", pcbType: "Indoor PCB", accessories: { sensor: false, remote: false, case: false, indoorMotor: false, outdoorMotor: false } };
export const EMPTY_STAB: StabilizerDetails = { kva: "4 KVA", boost: "Single Boost" };
export const EMPTY_COIL: CoilDetails = { acType: "Split AC", capacity: "1.5 Ton", tech: "Non-Inverter" };

export type RepairDraft = Omit<RepairEntry, "id" | "createdAt" | "timeline" | "status" | "pendingReason" | "delayReason">;

export function validateRepair(d: RepairDraft): string | null {
  if (!d.customerName.trim()) return "Enter the customer name.";
  if (!/^\d{10}$/.test(d.customerPhone.replace(/\D/g, ""))) return "Enter a 10-digit mobile number.";
  if (!d.techName.trim()) return "Enter who brought the item.";
  if (!d.brand.trim()) return "Enter the brand name.";
  if (!d.issue.trim()) return "Describe the problem / issue.";
  if (!d.receivedDate) return "Enter the receive date.";
  if (d.mode === "Out Source" && !d.vendor?.name.trim()) return "Enter the outside vendor's name.";
  return null;
}

/** One-line description for lists and WhatsApp messages. */
export function repairItemLabel(r: RepairEntry): string {
  if (r.itemType === "PCB Board" && r.pcb) return `${r.brand} ${r.pcb.capacity} ${r.pcb.tech} · ${r.pcb.pcbType}`;
  if (r.itemType === "Stabilizer" && r.stabilizer) return `${r.brand} ${r.stabilizer.kva} · ${r.stabilizer.boost}`;
  if (r.itemType === "Indoor Coil" && r.coil) return `${r.brand} ${r.coil.capacity} ${r.coil.tech} indoor coil`;
  return r.brand;
}

export function accessoriesText(p: PcbDetails): string {
  const yes = (Object.keys(PCB_ACCESSORIES) as PcbAccessory[]).filter((k) => p.accessories[k]).map((k) => PCB_ACCESSORIES[k]);
  return yes.length ? `With ${yes.join(", ")}` : "No accessories";
}

/** Days an item has been with the shop (or with the vendor), from the receive date. */
export const daysHeld = (r: RepairEntry, today: string) => Math.max(0, Math.round((Date.parse(today) - Date.parse(r.receivedDate)) / 86400000));

/** Open for more than 7 days and not yet repaired/returned. */
export const isDelayed = (r: RepairEntry, today: string) => !["Repaired", "Returned"].includes(r.status) && daysHeld(r, today) > 7;

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
