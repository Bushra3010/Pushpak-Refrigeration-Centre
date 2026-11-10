/* Staff Welfare & Facilities — technician mess LPG cylinders, room rent, and the shop-staff task list
 * those two feed automatically (rent due on a fixed date, LPG about to run out). */

import { addDays } from "./samples";

export const CYLINDER_SIZES = ["14.2", "19", "5"] as const;
export const CYLINDER_KIND: Record<(typeof CYLINDER_SIZES)[number], string> = { "14.2": "Domestic", "19": "Commercial", "5": "Small (FTL)" };
/** Used until two cylinders have been finished. */
export const DEFAULT_CYLINDER_DAYS = 30;
/** A refill task opens when this many days (or fewer) are estimated to be left. */
export const LPG_ALERT_DAYS = 3;

export interface LpgCylinder {
  id: string;
  no: string; // "LPG-025"
  sizeKg: (typeof CYLINDER_SIZES)[number];
  start: string; // ISO day
  end: string | null; // ISO day once finished
  people: number; // technicians eating at the mess
  cost: number | null;
  vendor: string;
  note: string;
  by: string;
  byRole: "Admin" | "Technician";
  createdAt: string;
}

export interface LpgDraft { no: string; sizeKg: LpgCylinder["sizeKg"]; start: string; people: number; cost: number | null; vendor: string; note: string }

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);

export function validateLpg(d: LpgDraft, current: LpgCylinder | undefined, today: string): string | null {
  if (!d.no.trim()) return "Enter the cylinder number.";
  if (!d.start) return "Pick the start date.";
  if (d.start > today) return "Start date cannot be in the future.";
  if (!(d.people >= 1 && d.people <= 50)) return "Technicians covered must be between 1 and 50.";
  if (d.cost != null && d.cost < 0) return "Cost cannot be negative.";
  if (current && d.start < current.start) return `The current cylinder ${current.no} started on ${current.start} — the new one must start on or after that day.`;
  return null;
}

export const currentCylinder = (list: LpgCylinder[]) => list.find((c) => !c.end);
export const finishedCylinders = (list: LpgCylinder[]) => list.filter((c) => c.end).sort((a, b) => b.start.localeCompare(a.start));
export const daysOf = (c: LpgCylinder, today: string) => Math.max(0, dayDiff(c.start, c.end ?? today));

/** Average life (days) of the last six finished cylinders, with the min–max range. */
export function lpgStats(list: LpgCylinder[], today: string) {
  const done = finishedCylinders(list).slice(0, 6).map((c) => daysOf(c, today)).filter((n) => n > 0);
  const avg = done.length ? Math.round(done.reduce((s, n) => s + n, 0) / done.length) : DEFAULT_CYLINDER_DAYS;
  const min = done.length ? Math.min(...done) : 28;
  const max = done.length ? Math.max(...done) : 32;
  const cur = currentCylinder(list);
  const used = cur ? daysOf(cur, today) : 0;
  const peopleList = finishedCylinders(list).slice(0, 6).map((c) => c.people);
  const costs = list.filter((c) => c.cost != null && c.start.slice(0, 4) === today.slice(0, 4)).map((c) => c.cost!);
  return {
    avg, min, max, basedOn: done.length,
    current: cur, used, balance: cur ? Math.max(0, avg - used) : 0, expectedEnd: cur ? addDays(cur.start, avg) : null,
    perMonth: Math.round((30 / avg) * 10) / 10, perYearMin: Math.floor(365 / max), perYearMax: Math.ceil(365 / min),
    peopleMin: peopleList.length ? Math.min(...peopleList) : cur?.people ?? 0, peopleMax: peopleList.length ? Math.max(...peopleList) : cur?.people ?? 0,
    spentThisYear: costs.reduce((s, n) => s + n, 0),
  };
}

