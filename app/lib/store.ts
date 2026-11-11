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
  DEMO_OTP, EMPTY_DIAGNOSIS, EMPTY_PREWORK, JOB_FLOW, acLabel, fmtDate, inr, isoDay, jobTotals, nowIso, seedDb, stepOf,
  isOpen, type AcQuoteRequest, type AcUnit, type Complaint, type Customer, type Db, type Job, type JobStatus, type LeadStatus, type Part, type PayMethod,
  type PreWork, type QuoteLine, type ServiceSite, type Settings, type Technician, validateSite,
} from "./data";
import { buildPayrollRun } from "./finance";
import type { Advance, AttendanceMark, Deduction, Expense, FinanceSettings, Holiday, Incentive, SalaryRecord, SavedCalc, TimeLog } from "./finance-types";
import { cleanDb, upgradeDb, withFinanceSeed } from "./finance-seed";
import { validateRepair, type RepairDraft, type RepairEntry, type RepairStatus } from "./repair";
import { DOC_LABEL, aadhaarLast4, daysToBirthday, emptyProfile, profileProblems, type DocKey, type DocStatus, type PaymentInfo, type TechProfile } from "./techprofile";
import { DEFAULT_FIELD_RULES, distanceM, newVisitOtp, parseGps, type FieldRules } from "./field";
import { addDays, latestSupplier, validateSample, type CustomerTemplate, type SampleDraft, type SampleEnquiry, type SupplierResponse } from "./samples";
import { approvalBlockers, needsCustomerAck, progress, submitProblems, type InspectionDraft, type ShiftingInspection } from "./shifting";
import { currentCylinder, daysOf, dueTasks, validateLpg, validateRoom, type LpgCylinder, type LpgDraft, type RentPayment, type RoomDraft } from "./welfare";
import { missingOf, rentalCalc, returnProblem, validateIssue, validateRental, validateReturn, type IssueDraft, type RentalDraft, type ReturnDraft } from "./tools";
import { EXPIRY_ALERT_DAYS, duplicateSerial, validateSale, warrantyEnd, type AcSale, type SaleDraft, type WarrantyClaim } from "./sales";
import { visitProblems, type SiteVisit, type SiteVisitDraft } from "./sitevisit";
import { validateBanner, validateEnquiry, type BannerDraft, type EnquiryStatus, type PartEnquiry, type PromoBanner } from "./promo";

const KEY = "prc:db:v1";
const sample = () => withFinanceSeed(seedDb());
const fresh = () => cleanDb(sample());

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
  priority?: Job["priority"]; source: Job["source"]; techId?: string | null; site?: ServiceSite;
}

