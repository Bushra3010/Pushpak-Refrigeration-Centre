"use client";

/* Demo data store shared by the customer app, technician app and admin panel.
 *
 * State lives in localStorage so all three apps (even in different tabs) see
 * the same customers, jobs and stock — book in the customer app, dispatch in
 * admin, work the job on the technician app. Every write goes through an
 * action below; when Supabase is wired in, these actions become the API calls
 * and the screens stay as they are. */

import { useSyncExternalStore } from "react";
import {
  EMPTY_DIAGNOSIS, EMPTY_PREWORK, JOB_FLOW, acLabel, fmtDate, inr, isoDay, jobTotals, nowIso, seedDb, stepOf,
  type AcUnit, type Complaint, type Customer, type Db, type Job, type JobStatus, type LeadStatus, type Part, type PayMethod,
  type PreWork, type QuoteLine, type Settings, type Technician,
} from "./data";

const KEY = "prc:db:v1";

let state: Db | null = null;
const listeners = new Set<() => void>();
let serverSnap: Db | null = null;

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch { /* storage blocked or corrupt — fall back to seed */ }
  return seedDb();
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
}

const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  // Another tab (e.g. admin) changed the data → pick it up here.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    state = e.newValue ? (JSON.parse(e.newValue) as Db) : seedDb();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

const getSnapshot = () => (state ??= load());
const getServerSnapshot = () => (serverSnap ??= seedDb());

