"use client";

import { useMemo, useState } from "react";
import { AcForm, AcHistory, AcSpecs, EMPTY_AC, JOB_TONE, type AcDraft } from "../components/service";
import { Chips } from "../components/ui";
import {
  acLabel, acSummary, daysBetween, fmtDate, inr, isDone, isOpen, jobTotals, today,
  type AcUnit, type Customer, type CustomerType, type Db,
} from "../lib/data";
import { addAc, addCustomer, addTech, mergeCustomers, updateAc, updateCustomer, updateTech } from "../lib/store";
import { NewJobModal } from "./Jobs";
import { Badge, Btn, Filter, Initials, Modal, Panel, SearchBox, Table, fieldLabel, input, muted } from "./kit";

/* ───────────────────────── Customers ───────────────────────── */

type CustFilter = "All" | "New" | "Existing" | "AMC" | "Payment due";

export function CustomersSection({ db, who, notify, openJob }: { db: Db; who: string; notify: (m: string) => void; openJob: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<CustFilter>("All");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const live = db.customers.filter((c) => !c.mergedInto);
  const due = (c: Customer) => db.jobs.filter((j) => j.customerId === c.id && j.invoice).reduce((s, j) => s + jobTotals(j, db.settings).due, 0);
  const dupes = useMemo(() => live.filter((c) => live.some((o) => o.id !== c.id && o.name.toLowerCase() === c.name.toLowerCase())), [live]);

  const rows = live.filter((c) => {
    const n = q.trim().toLowerCase();
    const hit = !n || `${c.name} ${c.phone} ${c.altPhone} ${c.address} ${c.area}`.toLowerCase().includes(n);
    const ok = f === "All" || (f === "New" && c.status === "New") || (f === "Existing" && c.status === "Existing") || (f === "AMC" && c.amc) || (f === "Payment due" && due(c) > 0);
    return hit && ok;
  });
  const cust = open ? db.customers.find((c) => c.id === open) : undefined;

  return (
    <>
      {dupes.length > 0 && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 12, background: "var(--warning)", border: "1px solid var(--warning-border)", fontSize: 13, color: "var(--warning-text)", fontWeight: 600 }}>
          Possible duplicate records: {[...new Set(dupes.map((d) => d.name))].join(", ")} — open one and use “Merge duplicate”.
        </div>
      )}
      <Panel title="Customers" pad={false} actions={<><SearchBox value={q} onChange={setQ} placeholder="Mobile, name or address" /><Btn kind="gold" onClick={() => setCreating(true)}>+ Add customer</Btn></>}>
        <div style={{ padding: "12px 16px" }}><Filter<CustFilter> options={["All", "New", "Existing", "AMC", "Payment due"]} value={f} onChange={setF} /></div>
        <Table rows={rows} rowKey={(c) => c.id} empty="No customers match." cols={[
          { key: "n", head: "Customer", render: (c) => <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Initials name={c.name} /><div><button onClick={() => setOpen(c.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: "var(--blue)", fontSize: 13 }}>{c.name}</button><div style={muted}>+91 {c.phone}</div></div></div> },
          { key: "a", head: "Area", render: (c) => <>{c.area}<div style={muted}>{c.type}</div></> },
          { key: "ac", head: "ACs", align: "center", render: (c) => db.acs.filter((a) => a.customerId === c.id).length },
          { key: "j", head: "Jobs", align: "center", render: (c) => db.jobs.filter((j) => j.customerId === c.id && j.status !== "Cancelled").length },
          { key: "s", head: "Spend", align: "right", render: (c) => inr(db.jobs.filter((j) => j.customerId === c.id && isDone(j)).reduce((s, j) => s + jobTotals(j, db.settings).paid, 0)) },
          { key: "d", head: "Due", align: "right", render: (c) => { const d = due(c); return d ? <b style={{ color: "var(--error-text)" }}>{inr(d)}</b> : <span style={muted}>—</span>; } },
          { key: "t", head: "Status", render: (c) => <div style={{ display: "flex", gap: 4 }}><Badge tone={c.status === "New" ? "purple" : "grey"}>{c.status}</Badge>{c.amc && <Badge tone="green">AMC</Badge>}</div> },
          { key: "x", head: "", align: "right", render: (c) => <Btn small kind="ghost" onClick={() => setOpen(c.id)}>Open</Btn> },
        ]} />
      </Panel>
      {cust && <CustomerModal db={db} c={cust} who={who} notify={notify} onClose={() => setOpen(null)} openJob={(id) => { setOpen(null); openJob(id); }} />}
      {creating && <CustomerForm title="Add customer" who={who} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); setOpen(id); notify("Customer added"); }} db={db} />}
    </>
  );
}

