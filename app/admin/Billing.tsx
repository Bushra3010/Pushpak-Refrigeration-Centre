"use client";

import { useState } from "react";
import { InvoiceDoc, PAY_TONE } from "../components/service";
import { fmtDate, fmtDateTime, inr, jobTotals, paymentStatus, type Db, type Job, type PaymentStatus } from "../lib/data";
import { recordPayment } from "../lib/store";
import { PaymentModal, custName } from "./Jobs";
import { Badge, Btn, Filter, Modal, Panel, SearchBox, Stat, Table, muted } from "./kit";

type QFilter = "All" | "Pending" | "Approved" | "Rejected";

export function QuotationsSection({ db, openJob }: { db: Db; openJob: (id: string) => void }) {
  const [f, setF] = useState<QFilter>("All");
  const [view, setView] = useState<Job | null>(null);
  const quoted = db.jobs.filter((j) => j.quote && j.quote.status !== "Draft").sort((a, b) => b.quote!.at.localeCompare(a.quote!.at));
  const rows = quoted.filter((j) => f === "All" || j.quote!.status === f);
  const pending = quoted.filter((j) => j.quote!.status === "Pending");
  const approved = quoted.filter((j) => j.quote!.status === "Approved" || j.invoice);
  const conv = quoted.length ? Math.round((approved.length / quoted.length) * 100) : 0;
  return (
    <>
      <div className="admin-grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Awaiting approval" value={String(pending.length)} sub={inr(pending.reduce((s, j) => s + jobTotals(j, db.settings).total, 0))} tone="amber" />
        <Stat label="Approval rate" value={`${conv}%`} sub={`${approved.length} of ${quoted.length} quotations`} tone="green" />
        <Stat label="Upsell items quoted" value={String(quoted.reduce((s, j) => s + j.lines.filter((l) => l.upsell).length, 0))} tone="purple" />
        <Stat label="Revised quotations" value={String(quoted.filter((j) => j.quote!.revision > 1).length)} tone="blue" />
      </div>
      <Panel title="Quotations" pad={false}>
        <div style={{ padding: "12px 16px" }}><Filter<QFilter> options={["All", "Pending", "Approved", "Rejected"]} value={f} onChange={setF} /></div>
        <Table rows={rows} rowKey={(j) => j.id} cols={[
          { key: "n", head: "Quotation", render: (j) => <><b>{j.quote!.no}</b><div style={muted}>{fmtDateTime(j.quote!.at)}</div></> },
          { key: "j", head: "Job", render: (j) => <button onClick={() => openJob(j.id)} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontWeight: 700, cursor: "pointer" }}>{j.id}</button> },
          { key: "c", head: "Customer", render: (j) => custName(db, j.customerId) },
          { key: "i", head: "Items", render: (j) => <span style={{ fontSize: 12 }}>{j.lines.length} items{j.lines.some((l) => l.upsell) && <> · <Badge tone="orange">upsell</Badge></>}</span> },
          { key: "a", head: "Total", align: "right", render: (j) => <b>{inr(jobTotals(j, db.settings).total)}</b> },
          { key: "s", head: "Status", render: (j) => <><Badge tone={j.quote!.status === "Approved" ? "green" : j.quote!.status === "Rejected" ? "red" : "amber"}>{j.quote!.status}</Badge>{j.quote!.approvedVia && <div style={muted}>via {j.quote!.approvedVia}</div>}</> },
          { key: "x", head: "", align: "right", render: (j) => <Btn small kind="ghost" onClick={() => setView(j)}>View</Btn> },
        ]} />
      </Panel>
      {view && <Modal width={620} title={view.quote!.no} onClose={() => setView(null)} footer={<Btn onClick={() => window.print()}>Print / PDF</Btn>}><InvoiceDoc job={view} db={db} kind="quotation" /></Modal>}
    </>
  );
}

type IFilter = "All" | PaymentStatus;