export function useDb(): Db {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Copy-on-write update: every action edits a fresh clone, then everyone re-renders. */
function mutate(fn: (d: Db) => void) {
  const next = structuredClone(getSnapshot());
  fn(next);
  state = next;
  persist();
  emit();
}

const nextId = (d: Db, prefix: string) => `${prefix}${++d.seq}`;
const uid = () => Math.random().toString(36).slice(2, 9);

function audit(d: Db, who: string, action: string, detail: string) {
  d.audit.unshift({ id: uid(), at: nowIso(), who, action, detail });
}

function notify(d: Db, to: string, title: string, body: string, jobId?: string) {
  d.notifications.unshift({ id: uid(), at: nowIso(), to, title, body, jobId, read: false });
}

const findJob = (d: Db, id: string) => d.jobs.find((j) => j.id === id)!;
const techName = (d: Db, id: string | null) => d.techs.find((t) => t.id === id)?.name ?? "Technician";
const custName = (d: Db, id: string) => d.customers.find((c) => c.id === id)?.name ?? "Customer";

function stamp(j: Job, status: JobStatus, by: string, note?: string) {
  j.status = status;
  j.timeline.push({ status, at: nowIso(), by, note });
}

/* ───────────────────────── Customers & ACs ───────────────────────── */

export type NewCustomer = Omit<Customer, "id" | "createdAt" | "amc" | "status"> & { status?: Customer["status"] };

export function addCustomer(c: NewCustomer, by: string): string {
  let id = "";
  mutate((d) => {
    id = `c${++d.seq}`;
    d.customers.unshift({ ...c, id, status: c.status ?? "New", createdAt: nowIso(), amc: null });
    audit(d, by, "Customer created", `${c.name} · ${c.phone}`);
  });
  return id;
}

export function updateCustomer(id: string, patch: Partial<Customer>, by: string) {
  mutate((d) => {
    const c = d.customers.find((x) => x.id === id)!;
    const changed = Object.keys(patch).filter((k) => JSON.stringify(c[k as keyof Customer]) !== JSON.stringify(patch[k as keyof Customer]));
    Object.assign(c, patch);
    if (changed.length) audit(d, by, "Customer edited", `${c.name}: ${changed.join(", ")}`);
  });
}

/** Moves ACs and jobs of `dropId` onto `keepId` and hides the duplicate. */
export function mergeCustomers(keepId: string, dropId: string, by: string) {
  mutate((d) => {
    const keep = d.customers.find((c) => c.id === keepId)!;
    const drop = d.customers.find((c) => c.id === dropId)!;
    d.acs.forEach((a) => { if (a.customerId === dropId) a.customerId = keepId; });
    d.jobs.forEach((j) => { if (j.customerId === dropId) j.customerId = keepId; });
    if (!keep.altPhone && drop.phone !== keep.phone) keep.altPhone = drop.phone;
    drop.mergedInto = keepId;
    audit(d, by, "Customers merged", `${drop.name} (${drop.phone}) → ${keep.name} (${keep.phone})`);
  });
}

export function addAc(ac: Omit<AcUnit, "id">, by: string): string {
  let id = "";
  mutate((d) => {
    id = `ac${++d.seq}`;
    d.acs.push({ ...ac, id });
    audit(d, by, "AC added", `${acLabel({ ...ac, id })} for ${custName(d, ac.customerId)}`);
  });
  return id;
}

export function updateAc(id: string, patch: Partial<AcUnit>, by: string) {
  mutate((d) => {
    const a = d.acs.find((x) => x.id === id)!;
    Object.assign(a, patch);
    audit(d, by, "AC edited", `${acLabel(a)} (${custName(d, a.customerId)})`);
  });
}

/* ───────────────────────── Jobs ───────────────────────── */

export interface NewJob {
  customerId: string; acId: string; date: string; slot: string; complaint: Complaint; preWork?: PreWork;
  priority?: Job["priority"]; source: Job["source"]; techId?: string | null;
}

export function createJob(input: NewJob, by: string): string {
  let id = "";
  mutate((d) => {
    id = `J-${++d.seq}`;
    const cust = d.customers.find((c) => c.id === input.customerId)!;
    const job: Job = {
      id, customerId: input.customerId, acId: input.acId, techId: null, status: "New Request",
      priority: input.priority ?? "Normal", source: input.source, createdAt: nowIso(), date: input.date, slot: input.slot,
      complaint: input.complaint, preWork: input.preWork ?? { ...EMPTY_PREWORK }, customerVerified: false,
      diagnosis: { ...EMPTY_DIAGNOSIS }, lines: [], discount: 0, quote: null,
      work: { serviceType: "", before: "", after: "", remarks: "" }, invoice: null, payments: [], followUp: null, notes: [],
      timeline: [{ status: "New Request", at: nowIso(), by }],
    };
    d.jobs.unshift(job);
    notify(d, "admin", `New service request · ${input.source}`, `${id} · ${cust.name} · ${input.complaint.issues.join(", ")}`, id);
    notify(d, `customer:${cust.id}`, "Service request received", `${id} for ${fmtDate(input.date)}, ${input.slot}. We'll assign a technician shortly.`, id);
    if (input.techId) doAssign(d, job, input.techId, by);
  });
  return id;
}

function doAssign(d: Db, j: Job, techId: string, by: string) {
  const prev = j.techId;
  j.techId = techId;
  const t = d.techs.find((x) => x.id === techId)!;
  if (stepOf(j.status) <= stepOf("Accepted")) stamp(j, "Assigned", by, prev ? `Reassigned from ${techName(d, prev)}` : `Assigned to ${t.name}`);
  else j.timeline.push({ status: j.status, at: nowIso(), by, note: `Reassigned to ${t.name}` });
  notify(d, `tech:${techId}`, "New job assigned", `${j.id} · ${custName(d, j.customerId)} · ${j.complaint.issues.join(", ")} · ${fmtDate(j.date)}, ${j.slot}`, j.id);
  notify(d, `customer:${j.customerId}`, "Technician assigned", `${t.name} will visit on ${fmtDate(j.date)}, ${j.slot}.`, j.id);
  if (prev && prev !== techId) {
    notify(d, `tech:${prev}`, "Job reassigned", `${j.id} was moved to another technician.`, j.id);
    audit(d, by, "Job reassigned", `${j.id} ${techName(d, prev)} → ${t.name}`);
  }
}

export function assignJob(jobId: string, techId: string, by: string) {
  mutate((d) => doAssign(d, findJob(d, jobId), techId, by));
}

export function declineJob(jobId: string, reason: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    const name = techName(d, j.techId);
    j.techId = null;
    stamp(j, "New Request", name, `Declined: ${reason}`);
    notify(d, "admin", "Technician declined a job", `${j.id} · ${name}: ${reason}. Please reassign.`, j.id);
  });
}

/** Simple forward moves (Accepted, On the Way, Arrived, Diagnosis, Work Started …). */
export function setStatus(jobId: string, status: JobStatus, by: string, note?: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    stamp(j, status, by, note);
    const t = d.techs.find((x) => x.id === j.techId);
    if (status === "On the Way") notify(d, `customer:${j.customerId}`, "Technician on the way", `${t?.name} has started for your location.`, j.id);
    if (status === "Arrived") { j.arrivedAt = nowIso(); notify(d, `customer:${j.customerId}`, "Technician arrived", `${t?.name} has reached your location.`, j.id); }
    if (t && ["On the Way", "Arrived", "Diagnosis", "Work Started"].includes(status)) t.availability = "On Job";
  });
}

export function updateJob(jobId: string, patch: Partial<Job>) {
  mutate((d) => Object.assign(findJob(d, jobId), patch));
}

