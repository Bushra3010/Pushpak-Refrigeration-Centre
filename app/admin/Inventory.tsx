"use client";

import { useState } from "react";
import { fmtDate, inr, isDone, type Db, type Part } from "../lib/data";
import { addPart, adjustStock, issueStock, updatePart } from "../lib/store";
import { Badge, Btn, Filter, Modal, Panel, SearchBox, Table, fieldLabel, input, muted } from "./kit";

const CATS: Part["category"][] = ["Compressor", "Electrical", "Motor", "Gas", "Plumbing", "Accessory", "Consumable"];
type View = "Part master" | "Technician stock" | "Usage per job";

export function InventorySection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [view, setView] = useState<View>("Part master");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"All" | Part["category"] | "Low stock">("All");
  const [modal, setModal] = useState<{ k: "adjust" | "issue" | "edit"; p: Part } | { k: "add" } | null>(null);
  const low = db.parts.filter((p) => p.stock <= p.minStock);
  const inVans = (id: string) => db.techs.reduce((s, t) => s + (t.van[id] ?? 0), 0);
  const rows = db.parts.filter((p) => (cat === "All" || (cat === "Low stock" ? p.stock <= p.minStock : p.category === cat)) && (!q.trim() || `${p.sku} ${p.name}`.toLowerCase().includes(q.trim().toLowerCase())));
  const stockValue = db.parts.reduce((s, p) => s + (p.stock + inVans(p.id)) * p.cost, 0);

  return (
    <>
      <div className="admin-grid-4" style={{ marginBottom: 16 }}>
        {[["Parts in catalogue", String(db.parts.length), "blue"], ["Low stock alerts", String(low.length), low.length ? "red" : "green"], ["Stock value (cost)", inr(stockValue), "purple"], ["Issued to technicians", `${db.parts.reduce((s, p) => s + inVans(p.id), 0)} units`, "amber"]].map(([l, v, t]) => (
          <div key={l} style={{ background: "var(--surface)", borderRadius: 16, padding: "14px 16px", border: "1px solid var(--line)", borderTop: `3px solid var(--${t === "red" ? "error-text" : t === "green" ? "success-text" : t === "purple" ? "purple" : t === "amber" ? "warning-text" : "info-text"})` }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>{l}</p><p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800 }}>{v}</p>
          </div>
        ))}
      </div>
      <Panel title="Inventory & parts" pad={false} actions={<><Filter options={["Part master", "Technician stock", "Usage per job"] as const} value={view} onChange={setView} />{view === "Part master" && <><SearchBox value={q} onChange={setQ} placeholder="SKU or part" /><Btn kind="gold" onClick={() => setModal({ k: "add" })}>+ Add part</Btn></>}</>}>
        {view === "Part master" && (
          <>
            <div style={{ padding: "12px 16px" }}><Filter options={["All", "Low stock", ...CATS] as ("All" | "Low stock" | Part["category"])[]} value={cat} onChange={setCat} /></div>
            <Table rows={rows} rowKey={(p) => p.id} cols={[
              { key: "s", head: "SKU / part", render: (p) => <><b>{p.name}</b><div style={muted}>{p.sku} · {p.category}</div></> },
              { key: "c", head: "Cost", align: "right", render: (p) => inr(p.cost) },
              { key: "p", head: "Selling", align: "right", render: (p) => inr(p.price) },
              { key: "m", head: "Margin", align: "right", render: (p) => <span style={{ color: "var(--success-text)", fontWeight: 600 }}>{Math.round(((p.price - p.cost) / p.price) * 100)}%</span> },
              { key: "w", head: "Warehouse", align: "right", render: (p) => <>{p.stock} {p.unit}{p.stock <= p.minStock && <div><Badge tone="red">Low · min {p.minStock}</Badge></div>}</> },
              { key: "v", head: "In vans", align: "right", render: (p) => inVans(p.id) },
              { key: "x", head: "", align: "right", render: (p) => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <Btn small kind="ghost" onClick={() => setModal({ k: "edit", p })}>Price</Btn>
                <Btn small kind="ghost" onClick={() => setModal({ k: "adjust", p })}>Adjust</Btn>
                <Btn small onClick={() => setModal({ k: "issue", p })}>Issue</Btn>
              </div> },
            ]} />
          </>
        )}
        {view === "Technician stock" && (
          <Table rows={db.parts.filter((p) => inVans(p.id) > 0)} rowKey={(p) => p.id} cols={[
            { key: "p", head: "Part", render: (p) => <b>{p.name}</b> },
            ...db.techs.filter((t) => t.active).map((t) => ({ key: t.id, head: t.name.split(" ")[0], align: "center" as const, render: (p: Part) => t.van[p.id] ? t.van[p.id] : <span style={muted}>—</span> })),
          ]} />
        )}
        {view === "Usage per job" && (
          <Table rows={db.jobs.filter((j) => isDone(j) && j.lines.some((l) => l.kind === "Part")).sort((a, b) => b.date.localeCompare(a.date))} rowKey={(j) => j.id} cols={[
            { key: "j", head: "Job", render: (j) => <><b>{j.id}</b><div style={muted}>{fmtDate(j.date)}</div></> },
            { key: "t", head: "Technician", render: (j) => db.techs.find((t) => t.id === j.techId)?.name ?? "—" },
            { key: "p", head: "Parts used", render: (j) => j.lines.filter((l) => l.kind === "Part").map((l) => `${l.name} × ${l.qty}`).join(", ") },
            { key: "v", head: "Parts value", align: "right", render: (j) => inr(j.lines.filter((l) => l.kind === "Part").reduce((s, l) => s + l.qty * l.price, 0)) },
            { key: "m", head: "Margin", align: "right", render: (j) => inr(j.lines.filter((l) => l.kind === "Part").reduce((s, l) => { const p = db.parts.find((x) => x.id === l.refId); return s + l.qty * (l.price - (p?.cost ?? l.price)); }, 0)) },
          ]} />
        )}
      </Panel>

      {modal?.k === "adjust" && <AdjustModal p={modal.p} onClose={() => setModal(null)} onSave={(d, r) => { adjustStock(modal.p.id, d, r, who); setModal(null); notify("Stock adjusted · logged in audit"); }} />}
      {modal?.k === "issue" && <IssueModal db={db} p={modal.p} onClose={() => setModal(null)} onSave={(t, n) => { issueStock(modal.p.id, t, n, who); setModal(null); notify(n > 0 ? "Stock issued" : "Stock returned"); }} />}
      {modal?.k === "edit" && <PartForm initial={modal.p} onClose={() => setModal(null)} onSave={(d) => { updatePart(modal.p.id, d, who); setModal(null); notify("Part updated · price change audited"); }} />}
      {modal?.k === "add" && <PartForm onClose={() => setModal(null)} onSave={(d) => { addPart(d, who); setModal(null); notify("Part added"); }} />}
    </>
  );
}

