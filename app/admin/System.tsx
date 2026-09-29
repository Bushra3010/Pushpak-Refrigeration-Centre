"use client";

import { useState } from "react";
import { fmtDateTime, inr, type Db, type Settings } from "../lib/data";
import { markRead, resetDemo, updateService, updateSettings } from "../lib/store";
import { Badge, Btn, Filter, Modal, Panel, SearchBox, Table, fieldLabel, input, muted } from "./kit";

/* ───────────────────────── Notifications ───────────────────────── */

type Aud = "Admin inbox" | "Technicians" | "Customers";

export function NotificationsSection({ db, openJob }: { db: Db; openJob: (id: string) => void }) {
  const [aud, setAud] = useState<Aud>("Admin inbox");
  const rows = db.notifications.filter((n) => (aud === "Admin inbox" ? n.to === "admin" : aud === "Technicians" ? n.to.startsWith("tech:") : n.to.startsWith("customer:")));
  const who = (to: string) => {
    const [k, id] = to.split(":");
    return k === "tech" ? db.techs.find((t) => t.id === id)?.name : k === "customer" ? db.customers.find((c) => c.id === id)?.name : "Admin";
  };
  return (
    <Panel title="Notifications & alerts" pad={false} actions={aud === "Admin inbox" && <Btn small kind="ghost" onClick={() => markRead("admin")}>Mark all read</Btn>}>
      <div style={{ padding: "12px 16px" }}>
        <Filter<Aud> options={["Admin inbox", "Technicians", "Customers"]} value={aud} onChange={setAud}
          counts={{ "Admin inbox": db.notifications.filter((n) => n.to === "admin" && !n.read).length }} />
        <p style={{ ...muted, margin: "8px 0 0" }}>Push / SMS / WhatsApp delivery is simulated in the demo — every notification the system sends is logged here.</p>
      </div>
      <Table rows={rows} rowKey={(n) => n.id} empty="Nothing here." cols={[
        { key: "t", head: "When", render: (n) => <span style={{ whiteSpace: "nowrap" }}>{fmtDateTime(n.at)}</span> },
        ...(aud !== "Admin inbox" ? [{ key: "w", head: "To", render: (n: Db["notifications"][number]) => who(n.to) }] : []),
        { key: "m", head: "Message", render: (n) => <><b style={{ fontWeight: n.read ? 600 : 800 }}>{n.title}</b><div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{n.body}</div></> },
        { key: "s", head: "", align: "right", render: (n) => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
          {!n.read && <Badge tone="blue">New</Badge>}
          {n.jobId && <Btn small kind="ghost" onClick={() => { if (n.to === "admin") markRead("admin", n.id); openJob(n.jobId!); }}>Open {n.jobId}</Btn>}
        </div> },
      ]} />
    </Panel>
  );
}

/* ───────────────────────── Audit log (PRD §15) ───────────────────────── */