export function addJobNote(jobId: string, text: string, by: string) {
  mutate((d) => findJob(d, jobId).notes.push({ at: nowIso(), by, text }));
}

/** Technician sends the estimate — customer approves in their app, or on-site by OTP. */
export function sendQuote(jobId: string, by: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    const rev = j.quote ? j.quote.revision + (j.quote.status === "Draft" ? 0 : 1) : 1;
    j.quote = { no: `QTN-${j.id.slice(2)}${rev > 1 ? `-R${rev}` : ""}`, at: nowIso(), revision: rev, status: "Pending" };
    const total = jobTotals(j, d.settings).total;
    stamp(j, "Estimate Prepared", by, `${j.quote.no} · ${inr(total)}${rev > 1 ? ` (revision ${rev})` : ""}`);
    notify(d, `customer:${j.customerId}`, rev > 1 ? "Revised quotation needs approval" : "Quotation ready for approval", `${j.quote.no} · ${inr(total)}. Review and approve to start the work.`, j.id);
  });
}

export function decideQuote(jobId: string, approve: boolean, via: NonNullable<Job["quote"]>["approvedVia"], by: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    if (!j.quote) return;
    const total = jobTotals(j, d.settings).total;
    j.quote.status = approve ? "Approved" : "Rejected";
    j.quote.decidedAt = nowIso();
    if (approve) {
      j.quote.approvedVia = via;
      j.quote.approvedTotal = total;
      j.lines.forEach((l) => { l.addOn = false; });
      stamp(j, "Approved", by, `${j.quote.no} approved via ${via} · ${inr(total)}`);
    } else {
      j.timeline.push({ status: "Estimate Prepared", at: nowIso(), by, note: `${j.quote.no} rejected by customer` });
    }
    if (j.techId) notify(d, `tech:${j.techId}`, approve ? "Quotation approved" : "Quotation rejected", `${j.id} · ${custName(d, j.customerId)} · ${inr(total)}`, j.id);
  });
}

/** Extra work found after approval → back to the customer as a revised estimate (PRD §8). */
export function addOnWork(jobId: string, lines: QuoteLine[], by: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    j.lines.push(...lines.map((l) => ({ ...l, addOn: true })));
    const rev = (j.quote?.revision ?? 1) + 1;
    j.quote = { no: `QTN-${j.id.slice(2)}-R${rev}`, at: nowIso(), revision: rev, status: "Pending" };
    stamp(j, "Estimate Prepared", by, `Additional work: ${lines.map((l) => l.name).join(", ")}`);
    notify(d, `customer:${j.customerId}`, "Additional work needs your approval", `${j.quote.no} · new total ${inr(jobTotals(j, d.settings).total)}`, j.id);
  });
}

/** Close the visit with only the inspection charge after a rejected quote. */
export function visitChargeOnly(jobId: string, by: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    const v = d.services.find((s) => s.id === "sv-visit")!;
    j.lines = [{ id: uid(), kind: "Service", name: v.name, qty: 1, price: v.price, refId: v.id }];
    j.discount = 0;
    j.work = { ...j.work, serviceType: "Inspection only", remarks: j.work.remarks || "Customer declined the repair estimate." };
    stamp(j, "Work Completed", by, "Quotation rejected — visit charge only");
    doInvoice(d, j, by);
  });
}

export function completeWork(jobId: string, by: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    stamp(j, "Work Completed", by);
    // Parts leave the technician's van first, then the warehouse.
    const t = d.techs.find((x) => x.id === j.techId);
    j.lines.filter((l) => l.kind === "Part" && l.refId).forEach((l) => {
      let need = l.qty;
      if (t) { const inVan = t.van[l.refId!] ?? 0; const take = Math.min(inVan, need); t.van[l.refId!] = inVan - take; need -= take; }
      const p = d.parts.find((x) => x.id === l.refId);
      if (p && need > 0) p.stock = Math.max(0, p.stock - need);
      if (p && p.stock <= p.minStock) notify(d, "admin", "Low stock", `${p.name} — ${p.stock} ${p.unit} left in warehouse.`);
    });
    if (t) t.availability = "Available";
    doInvoice(d, j, by);
  });
}

function doInvoice(d: Db, j: Job, by: string) {
  j.invoice = { no: `INV-${j.id.slice(2)}`, at: nowIso() };
  const total = jobTotals(j, d.settings).total;
  stamp(j, "Invoiced", by, `${j.invoice.no} · ${inr(total)}`);
  notify(d, `customer:${j.customerId}`, "Job completed · invoice ready", `${j.invoice.no} · ${inr(total)}. Pay online or to the technician.`, j.id);
}

