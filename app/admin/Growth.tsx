"use client";

import { useState } from "react";
import { acLabel, acSummary, daysBetween, fmtDate, fmtDateTime, inr, isDone, isoDay, today, type Db, type LeadStatus } from "../lib/data";
import { sellAmc, sendReminder, setAcQuoteStatus, setLead } from "../lib/store";
import { NewJobModal, custName } from "./Jobs";
import { Badge, Btn, Filter, Modal, Panel, Stat, Table, muted } from "./kit";

type View = "New AC quotes" | "AMC opportunities" | "AMC renewals" | "Service reminders" | "Replacement leads" | "Follow-ups" | "Upsell";
const LEAD_TONE: Record<LeadStatus, "blue" | "amber" | "green" | "grey"> = { Open: "blue", Contacted: "amber", Converted: "green", Dismissed: "grey" };

export function GrowthSection({ db, who, notify, openJob }: { db: Db; who: string; notify: (m: string) => void; openJob: (id: string) => void }) {
  const quotes = db.acQuotes ?? [];
  const openQuotes = quotes.filter((q) => q.status === "Open" || q.status === "Contacted");
  const [view, setView] = useState<View>(openQuotes.length ? "New AC quotes" : "AMC opportunities");
  const [amcFor, setAmcFor] = useState<string | null>(null);
  const [bookFor, setBookFor] = useState<string | null>(null);
  const live = db.customers.filter((c) => !c.mergedInto);
  const lead = (k: string): LeadStatus => db.leads[k] ?? "Open";
  const acsOf = (cid: string) => db.acs.filter((a) => a.customerId === cid);
  const visits = (cid: string) => db.jobs.filter((j) => j.customerId === cid && isDone(j)).length;

  const amcOpps = live.filter((c) => !c.amc && (visits(c.id) >= 2 || acsOf(c.id).length > 1 || acsOf(c.id).some((a) => a.usage === "Heavy" || a.usage === "24×7")) && lead(`amc:${c.id}`) !== "Dismissed");
  const renewals = live.filter((c) => c.amc && daysBetween(today(), c.amc.to) <= 30);
  const due = db.acs.filter((a) => {
    const c = live.find((x) => x.id === a.customerId);
    if (!c) return false;
    const s = acSummary(db, a.id);
    const open = db.jobs.some((j) => j.acId === a.id && !isDone(j) && j.status !== "Cancelled");
    return !open && (!s.lastService || daysBetween(s.lastService, today()) >= db.settings.reminderDays);
  });
  const replace = db.acs.filter((a) => live.some((c) => c.id === a.customerId) && (a.ageYears >= 8 || acSummary(db, a.id).spend >= 15000) && lead(`rep:${a.id}`) !== "Dismissed");
  const follow = db.jobs.filter((j) => j.followUp && j.followUp.date <= isoDay(14)).sort((a, b) => a.followUp!.date.localeCompare(b.followUp!.date));
  const done = db.jobs.filter(isDone);
  const upsellLines = done.flatMap((j) => j.lines.filter((l) => l.upsell).map((l) => ({ ...l, job: j })));
  const upsellRev = upsellLines.reduce((s, l) => s + l.qty * l.price, 0);
  const amcValue = amcOpps.reduce((s, c) => s + acsOf(c.id).length * db.settings.amcBasic, 0);

  const views: View[] = ["New AC quotes", "AMC opportunities", "AMC renewals", "Service reminders", "Replacement leads", "Follow-ups", "Upsell"];
  const counts: Partial<Record<View, number>> = { "New AC quotes": openQuotes.length, "AMC opportunities": amcOpps.length, "AMC renewals": renewals.length, "Service reminders": due.length, "Replacement leads": replace.length, "Follow-ups": follow.length, Upsell: upsellLines.length };

  return (
    <>
      <div className="admin-grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Upsell revenue" value={inr(upsellRev)} sub={`${upsellLines.length} recommended items sold`} tone="green" />
        <Stat label="AMC opportunities" value={String(amcOpps.length)} sub={`≈ ${inr(amcValue)} / year`} tone="purple" />
        <Stat label="Service reminders due" value={String(due.length)} sub={`every ${db.settings.reminderDays} days`} tone="amber" />
        <Stat label="Replacement leads" value={String(replace.length)} sub="old / high repair cost ACs" tone="blue" />
      </div>
      <Panel title="Revenue opportunities" pad={false}>
        <div style={{ padding: "12px 16px" }}><Filter<View> options={views} value={view} onChange={setView} counts={counts} /></div>

        {view === "New AC quotes" && (
          <Table rows={quotes} rowKey={(q) => q.id} empty="No AC quote requests yet — they come from Find My AC Size in the customer app." cols={[
            { key: "d", head: "Received", render: (q) => <>{fmtDateTime(q.at)}<div style={muted}>{q.timeline}</div></> },
            { key: "c", head: "Customer", render: (q) => <><b>{q.contact.name}</b><div style={muted}>+91 {q.contact.phone}</div><div style={muted}>{q.contact.address}</div></> },
            { key: "w", head: "Wants", render: (q) => <><b>{q.quantity} × {q.acType} · {q.capacityTons != null ? `${q.capacityTons} TR` : "size to suggest"}</b>
              <div style={muted}>{q.starRating} · {q.inverter} · {q.withInstallation ? "with installation" : "unit price only"}</div>
              <div style={muted}>{q.brands.join(", ")}</div>{q.notes && <div style={{ fontSize: 12, marginTop: 2 }}>“{q.notes}”</div>}</> },
            { key: "s", head: "Room estimate", render: (q) => <span style={{ fontSize: 12 }}>{q.sizing || "—"}{q.recommendedTons != null && q.capacityTons != null && q.capacityTons < q.recommendedTons && <div><Badge tone="amber">Below estimate</Badge></div>}</span> },
            { key: "l", head: "Lead", render: (q) => <Badge tone={LEAD_TONE[q.status]}>{q.status}</Badge> },
            { key: "x", head: "", align: "right", render: (q) => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {(["Contacted", "Converted", "Dismissed"] as const).filter((s) => s !== q.status).map((s) => <Btn key={s} small kind={s === "Converted" ? "gold" : "ghost"} onClick={() => { setAcQuoteStatus(q.id, s, who); notify(`Quote → ${s}`); }}>{s}</Btn>)}
            </div> },
          ]} />
        )}

        {view === "AMC opportunities" && (
          <Table rows={amcOpps} rowKey={(c) => c.id} empty="No AMC opportunities right now." cols={[
            { key: "c", head: "Customer", render: (c) => <><b>{c.name}</b><div style={muted}>+91 {c.phone} · {c.type}</div></> },
            { key: "w", head: "Why", render: (c) => <span style={{ fontSize: 12 }}>{[visits(c.id) >= 2 && `${visits(c.id)} paid visits`, acsOf(c.id).length > 1 && `${acsOf(c.id).length} ACs`, acsOf(c.id).some((a) => a.usage === "Heavy" || a.usage === "24×7") && "heavy usage"].filter(Boolean).join(" · ")}</span> },
            { key: "v", head: "Plan value", align: "right", render: (c) => inr(acsOf(c.id).length * db.settings.amcBasic) },
            { key: "s", head: "Lead", render: (c) => <Badge tone={LEAD_TONE[lead(`amc:${c.id}`)]}>{lead(`amc:${c.id}`)}</Badge> },
            { key: "x", head: "", align: "right", render: (c) => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {lead(`amc:${c.id}`) === "Open" && <Btn small kind="ghost" onClick={() => { setLead(`amc:${c.id}`, "Contacted", who); notify("Marked contacted"); }}>Contacted</Btn>}
              <Btn small kind="gold" onClick={() => setAmcFor(c.id)}>Sell AMC</Btn>
              <Btn small kind="ghost" onClick={() => { setLead(`amc:${c.id}`, "Dismissed", who); notify("Dismissed"); }}>Dismiss</Btn>
            </div> },
          ]} />
        )}

        {view === "AMC renewals" && (
          <Table rows={renewals} rowKey={(c) => c.id} empty="No renewals due in the next 30 days." cols={[
            { key: "c", head: "Customer", render: (c) => <><b>{c.name}</b><div style={muted}>+91 {c.phone}</div></> },
            { key: "p", head: "Plan", render: (c) => c.amc!.plan },
            { key: "e", head: "Expires", render: (c) => { const d = daysBetween(today(), c.amc!.to); return <>{fmtDate(c.amc!.to)}<div style={{ ...muted, color: d < 0 ? "var(--error-text)" : undefined }}>{d < 0 ? `expired ${-d} days ago` : `in ${d} days`}</div></>; } },
            { key: "v", head: "Visits left", align: "center", render: (c) => c.amc!.visitsLeft },
            { key: "x", head: "", align: "right", render: (c) => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <Btn small kind="ghost" onClick={() => { sendReminder(c.id, `Your AMC expires on ${fmtDate(c.amc!.to)}. Renew now to keep free visits and priority service.`, who); notify("Renewal reminder sent"); }}>Send reminder</Btn>
              <Btn small kind="gold" onClick={() => setAmcFor(c.id)}>Renew</Btn>
            </div> },
          ]} />
        )}

        {view === "Service reminders" && (
          <Table rows={due} rowKey={(a) => a.id} empty="Every AC is within its service interval." cols={[
            { key: "c", head: "Customer", render: (a) => <><b>{custName(db, a.customerId)}</b><div style={muted}>+91 {db.customers.find((c) => c.id === a.customerId)?.phone}</div></> },
            { key: "a", head: "AC", render: (a) => <>{a.application}<div style={muted}>{acLabel(a)}</div></> },
            { key: "l", head: "Last service", render: (a) => { const s = acSummary(db, a.id); return s.lastService ? <>{fmtDate(s.lastService)}<div style={muted}>{daysBetween(s.lastService, today())} days ago</div></> : <Badge tone="amber">Never</Badge>; } },
            { key: "r", head: "Reminded", render: (a) => (db.leads[`rem:${a.customerId}:${today()}`] ? <Badge tone="green">Today</Badge> : <span style={muted}>—</span>) },
            { key: "x", head: "", align: "right", render: (a) => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <Btn small kind="ghost" onClick={() => { sendReminder(a.customerId, `Your ${a.application.toLowerCase()} AC (${acLabel(a)}) is due for service. Book a visit in the app.`, who); notify("Reminder sent to customer app"); }}>Send reminder</Btn>
              <Btn small onClick={() => setBookFor(a.customerId)}>Book visit</Btn>
            </div> },
          ]} />
        )}

        {view === "Replacement leads" && (
          <Table rows={replace} rowKey={(a) => a.id} empty="No replacement leads." cols={[
            { key: "c", head: "Customer", render: (a) => <><b>{custName(db, a.customerId)}</b><div style={muted}>{a.application}</div></> },
            { key: "a", head: "AC", render: (a) => <>{acLabel(a)}<div style={muted}>{a.inverter ? "Inverter" : "Non-inverter"} · {a.ageYears} yrs</div></> },
            { key: "s", head: "Repair spend", align: "right", render: (a) => inr(acSummary(db, a.id).spend) },
            { key: "r", head: "Reason", render: (a) => <span style={{ fontSize: 12 }}>{a.ageYears >= 8 ? "Old unit — high power bill" : "High repair cost"}{!a.inverter && " · non-inverter"}</span> },
            { key: "l", head: "Lead", render: (a) => <Badge tone={LEAD_TONE[lead(`rep:${a.id}`)]}>{lead(`rep:${a.id}`)}</Badge> },
            { key: "x", head: "", align: "right", render: (a) => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {(["Contacted", "Converted", "Dismissed"] as const).filter((s) => s !== lead(`rep:${a.id}`)).map((s) => <Btn key={s} small kind={s === "Converted" ? "gold" : "ghost"} onClick={() => { setLead(`rep:${a.id}`, s, who); notify(`Lead → ${s}`); }}>{s}</Btn>)}
            </div> },
          ]} />
        )}

        {view === "Follow-ups" && (
          <Table rows={follow} rowKey={(j) => j.id} empty="No follow-ups in the next 2 weeks." cols={[
            { key: "d", head: "Due", render: (j) => <>{fmtDate(j.followUp!.date)}{j.followUp!.date < today() && <div><Badge tone="red">Overdue</Badge></div>}</> },
            { key: "c", head: "Customer", render: (j) => <><b>{custName(db, j.customerId)}</b><div style={muted}>+91 {db.customers.find((c) => c.id === j.customerId)?.phone}</div></> },
            { key: "n", head: "Note", render: (j) => j.followUp!.note },
            { key: "j", head: "From job", render: (j) => <button onClick={() => openJob(j.id)} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontWeight: 700, cursor: "pointer" }}>{j.id}</button> },
            { key: "x", head: "", align: "right", render: (j) => <Btn small kind="ghost" onClick={() => { sendReminder(j.customerId, `Hi from Pushpak — ${j.followUp!.note.toLowerCase()}. Is your AC working well?`, who); notify("Follow-up message sent"); }}>Send follow-up</Btn> },
          ]} />
        )}

        {view === "Upsell" && (
          <Table rows={upsellLines} rowKey={(l) => l.id} empty="No upsell items sold yet." cols={[
            { key: "d", head: "Date", render: (l) => fmtDate(l.job.date) },
            { key: "i", head: "Item", render: (l) => <b>{l.name}</b> },
            { key: "c", head: "Customer", render: (l) => custName(db, l.job.customerId) },
            { key: "t", head: "Technician", render: (l) => db.techs.find((t) => t.id === l.job.techId)?.name ?? "—" },
            { key: "a", head: "Value", align: "right", render: (l) => inr(l.qty * l.price) },
          ]} />
        )}
      </Panel>

      {amcFor && (() => {
        const c = db.customers.find((x) => x.id === amcFor)!;
        const n = acsOf(c.id).length || 1;
        return (
          <Modal title={`${c.amc ? "Renew" : "Sell"} AMC · ${c.name}`} onClose={() => setAmcFor(null)}>
            <p style={{ margin: "0 0 12px", fontSize: 13 }}>{n} AC{n > 1 ? "s" : ""} covered · 3 service visits per year.</p>
            <div style={{ display: "flex", gap: 10 }}>
              {(["Basic", "Comprehensive"] as const).map((p) => (
                <button key={p} onClick={() => { sellAmc(c.id, p, who); setAmcFor(null); notify(`AMC ${p} activated for ${c.name}`); }} style={{ flex: 1, border: "1.5px solid var(--line-strong)", borderRadius: 14, padding: 14, background: "white", cursor: "pointer", textAlign: "left" }}>
                  <b style={{ fontSize: 15 }}>{p}</b>
                  <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800, color: "var(--blue)" }}>{inr(n * (p === "Basic" ? db.settings.amcBasic : db.settings.amcComprehensive))}</p>
                  <p style={{ ...muted, margin: 0 }}>{p === "Basic" ? "Services + free visits + 10% off parts" : "Adds gas top-up and free repair labour"}</p>
                </button>
              ))}
            </div>
          </Modal>
        );
      })()}
      {bookFor && <NewJobModal db={db} who={who} presetCustomer={bookFor} onClose={() => setBookFor(null)} onCreated={(id) => { setBookFor(null); notify(`${id} created`); openJob(id); }} />}
    </>
  );
}
