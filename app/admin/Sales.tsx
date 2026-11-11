"use client";

import { useState } from "react";
import { fmtDate, inr, isoDay, type Db } from "../lib/data";
import {
  CLAIM_STATUSES, COMPANY_PROCESS, COMPRESSOR_YEARS, COVERAGE_POINTS, EXCLUSIONS, INSTALL_ROOMS, MAX_FILE_BYTES, SALE_AC_TYPES, SALE_BRANDS, SALE_CAPACITIES, WARRANTY_YEARS,
  claimCharges, compressorEnd, daysLeft, emptySale, emptyUnit, openClaims, warrantyEnd, warrantyState,
  type AcSale, type SaleDraft, type SaleUnit, type StoredFile, type WarrantyClaim, type WarrantyState,
} from "../lib/sales";
import { registerSale, saveClaim, updateSale } from "../lib/store";
import { Badge, Btn, Filter, Modal, Panel, SearchBox, Stat, Table, fieldLabel, input, muted, type Tone } from "./kit";
import type { Role } from "./System";

/* Admin → AC Sales & Warranty: from the sale to warranty expiry and every service after.
 * One customer profile, a separate Asset ID per AC. Vendor details are visible to Admin only. */

const W_TONE: Record<WarrantyState, Tone> = { Active: "green", "Expiring Soon": "amber", Expired: "red" };
type F = "All" | "Installation Pending" | WarrantyState | "Open Claims";
const FILTERS: F[] = ["All", "Installation Pending", "Active", "Expiring Soon", "Expired", "Open Claims"];
const errP = (e: string | null) => e && <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{e}</p>;
const sectionHead = (t: string) => <p style={{ margin: "18px 0 10px", fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", color: "var(--ink-mute)", textTransform: "uppercase" }}>{t}</p>;
const radios = <T extends string | number>(name: string, opts: readonly T[], value: T, onChange: (v: T) => void, label: (v: T) => string = String) => (
  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>{opts.map((o) => <label key={String(o)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, cursor: "pointer" }}><input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} style={{ width: 16, height: 16 }} /> {label(o)}</label>)}</div>
);

async function readFile(f: File | undefined): Promise<StoredFile | string | null> {
  if (!f) return null;
  if (f.size > MAX_FILE_BYTES) return `File is ${(f.size / 1e6).toFixed(1)} MB — keep it under 1.5 MB in the demo.`;
  const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
  return { name: f.name, data, type: f.type, size: f.size };
}

function FileField({ label: l, value, onChange }: { label: string; value: StoredFile | null; onChange: (f: StoredFile | null) => void }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <span style={fieldLabel}>{l}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {value ? <a href={value.data} download={value.name} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)" }}>📄 {value.name}</a> : <span style={muted}>Not uploaded</span>}
        <label style={{ ...input, width: "auto", padding: "6px 12px", cursor: "pointer", fontWeight: 600, fontSize: 12.5 }}>{value ? "Replace" : "Upload PDF / photo"}
          <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={async (e) => { const r = await readFile(e.target.files?.[0]); if (typeof r === "string") setErr(r); else { setErr(null); if (r) onChange(r); } e.target.value = ""; }} /></label>
        {value && <Btn small kind="ghost" onClick={() => onChange(null)}>Remove</Btn>}
      </div>
      {errP(err)}
    </div>
  );
}

