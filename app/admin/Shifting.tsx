"use client";

import { useState } from "react";
import { INSP_TONE } from "../technician/Shifting";
import { fmtDateTime, type Db } from "../lib/data";
import { INSP_STATUSES, OVERVIEW_PHOTOS, answerOf, approvalBlockers, flagsOf, isAbnormal, itemsFor, needsCustomerAck, progress, reportText, type InspStatus, type ShiftingInspection } from "../lib/shifting";
import { inspectionDecision, setInspectionRules } from "../lib/store";
import { Badge, Btn, Filter, Modal, Panel, SearchBox, Stat, Table, fieldLabel, input, muted } from "./kit";

/* Admin → Shifting Inspections: office review of technician pre-removal inspections. Removal is
 * authorised only here, and only when site safety, electrical isolation and customer acknowledgement pass. */

type F = "To review" | "All" | InspStatus;
const FILTERS: F[] = ["To review", "All", ...INSP_STATUSES];
const toReview = (x: ShiftingInspection) => ["Submitted", "Awaiting Customer Approval", "On Hold – Unsafe"].includes(x.status);

export function ShiftingSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const all = db.inspections ?? [];
  const [f, setF] = useState<F>("To review");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = all.filter((x) => f === "All" ? true : f === "To review" ? toReview(x) : x.status === f)
    .filter((x) => !q.trim() || `${x.id} ${x.customer.name} ${x.customer.mobile} ${x.techName} ${x.ac.brandModel} ${x.customer.oldLocation}`.toLowerCase().includes(q.toLowerCase()));
  const counts = Object.fromEntries(FILTERS.map((s) => [s, all.filter((x) => s === "All" ? true : s === "To review" ? toReview(x) : x.status === s).length])) as Partial<Record<F, number>>;
  const x = open ? all.find((i) => i.id === open) : undefined;
  const rules = db.inspectionRules ?? { faultPhotoRequired: true };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="admin-grid-4">
        <Stat label="Waiting for review" value={String(counts["To review"] ?? 0)} sub="submitted by technicians" tone={counts["To review"] ? "amber" : "green"} />
        <Stat label="On hold — unsafe" value={String(counts["On Hold – Unsafe"] ?? 0)} sub="removal blocked" tone={counts["On Hold – Unsafe"] ? "red" : "green"} />
        <Stat label="Awaiting customer" value={String(counts["Awaiting Customer Approval"] ?? 0)} sub="faults / extra charges to acknowledge" tone="orange" />
        <Stat label="Approved for removal" value={String(counts["Approved for Removal"] ?? 0)} sub={`${counts.Draft ?? 0} drafts in progress`} tone="green" />
      </div>

      <Panel title="AC shifting — pre-removal inspections" actions={<>
        <SearchBox value={q} onChange={setQ} placeholder="Search customer, mobile, technician…" />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600 }}><input type="checkbox" checked={rules.faultPhotoRequired} onChange={(e) => { setInspectionRules({ faultPhotoRequired: e.target.checked }, who); notify(e.target.checked ? "Fault photo now required" : "Fault photo now optional"); }} /> Photo required for each fault</label>
      </>} pad={false}>
        <div style={{ padding: "12px 16px 0" }}><Filter options={FILTERS} value={f} onChange={setF} counts={counts} /></div>
        <Table<ShiftingInspection> rowKey={(i) => i.id} rows={rows} empty="No inspections here." cols={[
          { key: "id", head: "Inspection", render: (i) => <div><b>{i.id}</b><div style={muted}>{fmtDateTime(i.submittedAt ?? i.inspectedAt)} · {i.techName}</div></div> },
          { key: "cust", head: "Customer", render: (i) => <div>{i.customer.name || "—"}<div style={muted}>{i.customer.mobile}</div></div> },
          { key: "ac", head: "AC", render: (i) => <div>{i.ac.kind} · {i.ac.capacity === "Other" ? i.ac.capacityOther : `${i.ac.capacity} T`}<div style={muted}>{i.ac.brandModel}</div></div> },
          { key: "chk", head: "Checks", render: (i) => { const p = progress(i); return <div>{p.done}/{p.total}<div style={{ ...muted, color: p.faults.length ? "var(--error-text)" : undefined }}>{p.faults.length} faults</div></div>; } },
          { key: "safety", head: "Safety", render: (i) => <Badge tone={i.site.safety === "Safe to Proceed" ? "green" : i.site.safety === "Unsafe / Hold Work" ? "red" : "amber"}>{i.site.safety}</Badge> },
          { key: "status", head: "Status", render: (i) => <Badge tone={INSP_TONE[i.status]}>{i.status}</Badge> },
          { key: "act", head: "", render: (i) => <Btn small onClick={() => setOpen(i.id)}>Review</Btn> },
        ]} />
      </Panel>

      {x && <ReviewModal x={x} who={who} notify={notify} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ReviewModal({ x, who, notify, onClose }: { x: ShiftingInspection; who: string; notify: (m: string) => void; onClose: () => void }) {
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const p = progress(x);
  const blockers = approvalBlockers(x);
  const act = (dec: "Approved" | "Hold" | "Correction" | "Reopen" | "Cancel") => {
    const e = inspectionDecision(x.id, dec, notes, who);
    if (e) { setErr(e); return; }
    notify(dec === "Approved" ? `${x.id} — removal authorised` : `${x.id} updated`); setNotes(""); setErr(null);
  };
  const sec: React.CSSProperties = { margin: "16px 0 6px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-soft)" };
  const kv = (k: string, v: React.ReactNode) => <div key={k} style={{ display: "flex", gap: 12, padding: "5px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}><span style={{ ...muted, width: 190, flexShrink: 0 }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>;
  const decided = x.status === "Approved for Removal" || x.status === "Cancelled";

  return (
    <Modal title={`${x.id} · Pre-removal inspection`} onClose={onClose} width={860} footer={<>
      <Btn kind="ghost" onClick={async () => { try { await navigator.clipboard.writeText(reportText(x)); notify("Report copied"); } catch { notify("⚠ Could not copy"); } }}>Copy report</Btn>
      <Btn kind="ghost" onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(`<pre style="font:13px/1.5 system-ui;white-space:pre-wrap;padding:24px">${reportText(x).replace(/</g, "&lt;")}</pre>`); w.document.close(); w.print(); } }}>Print</Btn>
    </>}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <Badge tone={INSP_TONE[x.status]}>{x.status}</Badge>
        <b style={{ fontSize: 14 }}>Removal authorised: {x.status === "Approved for Removal" ? "YES" : "NO"}</b>
        <span style={muted}>· {p.done}/{p.total} checked · {p.faults.length} faults · by {x.techName}</span>
      </div>
      {flagsOf(x).map((fl) => <div key={fl.text} style={{ padding: "7px 10px", borderRadius: 8, marginBottom: 6, fontSize: 12.5, fontWeight: 600, background: fl.tone === "red" ? "var(--error)" : fl.tone === "amber" ? "var(--gold-tint)" : "var(--info-bg)", color: fl.tone === "red" ? "var(--error-text)" : fl.tone === "amber" ? "var(--gold-dark)" : "var(--info-text)" }}>{fl.text}</div>)}

      <p style={sec}>Customer & AC</p>
      {kv("Customer", `${x.customer.name} · ${x.customer.mobile}`)}
      {kv("Old location", x.customer.oldLocation)}
      {kv("New location", x.customer.newLocation || "—")}
      {kv("AC", `${x.ac.kind} · ${x.ac.capacity === "Other" ? x.ac.capacityOther : `${x.ac.capacity} Ton`} · ${x.ac.brandModel || "—"}`)}
      {x.jobId && kv("Linked job", x.jobId)}

      {itemsFor(x.ac.kind).map((s) => (
        <div key={s.title}>
          <p style={sec}>{s.title}</p>
          {s.items.map((it) => {
            const a = answerOf(x, it.key);
            const bad = isAbnormal(it, a);
            return kv(it.label, <span style={{ color: bad ? "var(--error-text)" : a.value === "Not Checked" ? "var(--ink-mute)" : undefined }}>
              {a.value}{a.remark ? ` — ${a.remark}` : ""}
              {a.photos.length > 0 && <span style={{ display: "flex", gap: 4, marginTop: 4 }}>{a.photos.map((ph, i) => /* eslint-disable-next-line @next/next/no-img-element */ <a key={i} href={ph} target="_blank" rel="noreferrer"><img src={ph} alt={`${it.label} ${i + 1}`} style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 6 }} /></a>)}</span>}
            </span>);
          })}
        </div>
      ))}

      <p style={sec}>Service & site safety</p>
      {kv("Service required", `${x.site.serviceRequired}${x.site.serviceLocation ? ` · at ${x.site.serviceLocation}` : ""}`)}
      {kv("Outdoor unit at", `${x.site.outdoorAt === "Other" ? x.site.outdoorOther : x.site.outdoorAt} · ${x.site.heightFt || "—"} ft`)}
      {kv("Extra manpower", x.site.manpower === "Yes" ? `Yes — ${x.site.manpowerCount} (${x.site.manpowerReason})` : "No")}
      {kv("Ladder / scaffold", x.site.ladder)}
      {kv("Site safety", x.site.safety)}
      {kv("Electrical isolation", x.site.isolation)}
      {x.site.accessNotes && kv("Access notes", x.site.accessNotes)}

      <p style={sec}>Materials, refrigerant & customer</p>
      {kv("Copper pipe", x.materials.copper)}
      {kv("Outdoor stand / bracket", x.materials.bracket)}
      {kv("Refrigerant", x.materials.refrigerant)}
      {kv("Gas / leakage", x.materials.gas)}
      {kv("Faults / charges explained", x.materials.faultsExplained)}
      {x.materials.remarks && kv("Technician remarks", x.materials.remarks)}
      {kv("Customer acknowledgement", x.customerAck ? `${x.customerAck.name} · ${x.customerAck.method} · ${fmtDateTime(x.customerAck.at)}` : needsCustomerAck(x) ? "Required — not recorded" : "Not required")}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        {OVERVIEW_PHOTOS.map((o) => <div key={o.key} style={{ fontSize: 11.5 }}><div style={muted}>{o.label}</div>{(x.overview[o.key] ?? []).length ? (x.overview[o.key] ?? []).map((ph, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={ph} alt={o.label} style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, marginRight: 4 }} />) : <span style={{ color: "var(--ink-mute)" }}>No photo</span>}</div>)}
      </div>

      <p style={sec}>Office decision</p>
      {x.office && <p style={{ margin: "0 0 8px", fontSize: 13 }}>Last: <b>{x.office.decision}</b> by {x.office.by} · {fmtDateTime(x.office.at)}{x.office.notes ? ` — ${x.office.notes}` : ""}</p>}
      {!decided && blockers.length > 0 && <div style={{ padding: 10, borderRadius: 8, background: "var(--error)", color: "var(--error-text)", fontSize: 12.5, marginBottom: 8 }}><b>Removal cannot be approved yet:</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>}
      <label style={{ display: "block" }}><span style={fieldLabel}>Notes for the technician / record</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Required for hold, correction or cancel" style={input} /></label>
      {err && <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {!decided && x.status !== "Draft" && x.status !== "Correction Required" && <>
          <Btn disabled={blockers.length > 0} onClick={() => act("Approved")}>✓ Approve for Removal</Btn>
          <Btn kind="ghost" onClick={() => act("Correction")}>Request Correction</Btn>
          <Btn kind="danger" onClick={() => act("Hold")}>Hold — Unsafe</Btn>
        </>}
        {(decided || x.status === "On Hold – Unsafe") && x.status !== "Cancelled" && <Btn kind="ghost" onClick={() => act("Reopen")}>Reopen for edits</Btn>}
        {x.status !== "Cancelled" && <Btn kind="danger" onClick={() => act("Cancel")}>Cancel inspection</Btn>}
      </div>

      <p style={sec}>Audit trail</p>
      {x.audit.map((a, i) => <p key={i} style={{ ...muted, margin: "0 0 3px" }}>{fmtDateTime(a.at)} · <b>{a.by}</b> · {a.action}{a.detail ? ` — ${a.detail}` : ""}</p>)}
      <p style={{ ...muted, marginTop: 10 }}>Inspection record only — not proof of repair or refrigerant charge.</p>
    </Modal>
  );
}