export function createJob(input: NewJob, by: string): string {
  let id = "";
  mutate((d) => {
    id = `J-${++d.seq}`;
    const cust = d.customers.find((c) => c.id === input.customerId)!;
    const job: Job = {
      id, customerId: input.customerId, acId: input.acId, techId: null, status: "New Request",
      priority: input.priority ?? "Normal", source: input.source, createdAt: nowIso(), date: input.date, slot: input.slot,
      ...(input.site ? { site: { ...input.site, contactPhone: input.site.contactPhone.replace(/\D/g, "").slice(-10) } } : {}),
      category: d.acs.find((a) => a.id === input.acId)?.category ?? "AC",
      visitOtp: newVisitOtp(), calls: [],
      complaint: input.complaint, preWork: input.preWork ?? { ...EMPTY_PREWORK }, customerVerified: false,
      diagnosis: { ...EMPTY_DIAGNOSIS }, lines: [], discount: 0, quote: null,
      work: { serviceType: "", before: "", after: "", remarks: "" }, invoice: null, payments: [], followUp: null, notes: [],
      timeline: [{ status: "New Request", at: nowIso(), by }],
    };
    d.jobs.unshift(job);
    notify(d, "admin", `New service request · ${input.source}`, `${id} · ${cust.name} · ${input.complaint.issues.join(", ")}${input.site ? ` · ${input.site.area}` : ""}`, id);
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

/** Load the sample customers, jobs, repairs… (demo walkthroughs and tests). */
export function resetDemo() {
  state = sample();
  persist();
  emit();
}

/** Clear every customer, booking and record; keep technicians, prices, stock and settings. */
export function startFresh() {
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

/** Customer-app sizing estimate: saved against the customer; optionally asks the office for an installation quote. */
export function sizingEnquiry(customerId: string, title: string, inputs: unknown, outputs: unknown, wantsQuote: boolean, by: string) {
  mutate((d) => {
    d.calcs.unshift({ id: `calc${uid()}`, kind: "Tonnage", title, customerId, jobId: null, at: nowIso(), by, inputs, outputs });
    if (wantsQuote) {
      d.leads[`inst:${customerId}:${nowIso()}`] = "Open";
      notify(d, "admin", "New AC installation enquiry", `${custName(d, customerId)} · ${title}. Call to confirm site visit & quotation.`);
      notify(d, `customer:${customerId}`, "Installation enquiry received", "Our team will call you to confirm a site visit and send a quotation.");
    }
    audit(d, by, wantsQuote ? "Installation enquiry" : "Sizing estimate saved", `${custName(d, customerId)} · ${title}`);
  });
}

export type NewAcQuote = Omit<AcQuoteRequest, "id" | "at" | "status">;

/** Customer "Get Best AC Quote": stored for the office (Admin → Growth → New AC quotes) and confirmed to the customer. */
export function requestAcQuote(q: NewAcQuote, by: string) {
  const id = `acq${uid()}`;
  mutate((d) => {
    (d.acQuotes ??= []).unshift({ ...q, id, at: nowIso(), status: "Open" });
    const cap = q.capacityTons != null ? `${q.capacityTons} TR` : "size to suggest";
    notify(d, "admin", "New AC quote request", `${q.contact.name} · ${q.quantity} × ${q.acType} ${cap} · ${q.timeline}. Call +91 ${q.contact.phone}.`);
    notify(d, `customer:${q.customerId}`, "AC quote request received", "We'll call you with the best prices for your chosen ACs.");
    audit(d, by, "AC quote request", `${q.contact.name} · ${q.quantity} × ${q.acType} ${cap}`);
  });
  return id;
}

export function setAcQuoteStatus(id: string, status: LeadStatus, by: string) {
  mutate((d) => {
    const q = d.acQuotes?.find((x) => x.id === id);
    if (!q) return;
    q.status = status;
    audit(d, by, "AC quote updated", `${q.contact.name} → ${status}`);
  });
}

export { JOB_FLOW };

/* ───────────────────────── Technician Calculators hub ───────────────────────── */

const prefsOf = (d: Db, techId: string) => ((d.techPrefs ??= {})[techId] ??= { fav: [], recent: [] });

export function toggleFavourite(techId: string, tool: string) {
  mutate((d) => { const p = prefsOf(d, techId); p.fav = p.fav.includes(tool) ? p.fav.filter((x) => x !== tool) : [...p.fav, tool]; });
}

export function touchRecent(techId: string, tool: string) {
  const cur = getSnapshot().techPrefs?.[techId]?.recent ?? [];
  if (cur[0] === tool) return;
  mutate((d) => { const p = prefsOf(d, techId); p.recent = [tool, ...p.recent.filter((x) => x !== tool)].slice(0, 6); });
}

export type ToolSave = Omit<SavedCalc, "at"> & { tool: string };

/**
 * Saves a hub calculation. `rec.id` is the calculation's own id (new on every Calculate), so a second
 * tap — or a second tab — can never save it or its estimate lines twice.
 *  · `lines`: add to the job's estimate — appended while the job is in Diagnosis, or sent as add-on work
 *    needing the customer's approval once the estimate is approved. Never touches stock or invoices.
 *  · `note`: diagnostic readings, appended to the job's notes.
 */
export function saveToolCalc(rec: ToolSave, opts: { lines?: QuoteLine[]; note?: string } = {}): Err {
  let err: Err = null;
  mutate((d) => {
    if (d.calcs.some((c) => c.id === rec.id)) { err = "Already saved — change the inputs and calculate again for a new record."; return; }
    const j = rec.jobId ? d.jobs.find((x) => x.id === rec.jobId) : undefined;
    if (rec.jobId && !j) { err = "Job not found."; return; }
    if (j && rec.techId && !onJob(j, rec.techId)) { err = "You are not assigned to this job."; return; }
    if (opts.lines?.length) {
      if (!j) { err = "Select a job to add these lines to its estimate."; return; }
      const ref = `calc:${rec.id}`;
      if (j.lines.some((l) => l.refId === ref)) { err = "These lines are already on the estimate."; return; }
      const lines = opts.lines.map((l) => ({ ...l, refId: ref }));
      const step = stepOf(j.status);
      if (j.status === "Diagnosis" || (step >= 0 && step < stepOf("Diagnosis"))) {
        j.lines.push(...lines);
      } else if (step >= stepOf("Approved") && step < stepOf("Work Completed")) {
        j.lines.push(...lines.map((l) => ({ ...l, addOn: true })));
        const rev = (j.quote?.revision ?? 1) + 1;
        j.quote = { no: `QTN-${j.id.slice(2)}-R${rev}`, at: nowIso(), revision: rev, status: "Pending" };
        stamp(j, "Estimate Prepared", rec.by, `Additional work from ${rec.kind}: ${lines.map((l) => l.name).join(", ")}`);
        notify(d, `customer:${j.customerId}`, "Additional work needs your approval", `${j.quote.no} · new total ${inr(jobTotals(j, d.settings).total)}`, j.id);
      } else { err = `${j.id} is ${j.status} — lines can't be added now.`; return; }
    }
    if (opts.note) {
      if (!j) { err = "Select a job to save readings to."; return; }
      j.notes.push({ at: nowIso(), by: rec.by, text: opts.note });
    }
    d.calcs.unshift({ ...rec, at: nowIso() });
    audit(d, rec.by, "Calculation saved", `${rec.kind} · ${rec.title}${rec.jobId ? ` → ${rec.jobId}` : ""}${opts.lines?.length ? ` · ${opts.lines.length} estimate line(s)` : ""}`);
  });
  return err;
}

/**
 * Travel / petrol claim from the hub. Always Pending (never auto-approved or reimbursed). One claim per
 * calculation, and mileage + actual fuel for the same job and day only when the policy allows both.
 */
export function createToolClaim(calcRef: string, e: Omit<Expense, "id" | "status" | "calcRef">, by: string): Err {
  const db0 = getSnapshot();
  if (db0.expenses.some((x) => x.calcRef === calcRef)) return "A claim for this calculation was already submitted.";
  if (db0.fin.tools.travel.mode !== "both" && e.claimMethod) {
    const clash = db0.expenses.find((x) => x.techId === e.techId && x.jobId === e.jobId && x.date === e.date && x.status !== "Rejected" && x.status !== "Reversed" && x.claimMethod && (x.claimMethod !== e.claimMethod || e.claimMethod === "both"));
    if (clash) return `A ${clash.claimMethod} claim already exists for ${e.jobId ?? "this day"} on ${fmtDate(e.date)} — policy does not allow mileage and actual fuel together.`;
  }
  return addExpense({ ...e, status: "Pending", calcRef }, by);
}

/** Technician asks the office to take unused material back — the office confirms it with the existing issue/return. */
export function requestReturn(techId: string, items: Record<string, number>, jobId: string | null) {
  mutate((d) => {
    const list = Object.entries(items).filter(([, n]) => n > 0).map(([id, n]) => `${d.parts.find((p) => p.id === id)?.name ?? id} × ${n}`);
    if (!list.length) return;
    notify(d, "admin", `Return request · ${techName(d, techId)}`, `${list.join(", ")}${jobId ? ` (from ${jobId})` : ""} — confirm in Parts & Inventory`);
  });
}

/* ───────────────────────── Repair register (PCB / stabilizer / coil) ───────────────────────── */

export function addRepair(draft: RepairDraft, by: string): { id: string } | { error: string } {
  const err = validateRepair(draft);
  if (err) return { error: err };
  let id = "";
  mutate((d) => {
    d.repairs ??= [];
    const phone = draft.customerPhone.replace(/\D/g, "");
    const cust = d.customers.find((c) => c.phone === phone && !c.mergedInto);
    id = `R-${d.repairs.reduce((m, r) => Math.max(m, Number(r.id.slice(2)) || 100), 100) + 1}`;
    const now = nowIso();
    const entry: RepairEntry = { ...draft, customerPhone: phone, customerId: draft.customerId ?? cust?.id ?? null, id, createdAt: now, status: "Received", pendingReason: "", delayReason: "", timeline: [{ at: now, status: "Received", by }] };
    d.repairs.unshift(entry);
    d.notifications.unshift({ id: uid(), at: now, to: "admin", title: `Repair item received · ${id}`, body: `${entry.itemType} · ${entry.brand} · ${entry.customerName} (${entry.mode})`, read: false });
    audit(d, by, "Repair entry created", `${id} · ${entry.itemType} · ${entry.customerName}`);
  });
  return { id };
}

export function updateRepair(id: string, patch: Partial<RepairDraft>, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const r = d.repairs?.find((x) => x.id === id);
    if (!r) { err = "Entry not found."; return; }
    const next = { ...r, ...patch };
    err = validateRepair(next);
    if (err) return;
    Object.assign(r, patch);
    audit(d, by, "Repair entry edited", `${id} · ${Object.keys(patch).join(", ")}`);
  });
  return err;
}

/** Status change with the pending / delay reasons and return date the register needs. */
export function setRepairStatus(id: string, status: RepairStatus, info: { note?: string; pendingReason?: string; delayReason?: string; returnDate?: string | null; charge?: number | null }, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const r = d.repairs?.find((x) => x.id === id);
    if (!r) { err = "Entry not found."; return; }
    if (status === "Pending" && !(info.pendingReason ?? r.pendingReason).trim()) { err = "Give the reason the repair is pending."; return; }
    if (status === "Returned" && !(info.returnDate ?? r.returnDate)) { err = "Enter the return date."; return; }
    r.status = status;
    if (info.pendingReason != null) r.pendingReason = info.pendingReason;
    if (info.delayReason != null) r.delayReason = info.delayReason;
    if (info.returnDate !== undefined) r.returnDate = info.returnDate;
    if (info.charge !== undefined) r.charge = info.charge;
    r.timeline.push({ at: nowIso(), status, by, note: info.note?.trim() || undefined });
    if (r.customerId && (status === "Repaired" || status === "Returned"))
      d.notifications.unshift({ id: uid(), at: nowIso(), to: `customer:${r.customerId}`, title: status === "Repaired" ? `Your ${r.itemType} is repaired` : `Your ${r.itemType} has been returned`, body: `${r.id} · ${r.brand}${r.charge != null ? ` · ${inr(r.charge)}` : ""}`, read: false });
    audit(d, by, "Repair status", `${id} → ${status}${info.note ? ` · ${info.note}` : ""}`);
  });
  return err;
}

/* ───────────────────────── Spare-parts promo banners + enquiries ───────────────────────── */

export function addBanner(b: BannerDraft, by: string): { id: string } | { error: string } {
  const err = validateBanner(b);
  if (err) return { error: err };
  let id = "";
  mutate((d) => {
    d.promoBanners ??= [];
    id = `pb${++d.seq}`;
    const order = d.promoBanners.reduce((m, x) => Math.max(m, x.order), 0) + 1;
    d.promoBanners.push({ ...b, id, order, updatedAt: nowIso(), updatedBy: by });
    audit(d, by, "Promo banner added", `${b.category} · ${b.title}${b.enabled ? "" : " (disabled)"}`);
  });
  return { id };
}