export function SalesSection({ db, who, role, notify }: { db: Db; who: string; role: Role; notify: (m: string) => void }) {
  const [f, setF] = useState<F>("All");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const t0 = isoDay(0);
  const all = db.acSales ?? [];
  const match = (x: AcSale, k: F) => k === "All" || (k === "Installation Pending" ? x.install.status === "Pending" : k === "Open Claims" ? openClaims(x).length > 0 : warrantyState(x, t0) === k);
  const rows = all.filter((x) => match(x, f)).filter((x) => !q.trim() || `${x.id} ${x.customer.name} ${x.customer.phone} ${x.unit.brand} ${x.unit.model} ${x.unit.indoorSerial} ${x.unit.outdoorSerial} ${x.sale.invoiceNo}`.toLowerCase().includes(q.toLowerCase()));
  const counts = Object.fromEntries(FILTERS.map((k) => [k, all.filter((x) => match(x, k)).length])) as Partial<Record<F, number>>;
  const sale = open ? all.find((x) => x.id === open) : undefined;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="admin-grid-4">
        <Stat label="ACs registered" value={String(all.length)} sub={`${new Set(all.map((x) => x.customerId)).size} customers · ${inr(all.reduce((s, x) => s + x.unit.amount, 0))} sales`} tone="blue" />
        <Stat label="Installation pending" value={String(counts["Installation Pending"] ?? 0)} sub="sold, not yet installed" tone={counts["Installation Pending"] ? "amber" : "grey"} />
        <Stat label="Warranty expiring (30 days)" value={String(counts["Expiring Soon"] ?? 0)} sub="task opens for the staff automatically" tone={counts["Expiring Soon"] ? "red" : "green"} />
        <Stat label="Open warranty claims" value={String(counts["Open Claims"] ?? 0)} sub="with the company" tone="purple" />
      </div>
      <Panel title="AC Sales & Warranty register" actions={<><SearchBox value={q} onChange={setQ} placeholder="Asset ID, name, mobile, serial, invoice…" /><Btn onClick={() => setAdding(true)}>＋ New AC Sale</Btn></>} pad={false}>
        <div style={{ padding: "12px 16px 0" }}><Filter options={FILTERS} value={f} onChange={setF} counts={counts} /></div>
        <Table<AcSale> rowKey={(x) => x.id} rows={rows} empty="No AC sales registered yet." cols={[
          { key: "id", head: "Asset ID", render: (x) => <div><b>{x.id}</b><div style={muted}>Inv {x.sale.invoiceNo}</div></div> },
          { key: "c", head: "Customer", render: (x) => <div>{x.customer.name}<div style={muted}>{x.customer.phone} · {x.install.location}</div></div> },
          { key: "ac", head: "AC", render: (x) => <div><b>{x.unit.brand} {x.unit.capacity}</b><div style={muted}>{x.unit.model} · {x.unit.acType}</div></div> },
          { key: "sn", head: "Serial (IDU / ODU)", render: (x) => <div style={{ fontSize: 12.5 }}>{x.unit.indoorSerial}<div style={muted}>{x.unit.outdoorSerial || "—"}</div></div> },
          { key: "sale", head: "Sold / installed", render: (x) => <div>{fmtDate(x.sale.date)}<div style={muted}>{x.install.status === "Installed" ? `installed ${fmtDate(x.install.date)}` : "installation pending"}</div></div> },
          { key: "w", head: "Warranty", render: (x) => { const s = warrantyState(x, t0); return <div><Badge tone={W_TONE[s]}>{s}</Badge><div style={muted}>till {fmtDate(warrantyEnd(x))}</div></div>; } },
          { key: "a", head: "", render: (x) => <Btn small kind="ghost" onClick={() => setOpen(x.id)}>Open</Btn> },
        ]} />
      </Panel>
      {adding && <NewSale db={db} who={who} role={role} notify={notify} onClose={() => setAdding(false)} />}
      {sale && <SaleDetail key={sale.id} db={db} x={sale} who={who} role={role} notify={notify} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ───────────── New sale (one customer, one or more ACs) ───────────── */

function NewSale({ db, who, role, notify, onClose }: { db: Db; who: string; role: Role; notify: (m: string) => void; onClose: () => void }) {
  const [d, setD] = useState<SaleDraft>(() => emptySale(isoDay(0)));
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof SaleDraft>(k: K, v: Partial<SaleDraft[K]>) => { setD((s) => ({ ...s, [k]: Array.isArray(s[k]) ? v : { ...(s[k] as object), ...v } })); setErr(null); };
  const setUnit = (i: number, v: Partial<SaleUnit>) => { setD((s) => ({ ...s, units: s.units.map((u, n) => (n === i ? { ...u, ...v } : u)) })); setErr(null); };
  const existing = /^\d{10}$/.test(d.customer.phone) ? db.customers.find((c) => c.phone === d.customer.phone && !c.mergedInto) : undefined;
  const theirAssets = existing ? (db.acSales ?? []).filter((x) => x.customerId === existing.id) : [];
  const onPhone = (phone: string) => {
    const c = /^\d{10}$/.test(phone) ? db.customers.find((x) => x.phone === phone && !x.mergedInto) : undefined;
    setD((s) => ({ ...s, customer: c ? { customerId: c.id, name: c.name, phone, address: c.address, area: c.area } : { ...s.customer, customerId: null, phone } }));
    setErr(null);
  };
  const preview = { sale: { date: d.sale.date, invoiceNo: "" }, warranty: d.warranty };
  const save = () => {
    const r = registerSale(d, who);
    if ("error" in r) { setErr(r.error); return; }
    notify(`${r.ids.length} AC${r.ids.length === 1 ? "" : "s"} registered · ${r.ids.join(", ")}`);
    onClose();
  };
  return (
    <Modal title="New AC Sales Registration" onClose={onClose} width={760} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Register {d.units.length > 1 ? `${d.units.length} ACs` : "AC"}</Btn></>}>
      {sectionHead("Customer details")}
      <div className="form-grid">
        <label><span style={fieldLabel}>Mobile number *</span><input inputMode="numeric" value={d.customer.phone} onChange={(e) => onPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" style={input} /></label>
        <label><span style={fieldLabel}>Customer name *</span><input value={d.customer.name} onChange={(e) => set("customer", { name: e.target.value })} style={input} /></label>
        <label style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>Customer address / installation address *</span><input value={d.customer.address} onChange={(e) => set("customer", { address: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Area</span><input value={d.customer.area} onChange={(e) => set("customer", { area: e.target.value })} style={input} /></label>
      </div>
      {existing
        ? <p style={{ margin: "8px 0 0", fontSize: 12.5, fontWeight: 600, color: "var(--success-text)" }}>✓ Existing customer — details filled in. {theirAssets.length ? `Already has ${theirAssets.length} AC asset${theirAssets.length === 1 ? "" : "s"} (${theirAssets.map((x) => x.id).join(", ")}).` : ""} The new AC gets its own Asset ID on the same profile.</p>
        : d.customer.phone.length === 10 && <p style={{ ...muted, marginTop: 8 }}>New mobile — a customer profile is created automatically.</p>}

      {sectionHead(`AC product details · ${d.units.length} AC${d.units.length === 1 ? "" : "s"} (each gets its own Asset ID)`)}
      {d.units.map((u, i) => (
        <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><b>AC {i + 1}</b>{d.units.length > 1 && <Btn small kind="danger" onClick={() => setD((s) => ({ ...s, units: s.units.filter((_, n) => n !== i) }))}>Remove</Btn>}</div>
          <div className="form-grid">
            <label><span style={fieldLabel}>Installation location (room)</span><select value={u.room} onChange={(e) => setUnit(i, { room: e.target.value })} style={input}>{INSTALL_ROOMS.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label><span style={fieldLabel}>Brand</span><select value={u.brand} onChange={(e) => setUnit(i, { brand: e.target.value })} style={input}>{SALE_BRANDS.map((b) => <option key={b}>{b}</option>)}</select></label>
            <label><span style={fieldLabel}>Type</span><select value={u.acType} onChange={(e) => setUnit(i, { acType: e.target.value as SaleUnit["acType"] })} style={input}>{SALE_AC_TYPES.map((b) => <option key={b}>{b}</option>)}</select></label>
            <label><span style={fieldLabel}>Capacity</span><select value={u.capacity} onChange={(e) => setUnit(i, { capacity: e.target.value as SaleUnit["capacity"] })} style={input}>{SALE_CAPACITIES.map((b) => <option key={b}>{b}</option>)}</select></label>
            <label><span style={fieldLabel}>Model number *</span><input value={u.model} onChange={(e) => setUnit(i, { model: e.target.value.toUpperCase() })} placeholder="FTKM50" style={input} /></label>
            <label><span style={fieldLabel}>Sale amount ₹</span><input type="number" min={0} value={u.amount || ""} onChange={(e) => setUnit(i, { amount: Number(e.target.value) })} placeholder="38500" style={input} /></label>
            <label><span style={fieldLabel}>Indoor unit serial number *</span><input value={u.indoorSerial} onChange={(e) => setUnit(i, { indoorSerial: e.target.value.toUpperCase() })} placeholder="IDU serial" style={input} /></label>
            <label><span style={fieldLabel}>Outdoor unit serial number {u.acType === "Window" ? "(not for window AC)" : "*"}</span><input value={u.outdoorSerial} disabled={u.acType === "Window"} onChange={(e) => setUnit(i, { outdoorSerial: e.target.value.toUpperCase() })} placeholder="ODU serial" style={input} /></label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}><input type="checkbox" checked={u.inverter} onChange={(e) => setUnit(i, { inverter: e.target.checked })} /> Inverter AC</label>
          </div>
        </div>
      ))}
      <Btn kind="ghost" onClick={() => setD((s) => ({ ...s, units: [...s.units, { ...emptyUnit(), brand: s.units[s.units.length - 1].brand }] }))}>＋ Add another AC for this customer</Btn>

      {sectionHead("Sales & installation")}
      <div className="form-grid">
        <label><span style={fieldLabel}>Sales date *</span><input type="date" value={d.sale.date} onChange={(e) => set("sale", { date: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Invoice number *</span><input value={d.sale.invoiceNo} onChange={(e) => set("sale", { invoiceNo: e.target.value.toUpperCase() })} placeholder="PRC/2026/001" style={input} /></label>
        <label><span style={fieldLabel}>Installation technician</span><select value={d.sale.techId} onChange={(e) => set("sale", { techId: e.target.value })} style={input}><option value="">Not assigned</option>{db.techs.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <div><span style={fieldLabel}>Installation status</span>{radios("inst", ["Pending", "Installed"] as const, d.sale.status, (v) => set("sale", { status: v }))}</div>
        {d.sale.status === "Installed" && <label><span style={fieldLabel}>Installation date</span><input type="date" min={d.sale.date} value={d.sale.installDate} onChange={(e) => set("sale", { installDate: e.target.value })} style={input} /></label>}
      </div>

      {sectionHead("Warranty details")}
      <div className="form-grid">
        <div><span style={fieldLabel}>Product warranty period</span>{radios("wy", WARRANTY_YEARS, d.warranty.years, (v) => set("warranty", { years: v }), (v) => `${v} Year${v === 1 ? "" : "s"}`)}</div>
        <div><span style={fieldLabel}>Compressor warranty</span>{radios("cy", COMPRESSOR_YEARS, d.warranty.compressorYears, (v) => set("warranty", { compressorYears: v }), (v) => (v ? `${v} Years` : "Same as product"))}</div>
        <label><span style={fieldLabel}>Brand warranty registration no.</span><input value={d.warranty.regNo} onChange={(e) => set("warranty", { regNo: e.target.value })} style={input} /></label>
      </div>
      <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "var(--bg-secondary)" }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Warranty expiry (automatic)</p>
        <p style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 800 }}>{d.sale.date ? fmtDate(warrantyEnd(preview)) : "—"}{compressorEnd(preview) && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}> · compressor till {fmtDate(compressorEnd(preview)!)}</span>}</p>
        <p style={{ ...muted, margin: "4px 0 0" }}>Sales date + selected period. Verify the actual start date and coverage from the manufacturer&apos;s terms.</p>
      </div>
      <span style={{ ...fieldLabel, marginTop: 12 }}>Warranty covers (tick what applies to this model)</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 6 }}>
        {COVERAGE_POINTS.map((c) => <label key={c} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 13 }}><input type="checkbox" checked={d.warranty.coverage.includes(c)} onChange={(e) => set("warranty", { coverage: e.target.checked ? [...d.warranty.coverage, c] : d.warranty.coverage.filter((x) => x !== c) })} style={{ marginTop: 2 }} /> {c}</label>)}
      </div>
      <Exclusions />
      <label style={{ display: "block", marginTop: 10 }}><span style={fieldLabel}>Additional notes</span><textarea rows={2} value={d.warranty.notes} onChange={(e) => set("warranty", { notes: e.target.value })} placeholder="Warranty registration, installation conditions, exclusions…" style={{ ...input, resize: "vertical" }} /></label>

      {sectionHead("Documents")}
      <div className="form-grid">
        <FileField label="Sales invoice PDF" value={d.docs.invoice} onChange={(v) => set("docs", { invoice: v })} />
        <FileField label="Warranty registration proof" value={d.docs.registration} onChange={(v) => set("docs", { registration: v })} />
      </div>

      {role === "Admin" && <>{sectionHead("Vendor details · Admin only")}<VendorFields v={d.vendor} onChange={(v) => set("vendor", v)} /></>}
      {errP(err)}
    </Modal>
  );
}

function VendorFields({ v, onChange }: { v: AcSale["vendor"]; onChange: (p: Partial<AcSale["vendor"]>) => void }) {
  return (
    <div className="form-grid">
      <label><span style={fieldLabel}>Vendor / distributor</span><input value={v.name} onChange={(e) => onChange({ name: e.target.value })} style={input} /></label>
      <label><span style={fieldLabel}>Vendor mobile</span><input inputMode="numeric" value={v.phone} onChange={(e) => onChange({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} style={input} /></label>
      <label><span style={fieldLabel}>Vendor GSTIN</span><input value={v.gstin} onChange={(e) => onChange({ gstin: e.target.value.toUpperCase() })} style={input} /></label>
      <label><span style={fieldLabel}>Purchase invoice no.</span><input value={v.purchaseInvoice} onChange={(e) => onChange({ purchaseInvoice: e.target.value })} style={input} /></label>
      <label><span style={fieldLabel}>Purchase price ₹</span><input type="number" min={0} value={v.purchasePrice ?? ""} onChange={(e) => onChange({ purchasePrice: e.target.value === "" ? null : Number(e.target.value) })} style={input} /></label>
      <label><span style={fieldLabel}>Purchase date</span><input type="date" value={v.purchaseDate} onChange={(e) => onChange({ purchaseDate: e.target.value })} style={input} /></label>
    </div>
  );
}

function Exclusions() {
  return (
    <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
      <div style={{ padding: 12, borderRadius: 12, background: "#fef2f2" }}>
        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 800, color: "var(--error-text)" }}>✗ Not covered — the company only replaces the guaranteed part</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>{EXCLUSIONS.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      <div style={{ padding: 12, borderRadius: 12, background: "var(--bg-secondary)" }}>
        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 800 }}>Company warranty process</p>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>{COMPANY_PROCESS.map((x) => <li key={x}>{x}</li>)}</ol>
      </div>
    </div>
  );
}