type CDraft = Pick<Customer, "name" | "phone" | "altPhone" | "address" | "area" | "gps" | "type" | "contactPref" | "status">;

function CustomerForm({ db, title, initial, who, onClose, onSaved }: { db: Db; title: string; initial?: Customer; who: string; onClose: () => void; onSaved: (id: string) => void }) {
  const [d, setD] = useState<CDraft>(initial ?? { name: "", phone: "", altPhone: "", address: "", area: "", gps: "", type: "Residential", contactPref: "WhatsApp", status: "New" });
  const set = <K extends keyof CDraft>(k: K, v: CDraft[K]) => setD({ ...d, [k]: v });
  const phoneTaken = db.customers.find((c) => c.phone === d.phone && c.id !== initial?.id && !c.mergedInto);
  const valid = d.name.trim().length >= 2 && /^[6-9]\d{9}$/.test(d.phone) && d.address.trim().length >= 5 && (!d.altPhone || /^[6-9]\d{9}$/.test(d.altPhone)) && !phoneTaken;
  const save = () => {
    if (initial) { updateCustomer(initial.id, d, who); onSaved(initial.id); } else onSaved(addCustomer(d, who));
  };
  return (
    <Modal title={title} width={620} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn disabled={!valid} onClick={save}>Save</Btn></>}>
      <div className="form-grid">
        <label><span style={fieldLabel}>Customer name</span><input value={d.name} onChange={(e) => set("name", e.target.value)} style={input} /></label>
        <label><span style={fieldLabel}>Mobile number</span><input inputMode="numeric" value={d.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} style={input} />{phoneTaken && <span style={{ ...muted, color: "var(--error-text)" }}>Already used by {phoneTaken.name}</span>}</label>
        <label><span style={fieldLabel}>Alternate number</span><input inputMode="numeric" value={d.altPhone} onChange={(e) => set("altPhone", e.target.value.replace(/\D/g, "").slice(0, 10))} style={input} /></label>
        <label><span style={fieldLabel}>Area</span><input value={d.area} onChange={(e) => set("area", e.target.value)} style={input} /></label>
      </div>
      <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Full address</span><input value={d.address} onChange={(e) => set("address", e.target.value)} style={input} /></label>
      <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Google Maps location / GPS (lat,lng)</span><input value={d.gps} onChange={(e) => set("gps", e.target.value)} placeholder="28.5921,77.0460" style={input} /></label>
      <div style={{ marginTop: 12 }}><span style={fieldLabel}>Customer type</span><Chips options={["Residential", "Office", "Shop", "Commercial", "Other"] as CustomerType[]} value={d.type} onChange={(v) => set("type", v)} /></div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <div><span style={fieldLabel}>Status</span><Chips options={["New", "Existing"] as const} value={d.status} onChange={(v) => set("status", v)} /></div>
        <div><span style={fieldLabel}>Preferred contact</span><Chips options={["Call", "WhatsApp"] as const} value={d.contactPref} onChange={(v) => set("contactPref", v)} /></div>
      </div>
    </Modal>
  );
}