export function updateBanner(id: string, patch: Partial<BannerDraft>, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const b = d.promoBanners?.find((x) => x.id === id);
    if (!b) { err = "Banner not found."; return; }
    err = validateBanner({ ...b, ...patch });
    if (err) return;
    Object.assign(b, patch, { updatedAt: nowIso(), updatedBy: by });
    audit(d, by, patch.enabled !== undefined && Object.keys(patch).length === 1 ? (patch.enabled ? "Promo banner enabled" : "Promo banner disabled") : "Promo banner edited", `${b.category} · ${b.title}`);
  });
  return err;
}

export function deleteBanner(id: string, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const b = d.promoBanners?.find((x) => x.id === id);
    if (!b) { err = "Banner not found."; return; }
    d.promoBanners = d.promoBanners!.filter((x) => x.id !== id);
    audit(d, by, "Promo banner deleted", `${b.category} · ${b.title}`);
  });
  return err;
}

/** Move a banner one place up (-1) or down (+1) in the slider. */
export function moveBanner(id: string, dir: -1 | 1, by: string) {
  mutate((d) => {
    const list = (d.promoBanners ?? []).sort((a, b) => a.order - b.order);
    const i = list.findIndex((x) => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i].order, list[j].order] = [list[j].order, list[i].order];
    audit(d, by, "Promo banner reordered", `${list[i].title} moved ${dir < 0 ? "up" : "down"}`);
  });
}

export function addPartEnquiry(e: Pick<PartEnquiry, "bannerId" | "category" | "customerId" | "name" | "phone" | "appliance" | "part" | "note">, by: string): { id: string } | { error: string } {
  const err = validateEnquiry(e);
  if (err) return { error: err };
  let id = "";
  mutate((d) => {
    d.partEnquiries ??= [];
    id = `PE-${d.partEnquiries.reduce((m, x) => Math.max(m, Number(x.id.slice(3)) || 1000), 1000) + 1}`;
    const at = nowIso();
    d.partEnquiries.unshift({ ...e, phone: e.phone.replace(/\D/g, "").slice(-10), id, at, status: "New", history: [{ at, status: "New", by }] });
    d.notifications.unshift({ id: uid(), at, to: "admin", title: `Spare part enquiry · ${e.category}`, body: `${e.name} (${e.phone}) needs ${e.part}${e.appliance ? ` for ${e.appliance}` : ""}`, read: false });
    if (e.customerId) d.notifications.unshift({ id: uid(), at, to: `customer:${e.customerId}`, title: "Enquiry received", body: `We'll call you about ${e.part} shortly. Ref ${id}.`, read: false });
    audit(d, by, "Spare part enquiry", `${id} · ${e.category} · ${e.part}`);
  });
  return { id };
}

export function setEnquiryStatus(id: string, status: EnquiryStatus, note: string, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const q = d.partEnquiries?.find((x) => x.id === id);
    if (!q) { err = "Enquiry not found."; return; }
    q.status = status;
    q.history.push({ at: nowIso(), status, by, note: note.trim() || undefined });
    audit(d, by, "Spare part enquiry status", `${id} → ${status}`);
  });
  return err;
}

/** Customer changes the service address before the technician sets out. */
export function changeJobSite(jobId: string, site: ServiceSite, by: string): Err {
  let err: string | null = validateSite(site);
  if (err) return err;
  mutate((d) => {
    const j = d.jobs.find((x) => x.id === jobId);
    if (!j) { err = "Booking not found."; return; }
    if (stepOf(j.status) >= stepOf("On the Way")) { err = "The technician is already on the way — please call the office to change the address."; return; }
    j.site = { ...site, contactPhone: site.contactPhone.replace(/\D/g, "").slice(-10) };
    j.notes.push({ at: nowIso(), by, text: `Service address changed to: ${site.address}, ${site.area}` });
    notify(d, "admin", "Service address changed", `${j.id} · ${site.area}`, j.id);
    if (j.techId) notify(d, `tech:${j.techId}`, "Address changed", `${j.id} · now at ${site.address}, ${site.area}`, j.id);
  });
  return err;
}

/* ───────────────────────── AC shifting — pre-removal inspection ───────────────────────── */

const inspAudit = (x: ShiftingInspection, by: string, action: string, detail?: string) => x.audit.push({ at: nowIso(), by, action, detail });

export function createInspection(techId: string, draft: InspectionDraft): string {
  let id = "";
  mutate((d) => {
    d.inspections ??= [];
    const t = d.techs.find((x) => x.id === techId);
    id = `INS-${d.inspections.reduce((m, x) => Math.max(m, Number(x.id.slice(4)) || 200), 200) + 1}`;
    const now = nowIso();
    d.inspections.unshift({ ...structuredClone(draft), id, techId, techName: t?.name ?? techId, status: "Draft", createdAt: now, inspectedAt: now, office: null, audit: [{ at: now, by: t?.name ?? techId, action: "Draft started" }] });
  });
  return id;
}

/** Technician saves the draft — only their own, and only while it is editable. */
export function saveInspectionDraft(id: string, techId: string, draft: InspectionDraft): Err {
  let err: string | null = null;
  mutate((d) => {
    const x = d.inspections?.find((i) => i.id === id);
    if (!x) { err = "Inspection not found."; return; }
    if (x.techId !== techId) { err = "Only the assigned technician can edit this inspection."; return; }
    if (x.status !== "Draft" && x.status !== "Correction Required") { err = "This inspection is submitted — ask the office to reopen it."; return; }
    const changed = (["customer", "ac", "site", "materials"] as const).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(draft[k]));
    const prevP = progress(x).done;
    Object.assign(x, structuredClone(draft), { inspectedAt: nowIso() });
    if (changed.length || prevP !== progress(x).done) inspAudit(x, x.techName, "Draft saved", `${progress(x).done}/${progress(x).total} checked${changed.length ? ` · edited ${changed.join(", ")}` : ""}`);
  });
  return err;
}

export function submitInspection(id: string, techId: string, draft: InspectionDraft): Err {
  let err: string | null = null;
  mutate((d) => {
    const x = d.inspections?.find((i) => i.id === id);
    if (!x) { err = "Inspection not found."; return; }
    if (x.techId !== techId) { err = "Only the assigned technician can submit this inspection."; return; }
    if (x.status !== "Draft" && x.status !== "Correction Required") { err = "Already submitted."; return; }
    const problems = submitProblems(draft, { faultPhotoRequired: d.inspectionRules?.faultPhotoRequired ?? true });
    if (problems.length) { err = problems[0]; return; }
    Object.assign(x, structuredClone(draft));
    const now = nowIso();
    x.submittedAt = now;
    x.status = draft.site.safety === "Unsafe / Hold Work" ? "On Hold – Unsafe" : needsCustomerAck(x) && !x.customerAck ? "Awaiting Customer Approval" : "Submitted";
    inspAudit(x, x.techName, "Submitted for office review", `${progress(x).faults.length} faults · safety ${x.site.safety}`);
    notify(d, "admin", `Pre-removal inspection ${x.status === "On Hold – Unsafe" ? "· UNSAFE" : "submitted"}`, `${x.id} · ${x.customer.name} · ${x.ac.kind} ${x.ac.capacity} T`, x.jobId ?? undefined);
  });
  return err;
}

/** Customer acknowledgement of existing faults / extra charges (OTP in this demo). */
export function recordCustomerAck(id: string, ack: { name: string; method: "OTP" | "Signature on paper" | "Recorded call"; otp?: string }, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const x = d.inspections?.find((i) => i.id === id);
    if (!x) { err = "Inspection not found."; return; }
    if (!ack.name.trim()) { err = "Enter the name of the person acknowledging."; return; }
    if (ack.method === "OTP" && ack.otp !== DEMO_OTP) { err = "Wrong OTP."; return; }
    x.customerAck = { name: ack.name.trim(), method: ack.method, at: nowIso() };
    x.materials.faultsExplained = "Approved / Acknowledged";
    if (x.status === "Awaiting Customer Approval") x.status = "Submitted";
    inspAudit(x, by, "Customer acknowledged", `${ack.name} · ${ack.method}`);
  });
  return err;
}

