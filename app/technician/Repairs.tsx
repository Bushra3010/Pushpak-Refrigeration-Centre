"use client";

import { useState } from "react";
import { RepairCard, RepairDetails, RepairForm, RepairStatusForm, emptyDraft, repairWhatsApp } from "../components/repair";
import { BottomSheet, Empty, GhostButton, PageHeader, PrimaryButton, SectionHead, Tabs, card, field, small } from "../components/ui";
import { isoDay, type Db, type Technician } from "../lib/data";
import { isDelayed, type RepairStatus } from "../lib/repair";
import { addRepair, setRepairStatus } from "../lib/store";

/* Technician side of the PCB / Stabilizer / Coil repair register: /technician#repairs and #repairs/<id>. */

type Tab = "open" | "done" | "all";

export function RepairsScreen({ db, tech, entryId, onOpen, onBack, flash }: { db: Db; tech: Technician; entryId: string | null; onOpen: (id: string | null) => void; onBack: () => void; flash: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>("open");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState(false);
  const all = db.repairs ?? [];
  const entry = entryId ? all.find((r) => r.id === entryId) : undefined;
  const techNames = db.techs.filter((t) => t.active).map((t) => t.name);
  const t = isoDay(0);
  const done = (s: RepairStatus) => s === "Repaired" || s === "Returned";
  const list = all.filter((r) => (tab === "all" ? true : tab === "done" ? done(r.status) : !done(r.status)))
    .filter((r) => !q.trim() || `${r.id} ${r.customerName} ${r.customerPhone} ${r.brand} ${r.itemType} ${r.vendor?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  if (adding) {
    return (
      <div>
        <PageHeader title="New Inward Entry" sub="Repair register · entry by technician" onBack={() => setAdding(false)} />
        <div style={{ padding: "0 16px 24px" }}>
          <RepairForm db={db} initial={emptyDraft(tech.name, "Technician")} techNames={techNames} onCancel={() => setAdding(false)}
            onSave={(d) => { const r = addRepair(d, tech.name); if ("error" in r) return r.error; setAdding(false); flash(`Entry ${r.id} saved — shop notified`); onOpen(r.id); return null; }} />
        </div>
      </div>
    );
  }

  if (entry) {
    const late = isDelayed(entry, t);
    return (
      <div>
        <PageHeader title={`${entry.id} · ${entry.itemType}`} sub={`${entry.brand} · ${entry.mode}`} onBack={() => onOpen(null)} />
        <div style={{ padding: "0 16px 24px" }}>
          {late && <p style={{ margin: "0 0 10px", padding: 10, borderRadius: 10, background: "var(--error)", color: "var(--error-text)", fontSize: 13, fontWeight: 600 }}>⚠ With the shop for more than 7 days — update the status and the delay reason.</p>}
          <div style={{ ...card, padding: 14 }}><RepairDetails r={entry} /></div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <PrimaryButton onClick={() => setStatus(true)}>Update Repair Status</PrimaryButton>
            <GhostButton onClick={() => window.open(`https://wa.me/91${entry.customerPhone}?text=${encodeURIComponent(repairWhatsApp(entry))}`, "_blank", "noopener")}>WhatsApp Customer</GhostButton>
          </div>
        </div>
        {status && (
          <BottomSheet title="Update repair status" onClose={() => setStatus(false)}>
            <RepairStatusForm r={entry} onSave={(s, info) => { const e = setRepairStatus(entry.id, s, info, tech.name); if (e) return e; setStatus(false); flash(`${entry.id} → ${s}`); return null; }} />
          </BottomSheet>
        )}
      </div>
    );
  }

  const openCount = all.filter((r) => !done(r.status)).length;
  return (
    <div style={{ paddingBottom: 12 }}>
      <PageHeader title="Repair Register" sub="PCB Board · Stabilizer · Indoor Coil — inward, repair, outward" onBack={onBack} />
      <div style={{ padding: "0 16px" }}>
        <PrimaryButton onClick={() => setAdding(true)}>＋ New Inward Entry</PrimaryButton>
        <p style={{ ...small, textAlign: "center", margin: "8px 0 12px" }}>{openCount} item{openCount === 1 ? "" : "s"} in the shop · {all.filter((r) => isDelayed(r, t)).length} delayed</p>
        <input aria-label="Search repairs" placeholder="Search by name, mobile, brand, vendor" value={q} onChange={(e) => setQ(e.target.value)} style={field} />
        <div style={{ marginTop: 10 }}><Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: "open", label: "In Shop" }, { id: "done", label: "Repaired" }, { id: "all", label: "All" }]} /></div>
        <SectionHead title={tab === "open" ? "Items in the shop" : tab === "done" ? "Repaired / returned" : "All entries"} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((r) => <RepairCard key={r.id} r={r} onOpen={() => onOpen(r.id)} />)}
          {list.length === 0 && <Empty>No entries here.</Empty>}
        </div>
      </div>
    </div>
  );
}