function CustomerModal({ db, c, who, notify, onClose, openJob }: { db: Db; c: Customer; who: string; notify: (m: string) => void; onClose: () => void; openJob: (id: string) => void }) {
  const [tab, setTab] = useState<"ACs & history" | "Jobs" | "Payments">("ACs & history");
  const [modal, setModal] = useState<"edit" | "addAc" | "merge" | "job" | null>(null);
  const [editAc, setEditAc] = useState<AcUnit | null>(null);
  const acs = db.acs.filter((a) => a.customerId === c.id);
  const jobs = db.jobs.filter((j) => j.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pays = jobs.flatMap((j) => j.payments.map((p) => ({ ...p, job: j.id })));
  return (
    <Modal width={880} title={c.name} onClose={onClose} footer={<>
      <Btn kind="ghost" onClick={() => setModal("merge")}>Merge duplicate</Btn>
      <Btn kind="ghost" onClick={() => setModal("edit")}>Edit customer</Btn>
      <Btn kind="ghost" onClick={() => setModal("addAc")}>+ Add AC</Btn>
      <Btn kind="gold" disabled={!acs.length} onClick={() => setModal("job")}>+ New service request</Btn>
    </>}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13, marginBottom: 14 }}>
        <div><span style={muted}>Mobile</span><div><b>+91 {c.phone}</b>{c.altPhone && ` / ${c.altPhone}`}</div></div>
        <div style={{ flex: 1, minWidth: 220 }}><span style={muted}>Address</span><div>{c.address}{c.gps && <> · <a href={`https://maps.google.com/?q=${c.gps}`} target="_blank" rel="noreferrer">Map</a></>}</div></div>
        <div><span style={muted}>Type / contact</span><div>{c.type} · {c.contactPref}</div></div>
        <div><span style={muted}>AMC</span><div>{c.amc ? `${c.amc.plan} till ${fmtDate(c.amc.to)}` : "None"}</div></div>
      </div>
      <Filter options={["ACs & history", "Jobs", "Payments"] as const} value={tab} onChange={setTab} />
      {tab === "ACs & history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          {acs.map((a) => (
            <div key={a.id} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <b style={{ fontSize: 14 }}>{a.application} · {acLabel(a)}</b>
                <Btn small kind="ghost" onClick={() => setEditAc(a)}>Edit AC</Btn>
              </div>
              <div className="admin-grid-2"><AcSpecs ac={a} /><AcHistory db={db} ac={a} onOpenJob={openJob} /></div>
            </div>
          ))}
          {acs.length === 0 && <p style={muted}>No ACs yet.</p>}
        </div>
      )}
      {tab === "Jobs" && (
        <div style={{ marginTop: 12 }}>
          <Table rows={jobs} rowKey={(j) => j.id} cols={[
            { key: "id", head: "Job", render: (j) => <button onClick={() => openJob(j.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--blue)", fontWeight: 700 }}>{j.id}</button> },
            { key: "d", head: "Date", render: (j) => fmtDate(j.date) },
            { key: "c", head: "Complaint", render: (j) => j.complaint.issues.join(", ") },
            { key: "s", head: "Status", render: (j) => <Badge tone={JOB_TONE[j.status]}>{j.status}</Badge> },
            { key: "a", head: "Amount", align: "right", render: (j) => (j.lines.length ? inr(jobTotals(j, db.settings).total) : "—") },
          ]} />
        </div>
      )}
      {tab === "Payments" && (
        <div style={{ marginTop: 12 }}>
          <Table rows={pays} rowKey={(p) => p.id} empty="No payments yet." cols={[
            { key: "d", head: "Date", render: (p) => fmtDate(p.at) },
            { key: "j", head: "Job", render: (p) => p.job },
            { key: "m", head: "Method", render: (p) => `${p.refund ? "Refund · " : ""}${p.method}` },
            { key: "r", head: "Reference", render: (p) => <span style={muted}>{p.ref || "—"}</span> },
            { key: "a", head: "Amount", align: "right", render: (p) => <b style={{ color: p.refund ? "var(--error-text)" : undefined }}>{p.refund ? "−" : ""}{inr(p.amount)}</b> },
          ]} />
        </div>
      )}

      {modal === "edit" && <CustomerForm db={db} title="Edit customer" initial={c} who={who} onClose={() => setModal(null)} onSaved={() => { setModal(null); notify("Customer updated · logged in audit"); }} />}
      {modal === "addAc" && <AcModal title="Add AC" onClose={() => setModal(null)} onSave={(d) => { addAc({ ...d, customerId: c.id }, who); setModal(null); notify("AC added"); }} />}
      {editAc && (() => { const { id: _i, customerId: _c, ...draft } = editAc; return <AcModal title="Edit AC" initial={draft} onClose={() => setEditAc(null)} onSave={(d) => { updateAc(editAc.id, d, who); setEditAc(null); notify("AC updated"); }} />; })()}
      {modal === "merge" && <MergeModal db={db} keep={c} onClose={() => setModal(null)} onMerge={(dropId) => { mergeCustomers(c.id, dropId, who); setModal(null); notify("Records merged · logged in audit"); }} />}
      {modal === "job" && <NewJobModal db={db} who={who} presetCustomer={c.id} onClose={() => setModal(null)} onCreated={(id) => { setModal(null); notify(`${id} created`); openJob(id); }} />}
    </Modal>
  );
}

