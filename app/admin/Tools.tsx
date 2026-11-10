"use client";

import { useState } from "react";
import { fmtDate, inr, isoDay, type Db } from "../lib/data";
import { addDays } from "../lib/samples";
import { issueTool, resolveToolIssue, returnTool, saveToolRental } from "../lib/store";
import {
  ACCESSORIES, COMMON_TOOLS, ISSUE_CONDITIONS, RETURN_CONDITIONS, STORAGE_LOCATIONS, emptyIssue, emptyRental, issueStatus, missingOf, needsAttention,
  rentalCalc, rentalOverdue, type IssueDraft, type RentalDraft, type ReturnDraft, type ToolIssue, type ToolRental,
} from "../lib/tools";
import { Badge, Btn, Filter, Modal, Panel, SearchBox, Stat, Table, fieldLabel, input, muted, type Tone } from "./kit";

/* Admin / shop staff: (1) Shop Tools Management — Issue → Return → Register; (2) Tool Rental Register for tools hired from outside. */

const ST_TONE: Record<ReturnType<typeof issueStatus>, Tone> = { "At Site": "blue", Overdue: "red", Returned: "green", "Returned – Check": "amber" };
const err$ = (e: string | null) => e && <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{e}</p>;
const radioRow = <T extends string>(name: string, options: readonly T[], value: T, onChange: (v: T) => void) => (
  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
    {options.map((o) => <label key={o} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, cursor: "pointer" }}><input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} style={{ width: 16, height: 16 }} /> {o}</label>)}
  </div>
);
const checks = (name: string, options: readonly string[], value: string[], onChange: (v: string[]) => void) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
    {options.map((o) => <label key={o} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, cursor: "pointer" }}><input type="checkbox" name={name} checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} style={{ width: 16, height: 16 }} /> {o}</label>)}
  </div>
);

/* ───────────── Shop tools: issue / return / register ───────────── */

export function ShopToolsSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [tab, setTab] = useState<"1. Issue" | "2. Return" | "3. Register">("1. Issue");
  const all = db.toolIssues ?? [];
  const t0 = isoDay(0);
  const atSite = all.filter((x) => !x.ret);
  const attention = all.filter((x) => needsAttention(x, t0));
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="admin-grid-4">
        <Stat label="At site" value={String(atSite.length)} sub="tools out with technicians" tone="blue" />
        <Stat label="Closed" value={String(all.length - atSite.length)} sub="returned to the shop" tone="green" />
        <Stat label="Attention" value={String(attention.length)} sub="overdue, damaged or missing items" tone={attention.length ? "red" : "grey"} />
        <Stat label="Overdue" value={String(all.filter((x) => !x.ret && x.expectedReturn < t0).length)} sub="past expected return" tone="amber" />
      </div>
      <Filter options={["1. Issue", "2. Return", "3. Register"]} value={tab} onChange={setTab} counts={{ "2. Return": atSite.length }} />
      {tab === "1. Issue" && <IssueForm db={db} who={who} notify={(m) => { notify(m); setTab("3. Register"); }} />}
      {tab === "2. Return" && <ReturnList db={db} who={who} notify={notify} />}
      {tab === "3. Register" && <Register db={db} who={who} notify={notify} />}
    </div>
  );
}