/* ───────────── One asset ───────────── */

type Tab = "Overview" | "Installation" | "Warranty" | "Claims & History" | "Documents" | "Vendor";

function SaleDetail({ db, x, who, role, notify, onClose }: { db: Db; x: AcSale; who: string; role: Role; notify: (m: string) => void; onClose: () => void }) {
  const tabs: Tab[] = ["Overview", "Installation", "Warranty", "Claims & History", "Documents", ...(role === "Admin" ? (["Vendor"] as Tab[]) : [])];
  const [tab, setTab] = useState<Tab>("Overview");
  const t0 = isoDay(0);
  const st = warrantyState(x, t0);
  const kv = (k: string, v: React.ReactNode) => <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderTop: "1px solid var(--line)", fontSize: 13.5 }}><span style={{ color: "var(--ink-soft)" }}>{k}</span><b style={{ textAlign: "right" }}>{v}</b></div>;
  const siblings = (db.acSales ?? []).filter((y) => y.customerId === x.customerId && y.id !== x.id);
  return (
    <Modal title={`${x.id} · ${x.unit.brand} ${x.unit.capacity} · ${x.customer.name}`} onClose={onClose} width={780}>
      <div style={{ marginBottom: 12 }}><Filter options={tabs} value={tab} onChange={setTab} /></div>
      {tab === "Overview" && <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}><Badge tone={W_TONE[st]}>{st === "Expired" ? "Warranty expired" : `Warranty ${st.toLowerCase()} · ${daysLeft(x, t0)} days left`}</Badge><Badge tone={x.install.status === "Installed" ? "green" : "amber"}>{x.install.status === "Installed" ? "Installed" : "Installation pending"}</Badge>{openClaims(x).length > 0 && <Badge tone="purple">{openClaims(x).length} open claim</Badge>}</div>
        {kv("Customer", `${x.customer.name} · ${x.customer.phone}`)}
        {kv("Customer address", `${x.customer.address}${x.customer.area ? `, ${x.customer.area}` : ""}`)}
        {kv("Installation location", x.install.location)}
        {kv("AC", `${x.unit.brand} ${x.unit.capacity} ${x.unit.acType}${x.unit.inverter ? " Inverter" : ""}`)}
        {kv("Model", x.unit.model)}
        {kv("Indoor serial", x.unit.indoorSerial)}
        {kv("Outdoor serial", x.unit.outdoorSerial || "—")}
        {kv("Sales date · invoice", `${fmtDate(x.sale.date)} · ${x.sale.invoiceNo}`)}
        {kv("Sale amount", inr(x.unit.amount))}
        {kv("Warranty till", `${fmtDate(warrantyEnd(x))} (${x.warranty.years} yr)${compressorEnd(x) ? ` · compressor till ${fmtDate(compressorEnd(x)!)}` : ""}`)}
        {siblings.length > 0 && kv("Other ACs of this customer", siblings.map((y) => `${y.id} (${y.install.location})`).join(", "))}
        <p style={{ ...muted, marginTop: 10 }}>This AC also appears in the customer&apos;s app under My ACs, so every future service is recorded on it.</p>
      </>}
      {tab === "Installation" && <InstallTab db={db} x={x} who={who} role={role} notify={notify} />}
      {tab === "Warranty" && <WarrantyTab x={x} who={who} role={role} notify={notify} />}
      {tab === "Claims & History" && <ClaimsTab db={db} x={x} who={who} notify={notify} />}
      {tab === "Documents" && <div className="form-grid">
        <FileField label="Sales invoice PDF" value={x.docs.invoice} onChange={(v) => { updateSale(x.id, { docs: { ...x.docs, invoice: v } }, who, role === "Admin"); notify("Saved"); }} />
        <FileField label="Warranty registration proof" value={x.docs.registration} onChange={(v) => { updateSale(x.id, { docs: { ...x.docs, registration: v } }, who, role === "Admin"); notify("Saved"); }} />
      </div>}
      {tab === "Vendor" && role === "Admin" && <VendorTab x={x} who={who} notify={notify} />}
    </Modal>
  );
}

