/* Customer 360 history: everything a customer asked us for (service jobs, spare-part samples, repairs,
 * spare-part enquiries), newest first, with whether it was done and how many days it took. */

import type { Db } from "./data";

export type HistoryItem = {
  kind: "Service" | "Sample" | "Repair" | "Part enquiry";
  id: string;
  title: string;
  at: string;              // when it came in
  doneAt: string | null;   // when it was finished
  status: string;
  state: "Done" | "Open" | "Cancelled";
  days: number;            // days taken (done) or days open so far
};

const dayDiff = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86400000));

export function customerHistory(db: Db, customerId: string | null, phone: string, now = new Date().toISOString()): HistoryItem[] {
  const p = phone.replace(/\D/g, "").slice(-10);
  const mine = (cid: string | null | undefined, ph: string | undefined) => (!!customerId && cid === customerId) || (!!p && (ph ?? "").replace(/\D/g, "").slice(-10) === p);
  const item = (x: Omit<HistoryItem, "days">): HistoryItem => ({ ...x, days: dayDiff(x.at, x.doneAt ?? now) });
  const out: HistoryItem[] = [];

  for (const j of db.jobs) {
    if (!mine(j.customerId, db.customers.find((c) => c.id === j.customerId)?.phone)) continue;
    const done = j.timeline.find((t) => t.status === "Work Completed") ?? j.timeline.find((t) => t.status === "Invoiced" || t.status === "Closed");
    const ac = db.acs.find((a) => a.id === j.acId);
    out.push(item({
      kind: "Service", id: j.id, title: `${j.complaint.issues.join(", ")}${ac ? ` · ${ac.category ?? "AC"} ${ac.brand}` : ""}`, at: j.createdAt,
      doneAt: j.status === "Cancelled" ? (j.timeline.at(-1)?.at ?? null) : (done?.at ?? null), status: j.status,
      state: j.status === "Cancelled" ? "Cancelled" : done ? "Done" : "Open",
    }));
  }
  for (const s of db.samples ?? []) {
    if (!mine(s.customer.customerId, s.customer.phone)) continue;
    const closed = s.status === "Closed" ? (s.timeline.filter((t) => t.text.startsWith("Closed")).at(-1)?.at ?? null) : null;
    const good = s.closeReason === "Part sold / fitted";
    out.push(item({
      kind: "Sample", id: s.id, title: `${s.brand} ${s.part}${s.model ? ` (${s.model})` : ""}`, at: s.receivedAt, doneAt: closed,
      status: s.status === "Closed" ? `Closed — ${s.closeReason}` : s.status, state: s.status === "Closed" ? (good ? "Done" : "Cancelled") : "Open",
    }));
  }
  for (const r of db.repairs ?? []) {
    if (!mine(r.customerId, r.customerPhone)) continue;
    const done = r.timeline.find((t) => t.status === "Repaired") ?? r.timeline.find((t) => t.status === "Returned");
    out.push(item({
      kind: "Repair", id: r.id, title: `${r.itemType} · ${r.brand}`, at: r.createdAt, doneAt: done?.at ?? null, status: r.status,
      state: done ? "Done" : "Open",
    }));
  }
  for (const e of db.partEnquiries ?? []) {
    if (!mine(e.customerId, e.phone)) continue;
    const end = e.history.find((h) => h.status === "Sold" || h.status === "Closed");
    out.push(item({
      kind: "Part enquiry", id: e.id, title: `${e.part} · ${e.category}`, at: e.at, doneAt: end?.at ?? null, status: e.status,
      state: e.status === "Sold" ? "Done" : e.status === "Closed" ? "Cancelled" : "Open",
    }));
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** "Done in 3 days" / "Open for 5 days" / "Cancelled". */
export const historyLabel = (h: HistoryItem) => h.state === "Done" ? (h.days === 0 ? "Done same day" : `Done in ${h.days} day${h.days === 1 ? "" : "s"}`) : h.state === "Open" ? `Open for ${h.days} day${h.days === 1 ? "" : "s"}` : "Cancelled / closed";