/** Office decision. Approval is hard-gated by site safety, isolation and customer acknowledgement. */
export function inspectionDecision(id: string, decision: "Approved" | "Hold" | "Correction" | "Reopen" | "Cancel", notes: string, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const x = d.inspections?.find((i) => i.id === id);
    if (!x) { err = "Inspection not found."; return; }
    if ((decision === "Correction" || decision === "Hold" || decision === "Cancel") && !notes.trim()) { err = "Write a note for the technician."; return; }
    if (decision === "Approved") { const b = approvalBlockers(x); if (b.length) { err = b[0]; return; } }
    const now = nowIso();
    if (decision === "Reopen" || decision === "Correction") x.status = "Correction Required";
    else if (decision === "Hold") x.status = "On Hold – Unsafe";
    else if (decision === "Cancel") x.status = "Cancelled";
    else x.status = "Approved for Removal";
    x.office = { decision: decision === "Reopen" ? "Correction" : decision === "Cancel" ? "Hold" : decision, by, at: now, notes: notes.trim() };
    inspAudit(x, by, decision === "Approved" ? "Removal authorised" : decision === "Reopen" ? "Reopened for edits" : decision === "Correction" ? "Correction requested" : decision === "Cancel" ? "Cancelled" : "Put on hold", notes.trim() || undefined);
    notify(d, `tech:${x.techId}`, decision === "Approved" ? "Removal approved" : decision === "Cancel" ? "Inspection cancelled" : "Inspection needs attention", `${x.id} · ${x.customer.name}${notes.trim() ? ` — ${notes.trim()}` : ""}`);
  });
  return err;
}

export function setInspectionRules(rules: { faultPhotoRequired: boolean }, by: string) {
  mutate((d) => { d.inspectionRules = rules; audit(d, by, "Inspection rules", `Fault photo required: ${rules.faultPhotoRequired ? "yes" : "no"}`); });
}

/* ───────────────────────── Counter: spare-part sample enquiries ───────────────────────── */

const smpLog = (x: SampleEnquiry, by: string, text: string) => x.timeline.push({ at: nowIso(), by, text });
const findSample = (d: Db, id: string) => d.samples?.find((x) => x.id === id);

export function receiveSample(draft: SampleDraft, by: string): { id: string } | { error: string } {
  const err = validateSample(draft);
  if (err) return { error: err };
  let id = "";
  mutate((d) => {
    d.samples ??= [];
    const n = d.samples.reduce((m, x) => Math.max(m, Number(x.id.split("-").pop()) || 0), 0) + 1;
    id = `PRC-SMP-${String(n).padStart(4, "0")}`;
    const now = nowIso(), day = now.slice(0, 10);
    const phone = draft.customer.phone.replace(/\D/g, "").slice(-10);
    let cust = d.customers.find((c) => c.id === draft.customer.customerId && !c.mergedInto) ?? d.customers.find((c) => c.phone === phone && !c.mergedInto);
    // Customer 360: a new mobile number gets a full customer profile right away.
    if (!cust) {
      const k = draft.customer;
      cust = {
        id: `c${++d.seq}`, name: k.name.trim(), phone, altPhone: (k.altPhone ?? "").replace(/\D/g, "").slice(-10), address: k.address.trim(), area: (k.area ?? "").trim(),
        gps: (k.gps ?? "").replace(/\s/g, ""), type: k.type ?? "Residential", status: "New", contactPref: k.contactPref ?? "WhatsApp", createdAt: now, amc: null,
      };
      d.customers.unshift(cust);
      audit(d, by, "Customer created", `${cust.name} · ${phone} (sample counter)`);
    }
    d.samples.unshift({
      ...structuredClone(draft), id, receivedAt: now, receivedBy: by,
      customer: { ...draft.customer, phone, customerId: cust.id, name: draft.customer.name.trim() || cust.name, address: draft.customer.address.trim() || cust.address, area: draft.customer.area || cust.area, gps: draft.customer.gps || cust.gps },
      supplierDue: addDays(day, 2), customerDue: addDays(day, 2), suppliers: [], customerUpdates: [], customerReply: "Pending",
      status: "Received", closeReason: "", timeline: [{ at: now, by, text: `Sample received${draft.storage ? ` — kept at ${draft.storage}` : ""}` }],
    });
    audit(d, by, "Sample received", `${id} · ${draft.brand} ${draft.part} · ${draft.customer.name}`);
  });
  return { id };
}

export function updateSample(id: string, patch: Partial<SampleDraft>, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const x = findSample(d, id);
    if (!x) { err = "Sample not found."; return; }
    err = validateSample({ ...x, ...patch });
    if (err) return;
    Object.assign(x, structuredClone(patch));
    smpLog(x, by, "Details edited");
  });
  return err;
}

/** Add a supplier to ask (also remembered in the supplier list), or mark the message to them as sent. */
export function addSampleSupplier(id: string, sup: { name: string; phone: string }, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const x = findSample(d, id);
    if (!x) { err = "Sample not found."; return; }
    if (!sup.name.trim()) { err = "Enter the supplier name."; return; }
    const phone = sup.phone.replace(/\D/g, "").slice(-10);
    if (phone && !/^[6-9]\d{9}$/.test(phone)) { err = "Supplier WhatsApp must be 10 digits."; return; }
    x.suppliers.push({ id: uid(), name: sup.name.trim(), phone, messageSentAt: null, response: "Pending / No Response", respondedAt: null, price: null, restockDate: "", note: "" });
    d.suppliers ??= [];
    const known = d.suppliers.find((s) => s.name.toLowerCase() === sup.name.trim().toLowerCase());
    if (known) { if (phone) known.phone = phone; } else d.suppliers.push({ name: sup.name.trim(), phone });
    smpLog(x, by, `Supplier added: ${sup.name.trim()}`);
  });
  return err;
}

export function markSupplierMessageSent(id: string, supplierId: string, template: string, by: string) {
  mutate((d) => {
    const x = findSample(d, id); const s = x?.suppliers.find((y) => y.id === supplierId);
    if (!x || !s) return;
    s.messageSentAt = nowIso();
    if (x.status === "Received") x.status = "Supplier Enquired";
    x.supplierDue = addDays(nowIso().slice(0, 10), 2);
    smpLog(x, by, `${template} sent to ${s.name}`);
  });
}

export function setSupplierResponse(id: string, supplierId: string, r: { response: SupplierResponse; price: number | null; restockDate: string; note: string }, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const x = findSample(d, id); const s = x?.suppliers.find((y) => y.id === supplierId);
    if (!x || !s) { err = "Supplier not found."; return; }
    if (r.response === "Restock Expected" && !r.restockDate) { err = "Enter the expected restock date."; return; }
    Object.assign(s, { ...r, respondedAt: r.response === "Pending / No Response" ? null : nowIso() });
    if (r.response === "Part Available") x.status = "Part Found";
    else if (r.response === "Restock Expected" && x.status !== "Part Found") x.status = "Restock Expected";
    else if (r.response === "Part Not Available" && x.status !== "Part Found" && !x.suppliers.some((y) => y.response === "Part Available" || y.response === "Pending / No Response")) x.status = "Not Available";
    smpLog(x, by, `${s.name}: ${r.response}${r.price != null ? ` · ₹${r.price}` : ""}${r.restockDate ? ` · restock ${r.restockDate}` : ""}${r.note ? ` — ${r.note}` : ""}`);
  });
  return err;
}

/** Customer was messaged — resets the 2-day customer update clock. */
export function markCustomerInformed(id: string, template: CustomerTemplate, by: string) {
  mutate((d) => {
    const x = findSample(d, id);
    if (!x) return;
    x.customerUpdates.push({ at: nowIso(), template, by });
    x.customerDue = addDays(nowIso().slice(0, 10), 2);
    smpLog(x, by, `Customer informed: ${template}`);
    if (x.customer.customerId) d.notifications.unshift({ id: uid(), at: nowIso(), to: `customer:${x.customer.customerId}`, title: `Spare part update · ${x.part}`, body: `${template} — ${x.id}`, read: false });
  });
}