export function recordPayment(jobId: string, amount: number, method: PayMethod, ref: string, by: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    j.payments.push({ id: uid(), amount, method, ref, at: nowIso(), by });
    const t = jobTotals(j, d.settings);
    j.timeline.push({ status: j.status, at: nowIso(), by, note: `Payment ${inr(amount)} · ${method}${ref ? ` · ${ref}` : ""}${t.due > 0 ? ` · ${inr(t.due)} due` : " · fully paid"}` });
    if (t.due === 0 && j.status === "Invoiced") stamp(j, "Closed", by);
    notify(d, "admin", "Payment received", `${j.id} · ${custName(d, j.customerId)} · ${inr(amount)} ${method}`, j.id);
    if (by !== custName(d, j.customerId)) notify(d, `customer:${j.customerId}`, "Payment received — thank you!", `${inr(amount)} for ${j.invoice?.no ?? j.id}.`, j.id);
  });
}

export function refundPayment(jobId: string, amount: number, reason: string, by: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    j.payments.push({ id: uid(), amount, method: "Online", ref: reason, at: nowIso(), by, refund: true });
    audit(d, by, "Refund", `${j.id} · ${inr(amount)} · ${reason}`);
  });
}

export function closeJob(jobId: string, by: string, note?: string) {
  mutate((d) => { const j = findJob(d, jobId); stamp(j, "Closed", by, note); audit(d, by, "Job closed", `${j.id}${note ? ` · ${note}` : ""}`); });
}

export function setFollowUp(jobId: string, date: string, note: string, by: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    j.followUp = { date, note };
    j.timeline.push({ status: j.status, at: nowIso(), by, note: `Follow-up on ${fmtDate(date)}: ${note}` });
  });
}

export function cancelJob(jobId: string, reason: string, by: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    j.cancelReason = reason;
    stamp(j, "Cancelled", by, reason);
    if (j.techId) notify(d, `tech:${j.techId}`, "Job cancelled", `${j.id} · ${reason}`, j.id);
    notify(d, `customer:${j.customerId}`, "Service request cancelled", `${j.id} · ${reason}`, j.id);
    audit(d, by, "Job cancelled", `${j.id} · ${reason}`);
  });
}

export function rescheduleJob(jobId: string, date: string, slot: string, reason: string, by: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    j.date = date; j.slot = slot;
    j.timeline.push({ status: j.status, at: nowIso(), by, note: `Rescheduled to ${fmtDate(date)}, ${slot} — ${reason}` });
    notify(d, `customer:${j.customerId}`, "Visit rescheduled", `${j.id} is now on ${fmtDate(date)}, ${slot}.`, j.id);
    if (j.techId) notify(d, `tech:${j.techId}`, "Job rescheduled", `${j.id} → ${fmtDate(date)}, ${slot}`, j.id);
    audit(d, by, "Job rescheduled", `${j.id} → ${fmtDate(date)} · ${reason}`);
  });
}

export function setPriority(jobId: string, priority: Job["priority"], by: string) {
  mutate((d) => { const j = findJob(d, jobId); j.priority = priority; audit(d, by, "Priority changed", `${j.id} → ${priority}`); });
}

export function rateJob(jobId: string, stars: number) {
  mutate((d) => { const j = findJob(d, jobId); j.rating = stars; if (j.techId) notify(d, `tech:${j.techId}`, `Customer rated you ${stars}★`, `${j.id} · ${custName(d, j.customerId)}`, j.id); });
}

/* ───────────────────────── People, stock, settings ───────────────────────── */

export function addTech(t: Omit<Technician, "id" | "van" | "rating" | "joined">, by: string) {
  mutate((d) => { d.techs.push({ ...t, id: `t${++d.seq}`, van: {}, rating: 0, joined: isoDay(0) }); audit(d, by, "Technician added", t.name); });
}

export function updateTech(id: string, patch: Partial<Technician>, by: string) {
  mutate((d) => { const t = d.techs.find((x) => x.id === id)!; Object.assign(t, patch); audit(d, by, "Technician edited", `${t.name}: ${Object.keys(patch).join(", ")}`); });
}

export function addPart(p: Omit<Part, "id">, by: string) {
  mutate((d) => { d.parts.push({ ...p, id: `p${++d.seq}` }); audit(d, by, "Part added", `${p.sku} ${p.name}`); });
}