function InstallTab({ db, x, who, role, notify }: { db: Db; x: AcSale; who: string; role: Role; notify: (m: string) => void }) {
  const [v, setV] = useState(x.install);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<AcSale["install"]>) => { setV({ ...v, ...p }); setErr(null); };
  return (
    <div>
      <div className="form-grid">
        <label><span style={fieldLabel}>Installation location</span><input value={v.location} onChange={(e) => set({ location: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Technician</span><select value={v.techId} onChange={(e) => set({ techId: e.target.value, techName: db.techs.find((t) => t.id === e.target.value)?.name ?? "" })} style={input}><option value="">Not assigned</option>{db.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <div><span style={fieldLabel}>Status</span>{radios("ist", ["Pending", "Installed"] as const, v.status, (s) => set({ status: s, date: s === "Installed" ? v.date || isoDay(0) : "" }))}</div>
        {v.status === "Installed" && <label><span style={fieldLabel}>Installation date</span><input type="date" min={x.sale.date} value={v.date} onChange={(e) => set({ date: e.target.value })} style={input} /></label>}
        <label><span style={fieldLabel}>Copper pipe used (ft)</span><input type="number" min={0} value={v.pipeFt ?? ""} onChange={(e) => set({ pipeFt: e.target.value === "" ? null : Number(e.target.value) })} style={input} /></label>
      </div>
      <label style={{ display: "block", marginTop: 10 }}><span style={fieldLabel}>Installation report</span><textarea rows={4} value={v.report} onChange={(e) => set({ report: e.target.value })} placeholder="Indoor at 7 ft, outdoor on stand at balcony, vacuum done 20 min, gas pressure OK, demo given to customer…" style={{ ...input, resize: "vertical" }} /></label>
      {x.install.reportAt && <p style={muted}>Marked installed on {fmtDate(x.install.reportAt)}</p>}
      {errP(err)}
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}><Btn onClick={() => { const e = updateSale(x.id, { install: v }, who, role === "Admin"); setErr(e); if (!e) notify("Installation saved"); }}>Save installation</Btn></div>
    </div>
  );
}

function WarrantyTab({ x, who, role, notify }: { x: AcSale; who: string; role: Role; notify: (m: string) => void }) {
  const [w, setW] = useState(x.warranty);
  return (
    <div>
      <div className="form-grid">
        <div><span style={fieldLabel}>Product warranty</span>{radios("wy2", WARRANTY_YEARS, w.years, (v) => setW({ ...w, years: v }), (v) => `${v} yr`)}</div>
        <div><span style={fieldLabel}>Compressor warranty</span>{radios("cy2", COMPRESSOR_YEARS, w.compressorYears, (v) => setW({ ...w, compressorYears: v }), (v) => (v ? `${v} yr` : "Same"))}</div>
        <label><span style={fieldLabel}>Registration no.</span><input value={w.regNo} onChange={(e) => setW({ ...w, regNo: e.target.value })} style={input} /></label>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 15, fontWeight: 800 }}>Expiry: {fmtDate(warrantyEnd({ sale: x.sale, warranty: w }))}{compressorEnd({ sale: x.sale, warranty: w }) && ` · compressor ${fmtDate(compressorEnd({ sale: x.sale, warranty: w })!)}`}</p>
      <span style={{ ...fieldLabel, marginTop: 12 }}>Warranty covers</span>
      {COVERAGE_POINTS.map((c) => <label key={c} style={{ display: "flex", gap: 7, fontSize: 13, padding: "2px 0" }}><input type="checkbox" checked={w.coverage.includes(c)} onChange={(e) => setW({ ...w, coverage: e.target.checked ? [...w.coverage, c] : w.coverage.filter((y) => y !== c) })} /> {c}</label>)}
      <Exclusions />
      <label style={{ display: "block", marginTop: 10 }}><span style={fieldLabel}>Notes</span><textarea rows={2} value={w.notes} onChange={(e) => setW({ ...w, notes: e.target.value })} style={{ ...input, resize: "vertical" }} /></label>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}><Btn onClick={() => { const e = updateSale(x.id, { warranty: w }, who, role === "Admin"); notify(e ? `⚠ ${e}` : "Warranty saved"); }}>Save warranty</Btn></div>
    </div>
  );
}