export function setCustomerReply(id: string, reply: "Pending" | "Approved" | "Declined", by: string) {
  mutate((d) => {
    const x = findSample(d, id);
    if (!x) return;
    x.customerReply = reply;
    if (reply === "Approved") x.status = "Customer Approved";
    smpLog(x, by, `Customer reply: ${reply}`);
  });
}

/** Next action chosen after a supplier answer — logged; a check-again date moves the supplier follow-up date. */
export function sampleNextAction(id: string, text: string, by: string, checkOn?: string) {
  mutate((d) => {
    const x = findSample(d, id);
    if (!x) return;
    x.nextAction = text;
    if (checkOn) x.supplierDue = checkOn;
    smpLog(x, by, text);
  });
}

export function closeSample(id: string, reason: string, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const x = findSample(d, id);
    if (!x) { err = "Sample not found."; return; }
    if (!reason.trim()) { err = "Choose why it is closed."; return; }
    x.status = "Closed"; x.closeReason = reason;
    smpLog(x, by, `Closed — ${reason}`);
    audit(d, by, "Sample closed", `${id} · ${reason}`);
  });
  return err;
}

export function reopenSample(id: string, by: string) {
  mutate((d) => {
    const x = findSample(d, id);
    if (!x) return;
    const r = latestSupplier(x)?.response;
    x.status = r === "Part Available" ? "Part Found" : x.suppliers.length ? "Supplier Enquired" : "Received";
    x.closeReason = "";
    smpLog(x, by, "Reopened");
  });
}

/* ───────────────────────── Field rules: location, arrival radius, visit OTP, calls ───────────────────────── */

export const fieldRulesOf = (d: Pick<Db, "fieldRules">): FieldRules => ({ ...DEFAULT_FIELD_RULES, ...(d.fieldRules ?? {}) });

export function setFieldRules(patch: Partial<FieldRules>, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const next = { ...fieldRulesOf(d), ...patch };
    if (!next.categories.length) { err = "Keep at least one service category."; return; }
    if (!(next.geofenceM >= 10 && next.geofenceM <= 5000)) { err = "Arrival radius must be 10–5000 metres."; return; }
    if (!(next.nearbyKm > 0 && next.nearbyKm <= 100)) { err = "Nearby radius must be 1–100 km."; return; }
    if (!(next.maxBreakMin >= 0 && next.maxBreakMin <= 480)) { err = "Break limit must be 0–480 minutes."; return; }
    d.fieldRules = next;
    audit(d, by, "Field rules", `categories ${next.categories.join(", ")} · radius ${next.geofenceM} m · nearby ${next.nearbyKm} km · OTP ${next.visitOtp ? "on" : "off"} · in-app call ${next.inAppCall ? "on" : "off"} · break ${next.maxBreakMin} min`);
  });
  return err;
}

/** Technician app shares its position while on duty. */
export function setTechLocation(techId: string, lat: number, lng: number) {
  mutate((d) => { const t = d.techs.find((x) => x.id === techId); if (t) t.loc = { lat, lng, at: nowIso() }; });
}

/** "I've arrived" — only within the arrival radius of the site, unless the technician gives a reason. */
export function markArrived(jobId: string, techId: string, pos: { lat: number; lng: number } | null, override: string, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const j = d.jobs.find((x) => x.id === jobId);
    if (!j) { err = "Job not found."; return; }
    if (j.techId !== techId && !(j.helpers ?? []).includes(techId)) { err = "Not your job."; return; }
    const rules = fieldRulesOf(d);
    const c = d.customers.find((x) => x.id === j.customerId);
    const site = parseGps(j.site?.gps || c?.gps);
    const dist = pos && site ? distanceM(pos, site) : null;
    if (dist != null && dist > rules.geofenceM && !override.trim()) { err = `You are ${Math.round(dist)} m from the customer's location — move within ${rules.geofenceM} m, or give a reason.`; return; }
    if (pos == null && !override.trim()) { err = "Location not available — turn on location, or give a reason."; return; }
    const t = d.techs.find((x) => x.id === techId);
    if (t && pos) t.loc = { ...pos, at: nowIso() };
    j.arrival = { distanceM: dist, ...(override.trim() ? { override: override.trim() } : {}), at: nowIso() };
    j.arrivedAt = nowIso();
    stamp(j, "Arrived", by, dist != null ? `${Math.round(dist)} m from site${override.trim() ? ` — override: ${override.trim()}` : ""}` : override.trim() ? `No location — ${override.trim()}` : "Customer location not pinned");
    notify(d, `customer:${j.customerId}`, "Technician has arrived", rules.visitOtp ? `${t?.name ?? "Your technician"} is at your door. Share your visit OTP to start the work.` : `${t?.name ?? "Your technician"} is at your door.`, j.id);
    if (dist != null && dist > rules.geofenceM) notify(d, "admin", "Arrival outside radius", `${j.id} · ${Math.round(dist)} m · ${override.trim()}`, j.id);
  });
  return err;
}

/** Customer's visit OTP, entered by the technician on arrival. */
export function verifyVisitOtp(jobId: string, code: string, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const j = d.jobs.find((x) => x.id === jobId);
    if (!j) { err = "Job not found."; return; }
    if (!j.visitOtp) j.visitOtp = newVisitOtp();
    if (code.trim() !== j.visitOtp) { err = "Wrong OTP — ask the customer for the 4-digit visit code in their app."; return; }
    j.customerVerified = true;
    j.otpVerifiedAt = nowIso();
    j.notes.push({ at: nowIso(), by, text: "Visit OTP verified" });
  });
  return err;
}

/** Customer gets (or regenerates) a visit OTP for an older booking. */
export function ensureVisitOtp(jobId: string) {
  mutate((d) => { const j = d.jobs.find((x) => x.id === jobId); if (j && !j.visitOtp) j.visitOtp = newVisitOtp(); });
}

export function logCall(jobId: string | null, from: string, to: string, seconds: number) {
  mutate((d) => {
    const j = jobId ? d.jobs.find((x) => x.id === jobId) : undefined;
    const entry = { id: uid(), at: nowIso(), jobId, from, to, seconds: Math.max(0, Math.round(seconds)), via: "In-app" as const };
    if (j) (j.calls ??= []).push(entry);
  });
}

/* ───────────────────────── Technician registration, role, birthdays, payment details ───────────────────────── */

export const empIdOf = (d: Pick<Db, "techs">, techId: string) => `PRC-T${String(Math.max(1, d.techs.findIndex((t) => t.id === techId) + 1)).padStart(3, "0")}`;
export const profileOf = (d: Pick<Db, "techs">, techId: string): TechProfile => d.techs.find((t) => t.id === techId)?.profile ?? emptyProfile(empIdOf(d, techId));

/** Technician (or admin) saves registration details. Uploading a document sets it to Pending; only admin verifies. */
export function saveTechProfile(techId: string, next: TechProfile, by: string, asAdmin = false): Err {
  let err: string | null = null;
  mutate((d) => {
    const t = d.techs.find((x) => x.id === techId);
    if (!t) { err = "Technician not found."; return; }
    const p: TechProfile = structuredClone(next);
    p.docs.aadhaar.number = aadhaarLast4(p.docs.aadhaar.number);
    p.docs.pan.number = p.docs.pan.number.toUpperCase().trim();
    p.bank.ifsc = p.bank.ifsc.toUpperCase().trim();
    const probs = profileProblems(p);
    if (probs.length) { err = probs[0]; return; }
    const prev = t.profile ?? emptyProfile(empIdOf(d, techId));
    for (const k of Object.keys(p.docs) as DocKey[]) {
      const changed = p.docs[k].file !== prev.docs[k].file || p.docs[k].number !== prev.docs[k].number;
      if (!asAdmin) p.docs[k].status = changed && (p.docs[k].file || p.docs[k].number) ? "Pending" : prev.docs[k].status;
      if (!asAdmin && !changed) p.docs[k].note = prev.docs[k].note;
    }
    if (!asAdmin) p.role = prev.role; // role & responsibilities are admin-only
    t.profile = { ...p, submittedAt: nowIso() };
    if (!asAdmin) notify(d, "admin", "Technician profile updated", `${t.name} · ${p.empId}${Object.values(p.docs).some((x) => x.status === "Pending") ? " · documents to verify" : ""}`);
    audit(d, by, "Technician profile saved", `${t.name} · ${p.empId}`);
  });
  return err;
}