function AcModal({ title, initial, onClose, onSave }: { title: string; initial?: AcDraft; onClose: () => void; onSave: (d: AcDraft) => void }) {
  const [d, setD] = useState<AcDraft>(initial ?? EMPTY_AC);
  return (
    <Modal title={title} width={620} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn disabled={!d.brand} onClick={() => onSave(d)}>Save AC</Btn></>}>
      <AcForm value={d} onChange={setD} inputStyle={input} labelStyle={fieldLabel} />
    </Modal>
  );
}

function MergeModal({ db, keep, onClose, onMerge }: { db: Db; keep: Customer; onClose: () => void; onMerge: (dropId: string) => void }) {
  const [drop, setDrop] = useState("");
  const [ok, setOk] = useState(false);
  const cands = db.customers.filter((c) => c.id !== keep.id && !c.mergedInto).sort((a, b) => Number(b.name.toLowerCase() === keep.name.toLowerCase()) - Number(a.name.toLowerCase() === keep.name.toLowerCase()));
  const d = db.customers.find((c) => c.id === drop);
  return (
    <Modal title={`Merge into ${keep.name} (+91 ${keep.phone})`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="danger" disabled={!drop || !ok} onClick={() => onMerge(drop)}>Merge records</Btn></>}>
      <label><span style={fieldLabel}>Duplicate record to merge</span>
        <select value={drop} onChange={(e) => setDrop(e.target.value)} style={input}>
          <option value="">Select…</option>
          {cands.map((c) => <option key={c.id} value={c.id}>{c.name} · +91 {c.phone}{c.name.toLowerCase() === keep.name.toLowerCase() ? " (same name)" : ""}</option>)}
        </select>
      </label>
      {d && <p style={{ fontSize: 13, lineHeight: 1.6 }}>{db.acs.filter((a) => a.customerId === d.id).length} AC(s) and {db.jobs.filter((j) => j.customerId === d.id).length} job(s) from <b>{d.name}</b> will move to <b>{keep.name}</b>. Its mobile becomes the alternate number. The duplicate is hidden, not deleted.</p>}
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I&apos;ve confirmed these are the same customer (admin only)</label>
    </Modal>
  );
}

/* ───────────────────────── AC assets ───────────────────────── */

type AcFilter = "All" | "Service due" | "Repeat problems" | "Old (8+ yrs)" | "Under warranty";

