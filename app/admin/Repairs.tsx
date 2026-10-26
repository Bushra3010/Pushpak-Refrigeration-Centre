"use client";

import { useState } from "react";
import { RepairDetails, RepairForm, RepairStatusForm, STATUS_TONE, emptyDraft, repairWhatsApp } from "../components/repair";
import { fmtDate, inr, isoDay, type Db } from "../lib/data";
import { REPAIR_STATUSES, daysHeld, isDelayed, repairItemLabel, type RepairEntry, type RepairStatus } from "../lib/repair";
import { addRepair, setRepairStatus, updateRepair } from "../lib/store";
import { Badge, Btn, Filter, Modal, Panel, SearchBox, Stat, Table, muted } from "./kit";

/* Admin / shop-staff side of the repair register: receive items, send to vendors, update status, see delays. */

type F = "All" | "In Shop" | "Out Source" | "Delayed" | RepairStatus;
const FILTERS: F[] = ["All", "In Shop", "Out Source", "Delayed", ...REPAIR_STATUSES];

export function RepairsSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [f, setF] = useState<F>("In Shop");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "status" | "edit" | null>(null);
  const [adding, setAdding] = useState(false);
  const all = db.repairs ?? [];
  const t = isoDay(0);
  const done = (r: RepairEntry) => r.status === "Repaired" || r.status === "Returned";
  const rows = all.filter((r) => f === "All" ? true : f === "In Shop" ? !done(r) : f === "Out Source" ? r.mode === "Out Source" && !done(r) : f === "Delayed" ? isDelayed(r, t) : r.status === f)
    .filter((r) => !q.trim() || `${r.id} ${r.customerName} ${r.customerPhone} ${r.brand} ${r.itemType} ${r.techName} ${r.vendor?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const counts = Object.fromEntries(FILTERS.map((x) => [x, all.filter((r) => x === "All" ? true : x === "In Shop" ? !done(r) : x === "Out Source" ? r.mode === "Out Source" && !done(r) : x === "Delayed" ? isDelayed(r, t) : r.status === x).length])) as Partial<Record<F, number>>;
  const entry = open ? all.find((r) => r.id === open) : undefined;
  const techNames = db.techs.filter((x) => x.active).map((x) => x.name);
  const vendorDue = all.filter((r) => r.mode === "Out Source" && !done(r) && r.vendor && r.vendor.expectedDate < t);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="admin-grid-4">
        <Stat label="In the shop" value={String(counts["In Shop"] ?? 0)} sub="not yet repaired / returned" tone="blue" />
        <Stat label="At outside vendors" value={String(counts["Out Source"] ?? 0)} sub={`${vendorDue.length} past the expected date`} tone={vendorDue.length ? "amber" : "teal"} />
        <Stat label="Delayed (> 7 days)" value={String(counts.Delayed ?? 0)} sub="need a delay reason & customer update" tone={counts.Delayed ? "red" : "green"} />
        <Stat label="Repaired this month" value={String(all.filter((r) => done(r) && r.timeline.some((e) => (e.status === "Repaired") && e.at.slice(0, 7) === t.slice(0, 7))).length)} sub={inr(all.filter(done).reduce((s, r) => s + (r.charge ?? 0), 0)) + " charged (all time)"} tone="green" />
      </div>

      <Panel title="PCB Board · Stabilizer · Indoor Coil repair register" actions={<><SearchBox value={q} onChange={setQ} placeholder="Search name, mobile, brand, vendor…" /><Btn onClick={() => setAdding(true)}>＋ New Inward Entry</Btn></>} pad={false}>
        <div style={{ padding: "12px 16px 0" }}><Filter options={FILTERS} value={f} onChange={setF} counts={counts} /></div>
        <Table<RepairEntry> rowKey={(r) => r.id} rows={rows} empty="No repair entries match." cols={[
          { key: "entry", head: "Entry", render: (r) => <div><b>{r.id}</b><div style={muted}>{fmtDate(r.receivedDate)} · {daysHeld(r, t)} d{isDelayed(r, t) ? " · ⚠" : ""}</div></div> },
          { key: "item", head: "Item", render: (r) => <div><b>{r.itemType}</b><div style={muted}>{repairItemLabel(r)}</div></div> },
          { key: "customer", head: "Customer", render: (r) => <div>{r.customerName}<div style={muted}>{r.customerPhone} · by {r.techName}</div></div> },
          { key: "repair", head: "Repair", render: (r) => <div>{r.mode}{r.vendor && <div style={muted}>{r.vendor.name} · back {fmtDate(r.vendor.expectedDate)}</div>}</div> },
          { key: "status", head: "Status", render: (r) => <div><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>{r.pendingReason && <div style={{ ...muted, maxWidth: 220 }}>{r.pendingReason}</div>}</div> },
          { key: "return", head: "Return", render: (r) => r.returnDate ? fmtDate(r.returnDate) : "—" },
          { key: "₹", head: "₹", render: (r) => r.charge == null ? "—" : inr(r.charge) },
          { key: "actions", head: "", render: (r) => <div style={{ display: "flex", gap: 6 }}><Btn small kind="ghost" onClick={() => { setOpen(r.id); setMode("view"); }}>View</Btn><Btn small onClick={() => { setOpen(r.id); setMode("status"); }}>Status</Btn></div> },
        ]} />
      </Panel>

      {adding && (
        <Modal title="New inward entry (shop staff)" onClose={() => setAdding(false)} width={620}>
          <RepairForm db={db} initial={emptyDraft(who, "Shop Staff")} techNames={techNames} onCancel={() => setAdding(false)}
            onSave={(d) => { const r = addRepair(d, who); if ("error" in r) return r.error; setAdding(false); notify(`Entry ${r.id} saved`); return null; }} />
        </Modal>
      )}
      {entry && mode === "view" && (
        <Modal title={`${entry.id} · ${entry.itemType} · ${entry.brand}`} onClose={() => setMode(null)} width={620}
          footer={<><Btn kind="ghost" onClick={() => window.open(`https://wa.me/91${entry.customerPhone}?text=${encodeURIComponent(repairWhatsApp(entry))}`, "_blank", "noopener")}>WhatsApp customer</Btn><Btn kind="ghost" onClick={() => setMode("edit")}>Edit entry</Btn><Btn onClick={() => setMode("status")}>Update status</Btn></>}>
          <RepairDetails r={entry} />
        </Modal>
      )}
      {entry && mode === "status" && (
        <Modal title={`Update status · ${entry.id}`} onClose={() => setMode(null)}>
          <RepairStatusForm r={entry} onSave={(s, info) => { const e = setRepairStatus(entry.id, s, info, who); if (e) return e; setMode(null); notify(`${entry.id} → ${s}`); return null; }} />
        </Modal>
      )}
      {entry && mode === "edit" && (
        <Modal title={`Edit entry · ${entry.id}`} onClose={() => setMode("view")} width={620}>
          <RepairForm db={db} initial={entry} techNames={techNames} saveLabel="Save Changes" onCancel={() => setMode("view")}
            onSave={(d) => { const e = updateRepair(entry.id, d, who); if (e) return e; setMode("view"); notify("Entry updated"); return null; }} />
        </Modal>
      )}
    </div>
  );
}