export function setDocStatus(techId: string, key: DocKey, status: DocStatus, note: string, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const t = d.techs.find((x) => x.id === techId);
    if (!t) { err = "Technician not found."; return; }
    if (status === "Rejected" && !note.trim()) { err = "Give the reason for rejecting."; return; }
    t.profile ??= emptyProfile(empIdOf(d, techId));
    Object.assign(t.profile.docs[key], { status, note: note.trim(), at: nowIso() });
    notify(d, `tech:${techId}`, `${DOC_LABEL[key]} ${status.toLowerCase()}`, status === "Rejected" ? `Please upload again — ${note.trim()}` : `Your ${DOC_LABEL[key]} is ${status.toLowerCase()}.`);
    audit(d, by, "Document verification", `${t.name} · ${DOC_LABEL[key]} → ${status}`);
  });
  return err;
}

/** Admin sets each technician's job role and responsibilities. */
export function setTechRole(techId: string, title: string, responsibilities: string[], by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    const t = d.techs.find((x) => x.id === techId);
    if (!t) { err = "Technician not found."; return; }
    const list = responsibilities.map((r) => r.trim()).filter(Boolean);
    if (!title.trim()) { err = "Enter the job role."; return; }
    if (!list.length) { err = "Add at least one responsibility."; return; }
    t.profile ??= emptyProfile(empIdOf(d, techId));
    t.profile.role = { title: title.trim(), responsibilities: list, setBy: by, at: nowIso() };
    notify(d, `tech:${techId}`, "Your job role was updated", `${title.trim()} · ${list.length} responsibilities`);
    audit(d, by, "Job role set", `${t.name} · ${title.trim()}`);
  });
  return err;
}

/** Birthday notification once a year, the first time the technician app opens on the day. */
export function ensureBirthdayWish(techId: string, today: string) {
  const d0 = getSnapshot();
  const t = d0.techs.find((x) => x.id === techId);
  if (!t?.profile?.personal.dob || daysToBirthday(t.profile.personal.dob, today) !== 0) return;
  if (d0.notifications.some((n) => n.to === `tech:${techId}` && n.title.startsWith("Happy Birthday") && n.at.slice(0, 10) === today)) return;
  mutate((d) => notify(d, `tech:${techId}`, `Happy Birthday, ${t.name.split(" ")[0]}! 🎂`, `Wishing you a wonderful year ahead — from the whole ${d.settings.company} family.`));
}

export function setPaymentInfo(p: PaymentInfo, by: string): Err {
  let err: string | null = null;
  mutate((d) => {
    if (p.upi && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(p.upi.trim())) { err = "UPI ID must look like name@bank."; return; }
    if (p.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p.ifsc.trim().toUpperCase())) { err = "IFSC must look like SBIN0001234."; return; }
    if (p.account && !/^\d{9,18}$/.test(p.account.trim())) { err = "Account number must be 9–18 digits."; return; }
    d.paymentInfo = { ...p, upi: p.upi.trim(), ifsc: p.ifsc.trim().toUpperCase(), account: p.account.trim() };
    audit(d, by, "Payment details updated", `${p.bankName} · ${p.upi}`);
  });
  return err;
}

/* ───────────── Staff welfare: mess LPG, room rent, shop-staff tasks (welfare.ts) ───────────── */

/** Technician or office starts a new cylinder; the one in use is marked finished on that day. */
export function addCylinder(draft: LpgDraft, by: string, byRole: LpgCylinder["byRole"]): Err {
  const cur = currentCylinder(getSnapshot().cylinders ?? []);
  const err = validateLpg(draft, cur, isoDay(0));
  if (err) return err;
  mutate((d) => {
    d.cylinders ??= [];
    const open = currentCylinder(d.cylinders);
    if (open) open.end = draft.start;
    d.cylinders.unshift({ ...draft, no: draft.no.trim().toUpperCase(), vendor: draft.vendor.trim(), note: draft.note.trim(), id: `cyl${++d.seq}`, end: null, by, byRole, createdAt: nowIso() });
    // the refill task for the old cylinder is done once the new one is in use
    (d.staffTasks ?? []).forEach((t) => { if (open && t.key === `lpg:${open.id}` && t.status === "Open") Object.assign(t, { status: "Done", doneAt: nowIso(), doneBy: by, note: `New cylinder ${draft.no} started` }); });
    audit(d, by, "LPG cylinder started", `${draft.no} · ${draft.sizeKg} kg${open ? ` · ${open.no} finished after ${daysOf(open, draft.start)} days` : ""}`);
    if (byRole === "Technician") notify(d, "admin", "New LPG cylinder started", `${draft.no} at the mess, entered by ${by}${open ? ` · ${open.no} lasted ${daysOf(open, draft.start)} days` : ""}`);
  });
  return null;
}

export function finishCylinder(id: string, end: string, by: string): Err {
  const c = (getSnapshot().cylinders ?? []).find((x) => x.id === id);
  if (!c) return "Cylinder not found.";
  if (!end || end < c.start || end > isoDay(0)) return "Finish date must be between the start date and today.";
  mutate((d) => {
    const x = d.cylinders!.find((y) => y.id === id)!;
    x.end = end;
    audit(d, by, "LPG cylinder finished", `${x.no} · ${daysOf(x, end)} days`);
  });
  return null;
}

export function updateCylinder(id: string, patch: Partial<Pick<LpgCylinder, "no" | "start" | "end" | "people" | "meals" | "cost" | "vendor" | "note">>, by: string): Err {
  const c = (getSnapshot().cylinders ?? []).find((x) => x.id === id);
  if (!c) return "Cylinder not found.";
  const n = { ...c, ...patch };
  if (n.meals != null && !(n.meals >= 1 && n.meals <= 4)) return "Meals per day must be 1–4.";
  if (!n.no.trim()) return "Enter the cylinder number.";
  if (n.end && n.end < n.start) return "Finish date cannot be before the start date.";
  if (!(n.people >= 1)) return "Technicians covered must be at least 1.";
  mutate((d) => {
    Object.assign(d.cylinders!.find((y) => y.id === id)!, patch);
    audit(d, by, "LPG cylinder edited", n.no);
  });
  return null;
}

export function deleteCylinder(id: string, by: string) {
  mutate((d) => {
    const c = (d.cylinders ?? []).find((x) => x.id === id);
    if (!c) return;
    d.cylinders = d.cylinders!.filter((x) => x.id !== id);
    audit(d, by, "LPG cylinder deleted", c.no);
  });
}

export function saveRoom(id: string | null, draft: RoomDraft, by: string): Err {
  const err = validateRoom(draft);
  if (err) return err;
  mutate((d) => {
    d.rooms ??= [];
    const clean = { ...draft, label: draft.label.trim(), landlord: draft.landlord.trim(), note: draft.note.trim() };
    const r = id ? d.rooms.find((x) => x.id === id) : undefined;
    if (r) Object.assign(r, clean);
    else d.rooms.push({ ...clean, id: `room${++d.seq}` });
    audit(d, by, id ? "Room rent edited" : "Room rent added", `${clean.label} · ₹${clean.amount} on day ${clean.dueDay} → ${clean.assignTo}`);
  });
  return null;
}