function AdjustModal({ p, onClose, onSave }: { p: Part; onClose: () => void; onSave: (delta: number, reason: string) => void }) {
  const [dir, setDir] = useState<"Add" | "Remove">("Add");
  const [n, setN] = useState("");
  const [r, setR] = useState("");
  const qty = Number(n) || 0;
  return (
    <Modal title={`Adjust stock · ${p.name}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn disabled={!qty || r.trim().length < 3 || (dir === "Remove" && qty > p.stock)} onClick={() => onSave(dir === "Add" ? qty : -qty, r.trim())}>Save adjustment</Btn></>}>
      <p style={{ margin: "0 0 12px", fontSize: 13 }}>In warehouse: <b>{p.stock} {p.unit}</b></p>
      <Filter options={["Add", "Remove"] as const} value={dir} onChange={setDir} />
      <div className="form-grid" style={{ marginTop: 12 }}>
        <label><span style={fieldLabel}>Quantity ({p.unit})</span><input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} style={input} /></label>
        <label><span style={fieldLabel}>Reason (audit trail)</span><input value={r} onChange={(e) => setR(e.target.value)} placeholder={dir === "Add" ? "Purchase bill #…" : "Damaged / count correction"} style={input} /></label>
      </div>
    </Modal>
  );
}

function IssueModal({ db, p, onClose, onSave }: { db: Db; p: Part; onClose: () => void; onSave: (techId: string, n: number) => void }) {
  const [t, setT] = useState(db.techs.find((x) => x.active)?.id ?? "");
  const [n, setN] = useState("");
  const [dir, setDir] = useState<"Issue" | "Return">("Issue");
  const qty = Number(n) || 0;
  const tech = db.techs.find((x) => x.id === t);
  const max = dir === "Issue" ? p.stock : tech?.van[p.id] ?? 0;
  return (
    <Modal title={`${dir} · ${p.name}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn disabled={!t || !qty || qty > max} onClick={() => onSave(t, dir === "Issue" ? qty : -qty)}>{dir}</Btn></>}>
      <Filter options={["Issue", "Return"] as const} value={dir} onChange={setDir} />
      <div className="form-grid" style={{ marginTop: 12 }}>
        <label><span style={fieldLabel}>Technician</span><select value={t} onChange={(e) => setT(e.target.value)} style={input}>{db.techs.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name} (has {x.van[p.id] ?? 0})</option>)}</select></label>
        <label><span style={fieldLabel}>Quantity (max {max})</span><input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} style={input} /></label>
      </div>
    </Modal>
  );
}