export function updatePart(id: string, patch: Partial<Part>, by: string) {
  mutate((d) => {
    const p = d.parts.find((x) => x.id === id)!;
    const bits: string[] = [];
    if (patch.price !== undefined && patch.price !== p.price) bits.push(`price ${inr(p.price)} → ${inr(patch.price)}`);
    if (patch.cost !== undefined && patch.cost !== p.cost) bits.push(`cost ${inr(p.cost)} → ${inr(patch.cost)}`);
    if (patch.minStock !== undefined && patch.minStock !== p.minStock) bits.push(`min stock ${p.minStock} → ${patch.minStock}`);
    Object.assign(p, patch);
    if (bits.length) audit(d, by, "Price edit", `${p.name}: ${bits.join(", ")}`);
  });
}

export function adjustStock(partId: string, delta: number, reason: string, by: string) {
  mutate((d) => {
    const p = d.parts.find((x) => x.id === partId)!;
    p.stock = Math.max(0, p.stock + delta);
    audit(d, by, "Stock adjustment", `${p.name} ${delta > 0 ? "+" : ""}${delta} ${p.unit} (${reason}) → ${p.stock}`);
  });
}

/** Warehouse → technician's van (negative qty returns stock). */
export function issueStock(partId: string, techId: string, qty: number, by: string) {
  mutate((d) => {
    const p = d.parts.find((x) => x.id === partId)!;
    const t = d.techs.find((x) => x.id === techId)!;
    const move = qty > 0 ? Math.min(qty, p.stock) : -Math.min(-qty, t.van[partId] ?? 0);
    p.stock -= move;
    t.van[partId] = (t.van[partId] ?? 0) + move;
    audit(d, by, move > 0 ? "Stock issued" : "Stock returned", `${p.name} ${Math.abs(move)} ${p.unit} ${move > 0 ? "→" : "←"} ${t.name}`);
  });
}

export function requestStock(techId: string, items: Record<string, number>) {
  mutate((d) => {
    const list = Object.entries(items).filter(([, n]) => n > 0).map(([id, n]) => `${d.parts.find((p) => p.id === id)?.name} × ${n}`);
    notify(d, "admin", `Stock request · ${techName(d, techId)}`, list.join(", "));
  });
}

export function updateService(id: string, patch: { price?: number; active?: boolean }, by: string) {
  mutate((d) => {
    const s = d.services.find((x) => x.id === id)!;
    if (patch.price !== undefined && patch.price !== s.price) audit(d, by, "Price edit", `${s.name} ${inr(s.price)} → ${inr(patch.price)}`);
    if (patch.active !== undefined && patch.active !== s.active) audit(d, by, "Service catalogue", `${s.name} ${patch.active ? "enabled" : "disabled"}`);
    Object.assign(s, patch);
  });
}

export function updateSettings(patch: Partial<Settings>, by: string) {
  mutate((d) => { Object.assign(d.settings, patch); audit(d, by, "Settings changed", Object.keys(patch).join(", ")); });
}

export function sellAmc(customerId: string, plan: "Basic" | "Comprehensive", by: string) {
  mutate((d) => {
    const c = d.customers.find((x) => x.id === customerId)!;
    const from = c.amc && c.amc.to > isoDay(0) ? c.amc.to : isoDay(0);
    const to = new Date(from); to.setFullYear(to.getFullYear() + 1);
    c.amc = { plan, from, to: to.toISOString().slice(0, 10), visitsLeft: 3 };
    d.leads[`amc:${customerId}`] = "Converted";
    audit(d, by, "AMC sold", `${c.name} · ${plan} · ${inr(plan === "Basic" ? d.settings.amcBasic : d.settings.amcComprehensive)}`);
    notify(d, `customer:${customerId}`, `AMC ${plan} activated`, `Valid till ${fmtDate(c.amc.to)} · 3 service visits included.`);
  });
}

export function setLead(key: string, status: LeadStatus, by: string) {
  mutate((d) => { d.leads[key] = status; audit(d, by, "Lead updated", `${key} → ${status}`); });
}

export function sendReminder(customerId: string, what: string, by: string) {
  mutate((d) => {
    notify(d, `customer:${customerId}`, "Service reminder", what);
    d.leads[`rem:${customerId}:${isoDay(0)}`] = "Contacted";
    audit(d, by, "Reminder sent", `${custName(d, customerId)} · ${what}`);
  });
}

export function markRead(to: string, id?: string) {
  mutate((d) => d.notifications.forEach((n) => { if (n.to === to && (!id || n.id === id)) n.read = true; }));
}

export function resetDemo() {
  state = seedDb();
  persist();
  emit();
}

export { JOB_FLOW };