const blankClaim = (): Omit<WarrantyClaim, "id" | "by" | "updatedAt"> & { id?: string } => ({ date: isoDay(0), issue: "", part: "", status: "Raised", companyRef: "", charges: { checking: 0, handling: 0, repair: 0, material: 0 }, notes: "" });

function ClaimsTab({ db, x, who, notify }: { db: Db; x: AcSale; who: string; notify: (m: string) => void }) {
  const [c, setC] = useState<ReturnType<typeof blankClaim> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const jobs = db.jobs.filter((j) => j.acId === x.acId).sort((a, b) => b.date.localeCompare(a.date));
  const inWarranty = warrantyState(x, isoDay(0)) !== "Expired";
  const money = (k: keyof WarrantyClaim["charges"], l: string) => <label><span style={fieldLabel}>{l} ₹</span><input type="number" min={0} value={c!.charges[k] || ""} onChange={(e) => setC({ ...c!, charges: { ...c!.charges, [k]: Number(e.target.value) } })} placeholder="0" style={input} /></label>;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <b>Warranty claims ({x.claims.length})</b>
        {!c && <Btn small onClick={() => { setC(blankClaim()); setErr(null); }}>＋ Raise warranty claim</Btn>}
      </div>
      {!inWarranty && <p style={{ margin: "6px 0 0", fontSize: 12.5, fontWeight: 700, color: "var(--error-text)" }}>Warranty expired on {fmtDate(warrantyEnd(x))} — the company may reject new claims.</p>}
      {c && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12, marginTop: 10 }}>
          <div className="form-grid">
            <label><span style={fieldLabel}>Claim date</span><input type="date" value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} style={input} /></label>
            <label><span style={fieldLabel}>Status</span><select value={c.status} onChange={(e) => setC({ ...c, status: e.target.value as WarrantyClaim["status"] })} style={input}>{CLAIM_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>Problem *</span><input value={c.issue} onChange={(e) => setC({ ...c, issue: e.target.value })} placeholder="No cooling — outdoor PCB faulty" style={input} /></label>
            <label><span style={fieldLabel}>Guaranteed part claimed</span><input value={c.part} onChange={(e) => setC({ ...c, part: e.target.value })} placeholder="Outdoor PCB" style={input} /></label>
            <label><span style={fieldLabel}>Company complaint / claim no.</span><input value={c.companyRef} onChange={(e) => setC({ ...c, companyRef: e.target.value })} style={input} /></label>
          </div>
          <p style={{ margin: "12px 0 6px", fontSize: 13, fontWeight: 800 }}>Customer pays (not covered by the company)</p>
          <div className="form-grid">{money("checking", "Checking")}{money("handling", "Handling")}{money("repair", "Repair / labour")}{money("material", "Related material")}</div>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, fontWeight: 700 }}>Customer total: {inr(c.charges.checking + c.charges.handling + c.charges.repair + c.charges.material)}</p>
          <label style={{ display: "block", marginTop: 10 }}><span style={fieldLabel}>Notes</span><input value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} style={input} /></label>
          {errP(err)}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}><Btn kind="ghost" onClick={() => setC(null)}>Cancel</Btn><Btn onClick={() => { const e = saveClaim(x.id, c, who); setErr(e); if (!e) { notify("Claim saved"); setC(null); } }}>Save claim</Btn></div>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        {x.claims.map((k) => (
          <div key={k.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 0", borderTop: "1px solid var(--line)", fontSize: 13.5 }}>
            <span><b>{k.id} · {k.part || k.issue}</b><span style={{ display: "block", ...muted }}>{fmtDate(k.date)} · {k.issue}{k.companyRef ? ` · ref ${k.companyRef}` : ""} · customer paid {inr(claimCharges(k))}</span></span>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}><Badge tone={k.status === "Rejected" ? "red" : ["Part Replaced", "Closed"].includes(k.status) ? "green" : "amber"}>{k.status}</Badge><Btn small kind="ghost" onClick={() => setC({ ...k })}>Update</Btn></span>
          </div>
        ))}
        {!x.claims.length && <p style={muted}>No warranty claims.</p>}
      </div>
      <p style={{ margin: "18px 0 6px", fontWeight: 800 }}>Service & repair history ({jobs.length})</p>
      {jobs.map((j) => <div key={j.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}><span><b>{j.id}</b> · {fmtDate(j.date)}<span style={{ display: "block", ...muted }}>{j.complaint.issues.join(", ")}</span></span><Badge tone="grey">{j.status}</Badge></div>)}
      {!jobs.length && <p style={muted}>No service jobs yet — every job booked on this AC appears here automatically.</p>}
    </div>
  );
}

function VendorTab({ x, who, notify }: { x: AcSale; who: string; notify: (m: string) => void }) {
  const [v, setV] = useState(x.vendor);
  const margin = v.purchasePrice != null ? x.unit.amount - v.purchasePrice : null;
  return (
    <div>
      <p style={{ ...muted, marginTop: 0 }}>🔒 Only Admin can see these details.</p>
      <VendorFields v={v} onChange={(p) => setV({ ...v, ...p })} />
      {margin != null && <p style={{ margin: "10px 0 0", fontSize: 14, fontWeight: 800, color: margin >= 0 ? "var(--success-text)" : "var(--error-text)" }}>Margin on this AC: {inr(margin)}</p>}
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}><Btn onClick={() => { const e = updateSale(x.id, { vendor: v }, who, true); notify(e ? `⚠ ${e}` : "Vendor details saved"); }}>Save vendor</Btn></div>
    </div>
  );
}