export function AuditSection({ db }: { db: Db }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState("All");
  const actions = ["All", ...new Set(db.audit.map((a) => a.action))];
  const rows = db.audit.filter((a) => (f === "All" || a.action === f) && (!q.trim() || `${a.who} ${a.action} ${a.detail}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <Panel title="Audit log" pad={false} actions={<SearchBox value={q} onChange={setQ} placeholder="Search changes" />}>
      <div style={{ padding: "12px 16px" }}><Filter options={actions} value={f} onChange={setF} /></div>
      <Table rows={rows} rowKey={(a) => a.id} empty="No changes recorded." cols={[
        { key: "t", head: "When", render: (a) => <span style={{ whiteSpace: "nowrap" }}>{fmtDateTime(a.at)}</span> },
        { key: "w", head: "Who", render: (a) => a.who },
        { key: "a", head: "Action", render: (a) => <Badge tone={/price|refund/i.test(a.action) ? "amber" : /merge|cancel/i.test(a.action) ? "red" : "blue"}>{a.action}</Badge> },
        { key: "d", head: "Detail", render: (a) => <span style={{ fontSize: 12.5 }}>{a.detail}</span> },
      ]} />
    </Panel>
  );
}

/* ───────────────────────── Settings ───────────────────────── */

export const ROLES = ["Admin", "Service Coordinator", "Accounts"] as const;
export type Role = (typeof ROLES)[number];

const ACCESS: [string, string, string, string, string][] = [
  ["Customers & ACs", "Full + merge", "Create / edit", "View", "Assigned jobs only"],
  ["Jobs & dispatch", "Full", "Full", "View", "Own jobs"],
  ["Quotations", "Full", "Full", "View", "Create for own jobs"],
  ["Invoices & payments", "Full + refunds", "Record payment", "Full + refunds", "Collect on own jobs"],
  ["Inventory", "Full + prices", "Issue stock", "View", "Own van"],
  ["Reports", "Full", "Operational", "Financial", "—"],
  ["Settings & pricing", "Full", "—", "—", "—"],
];

export function SettingsSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [s, setS] = useState<Settings>(db.settings);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="admin-grid-2">
        <Panel title="Company & billing" actions={<Btn disabled={!dirty} onClick={() => { const changed = Object.fromEntries(Object.entries(s).filter(([k, v]) => db.settings[k as keyof Settings] !== v)); updateSettings(changed, who); notify("Settings saved · logged in audit"); }}>Save</Btn>}>
          <div className="form-grid">
            <label><span style={fieldLabel}>Company name</span><input value={s.company} onChange={(e) => set("company", e.target.value)} style={input} /></label>
            <label><span style={fieldLabel}>Phone</span><input value={s.phone} onChange={(e) => set("phone", e.target.value)} style={input} /></label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Address (on invoices)</span><input value={s.address} onChange={(e) => set("address", e.target.value)} style={input} /></label>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label><span style={fieldLabel}>GSTIN</span><input value={s.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} style={input} /></label>
            <label><span style={fieldLabel}>GST %</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={s.gstEnabled} onChange={(e) => set("gstEnabled", e.target.checked)} aria-label="Charge GST" style={{ width: 18, height: 18 }} />
                <select value={s.gstPercent} disabled={!s.gstEnabled} onChange={(e) => set("gstPercent", Number(e.target.value))} style={input}>{[5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</select>
              </div>
            </label>
            <label><span style={fieldLabel}>Service reminder after (days)</span><input inputMode="numeric" value={s.reminderDays} onChange={(e) => set("reminderDays", Math.min(365, num(e.target.value)))} style={input} /></label>
            <label><span style={fieldLabel}>Quotation approval</span><select value={s.approvalMode} onChange={(e) => set("approvalMode", e.target.value as Settings["approvalMode"])} style={input}>{(["Customer App or OTP", "OTP only"] as const).map((m) => <option key={m}>{m}</option>)}</select></label>
            <label><span style={fieldLabel}>AMC Basic (₹ / AC / yr)</span><input inputMode="numeric" value={s.amcBasic} onChange={(e) => set("amcBasic", num(e.target.value))} style={input} /></label>
            <label><span style={fieldLabel}>AMC Comprehensive (₹ / AC / yr)</span><input inputMode="numeric" value={s.amcComprehensive} onChange={(e) => set("amcComprehensive", num(e.target.value))} style={input} /></label>
          </div>
        </Panel>

        <Panel title="Service catalogue & labour pricing" pad={false}>
          <Table rows={db.services} rowKey={(x) => x.id} cols={[
            { key: "n", head: "Service", render: (x) => <><b style={{ opacity: x.active ? 1 : 0.5 }}>{x.name}</b><div style={muted}>{x.category}</div></> },
            { key: "p", head: "Price (₹)", align: "right", render: (x) => (
              <input inputMode="numeric" value={prices[x.id] ?? String(x.price)} onChange={(e) => setPrices({ ...prices, [x.id]: e.target.value.replace(/\D/g, "") })} aria-label={`${x.name} price`} style={{ ...input, width: 90, textAlign: "right", padding: "5px 8px" }} />
            ) },
            { key: "x", head: "", align: "right", render: (x) => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {prices[x.id] !== undefined && Number(prices[x.id]) !== x.price && Number(prices[x.id]) > 0 && <Btn small onClick={() => { updateService(x.id, { price: Number(prices[x.id]) }, who); setPrices((p) => { const n = { ...p }; delete n[x.id]; return n; }); notify(`${x.name} → ${inr(Number(prices[x.id]))} · audited`); }}>Save</Btn>}
              <Btn small kind="ghost" onClick={() => updateService(x.id, { active: !x.active }, who)}>{x.active ? "Disable" : "Enable"}</Btn>
            </div> },
          ]} />
          <p style={{ ...muted, padding: "10px 16px" }}>Part prices are edited in Inventory. Every price change is written to the audit log.</p>
        </Panel>
      </div>

      <Panel title="Roles & access" pad={false}>
        <div className="no-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 640 }}>
            <thead><tr>{["Area", "Admin", "Service Coordinator", "Accounts", "Technician (app)"].map((h) => <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: "var(--ink-mute)", textTransform: "uppercase", background: "var(--bg-secondary)", borderBottom: "1px solid var(--line)" }}>{h}</th>)}</tr></thead>
            <tbody>{ACCESS.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} style={{ padding: "9px 14px", borderBottom: "1px solid var(--line)", fontWeight: i ? 500 : 700, color: c === "—" ? "var(--ink-mute)" : undefined }}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p style={{ ...muted, padding: "10px 16px" }}>Switch role from the top bar to preview what each role sees. Real enforcement happens server-side (Supabase row-level security) once the backend is connected. Sessions time out after 30 minutes idle.</p>
      </Panel>

      <Panel title="Demo data">
        <p style={{ margin: "0 0 10px", fontSize: 13 }}>All three apps share this browser&apos;s demo data. Reset to restore the original customers, jobs and stock.</p>
        <Btn kind="danger" onClick={() => setConfirmReset(true)}>Reset demo data</Btn>
      </Panel>
      {confirmReset && (
        <Modal title="Reset demo data?" onClose={() => setConfirmReset(false)} footer={<><Btn kind="ghost" onClick={() => setConfirmReset(false)}>Cancel</Btn><Btn kind="danger" onClick={() => { resetDemo(); setConfirmReset(false); setS(db.settings); notify("Demo data reset"); }}>Reset</Btn></>}>
          <p style={{ margin: 0, fontSize: 13.5 }}>Every change made in the customer app, technician app and admin panel in this browser will be lost.</p>
        </Modal>
      )}
    </div>
  );
}