/** Opens any task that is due today (rent reminder window reached, LPG nearly finished). Safe to call often. */
export function syncStaffTasks(day = isoDay(0)) {
  const s = getSnapshot();
  const add = [...dueTasks({ rooms: s.rooms ?? [], cylinders: s.cylinders ?? [], tasks: s.staffTasks ?? [] }, day), ...warrantyTasks(s.acSales ?? [], s.staffTasks ?? [], day)];
  if (!add.length) return 0;
  mutate((d) => {
    d.staffTasks ??= [];
    for (const t of add) {
      d.staffTasks.unshift({ ...t, id: `task${++d.seq}`, status: "Open", createdAt: nowIso() });
      notify(d, "admin", `Task for ${t.assignTo}: ${t.kind}`, `${t.title} — ${t.detail} · due ${fmtDate(t.due)}`);
    }
  });
  return add.length;
}

export function completeTask(id: string, by: string, note = "") {
  mutate((d) => {
    const t = (d.staffTasks ?? []).find((x) => x.id === id);
    if (!t || t.status === "Done") return;
    Object.assign(t, { status: "Done", doneAt: nowIso(), doneBy: by, note: note.trim() });
    audit(d, by, "Task done", `${t.title}${note ? ` · ${note}` : ""}`);
  });
}

/** Staff marks the rent task done by recording the payment. */
export function payRent(taskId: string, p: { amount: number; paidOn: string; mode: RentPayment["mode"]; ref: string }, by: string): Err {
  const t = (getSnapshot().staffTasks ?? []).find((x) => x.id === taskId);
  if (!t || t.kind !== "Room Rent") return "Task not found.";
  if (!(p.amount > 0)) return "Enter the amount paid.";
  if (!p.paidOn || p.paidOn > isoDay(0)) return "Paid date cannot be in the future.";
  if (p.mode !== "Cash" && !p.ref.trim()) return "Enter the UPI / transaction / cheque reference.";
  const [, roomId, month] = t.key.split(":");
  mutate((d) => {
    d.rentPayments ??= [];
    d.rentPayments.unshift({ id: `rent${++d.seq}`, roomId, month, paidOn: p.paidOn, amount: p.amount, mode: p.mode, ref: p.ref.trim(), by });
    Object.assign(d.staffTasks!.find((x) => x.id === taskId)!, { status: "Done", doneAt: nowIso(), doneBy: by, note: `Paid ₹${p.amount.toLocaleString("en-IN")} by ${p.mode}${p.ref ? ` · ${p.ref.trim()}` : ""}` });
    audit(d, by, "Room rent paid", `${t.title} · ₹${p.amount} ${p.mode}`);
    notify(d, "admin", "Room rent paid", `${t.title.replace("Pay room rent — ", "")} · ₹${p.amount.toLocaleString("en-IN")} ${p.mode} by ${by}`);
  });
  return null;
}

/* ───────────── Shop tools issue / return + rented tools (tools.ts) ───────────── */

const nextNo = (list: { id: string }[], prefix: string) => `${prefix}-${String(list.reduce((m, x) => Math.max(m, Number(x.id.split("-").pop()) || 0), 0) + 1).padStart(4, "0")}`;

export function issueTool(draft: IssueDraft, by: string): { id: string } | { error: string } {
  const err = validateIssue(draft);
  if (err) return { error: err };
  let id = "";
  mutate((d) => {
    d.toolIssues ??= [];
    id = nextNo(d.toolIssues, "TI");
    d.toolIssues.unshift({ ...structuredClone(draft), tool: draft.tool.trim(), site: draft.site.trim(), handedBy: draft.handedBy.trim(), id, createdAt: nowIso(), createdBy: by, ret: null });
    audit(d, by, "Tool issued", `${id} · ${draft.tool} ×${draft.qty} → ${draft.techName} · ${draft.site}`);
    if (draft.techId) notify(d, `tech:${draft.techId}`, "Tool issued to you", `${draft.tool} ×${draft.qty} for ${draft.site} — return by ${fmtDate(draft.expectedReturn)}`);
  });
  return { id };
}

export function returnTool(id: string, r: ReturnDraft, by: string): Err {
  const x = (getSnapshot().toolIssues ?? []).find((y) => y.id === id);
  if (!x) return "Entry not found.";
  if (x.ret) return "This tool is already returned.";
  const err = validateReturn(x, r);
  if (err) return err;
  mutate((d) => {
    const y = d.toolIssues!.find((z) => z.id === id)!;
    y.ret = { ...structuredClone(r), receivedBy: r.receivedBy.trim(), remarks: r.remarks.trim(), resolved: false };
    y.ret.resolved = !returnProblem(y);
    audit(d, by, "Tool returned", `${id} · ${y.tool} · ${r.condition}${missingOf(y).length ? ` · missing ${missingOf(y).join(", ")}` : ""}`);
    if (!y.ret.resolved) notify(d, "admin", "Tool returned with a problem", `${id} · ${y.tool} from ${y.techName}: ${r.remarks.trim()}`);
  });
  return null;
}

export function resolveToolIssue(id: string, by: string) {
  mutate((d) => {
    const y = (d.toolIssues ?? []).find((z) => z.id === id);
    if (!y?.ret) return;
    y.ret.resolved = true;
    audit(d, by, "Tool problem resolved", `${id} · ${y.tool}`);
  });
}

export function saveToolRental(id: string | null, draft: RentalDraft, by: string): Err {
  const err = validateRental(draft);
  if (err) return err;
  mutate((d) => {
    d.toolRentals ??= [];
    const clean = { ...structuredClone(draft), tool: draft.tool.trim(), site: draft.site.trim(), vendor: draft.vendor.trim(), remarks: draft.remarks.trim() };
    const r = id ? d.toolRentals.find((x) => x.id === id) : undefined;
    const total = rentalCalc(clean, isoDay(0)).total;
    if (r) Object.assign(r, clean);
    else d.toolRentals.unshift({ ...clean, id: nextNo(d.toolRentals, "TR"), createdAt: nowIso(), createdBy: by });
    audit(d, by, id ? "Tool rental updated" : "Tool rental added", `${clean.tool} ×${clean.qty} · ${clean.status} · ₹${total}`);
  });
  return null;
}

/* ───────────── AC sales & warranty (sales.ts) ───────────── */

/** A "call the customer" task 30 days before each warranty ends (for AMC / extended warranty). */
function warrantyTasks(sales: AcSale[], tasks: { key: string }[], day: string) {
  const have = new Set(tasks.map((t) => t.key));
  return sales.filter((x) => { const end = warrantyEnd(x); return end >= day && addDays(day, EXPIRY_ALERT_DAYS) >= end && !have.has(`warranty:${x.id}`); })
    .map((x) => ({ key: `warranty:${x.id}`, kind: "Warranty Expiry" as const, title: `Warranty ending — ${x.customer.name} (${x.id})`, detail: `${x.unit.brand} ${x.unit.capacity} ${x.unit.model} · ${x.install.location} · call ${x.customer.phone} for AMC / extended warranty`, due: warrantyEnd(x), assignTo: "Service Coordinator" as const }));
}

const acCapacity = (c: string): AcUnit["capacity"] => (c === "1 Ton" || c === "1.5 Ton" || c === "2 Ton" ? c : "Other");
const acApplication = (room: string): AcUnit["application"] => (/bed/i.test(room) ? "Bedroom" : /hall|living/i.test(room) ? "Hall" : /office/i.test(room) ? "Office" : /shop/i.test(room) ? "Shop" : /server/i.test(room) ? "Server Room" : "Other");