export function AcAssetsSection({ db, openJob }: { db: Db; openJob: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<AcFilter>("All");
  const [open, setOpen] = useState<AcUnit | null>(null);
  const rows = db.acs.filter((a) => {
    const c = db.customers.find((x) => x.id === a.customerId);
    if (!c || c.mergedInto) return false;
    const s = acSummary(db, a.id);
    const n = q.trim().toLowerCase();
    const hit = !n || `${a.brand} ${a.model} ${a.serial} ${c.name} ${c.phone}`.toLowerCase().includes(n);
    const dueSvc = !s.lastService || daysBetween(s.lastService, today()) >= db.settings.reminderDays;
    return hit && (f === "All" || (f === "Service due" && dueSvc) || (f === "Repeat problems" && s.repeatIssues.length > 0) || (f === "Old (8+ yrs)" && a.ageYears >= 8) || (f === "Under warranty" && a.warranty === "Yes"));
  });
  return (
    <>
      <Panel title={`AC assets · ${db.acs.length} registered`} pad={false} actions={<SearchBox value={q} onChange={setQ} placeholder="Brand, model, serial, customer" />}>
        <div style={{ padding: "12px 16px" }}><Filter<AcFilter> options={["All", "Service due", "Repeat problems", "Old (8+ yrs)", "Under warranty"]} value={f} onChange={setF} /></div>
        <Table rows={rows} rowKey={(a) => a.id} cols={[
          { key: "a", head: "AC", render: (a) => <button onClick={() => setOpen(a)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}><b style={{ color: "var(--blue)" }}>{acLabel(a)}</b><div style={muted}>{a.model || "—"} · {a.serial || "no serial"}</div></button> },
          { key: "c", head: "Customer", render: (a) => <>{db.customers.find((c) => c.id === a.customerId)?.name}<div style={muted}>{a.application}</div></> },
          { key: "g", head: "Age", align: "center", render: (a) => `${a.ageYears} yr` },
          { key: "u", head: "Usage", render: (a) => <span style={muted}>{a.usage} · {a.dailyHours}h</span> },
          { key: "l", head: "Last service", render: (a) => { const s = acSummary(db, a.id); return s.lastService ? fmtDate(s.lastService) : <Badge tone="amber">Never</Badge>; } },
          { key: "v", head: "Visits", align: "center", render: (a) => acSummary(db, a.id).visits },
          { key: "s", head: "Spend", align: "right", render: (a) => inr(acSummary(db, a.id).spend) },
          { key: "f", head: "Flags", render: (a) => { const s = acSummary(db, a.id); return <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{s.repeatIssues.length > 0 && <Badge tone="red">Repeat</Badge>}{a.ageYears >= 8 && <Badge tone="purple">Replace lead</Badge>}{a.warranty === "Yes" && <Badge tone="green">Warranty</Badge>}{db.jobs.some((j) => j.acId === a.id && isOpen(j)) && <Badge tone="blue">Open job</Badge>}</div>; } },
        ]} />
      </Panel>
      {open && (
        <Modal width={820} title={`${acLabel(open)} · ${db.customers.find((c) => c.id === open.customerId)?.name}`} onClose={() => setOpen(null)}>
          <div className="admin-grid-2"><AcSpecs ac={open} /><AcHistory db={db} ac={open} onOpenJob={(id) => { setOpen(null); openJob(id); }} /></div>
        </Modal>
      )}
    </>
  );
}

/* ───────────────────────── Technicians ───────────────────────── */

export function TechniciansSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const stats = (id: string) => {
    const mine = db.jobs.filter((j) => j.techId === id);
    const done = mine.filter(isDone);
    const value = done.reduce((s, j) => s + jobTotals(j, db.settings).total, 0);
    const upsell = done.reduce((s, j) => s + j.lines.filter((l) => l.upsell).reduce((t, l) => t + l.qty * l.price, 0), 0);
    return { open: mine.filter(isOpen).length, today: mine.filter((j) => j.date === today() && j.status !== "Cancelled").length, done: done.length, rate: mine.length ? Math.round((done.length / mine.filter((j) => j.status !== "Cancelled").length) * 100) : 0, avg: done.length ? value / done.length : 0, upsell, value };
  };
  const t = edit ? db.techs.find((x) => x.id === edit) : undefined;
  return (
    <>
      <div className="admin-grid-4" style={{ marginBottom: 16 }}>
        {(["Available", "On Job", "Off Duty"] as const).map((s, i) => (
          <div key={s} style={{ background: "var(--surface)", borderRadius: 16, padding: "14px 16px", border: "1px solid var(--line)", borderTop: `3px solid ${["var(--success-text)", "var(--info-text)", "var(--text-muted)"][i]}` }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>{s}</p>
            <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800 }}>{db.techs.filter((x) => x.active && x.availability === s).length}</p>
          </div>
        ))}
        <div style={{ background: "var(--surface)", borderRadius: 16, padding: "14px 16px", border: "1px solid var(--line)", borderTop: "3px solid var(--gold-dark)" }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Unassigned requests</p>
          <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800 }}>{db.jobs.filter((j) => j.status === "New Request").length}</p>
        </div>
      </div>
      <Panel title="Technicians" pad={false} actions={<Btn kind="gold" onClick={() => setAdding(true)}>+ Add technician</Btn>}>
        <Table rows={db.techs} rowKey={(x) => x.id} cols={[
          { key: "n", head: "Technician", render: (x) => <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Initials name={x.name} /><div><b>{x.name}</b><div style={muted}>+91 {x.phone} · ★{x.rating || "—"}</div></div></div> },
          { key: "s", head: "Skills / area", render: (x) => <><div style={{ fontSize: 12 }}>{x.skills.join(", ")}</div><div style={muted}>{x.area}</div></> },
          { key: "a", head: "Availability", render: (x) => !x.active ? <Badge tone="grey">Inactive</Badge> : <Badge tone={x.availability === "Available" ? "green" : x.availability === "On Job" ? "blue" : "grey"}>{x.availability}</Badge> },
          { key: "w", head: "Workload", align: "center", render: (x) => { const s = stats(x.id); return <>{s.today} today<div style={muted}>{s.open} open</div></>; } },
          { key: "c", head: "Completion", align: "center", render: (x) => `${stats(x.id).rate}%` },
          { key: "v", head: "Avg job", align: "right", render: (x) => inr(stats(x.id).avg) },
          { key: "u", head: "Upsell", align: "right", render: (x) => inr(stats(x.id).upsell) },
          { key: "x", head: "", align: "right", render: (x) => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Btn small kind="ghost" onClick={() => setEdit(x.id)}>Edit</Btn>
            <Btn small kind={x.active ? "danger" : "primary"} onClick={() => { updateTech(x.id, { active: !x.active, availability: x.active ? "Off Duty" : "Available" }, who); notify(`${x.name} ${x.active ? "deactivated" : "activated"}`); }}>{x.active ? "Deactivate" : "Activate"}</Btn>
          </div> },
        ]} />
      </Panel>
      {adding && <TechForm onClose={() => setAdding(false)} onSave={(d) => { addTech({ ...d, availability: "Available", active: true }, who); setAdding(false); notify(`${d.name} added`); }} />}
      {t && <TechForm initial={t} onClose={() => setEdit(null)} onSave={(d) => { updateTech(t.id, d, who); setEdit(null); notify("Technician updated"); }} />}
    </>
  );
}