export function BillingSection({ db, who, notify, openJob }: { db: Db; who: string; notify: (m: string) => void; openJob: (id: string) => void }) {
  const [f, setF] = useState<IFilter>("All");
  const [q, setQ] = useState("");
  const [view, setView] = useState<Job | null>(null);
  const [pay, setPay] = useState<Job | null>(null);
  const invoiced = db.jobs.filter((j) => j.invoice).sort((a, b) => b.invoice!.at.localeCompare(a.invoice!.at));
  const rows = invoiced.filter((j) => (f === "All" || paymentStatus(j, db.settings) === f) && (!q.trim() || `${j.invoice!.no} ${j.id} ${custName(db, j.customerId)}`.toLowerCase().includes(q.trim().toLowerCase())));
  const totals = invoiced.map((j) => jobTotals(j, db.settings));
  const billed = totals.reduce((s, t) => s + t.total, 0);
  const collected = totals.reduce((s, t) => s + t.paid, 0);
  const due = totals.reduce((s, t) => s + t.due, 0);
  const gst = totals.reduce((s, t) => s + t.gst, 0);
  const pays = invoiced.flatMap((j) => j.payments);
  const byMethod = (["Cash", "UPI", "Card", "Online"] as const).map((m) => [m, pays.filter((p) => p.method === m && !p.refund).reduce((s, p) => s + p.amount, 0)] as const);

  return (
    <>
      <div className="admin-grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Billed" value={inr(billed)} sub={`${invoiced.length} invoices`} tone="blue" />
        <Stat label="Collected" value={inr(collected)} sub={byMethod.filter(([, v]) => v).map(([m, v]) => `${m} ${inr(v)}`).join(" · ")} tone="green" />
        <Stat label="Pending payments" value={inr(due)} sub={`${invoiced.filter((j) => jobTotals(j, db.settings).due > 0).length} invoices`} tone="red" />
        <Stat label={`GST collected${db.settings.gstEnabled ? "" : " (off)"}`} value={inr(gst)} tone="purple" />
      </div>
      <Panel title="Invoices & payments" pad={false} actions={<SearchBox value={q} onChange={setQ} placeholder="Invoice, job, customer" />}>
        <div style={{ padding: "12px 16px" }}><Filter<IFilter> options={["All", "Pending", "Partially Paid", "Paid", "Refunded"]} value={f} onChange={setF} /></div>
        <Table rows={rows} rowKey={(j) => j.id} cols={[
          { key: "n", head: "Invoice", render: (j) => <><b>{j.invoice!.no}</b><div style={muted}>{fmtDate(j.invoice!.at)}</div></> },
          { key: "j", head: "Job", render: (j) => <button onClick={() => openJob(j.id)} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontWeight: 700, cursor: "pointer" }}>{j.id}</button> },
          { key: "c", head: "Customer", render: (j) => custName(db, j.customerId) },
          { key: "t", head: "Total", align: "right", render: (j) => inr(jobTotals(j, db.settings).total) },
          { key: "p", head: "Paid", align: "right", render: (j) => <>{inr(jobTotals(j, db.settings).paid)}<div style={muted}>{j.payments.map((p) => p.method).join(", ")}</div></> },
          { key: "d", head: "Due", align: "right", render: (j) => { const d = jobTotals(j, db.settings).due; return d ? <b style={{ color: "var(--error-text)" }}>{inr(d)}</b> : "—"; } },
          { key: "s", head: "Status", render: (j) => <Badge tone={PAY_TONE[paymentStatus(j, db.settings)]}>{paymentStatus(j, db.settings)}</Badge> },
          { key: "x", head: "", align: "right", render: (j) => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            {jobTotals(j, db.settings).due > 0 && <Btn small kind="gold" onClick={() => setPay(j)}>Record payment</Btn>}
            <Btn small kind="ghost" onClick={() => setView(j)}>Invoice</Btn>
          </div> },
        ]} />
      </Panel>
      {view && <Modal width={620} title={view.invoice!.no} onClose={() => setView(null)} footer={<Btn onClick={() => window.print()}>Print / PDF</Btn>}><InvoiceDoc job={view} db={db} kind="invoice" /></Modal>}
      {pay && <PaymentModal due={jobTotals(pay, db.settings).due} onClose={() => setPay(null)} onConfirm={(a, m, r) => { recordPayment(pay.id, a, m, r, who); setPay(null); notify(`${inr(a)} recorded against ${pay.invoice!.no}`); }} />}
    </>
  );
}