/** Registers the sale: one customer profile (found by mobile or created), and per AC its own Asset ID + AC record. */
export function registerSale(draft: SaleDraft, by: string): { ids: string[] } | { error: string } {
  const err = validateSale(draft) ?? duplicateSerial(getSnapshot().acSales ?? [], draft);
  if (err) return { error: err };
  const ids: string[] = [];
  mutate((d) => {
    d.acSales ??= [];
    const now = nowIso();
    const k = draft.customer;
    let cust = d.customers.find((c) => c.id === k.customerId && !c.mergedInto) ?? d.customers.find((c) => c.phone === k.phone && !c.mergedInto);
    if (!cust) {
      cust = { id: `c${++d.seq}`, name: k.name.trim(), phone: k.phone, altPhone: "", address: k.address.trim(), area: k.area.trim(), gps: "", type: "Residential", status: "New", contactPref: "WhatsApp", createdAt: now, amc: null };
      d.customers.unshift(cust);
      audit(d, by, "Customer created", `${cust.name} · ${cust.phone} (AC sale)`);
    }
    let n = d.acSales.reduce((m, x) => Math.max(m, Number(x.id.split("-").pop()) || 0), 0);
    const tech = d.techs.find((t) => t.id === draft.sale.techId);
    for (const u of draft.units) {
      const id = `PRC-AST-${String(++n).padStart(4, "0")}`;
      const acId = `ac${++d.seq}`;
      d.acs.push({ id: acId, customerId: cust.id, category: "AC", application: acApplication(u.room), acType: u.acType, capacity: acCapacity(u.capacity), brand: u.brand, model: u.model.trim(),
        serial: [u.indoorSerial.trim(), u.outdoorSerial.trim()].filter(Boolean).join(" / "), inverter: u.inverter, ageYears: 0, installAgeYears: 0, purchased: "New", warranty: "Yes", dailyHours: 8, usage: "Regular" });
      const rec: AcSale = {
        id, acId, customerId: cust.id,
        customer: { name: cust.name, phone: cust.phone, address: k.address.trim() || cust.address, area: k.area.trim() || cust.area },
        install: { location: u.room, status: draft.sale.status, date: draft.sale.status === "Installed" ? draft.sale.installDate : "", techId: tech?.id ?? "", techName: tech?.name ?? "", report: "", pipeFt: null },
        unit: { ...u, model: u.model.trim(), indoorSerial: u.indoorSerial.trim().toUpperCase(), outdoorSerial: u.outdoorSerial.trim().toUpperCase() },
        sale: { date: draft.sale.date, invoiceNo: draft.sale.invoiceNo.trim() },
        warranty: structuredClone(draft.warranty), docs: structuredClone(draft.docs), vendor: structuredClone(draft.vendor), claims: [], createdAt: now, createdBy: by,
      };
      d.acSales.unshift(rec);
      ids.push(id);
      audit(d, by, "AC sale registered", `${id} · ${u.brand} ${u.capacity} ${u.model} · ${cust.name}`);
      notify(d, `customer:${cust.id}`, "AC warranty registered", `${u.brand} ${u.capacity} (${u.room}) · Asset ${id} · warranty till ${fmtDate(warrantyEnd(rec))}`);
      if (tech && draft.sale.status === "Pending") notify(d, `tech:${tech.id}`, "AC installation assigned", `${id} · ${u.brand} ${u.capacity} at ${cust.name}, ${rec.customer.address}`);
    }
  });
  return { ids };
}

/** Edits a sale record. Vendor details can only be changed by Admin. */
export function updateSale(id: string, patch: Partial<Pick<AcSale, "customer" | "unit" | "sale" | "warranty" | "docs" | "vendor" | "install">>, by: string, isAdmin: boolean): Err {
  const x = (getSnapshot().acSales ?? []).find((y) => y.id === id);
  if (!x) return "Record not found.";
  if (patch.vendor && !isAdmin) return "Only Admin can change vendor details.";
  if (patch.unit && (!patch.unit.indoorSerial.trim() || (patch.unit.acType !== "Window" && !patch.unit.outdoorSerial.trim()))) return "Indoor and outdoor serial numbers are required.";
  if (patch.install?.status === "Installed" && !patch.install.date) return "Enter the installation date.";
  mutate((d) => {
    const y = d.acSales!.find((z) => z.id === id)!;
    Object.assign(y, structuredClone(patch));
    const ac = d.acs.find((a) => a.id === y.acId);
    if (ac && patch.unit) Object.assign(ac, { brand: y.unit.brand, model: y.unit.model, acType: y.unit.acType, capacity: acCapacity(y.unit.capacity), serial: [y.unit.indoorSerial, y.unit.outdoorSerial].filter(Boolean).join(" / ") });
    if (patch.install?.status === "Installed" && x.install.status !== "Installed") {
      y.install.reportAt = nowIso();
      notify(d, `customer:${y.customerId}`, "AC installed", `${y.unit.brand} ${y.unit.capacity} · ${y.install.location} · Asset ${y.id}`);
    }
    audit(d, by, "AC sale updated", `${id} · ${Object.keys(patch).join(", ")}`);
  });
  return null;
}

export function saveClaim(saleId: string, c: Omit<WarrantyClaim, "id" | "by" | "updatedAt"> & { id?: string }, by: string): Err {
  const x = (getSnapshot().acSales ?? []).find((y) => y.id === saleId);
  if (!x) return "Record not found.";
  if (!c.issue.trim()) return "Describe the problem.";
  if (!c.date) return "Pick the claim date.";
  if (Object.values(c.charges).some((n) => !(n >= 0))) return "Charges cannot be negative.";
  mutate((d) => {
    const y = d.acSales!.find((z) => z.id === saleId)!;
    const old = c.id ? y.claims.find((z) => z.id === c.id) : undefined;
    if (old) Object.assign(old, { ...c, by, updatedAt: nowIso() });
    else y.claims.unshift({ ...c, id: `CLM-${String(y.claims.length + 1).padStart(2, "0")}`, by, updatedAt: nowIso() });
    audit(d, by, old ? "Warranty claim updated" : "Warranty claim raised", `${saleId} · ${c.part || c.issue} · ${c.status}`);
    notify(d, `customer:${y.customerId}`, `Warranty claim · ${c.status}`, `${y.unit.brand} ${y.unit.capacity} (${y.id}) — ${c.part || c.issue}`);
  });
  return null;
}

/* ───────────── AC site visit reports (sitevisit.ts) ───────────── */

export function saveSiteVisit(id: string | null, techId: string, draft: SiteVisitDraft): { id: string } {
  let out = id ?? "";
  mutate((d) => {
    d.siteVisits ??= [];
    const v = id ? d.siteVisits.find((x) => x.id === id) : undefined;
    if (v) { Object.assign(v, structuredClone(draft)); return; }
    out = `SV-${String(d.siteVisits.reduce((m, x) => Math.max(m, Number(x.id.split("-").pop()) || 0), 0) + 1).padStart(4, "0")}`;
    d.siteVisits.unshift({ ...structuredClone(draft), id: out, techId, techName: techName(d, techId), status: "Draft", office: null, createdAt: nowIso() });
  });
  return { id: out };
}

export function submitSiteVisit(id: string, draft: SiteVisitDraft): string[] {
  const p = visitProblems(draft);
  if (p.length) return p;
  mutate((d) => {
    const v = (d.siteVisits ?? []).find((x) => x.id === id);
    if (!v) return;
    Object.assign(v, structuredClone(draft), { status: "Submitted", submittedAt: nowIso() });
    notify(d, "admin", "Site visit report submitted", `${id} · ${v.customer.name} · ${v.techName}${(v.pipeFt ?? 0) > v.standardFt ? ` · extra pipe ${(v.pipeFt ?? 0) - v.standardFt} ft` : ""}`);
    audit(d, v.techName, "Site visit submitted", `${id} · ${v.customer.name}`);
  });
  return [];
}

export function reviewSiteVisit(id: string, ok: boolean, notes: string, by: string): Err {
  if (!ok && !notes.trim()) return "Write what the technician must correct.";
  mutate((d) => {
    const v = (d.siteVisits ?? []).find((x) => x.id === id);
    if (!v) return;
    v.status = ok ? "Reviewed" : "Correction Required";
    v.office = { notes: notes.trim(), by, at: nowIso() };
    notify(d, `tech:${v.techId}`, ok ? "Site visit reviewed" : "Site visit needs correction", `${id} · ${v.customer.name}${notes.trim() ? ` — ${notes.trim()}` : ""}`);
    audit(d, by, ok ? "Site visit reviewed" : "Site visit sent back", `${id}${notes ? ` · ${notes}` : ""}`);
  });
  return null;
}
