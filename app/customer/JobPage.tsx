"use client";

import { useState } from "react";
import { ClockIcon, PhoneIcon, ReceiptIcon, StarIcon } from "../components/icons";
import { ComplaintBox, InvoiceDoc, JobPill, MapMock, ProgressSteps, QuoteTable, SecureBadge, SecureScreen, Timeline } from "../components/service";
import { Avatar, BottomSheet, Chips, Footer, GhostButton, PageHeader, PrimaryButton, StarPicker, card, sectionTitle, small } from "../components/ui";
import { acLabel, fmtDateTime, initials, inr, jobTotals, relDay, siteOf, stepOf, validateSite, type Db, type Job, type PayMethod, type ServiceSite } from "../lib/data";
import { changeJobSite } from "../lib/store";
import { SiteCard, SiteForm } from "./SiteForm";

export function CustomerJobPage({ db, job, onBack, onApprove, onReject, onPay, onRate, onCancel, onInvoice }: {
  db: Db; job: Job; onBack: () => void;
  onApprove: () => void; onReject: () => void; onPay: (amount: number, method: PayMethod, ref: string) => void;
  onRate: (n: number) => void; onCancel: (reason: string) => void; onInvoice: () => void;
}) {
  const [sheet, setSheet] = useState<"approve" | "reject" | "pay" | "cancel" | "address" | null>(null);
  const cust = db.customers.find((x) => x.id === job.customerId);
  const site = siteOf(job, cust);
  const canChangeSite = job.status !== "Cancelled" && stepOf(job.status) < stepOf("On the Way");
  const [stars, setStars] = useState(0);
  const ac = db.acs.find((a) => a.id === job.acId)!;
  const tech = db.techs.find((t) => t.id === job.techId);
  const t = jobTotals(job, db.settings);
  const step = stepOf(job.status);
  const quotePending = job.status === "Estimate Prepared" && job.quote?.status === "Pending";
  const due = job.invoice && t.due > 0;
  const canCancel = step >= 0 && step < stepOf("On the Way");

  return (
    <SecureScreen label="your quotation and invoice">
      <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
        <PageHeader title={`Service ${job.id}`} sub={`${ac.application} AC · ${acLabel(ac)}`} onBack={onBack} right={<JobPill status={job.status} />} />
        <div style={{ padding: "0 16px 12px", flex: 1 }}>
          {job.status !== "Cancelled" && <div style={{ ...card, padding: "14px 8px" }}><ProgressSteps status={job.status} /></div>}
          {job.status === "Cancelled" && <div style={{ ...card, padding: 14, background: "var(--surface-dim)", boxShadow: "none" }}><p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Cancelled · {job.cancelReason}</p></div>}

          {/* Technician / tracking */}
          {job.status === "On the Way" && (
            <div className="fade-up" style={{ marginTop: 12 }}><MapMock moving etaMin={18} /></div>
          )}
          <SiteCard site={site} onChange={canChangeSite ? () => setSheet("address") : undefined} />

          {tech ? (
            <div style={{ ...card, padding: 14, marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar initials={initials(tech.name)} size={44} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{tech.name}</p>
                <p style={{ ...small, display: "flex", alignItems: "center", gap: 4 }}><StarIcon s={12} /> {tech.rating} · Your technician</p>
              </div>
              <a href={`tel:+91${tech.phone}`} aria-label={`Call ${tech.name}`} className="press" style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center" }}><PhoneIcon s={18} c="var(--success-text)" /></a>
            </div>
          ) : job.status === "New Request" && (
            <div style={{ ...card, padding: 14, marginTop: 12, background: "var(--info-bg)", boxShadow: "none" }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--info-text)", fontWeight: 600 }}>Request received. Our coordinator will assign a technician shortly — you&apos;ll get a notification.</p>
            </div>
          )}
          <p style={{ ...small, display: "flex", alignItems: "center", gap: 6, margin: "10px 4px 0" }}><ClockIcon s={14} c="var(--ink-soft)" /> {relDay(job.date)}, {job.slot}</p>

          {/* Quotation */}
          {job.quote && job.lines.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 style={sectionTitle}>{job.invoice ? "Bill" : `Quotation ${job.quote.no}`}</h3>
                <SecureBadge />
              </div>
              {quotePending && (
                <div style={{ ...card, padding: 12, marginBottom: 10, background: "var(--gold-tint)", boxShadow: "none", border: "1px solid var(--gold-100)" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gold-dark)" }}>Your approval is needed{job.quote.revision > 1 ? ` · revision ${job.quote.revision}` : ""}</p>
                  <p style={{ ...small, marginTop: 2 }}>{job.diagnosis.rootCause ? `Technician found: ${job.diagnosis.rootCause}.` : ""} {job.diagnosis.recommendation}</p>
                </div>
              )}
              {job.quote.status === "Rejected" && !job.invoice && <p style={{ ...small, color: "var(--error-text)", fontWeight: 600, margin: "0 0 8px" }}>You rejected this quotation. The technician may revise it.</p>}
              <div style={{ ...card, padding: "4px 14px" }}><QuoteTable job={job} db={db} /></div>
              {job.quote.status === "Approved" && !job.invoice && <p style={{ ...small, margin: "8px 4px 0" }}>Approved via {job.quote.approvedVia} · {fmtDateTime(job.quote.decidedAt!)}</p>}
            </>
          )}

          {job.invoice && (
            <button onClick={onInvoice} className="press" style={{ ...card, width: "100%", marginTop: 10, padding: 14, border: "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}>
              <ReceiptIcon s={22} c="var(--blue)" />
              <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>Invoice {job.invoice.no}</span><span style={{ fontSize: 12, color: "var(--ink-soft)" }}>View, print or download PDF</span></span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: t.due ? "var(--error-text)" : "var(--success-text)" }}>{t.due ? `${inr(t.due)} due` : "Paid"}</span>
            </button>
          )}

          {/* Rating */}
          {job.status === "Closed" && !job.rating && tech && (
            <div style={{ ...card, padding: 16, marginTop: 12, textAlign: "center" }}>
              <p style={{ margin: "0 0 10px", fontSize: 14.5, fontWeight: 700 }}>How was {tech.name.split(" ")[0]}&apos;s service?</p>
              <StarPicker value={stars} onChange={setStars} />
              <PrimaryButton disabled={!stars} onClick={() => onRate(stars)} style={{ marginTop: 14, padding: 12 }}>Submit rating</PrimaryButton>
            </div>
          )}
          {job.rating && <p style={{ ...small, textAlign: "center", marginTop: 12 }}>You rated this service {"★".repeat(job.rating)}</p>}

          <h3 style={sectionTitle}>Your complaint</h3>
          <ComplaintBox job={job} />

          {job.diagnosis.rootCause && (
            <>
              <h3 style={sectionTitle}>Technician&apos;s findings</h3>
              <div style={{ ...card, padding: 14, fontSize: 13, lineHeight: 1.6 }}>
                <p style={{ margin: 0 }}><b>Cause:</b> {job.diagnosis.rootCause}</p>
                {job.diagnosis.observed && <p style={{ margin: 0 }}><b>Observed:</b> {job.diagnosis.observed}</p>}
                {job.work.remarks && <p style={{ margin: 0 }}><b>Work done:</b> {job.work.remarks}</p>}
              </div>
            </>
          )}

          <h3 style={sectionTitle}>Updates</h3>
          <div style={{ ...card, padding: 14 }}><Timeline job={job} /></div>

          {canCancel && <button onClick={() => setSheet("cancel")} style={{ display: "block", margin: "16px auto 4px", background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 13, fontWeight: 600 }}>Cancel this request</button>}
        </div>

        {(quotePending || due) && (
          <Footer>
            {quotePending && (
              <div style={{ display: "flex", gap: 10 }}>
                <GhostButton danger onClick={() => setSheet("reject")} style={{ flex: 1 }}>Reject</GhostButton>
                <PrimaryButton tone="green" onClick={() => setSheet("approve")} style={{ flex: 2 }}>Approve {inr(t.total)}</PrimaryButton>
              </div>
            )}
            {due && <PrimaryButton tone="gold" onClick={() => setSheet("pay")}>Pay {inr(t.due)}</PrimaryButton>}
          </Footer>
        )}

        {sheet === "address" && cust && <AddressSheet job={job} site={site} me={cust} onClose={() => setSheet(null)} />}
        {sheet === "approve" && <ApproveSheet total={t.total} onClose={() => setSheet(null)} onConfirm={() => { setSheet(null); onApprove(); }} />}
        {sheet === "reject" && (
          <BottomSheet title="Reject quotation?" onClose={() => setSheet(null)}>
            <p style={{ ...small, marginBottom: 14 }}>The technician will not start the repair. Only the inspection charge of {inr(db.services.find((s) => s.id === "sv-visit")?.price ?? 0)} applies if they close the visit. You can also ask them to revise it.</p>
            <GhostButton danger onClick={() => { setSheet(null); onReject(); }}>Yes, reject quotation</GhostButton>
          </BottomSheet>
        )}
        {sheet === "pay" && <PaySheet amount={t.due} onClose={() => setSheet(null)} onPaid={(m, ref) => { setSheet(null); onPay(t.due, m, ref); }} />}
        {sheet === "cancel" && <CancelSheet onClose={() => setSheet(null)} onConfirm={(r) => { setSheet(null); onCancel(r); }} />}
      </div>
    </SecureScreen>
  );
}

function ApproveSheet({ total, onClose, onConfirm }: { total: number; onClose: () => void; onConfirm: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <BottomSheet title="Approve quotation" onClose={onClose}>
      <div style={{ ...card, padding: 14, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Amount</p>
        <p style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{inr(total)}</p>
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "14px 4px", cursor: "pointer" }}>
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
        <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>I approve this work and amount. Any additional work will need my separate approval.</span>
      </label>
      <PrimaryButton tone="green" disabled={!ok} onClick={onConfirm}>Approve &amp; start work</PrimaryButton>
    </BottomSheet>
  );
}

function PaySheet({ amount, onClose, onPaid }: { amount: number; onClose: () => void; onPaid: (m: PayMethod, ref: string) => void }) {
  const [m, setM] = useState<"UPI" | "Card" | "Online">("UPI");
  const [busy, setBusy] = useState(false);
  const pay = () => {
    setBusy(true);
    // Demo gateway — Razorpay / PhonePe checkout goes here with the backend.
    setTimeout(() => onPaid(m, `${m === "UPI" ? "UPI" : m === "Card" ? "CRD" : "NB"}${Date.now().toString().slice(-8)}`), 1200);
  };
  return (
    <BottomSheet title="Pay securely" onClose={onClose}>
      <div style={{ ...card, padding: 14, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Amount to pay</p>
        <p style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{inr(amount)}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {([["UPI", "UPI · GPay, PhonePe, Paytm"], ["Card", "Debit / Credit card"], ["Online", "Net banking"]] as const).map(([k, t]) => (
          <button key={k} onClick={() => setM(k)} aria-pressed={m === k} style={{ ...card, padding: 14, textAlign: "left", cursor: "pointer", fontSize: 14, fontWeight: 600, border: m === k ? "2px solid var(--blue)" : "2px solid transparent" }}>{t}</button>
        ))}
      </div>
      <p style={{ ...small, margin: "10px 4px 14px" }}>Demo payment — no money is charged. You can also pay cash to the technician.</p>
      <PrimaryButton tone="gold" disabled={busy} onClick={pay}>{busy ? "Processing…" : `Pay ${inr(amount)}`}</PrimaryButton>
    </BottomSheet>
  );
}

const CANCEL_REASONS = ["Problem solved on its own", "Booked by mistake", "Want a different date", "Found another service"] as const;

function CancelSheet({ onClose, onConfirm }: { onClose: () => void; onConfirm: (r: string) => void }) {
  const [r, setR] = useState("");
  return (
    <BottomSheet title="Cancel request" onClose={onClose}>
      <Chips options={CANCEL_REASONS} value={r as (typeof CANCEL_REASONS)[number]} onChange={setR} />
      <PrimaryButton disabled={!r} onClick={() => onConfirm(r)} style={{ marginTop: 16 }}>Cancel request</PrimaryButton>
    </BottomSheet>
  );
}

export function InvoicePage({ db, job, onBack }: { db: Db; job: Job; onBack: () => void }) {
  const kind = job.invoice ? "invoice" : "quotation";
  return (
    <SecureScreen label="your invoice">
      <PageHeader title={kind === "invoice" ? "Invoice" : "Quotation"} onBack={onBack} />
      <div style={{ padding: "0 16px 20px" }}>
        <InvoiceDoc job={job} db={db} kind={kind} />
        <p style={{ ...small, textAlign: "center", margin: "10px 0" }}>Sharing is only through this button — screenshots are blocked in the Android app.</p>
        <PrimaryButton onClick={() => window.print()}>Download / Print PDF</PrimaryButton>
      </div>
    </SecureScreen>
  );
}

function AddressSheet({ job, site, me, onClose }: { job: Job; site: ServiceSite; me: NonNullable<Db["customers"][number]>; onClose: () => void }) {
  const [v, setV] = useState<ServiceSite>(site);
  const [err, setErr] = useState<string | null>(null);
  const save = () => { const e = validateSite(v) ?? changeJobSite(job.id, v, me.name); if (e) setErr(e); else onClose(); };
  return (
    <BottomSheet title="Change service address" onClose={onClose}>
      <SiteForm me={me} value={v} onChange={setV} />
      {err && <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
      <div style={{ marginTop: 14 }}><PrimaryButton onClick={save}>Save Address</PrimaryButton></div>
    </BottomSheet>
  );
}