function IssueForm({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const t0 = isoDay(0);
  const [d, setD] = useState<IssueDraft>(() => ({ ...emptyIssue(t0, addDays(t0, 3)), handedBy: who === "Admin" ? "" : who }));
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<IssueDraft>) => { setD({ ...d, ...p }); setErr(null); };
  const techs = db.techs.filter((t) => t.active);
  const names = [...new Set([...COMMON_TOOLS, ...(db.toolIssues ?? []).map((x) => x.tool)])];
  const save = () => { const r = issueTool(d, who); if ("error" in r) { setErr(r.error); return; } notify(`${r.id} · ${d.tool} issued to ${d.techName}`); setD(emptyIssue(t0, addDays(t0, 3))); };
  return (
    <div className="admin-grid-2">
      <Panel title="🧰 Tool Issue — From Shop">
        <div className="form-grid">
          <label style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>Tool name *</span><input list="tool-names" value={d.tool} onChange={(e) => set({ tool: e.target.value })} placeholder="Vacuum Pump (2 CFM)" style={input} /><datalist id="tool-names">{names.map((n) => <option key={n} value={n} />)}</datalist></label>
          <label><span style={fieldLabel}>Quantity *</span><input type="number" min={1} value={d.qty || ""} onChange={(e) => set({ qty: Number(e.target.value) })} style={input} /></label>
          <label><span style={fieldLabel}>Issue date *</span><input type="date" value={d.issueDate} onChange={(e) => set({ issueDate: e.target.value })} style={input} /></label>
          <label style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>Technician receiving tool *</span>
            <select value={d.techId} onChange={(e) => { const t = techs.find((x) => x.id === e.target.value); set({ techId: e.target.value, techName: t?.name ?? "" }); }} style={input}>
              <option value="">Select technician</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.phone}</option>)}
            </select></label>
          <label style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>Site / customer / project *</span><input value={d.site} onChange={(e) => set({ site: e.target.value })} placeholder="Site name and area" style={input} /></label>
          <label style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>Handed over by (shop staff) *</span><input value={d.handedBy} onChange={(e) => set({ handedBy: e.target.value })} placeholder="दुकान से देने वाले का नाम" style={input} /></label>
          <label><span style={fieldLabel}>Original storage location</span><select value={d.location} onChange={(e) => set({ location: e.target.value as IssueDraft["location"] })} style={input}>{STORAGE_LOCATIONS.map((l) => <option key={l}>{l}</option>)}</select></label>
          <label><span style={fieldLabel}>Expected return *</span><input type="date" min={d.issueDate} value={d.expectedReturn} onChange={(e) => set({ expectedReturn: e.target.value })} style={input} /></label>
        </div>
        <span style={{ ...fieldLabel, marginTop: 14 }}>Tool condition at issue</span>
        {radioRow("issue-cond", ISSUE_CONDITIONS, d.condition, (v) => set({ condition: v }))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}><span style={fieldLabel}>Accessories given</span><button type="button" onClick={() => set({ accessories: d.accessories.length === ACCESSORIES.length ? [] : [...ACCESSORIES] })} style={{ background: "none", border: "none", color: "var(--blue)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{d.accessories.length === ACCESSORIES.length ? "Clear all" : "Select all"}</button></div>
        {checks("acc", ACCESSORIES, d.accessories, (v) => set({ accessories: v }))}
        <input value={d.otherAccessories} onChange={(e) => set({ otherAccessories: e.target.value })} placeholder="Other accessories (optional)" style={{ ...input, marginTop: 8 }} />
        <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Issue remarks / existing damage</span><textarea rows={2} value={d.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="Working condition, scratches, missing parts etc." style={{ ...input, resize: "vertical" }} /></label>
        {err$(err)}
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}><Btn onClick={save}>Issue tool</Btn></div>
      </Panel>
      <Panel title="Handover summary">
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{d.tool || "Tool not entered"} × {d.qty || 0} · {d.techName || "Technician not entered"}</p>
        <p style={{ ...muted, fontSize: 13, margin: "6px 0 0" }}>From: {d.location} → {d.site || "Site not entered"}</p>
        <p style={{ ...muted, fontSize: 13, margin: "4px 0 0" }}>{fmtDate(d.issueDate)} → back by {fmtDate(d.expectedReturn)} · {d.condition}</p>
        <p style={{ ...muted, fontSize: 13, margin: "4px 0 0" }}>Accessories: {[...d.accessories, d.otherAccessories.trim()].filter(Boolean).join(", ") || "none"}</p>
        <p style={{ ...muted, fontSize: 13, margin: "4px 0 0" }}>Handed over by: {d.handedBy || "—"}</p>
        <p style={{ ...muted, marginTop: 12 }}>The technician sees this tool in their app under <b>My Tools</b> with the return date.</p>
      </Panel>
    </div>
  );
}