const SKILLS = ["Split", "Window", "Cassette", "Tower", "Ductable", "Gas charging", "PCB repair", "Compressor", "Installation", "Commercial"];

function TechForm({ initial, onClose, onSave }: { initial?: { name: string; phone: string; area: string; skills: string[]; availability?: string }; onClose: () => void; onSave: (d: { name: string; phone: string; area: string; skills: string[] }) => void }) {
  const [d, setD] = useState({ name: initial?.name ?? "", phone: initial?.phone ?? "", area: initial?.area ?? "", skills: initial?.skills ?? [] });
  const valid = d.name.trim().length > 2 && /^[6-9]\d{9}$/.test(d.phone) && d.skills.length > 0;
  return (
    <Modal title={initial ? `Edit ${initial.name}` : "Add technician"} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn disabled={!valid} onClick={() => onSave(d)}>Save</Btn></>}>
      <div className="form-grid">
        <label><span style={fieldLabel}>Name</span><input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Mobile (login)</span><input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} style={input} /></label>
      </div>
      <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Service area</span><input value={d.area} onChange={(e) => setD({ ...d, area: e.target.value })} placeholder="e.g. Dwarka, Janakpuri" style={input} /></label>
      <div style={{ marginTop: 12 }}><span style={fieldLabel}>Skills / service categories</span>
        <Chips options={SKILLS} multi value={d.skills} onChange={(s) => setD({ ...d, skills: d.skills.includes(s) ? d.skills.filter((x) => x !== s) : [...d.skills, s] })} />
      </div>
    </Modal>
  );
}

