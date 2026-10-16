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
  isOpen, type AcUnit, type Complaint, type Customer, type Db, type Job, type JobStatus, type LeadStatus, type Part, type PayMethod,
  type PreWork, type QuoteLine, type Settings, type Technician,
} from "./data";
import { buildPayrollRun } from "./finance";
import type { Advance, AttendanceMark, Deduction, Expense, FinanceSettings, Holiday, Incentive, SalaryRecord, SavedCalc, TimeLog } from "./finance-types";
import { upgradeDb, withFinanceSeed } from "./finance-seed";

const KEY = "prc:db:v1";
const fresh = () => withFinanceSeed(seedDb());

let state: Db | null = null;
const listeners = new Set<() => void>();
let serverSnap: Db | null = null;

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = upgradeDb(JSON.parse(raw) as Db);
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage blocked */ }
      return db;
    }
  } catch { /* storage blocked or corrupt — fall back to seed */ }
  return fresh();
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
    state = e.newValue ? upgradeDb(JSON.parse(e.newValue) as Db) : fresh();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

const getSnapshot = () => (state ??= load());
const getServerSnapshot = () => (serverSnap ??= fresh());

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
    stopJobTimers(d, j.id, by);
    j.lines.filter((l) => l.kind === "Part" && l.refId).forEach((l) => {
      l.unitCost = d.parts.find((x) => x.id === l.refId)?.cost; // material cost recognised at consumption
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
  state = fresh();
  persist();
  emit();
}

/* ───────────────────────── Finance add-on ─────────────────────────
 * Actions that can be refused return an error message (string) instead of
 * throwing; null means done. Approved payroll months are locked. */

type Err = string | null;

/** Local ISO with seconds — timers need sub-minute precision. */
const nowSec = () => { const d = new Date(); return `${nowIso()}:${String(d.getSeconds()).padStart(2, "0")}`; };
const lockedMonth = (d: Db, iso: string) => d.payrollRuns.some((r) => r.month === iso.slice(0, 7) && r.status === "Approved");
const lockMsg = (iso: string) => `Payroll for ${iso.slice(0, 7)} is approved — that month is locked.`;
const onJob = (j: Job, techId: string) => j.techId === techId || (j.helpers ?? []).includes(techId);
const overlapsAny = (d: Db, techId: string, start: string, end: string | null, ignore?: string) =>
  d.timeLogs.some((l) => l.id !== ignore && l.techId === techId && l.status !== "Rejected" && l.start < (end ?? "9999") && start < (l.end ?? "9999"));

function stopJobTimers(d: Db, jobId: string, by: string) {
  d.timeLogs.forEach((l) => { if (l.jobId === jobId && l.status === "Running") { l.end = nowSec(); l.status = "Submitted"; l.note = `${l.note ?? ""} stopped by ${by}`.trim(); } });
}

export type TimerAction = "travel" | "work" | "pause" | "resume" | "stop";

/** Technician timer. Server clock in the real app; one running segment per technician, never overlapping. */
export function timerAction(techId: string, jobId: string | null, action: TimerAction, by: string): Err {
  let err: Err = null;
  mutate((d) => {
    const now = nowSec();
    if (lockedMonth(d, now)) { err = lockMsg(now); return; }
    const running = d.timeLogs.find((l) => l.techId === techId && l.status === "Running");
    if (action === "travel" || action === "work" || action === "resume") {
      const j = jobId ? d.jobs.find((x) => x.id === jobId) : undefined;
      if (!j || !onJob(j, techId)) { err = "You are not assigned to this job."; return; }
      if (!isOpen(j)) { err = `Job is ${j.status} — timers run only on open jobs.`; return; }
    } else if (!running) { err = "No timer is running."; return; }
    if (action === "pause" && running?.kind === "Break") { err = "Already on a break."; return; }
    if (running) { running.end = now; running.status = "Submitted"; }
    if (action === "stop") return;
    const kind = action === "travel" ? "Travel" : action === "pause" ? "Break" : "Work";
    d.timeLogs.push({ id: `tl${uid()}`, techId, jobId: action === "pause" ? running!.jobId : jobId, kind, start: now, end: null, status: "Running" });
    const j = d.jobs.find((x) => x.id === (action === "pause" ? running!.jobId : jobId));
    if (j && action === "travel" && stepOf(j.status) < stepOf("On the Way")) stamp(j, "On the Way", by);
    if (j && (action === "work" || action === "resume") && stepOf(j.status) < stepOf("Arrived")) { stamp(j, "Arrived", by, "Work timer started"); j.arrivedAt = nowIso(); }
  });
  return err;
}

export function reviewTime(ids: string[], approve: boolean, note: string, by: string): Err {
  let err: Err = null;
  if (!approve && !note.trim()) return "A reason is required to reject time.";
  mutate((d) => {
    const rows = d.timeLogs.filter((l) => ids.includes(l.id) && l.status === "Submitted");
    const locked = rows.find((l) => lockedMonth(d, l.start));
    if (locked) { err = lockMsg(locked.start); return; }
    rows.forEach((l) => { l.status = approve ? "Approved" : "Rejected"; l.reviewedBy = by; if (note) l.note = `${l.note ?? ""} ${note}`.trim(); });
    audit(d, by, approve ? "Time approved" : "Time rejected", `${rows.length} entr${rows.length === 1 ? "y" : "ies"}${note ? ` · ${note}` : ""}`);
  });
  return err;
}

export function requestCorrection(c: { logId: string | null; techId: string; jobId: string | null; kind: TimeLog["kind"]; start: string; end: string; reason: string }, by: string): Err {
  if (c.reason.trim().length < 5) return "Give a reason (at least 5 characters).";
  if (!(c.end > c.start)) return "End must be after start.";
  let err: Err = null;
  mutate((d) => {
    if (lockedMonth(d, c.start)) { err = lockMsg(c.start); return; }
    d.corrections.unshift({ ...c, id: `tc${uid()}`, status: "Pending", requestedBy: by, requestedAt: nowIso() });
    notify(d, "admin", "Time correction requested", `${techName(d, c.techId)} · ${c.reason}`);
    audit(d, by, "Time correction requested", `${techName(d, c.techId)} · ${c.start} → ${c.end} · ${c.reason}`);
  });
  return err;
}

export function reviewCorrection(id: string, approve: boolean, note: string, by: string): Err {
  let err: Err = null;
  mutate((d) => {
    const c = d.corrections.find((x) => x.id === id && x.status === "Pending");
    if (!c) { err = "Correction not found or already reviewed."; return; }
    if (c.requestedBy === by) { err = "Someone other than the requester must review a correction."; return; }
    if (lockedMonth(d, c.start)) { err = lockMsg(c.start); return; }
    if (approve) {
      if (overlapsAny(d, c.techId, c.start, c.end, c.logId ?? undefined)) { err = "The corrected time overlaps another entry for this technician."; return; }
      const log = c.logId ? d.timeLogs.find((l) => l.id === c.logId) : undefined;
      if (log) Object.assign(log, { start: c.start, end: c.end, kind: c.kind, status: "Approved", reviewedBy: by, note: `Corrected: ${c.reason}` });
      else d.timeLogs.push({ id: `tl${uid()}`, techId: c.techId, jobId: c.jobId, kind: c.kind, start: c.start, end: c.end, status: "Approved", reviewedBy: by, note: `Added by correction: ${c.reason}` });
    }
    c.status = approve ? "Approved" : "Rejected"; c.reviewedBy = by; c.reviewNote = note;
    audit(d, by, approve ? "Time correction approved" : "Time correction rejected", `${techName(d, c.techId)} · ${c.reason}${note ? ` · ${note}` : ""}`);
  });
  return err;
}

/** New effective-dated salary record; the previous open record ends the day before. */
export function saveSalary(r: Omit<SalaryRecord, "id" | "to">, by: string): Err {
  if (r.payType === "Monthly" ? !(r.monthly > 0) : !(r.hourly > 0)) return "Enter the monthly salary or hourly rate.";
  if (!(r.hoursPerDay > 0) || !r.workingWeekdays.length) return "Set working days and scheduled hours.";
  let err: Err = null;
  mutate((d) => {
    if (d.payrollRuns.some((x) => x.status === "Approved" && x.month >= r.from.slice(0, 7))) { err = "That date falls in an approved payroll month — choose a later effective date."; return; }
    const prevDay = (() => { const x = new Date(`${r.from}T12:00`); x.setDate(x.getDate() - 1); return x.toISOString().slice(0, 10); })();
    d.salaries.forEach((s) => { if (s.techId === r.techId && s.from < r.from && (!s.to || s.to >= r.from)) s.to = prevDay; });
    d.salaries = d.salaries.filter((s) => !(s.techId === r.techId && s.from === r.from));
    d.salaries.push({ ...r, id: `sal${uid()}`, to: null });
    audit(d, by, "Salary record", `${techName(d, r.techId)} from ${fmtDate(r.from)} · ${r.payType === "Monthly" ? `${inr(r.monthly)}/month` : `${inr(r.hourly)}/hour`}`);
  });
  return err;
}

const lockedOr = (d: Db, iso: string, fn: () => void): Err => { if (lockedMonth(d, iso)) return lockMsg(iso); fn(); return null; };

export function setAttendance(m: AttendanceMark, by: string): Err {
  let err: Err = null;
  mutate((d) => { err = lockedOr(d, m.date, () => { d.attendance = d.attendance.filter((a) => !(a.techId === m.techId && a.date === m.date)); d.attendance.push(m); audit(d, by, "Attendance", `${techName(d, m.techId)} ${fmtDate(m.date)} → ${m.status}`); }); });
  return err;
}
export function addHoliday(h: Holiday, by: string): Err {
  let err: Err = null;
  mutate((d) => { err = lockedOr(d, h.date, () => { d.holidays = [...d.holidays.filter((x) => x.date !== h.date), h]; audit(d, by, "Holiday", `${fmtDate(h.date)} ${h.name}`); }); });
  return err;
}
export function addAdvance(a: Omit<Advance, "id">, by: string): Err {
  if (!(a.amount > 0) || !a.reason.trim()) return "Enter amount and reason.";
  mutate((d) => { d.advances.push({ ...a, id: `adv${uid()}` }); audit(d, by, "Salary advance", `${techName(d, a.techId)} · ${inr(a.amount)} (recoverable, not an expense)`); });
  return null;
}
export function addIncentive(i: Omit<Incentive, "id">, by: string): Err {
  let err: Err = null;
  if (!(i.amount > 0) || !i.reason.trim()) return "Enter amount and reason.";
  mutate((d) => { err = lockedOr(d, `${i.month}-01`, () => { d.incentives.push({ ...i, id: `inc${uid()}` }); audit(d, by, "Incentive", `${techName(d, i.techId)} · ${inr(i.amount)} · ${i.reason}`); }); });
  return err;
}
export function addDeduction(x: Omit<Deduction, "id">, by: string): Err {
  let err: Err = null;
  if (!(x.amount > 0) || !x.reason.trim()) return "Enter amount and reason.";
  mutate((d) => { err = lockedOr(d, `${x.month}-01`, () => { d.deductions.push({ ...x, id: `ded${uid()}` }); audit(d, by, "Salary deduction", `${techName(d, x.techId)} · ${inr(x.amount)} · ${x.kind} · ${x.reason}`); }); });
  return err;
}

export function addExpense(e: Omit<Expense, "id">, by: string): Err {
  if (!(e.amount > 0)) return "Amount must be more than zero.";
  if (e.cls === "Direct job" && !e.jobId) return "Direct job expenses must be linked to a job.";
  if (e.cls === "Technician shared" && !e.techId) return "Technician shared costs need a technician.";
  if (e.paidBy === "Employee" && !e.techId) return "Employee-paid claims need the employee.";
  let err: Err = null;
  mutate((d) => {
    if (e.cls === "Technician shared" && e.status === "Approved" && lockedMonth(d, e.date)) { err = lockMsg(e.date); return; }
    d.expenses.unshift({ ...e, id: `ex${uid()}` });
    if (e.status === "Pending") notify(d, "admin", "Expense claim submitted", `${e.category} · ${inr(e.amount)} · ${e.jobId ?? "monthly"}`);
    audit(d, by, "Expense recorded", `${e.category} · ${inr(e.amount)} · ${e.cls}${e.jobId ? ` · ${e.jobId}` : ""} · ${e.status}`);
  });
  return err;
}

export function reviewExpense(id: string, action: "approve" | "reject" | "reverse", note: string, by: string, patch: { cls?: Expense["cls"]; jobId?: string | null } = {}): Err {
  let err: Err = null;
  mutate((d) => {
    const e = d.expenses.find((x) => x.id === id);
    if (!e) { err = "Expense not found."; return; }
    if (action !== "approve" && !note.trim()) { err = "A reason is required."; return; }
    if (action === "reverse") {
      if (e.status !== "Approved") { err = "Only approved expenses can be reversed."; return; }
      if (e.reimbursed) { err = "Already reimbursed — recover it through a payroll deduction instead."; return; }
    } else if (e.status !== "Pending") { err = `Expense is already ${e.status.toLowerCase()}.`; return; }
    const cls = patch.cls ?? e.cls;
    if (cls === "Technician shared" && lockedMonth(d, e.date)) { err = lockMsg(e.date); return; }
    if (action === "approve") { e.cls = cls; if (patch.jobId !== undefined) e.jobId = patch.jobId; if (e.cls === "Direct job" && !e.jobId) { err = "Pick the job for a direct job expense."; return; } }
    e.status = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Reversed";
    e.reviewNote = note;
    audit(d, by, `Expense ${e.status.toLowerCase()}`, `${e.category} · ${inr(e.amount)}${note ? ` · ${note}` : ""}`);
  });
  return err;
}

export function reimburseExpense(id: string, ref: string, by: string): Err {
  let err: Err = null;
  mutate((d) => {
    const e = d.expenses.find((x) => x.id === id);
    if (!e || e.paidBy !== "Employee" || e.status !== "Approved") { err = "Only approved employee-paid claims can be reimbursed."; return; }
    if (e.reimbursed) { err = "This claim was already reimbursed."; return; }
    e.reimbursed = { how: "Direct", ref, at: nowIso() };
    audit(d, by, "Claim reimbursed", `${e.category} · ${inr(e.amount)} · ${ref} (settlement, not a new expense)`);
  });
  return err;
}

export function savePayroll(month: string, by: string): Err {
  let err: Err = null;
  mutate((d) => {
    if (d.payrollRuns.some((r) => r.month === month && r.status === "Approved")) { err = lockMsg(`${month}-01`); return; }
    const run = buildPayrollRun(d, month);
    if (!run.lines.length) { err = "No technician has a salary record for this month."; return; }
    d.payrollRuns = [...d.payrollRuns.filter((r) => r.month !== month), run];
    audit(d, by, "Payroll saved (draft)", `${month} · employer cost ${inr(run.totals.employerCost)}`);
  });
  return err;
}

export function approvePayroll(month: string, by: string): Err {
  let err: Err = null;
  mutate((d) => {
    const run = d.payrollRuns.find((r) => r.month === month);
    if (!run || run.status !== "Draft") { err = "Save the draft payroll first."; return; }
    const pending = d.timeLogs.filter((l) => l.start.startsWith(month) && (l.status === "Running" || l.status === "Submitted")).length;
    if (pending) { err = `Approve or reject ${pending} running/submitted time entr${pending === 1 ? "y" : "ies"} in ${month} first.`; return; }
    const fresh = buildPayrollRun(d, month); // recompute so the locked figures match today's data
    for (const l of fresh.lines.filter((x) => x.type === "reimbursement")) {
      const e = d.expenses.find((x) => x.id === l.ref);
      if (e?.reimbursed) { err = `Claim ${e.category} ${inr(e.amount)} was already reimbursed.`; return; }
    }
    Object.assign(run, fresh, { status: "Approved", approvedAt: nowIso(), approvedBy: by });
    for (const l of run.lines.filter((x) => x.type === "reimbursement")) {
      const e = d.expenses.find((x) => x.id === l.ref);
      if (e) e.reimbursed = { how: "Payroll", ref: `Payroll ${month}`, at: nowIso() };
    }
    audit(d, by, "Payroll approved", `${month} · net pay ${inr(run.totals.netPay)} · locked`);
  });
  return err;
}

export function setJobTeam(jobId: string, helpers: string[], by: string) {
  mutate((d) => {
    const j = findJob(d, jobId);
    j.helpers = helpers.filter((h) => h !== j.techId);
    if (j.splitApprovedBy) { j.split = undefined; j.splitApprovedBy = undefined; }
    j.helpers.forEach((h) => notify(d, `tech:${h}`, "Added to a job", `${j.id} · ${custName(d, j.customerId)}`, j.id));
    audit(d, by, "Job team", `${j.id} helpers: ${j.helpers.map((h) => techName(d, h)).join(", ") || "none"}`);
  });
}

/** Manual revenue split (must total exactly 100%) or null to split by approved hours. */
export function setJobSplit(jobId: string, split: Record<string, number> | null, by: string): Err {
  if (split && Math.abs(Object.values(split).reduce((a, b) => a + b, 0) - 100) > 0.001) return "Shares must total exactly 100%.";
  mutate((d) => {
    const j = findJob(d, jobId);
    j.split = split ?? undefined;
    j.splitApprovedBy = split ? by : undefined;
    audit(d, by, "Revenue split", `${j.id} → ${split ? Object.entries(split).map(([t, p]) => `${techName(d, t)} ${p}%`).join(", ") : "by approved hours"}`);
  });
  return null;
}

export function logCallback(parentId: string, date: string, slot: string, note: string, by: string): string {
  let id = "";
  mutate((d) => {
    const p = findJob(d, parentId);
    id = `J-${++d.seq}`;
    d.jobs.unshift({
      ...structuredClone(p), id, status: "New Request", techId: null, helpers: [], split: undefined, splitApprovedBy: undefined, parentJobId: p.id,
      createdAt: nowIso(), date, slot, complaint: { ...p.complaint, notes: `Callback for ${p.id}: ${note}` }, customerVerified: false, arrivedAt: undefined,
      diagnosis: { ...EMPTY_DIAGNOSIS }, lines: [], discount: 0, quote: null, work: { serviceType: "", before: "", after: "", remarks: "" }, invoice: null,
      payments: [], followUp: null, rating: undefined, notes: [], timeline: [{ status: "New Request", at: nowIso(), by, note: `Callback for ${p.id}` }], cancelReason: undefined,
    });
    notify(d, "admin", "Callback logged", `${id} for ${p.id} · ${custName(d, p.customerId)}`, id);
    audit(d, by, "Callback logged", `${id} ← ${p.id} · ${note}`);
  });
  return id;
}

export function updateFin(patch: Partial<FinanceSettings>, by: string) {
  mutate((d) => { Object.assign(d.fin, patch); audit(d, by, "Cost rules changed", Object.keys(patch).join(", ")); });
}

/** Saves a calculator result; optional lines go onto the job's estimate (never touches stock). */
export function saveCalc(c: Omit<SavedCalc, "id" | "at">, lines: QuoteLine[] | null): Err {
  let err: Err = null;
  mutate((d) => {
    if (c.jobId && lines?.length) {
      const j = findJob(d, c.jobId);
      if (stepOf(j.status) >= stepOf("Approved") || j.status === "Cancelled") { err = `${j.id} is ${j.status} — add calculator lines before the estimate is approved.`; return; }
      j.lines.push(...lines);
    }
    d.calcs.unshift({ ...c, id: `calc${uid()}`, at: nowIso() });
    audit(d, c.by, "Calculation saved", `${c.kind} · ${c.title}${c.jobId ? ` → ${c.jobId}` : ""}`);
  });
  return err;
}

export { JOB_FLOW };