function ReturnList({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [open, setOpen] = useState<ToolIssue | null>(null);
  const t0 = isoDay(0);
  const rows = (db.toolIssues ?? []).filter((x) => !x.ret).sort((a, b) => a.expectedReturn.localeCompare(b.expectedReturn));
  return (
    <Panel title="Tools at site — receive back" pad={false}>
      <Table<ToolIssue> rowKey={(x) => x.id} rows={rows} empty="No tools out right now." cols={[
        { key: "id", head: "Entry", render: (x) => <div><b>{x.id}</b><div style={muted}>{fmtDate(x.issueDate)}</div></div> },
        { key: "tool", head: "Tool", render: (x) => <div><b>{x.tool}</b> × {x.qty}<div style={muted}>{x.accessories.join(", ") || "no accessories"}</div></div> },
        { key: "tech", head: "Technician / site", render: (x) => <div>{x.techName}<div style={muted}>{x.site}</div></div> },
        { key: "due", head: "Expected", render: (x) => <span style={{ fontWeight: 600, color: x.expectedReturn < t0 ? "var(--error-text)" : undefined }}>{fmtDate(x.expectedReturn)}{x.expectedReturn < t0 ? " · overdue" : ""}</span> },
        { key: "a", head: "", render: (x) => <Btn small onClick={() => setOpen(x)}>Receive back</Btn> },
      ]} />
      {open && <ReturnModal x={open} who={who} notify={notify} onClose={() => setOpen(null)} />}
    </Panel>
  );
}

function ReturnModal({ x, who, notify, onClose }: { x: ToolIssue; who: string; notify: (m: string) => void; onClose: () => void }) {
  const [r, setR] = useState<ReturnDraft>({ date: isoDay(0), receivedBy: who === "Admin" ? "" : who, qty: x.qty, condition: "Good / Working", accessories: [...x.accessories], remarks: "", resolved: false });
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<ReturnDraft>) => { setR({ ...r, ...p }); setErr(null); };
  const missing = missingOf(x, r);
  return (
    <Modal title={`Return · ${x.id} ${x.tool}`} onClose={onClose} width={560} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={() => { const e = returnTool(x.id, r, who); setErr(e); if (!e) { notify(`${x.tool} returned`); onClose(); } }}>Save return</Btn></>}>
      <p style={{ ...muted, margin: "0 0 12px", fontSize: 13 }}>{x.techName} · {x.site} · issued {fmtDate(x.issueDate)} ({x.condition}) from {x.location}</p>
      <div className="form-grid">
        <label><span style={fieldLabel}>Return date *</span><input type="date" min={x.issueDate} value={r.date} onChange={(e) => set({ date: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Quantity returned</span><input type="number" min={0} max={x.qty} value={r.qty} onChange={(e) => set({ qty: Number(e.target.value) })} style={input} /></label>
        <label style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>Received by (shop staff) *</span><input value={r.receivedBy} onChange={(e) => set({ receivedBy: e.target.value })} style={input} /></label>
      </div>
      <span style={{ ...fieldLabel, marginTop: 12 }}>Condition at return</span>
      {radioRow("ret-cond", RETURN_CONDITIONS, r.condition, (v) => set({ condition: v }))}
      {x.accessories.length > 0 && <><span style={{ ...fieldLabel, marginTop: 12 }}>Accessories received back</span>{checks("ret-acc", x.accessories, r.accessories, (v) => set({ accessories: v }))}</>}
      {missing.length > 0 && <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 700, color: "var(--error-text)" }}>Missing: {missing.join(", ")}</p>}
      <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Return remarks {r.condition === "Damaged" || r.condition === "Needs Service" || missing.length || r.qty < x.qty ? "*" : ""}</span><textarea rows={2} value={r.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="Damage, missing parts, who is responsible…" style={{ ...input, resize: "vertical" }} /></label>
      <p style={{ ...muted, marginTop: 8 }}>Tool goes back to: <b>{x.location}</b></p>
      {err$(err)}
    </Modal>
  );
}

function Register({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [f, setF] = useState<"All" | "At Site" | "Attention" | "Returned">("All");
  const [q, setQ] = useState("");
  const t0 = isoDay(0);
  const all = db.toolIssues ?? [];
  const match = (x: ToolIssue, k: typeof f) => k === "All" || (k === "At Site" ? !x.ret : k === "Returned" ? !!x.ret : needsAttention(x, t0));
  const rows = all.filter((x) => match(x, f)).filter((x) => !q.trim() || `${x.id} ${x.tool} ${x.techName} ${x.site} ${x.handedBy}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel title="Tool register" actions={<SearchBox value={q} onChange={setQ} placeholder="Search tool, technician, site…" />} pad={false}>
      <div style={{ padding: "12px 16px 0" }}><Filter options={["All", "At Site", "Attention", "Returned"]} value={f} onChange={setF} counts={{ All: all.length, "At Site": all.filter((x) => match(x, "At Site")).length, Attention: all.filter((x) => match(x, "Attention")).length, Returned: all.filter((x) => match(x, "Returned")).length }} /></div>
      <Table<ToolIssue> rowKey={(x) => x.id} rows={rows} empty="No tool entries yet." cols={[
        { key: "id", head: "Entry", render: (x) => <div><b>{x.id}</b><div style={muted}>{x.location}</div></div> },
        { key: "tool", head: "Tool", render: (x) => <div><b>{x.tool}</b> × {x.qty}<div style={muted}>{x.condition}</div></div> },
        { key: "tech", head: "Technician / site", render: (x) => <div>{x.techName}<div style={muted}>{x.site}</div></div> },
        { key: "out", head: "Issued", render: (x) => <div>{fmtDate(x.issueDate)}<div style={muted}>by {x.handedBy}</div></div> },
        { key: "back", head: "Returned", render: (x) => x.ret ? <div>{fmtDate(x.ret.date)}<div style={muted}>{x.ret.condition} · to {x.ret.receivedBy}</div></div> : <span style={muted}>due {fmtDate(x.expectedReturn)}</span> },
        { key: "s", head: "Status", render: (x) => { const s = issueStatus(x, t0); return <div><Badge tone={ST_TONE[s]}>{s}</Badge>{x.ret && missingOf(x).length > 0 && <div style={{ ...muted, color: "var(--error-text)" }}>Missing: {missingOf(x).join(", ")}</div>}{x.ret?.remarks && <div style={{ ...muted, maxWidth: 220 }}>{x.ret.remarks}</div>}</div>; } },
        { key: "a", head: "", render: (x) => s$(x) ? <Btn small kind="ghost" onClick={() => { resolveToolIssue(x.id, who); notify("Marked resolved"); }}>Resolved</Btn> : null },
      ]} />
    </Panel>
  );
}
const s$ = (x: ToolIssue) => issueStatus(x, isoDay(0)) === "Returned – Check";

/* ───────────── Tool rental register (hired from outside) ───────────── */

export function ToolRentalSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [edit, setEdit] = useState<{ id: string | null; d: RentalDraft } | null>(null);
  const [f, setF] = useState<"All" | "In Use" | "Returned" | "Overdue">("All");
  const t0 = isoDay(0);
  const all = db.toolRentals ?? [];
  const match = (r: ToolRental, k: typeof f) => k === "All" || (k === "Overdue" ? rentalOverdue(r, t0) : r.status === k);
  const total = all.reduce((s, r) => s + rentalCalc(r, t0).total, 0);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="admin-grid-4">
        <Stat label="Active" value={String(all.filter((r) => r.status === "In Use").length)} sub="tools on hire now" tone="blue" />
        <Stat label="Returned" value={String(all.filter((r) => r.status === "Returned").length)} sub="closed rentals" tone="green" />
        <Stat label="Total cost" value={inr(total)} sub="rent + late charges" tone="purple" />
        <Stat label="Deposit pending" value={inr(all.reduce((s, r) => s + rentalCalc(r, t0).depositPending, 0))} sub="security deposit not yet back" tone="amber" />
      </div>
      <Panel title="🔧 Tool Rental Register" actions={<Btn onClick={() => setEdit({ id: null, d: emptyRental(t0, addDays(t0, 3)) })}>＋ New tool rental entry</Btn>} pad={false}>
        <div style={{ padding: "12px 16px 0" }}><Filter options={["All", "In Use", "Overdue", "Returned"]} value={f} onChange={setF} counts={{ All: all.length, "In Use": all.filter((r) => match(r, "In Use")).length, Overdue: all.filter((r) => match(r, "Overdue")).length, Returned: all.filter((r) => match(r, "Returned")).length }} /></div>
        <Table<ToolRental> rowKey={(r) => r.id} rows={all.filter((r) => match(r, f))} empty="No rented tools yet." cols={[
          { key: "id", head: "Entry", render: (r) => <div><b>{r.id}</b><div style={muted}>{r.vendor || "—"}</div></div> },
          { key: "tool", head: "Tool", render: (r) => <div><b>{r.tool}</b> × {r.qty}<div style={muted}>{r.techName} · {r.site}</div></div> },
          { key: "dates", head: "Hire → return", render: (r) => <div>{fmtDate(r.hireDate)} → {fmtDate(r.expectedReturn)}<div style={muted}>{r.status === "Returned" ? `returned ${fmtDate(r.returnDate)}` : r.returnDate ? `planned ${fmtDate(r.returnDate)}` : ""}</div></div> },
          { key: "calc", head: "Cost", render: (r) => { const c = rentalCalc(r, t0); return <div><b>{inr(c.total)}</b><div style={muted}>{c.rentalDays} d × {inr(r.ratePerDay)}{c.lateDays ? ` + ${c.lateDays} late d` : ""}</div></div>; } },
          { key: "dep", head: "Deposit", render: (r) => <div>{inr(r.deposit)}<div style={muted}>{r.depositRefund ? `refund ${inr(r.depositRefund)}` : "not refunded"}</div></div> },
          { key: "s", head: "Status", render: (r) => <Badge tone={rentalOverdue(r, t0) ? "red" : r.status === "Returned" ? "green" : "blue"}>{rentalOverdue(r, t0) ? "Overdue" : r.status}</Badge> },
          { key: "a", head: "", render: (r) => <Btn small kind="ghost" onClick={() => { const { id, createdAt, createdBy, ...d } = r; void createdAt; void createdBy; setEdit({ id, d }); }}>{r.status === "In Use" ? "Update / return" : "View"}</Btn> },
        ]} />
      </Panel>
      {edit && <RentalForm init={edit} who={who} notify={notify} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RentalForm({ init, who, notify, onClose }: { init: { id: string | null; d: RentalDraft }; who: string; notify: (m: string) => void; onClose: () => void }) {
  const [d, setD] = useState(init.d);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<RentalDraft>) => { setD({ ...d, ...p }); setErr(null); };
  const c = rentalCalc(d, isoDay(0));
  const num = (k: keyof RentalDraft, l: string) => <label><span style={fieldLabel}>{l}</span><input type="number" min={0} value={(d[k] as number) || ""} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<RentalDraft>)} placeholder="0" style={input} /></label>;
  const row = (k: string, v: string, strong?: boolean) => <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: strong ? 16 : 13.5, fontWeight: strong ? 800 : 500, borderTop: strong ? "1px solid var(--line)" : "none", marginTop: strong ? 6 : 0 }}><span>{k}</span><span>{v}</span></div>;
  return (
    <Modal title={init.id ? `Tool rental ${init.id}` : "New tool rental entry"} onClose={onClose} width={640} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={() => { const e = saveToolRental(init.id, d, who); setErr(e); if (!e) { notify("Tool rental saved"); onClose(); } }}>Save</Btn></>}>
      <div className="form-grid">
        <label style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>Tool name *</span><input list="rent-tools" value={d.tool} onChange={(e) => set({ tool: e.target.value })} placeholder="Vacuum Pump" style={input} /><datalist id="rent-tools">{COMMON_TOOLS.map((n) => <option key={n} value={n} />)}</datalist></label>
        <label><span style={fieldLabel}>Quantity *</span><input type="number" min={1} value={d.qty || ""} onChange={(e) => set({ qty: Number(e.target.value) })} style={input} /></label>
        <label><span style={fieldLabel}>Technician name *</span><input value={d.techName} onChange={(e) => set({ techName: e.target.value })} style={input} /></label>
        <label style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>Site / project name *</span><input value={d.site} onChange={(e) => set({ site: e.target.value })} placeholder="T. Nagar — AC Installation" style={input} /></label>
        <label><span style={fieldLabel}>Hired from (vendor)</span><input value={d.vendor} onChange={(e) => set({ vendor: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Vendor mobile</span><input inputMode="numeric" value={d.vendorPhone} onChange={(e) => set({ vendorPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })} style={input} /></label>
        <label><span style={fieldLabel}>Hire date *</span><input type="date" value={d.hireDate} onChange={(e) => set({ hireDate: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Expected return date *</span><input type="date" min={d.hireDate} value={d.expectedReturn} onChange={(e) => set({ expectedReturn: e.target.value })} style={input} /></label>
        {num("ratePerDay", "Rent per day (₹)")}
        {num("lateRatePerDay", "Late charge / day (₹)")}
        {num("deposit", "Security deposit (₹)")}
        {num("depositRefund", "Deposit refund received (₹)")}
      </div>
      <span style={{ ...fieldLabel, marginTop: 12 }}>Tool status</span>
      {radioRow("rent-status", ["In Use", "Returned"] as const, d.status, (v) => set({ status: v }))}
      <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>{d.status === "Returned" ? "Actual return date *" : "Actual / planned return date"}</span><input type="date" min={d.hireDate} value={d.returnDate} onChange={(e) => set({ returnDate: e.target.value })} style={input} /></label>
      <p style={{ ...muted, margin: "4px 0 0" }}>Late Charges का Preview इस तारीख के आधार पर बनेगा। Returned चुनने पर यही Actual Return Date होगी।</p>
      <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Remarks / tool condition</span><textarea rows={2} value={d.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="Good condition" style={{ ...input, resize: "vertical" }} /></label>
      <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "var(--bg-secondary)" }}>
        <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800 }}>Automatic rental calculation</p>
        {row("Rental days", String(c.rentalDays))}
        {row("Base rental amount", inr(c.base))}
        {row(`Late days${d.status === "In Use" ? " (preview)" : ""}`, String(c.lateDays))}
        {row("Late charges", inr(c.late))}
        {row("Total rental expense", inr(c.total), true)}
        {d.deposit > 0 && row("Deposit still with vendor", inr(c.depositPending))}
      </div>
      {err$(err)}
    </Modal>
  );
}