export const nextCylinderNo = (list: LpgCylinder[]) => `LPG-${String(list.reduce((m, c) => Math.max(m, Number(c.no.replace(/\D/g, "")) || 0), 0) + 1).padStart(3, "0")}`;

/* ───────────── Room rent (admin only) ───────────── */

export const STAFF_ROLES = ["Accounts", "Service Coordinator"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const RENT_MODES = ["Cash", "UPI", "Bank Transfer", "Cheque"] as const;

export interface RentRoom {
  id: string;
  label: string; // "Technician room — Laxmi Nagar"
  landlord: string;
  phone: string;
  amount: number;
  dueDay: number; // 1–28, every month
  remindBefore: number; // task appears this many days before the due date
  assignTo: StaffRole;
  active: boolean;
  note: string;
}
export type RoomDraft = Omit<RentRoom, "id">;
export const emptyRoom = (): RoomDraft => ({ label: "", landlord: "", phone: "", amount: 0, dueDay: 5, remindBefore: 2, assignTo: "Accounts", active: true, note: "" });

export interface RentPayment { id: string; roomId: string; month: string; paidOn: string; amount: number; mode: (typeof RENT_MODES)[number]; ref: string; by: string }

export function validateRoom(d: RoomDraft): string | null {
  if (!d.label.trim()) return "Enter the room / property name.";
  if (!d.landlord.trim()) return "Enter the landlord's name.";
  if (d.phone && !/^\d{10}$/.test(d.phone)) return "Landlord mobile must be 10 digits.";
  if (!(d.amount > 0)) return "Enter the monthly rent.";
  if (!(d.dueDay >= 1 && d.dueDay <= 28)) return "Due day must be between 1 and 28.";
  if (!(d.remindBefore >= 0 && d.remindBefore <= 10)) return "Reminder must be 0–10 days before.";
  return null;
}

export const rentDueDate = (room: RentRoom, month: string) => `${month}-${String(room.dueDay).padStart(2, "0")}`;

/* ───────────── Shop-staff tasks (created automatically) ───────────── */

export interface StaffTask {
  id: string;
  key: string; // dedupe: "rent:<roomId>:<YYYY-MM>" | "lpg:<cylinderId>"
  kind: "Room Rent" | "LPG Refill";
  title: string;
  detail: string;
  due: string;
  assignTo: StaffRole;
  status: "Open" | "Done";
  createdAt: string;
  doneAt?: string;
  doneBy?: string;
  note?: string;
}

/** Tasks that should exist today but don't yet. Pure — the store adds them. */
export function dueTasks(input: { rooms: RentRoom[]; cylinders: LpgCylinder[]; tasks: StaffTask[] }, today: string): Omit<StaffTask, "id" | "createdAt" | "status">[] {
  const have = new Set(input.tasks.map((t) => t.key));
  const out: Omit<StaffTask, "id" | "createdAt" | "status">[] = [];
  const month = today.slice(0, 7);
  for (const r of input.rooms.filter((x) => x.active)) {
    const due = rentDueDate(r, month);
    const key = `rent:${r.id}:${month}`;
    if (have.has(key) || addDays(due, -r.remindBefore) > today) continue;
    out.push({ key, kind: "Room Rent", title: `Pay room rent — ${r.label}`, detail: `₹${r.amount.toLocaleString("en-IN")} to ${r.landlord}${r.phone ? ` (${r.phone})` : ""} for ${month}`, due, assignTo: r.assignTo });
  }
  const s = lpgStats(input.cylinders, today);
  if (s.current && s.balance <= LPG_ALERT_DAYS && !have.has(`lpg:${s.current.id}`)) {
    out.push({ key: `lpg:${s.current.id}`, kind: "LPG Refill", title: "Book the next LPG cylinder for the mess", detail: `${s.current.no} has about ${s.balance} day${s.balance === 1 ? "" : "s"} left (started ${s.current.start}).`, due: s.expectedEnd!, assignTo: "Service Coordinator" });
  }
  return out;
}