function PartForm({ initial, onClose, onSave }: { initial?: Part; onClose: () => void; onSave: (d: Omit<Part, "id">) => void }) {
  const [d, setD] = useState<Omit<Part, "id">>(initial ?? { sku: "", name: "", category: "Electrical", cost: 0, price: 0, stock: 0, minStock: 2, unit: "pc" });
  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;
  const valid = d.sku.trim() && d.name.trim() && d.price > 0 && d.cost >= 0 && d.price >= d.cost;
  return (
    <Modal title={initial ? `Edit ${initial.name}` : "Add part"} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn disabled={!valid} onClick={() => onSave(d)}>Save</Btn></>}>
      <div className="form-grid">
        <label><span style={fieldLabel}>SKU</span><input value={d.sku} disabled={!!initial} onChange={(e) => setD({ ...d, sku: e.target.value.toUpperCase() })} style={input} /></label>
        <label><span style={fieldLabel}>Name</span><input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Category</span><select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as Part["category"] })} style={input}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label><span style={fieldLabel}>Unit</span><input value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Purchase cost (₹)</span><input inputMode="numeric" value={d.cost || ""} onChange={(e) => setD({ ...d, cost: num(e.target.value) })} style={input} /></label>
        <label><span style={fieldLabel}>Selling price (₹)</span><input inputMode="numeric" value={d.price || ""} onChange={(e) => setD({ ...d, price: num(e.target.value) })} style={input} /></label>
        {!initial && <label><span style={fieldLabel}>Opening stock</span><input inputMode="numeric" value={d.stock || ""} onChange={(e) => setD({ ...d, stock: num(e.target.value) })} style={input} /></label>}
        <label><span style={fieldLabel}>Low-stock alert at</span><input inputMode="numeric" value={d.minStock || ""} onChange={(e) => setD({ ...d, minStock: num(e.target.value) })} style={input} /></label>
      </div>
      {d.price > 0 && <p style={{ ...muted, marginTop: 10 }}>Margin {Math.round(((d.price - d.cost) / d.price) * 100)}%{d.price < d.cost ? " — selling below cost!" : ""}</p>}
    </Modal>
  );
}
