"use client";

import { useState } from "react";
import { shrinkPhoto } from "../components/repair";
import { fmtDate, fmtDateTime, isoDay, type Db } from "../lib/data";
import {
  APPLIANCES, APPLIANCE_NAME, CLOSE_REASONS, CUSTOMER_TEMPLATES, PARTS, SAMPLE_STATUSES, SUPPLIER_RESPONSES, SUPPLIER_TEMPLATES,
  customerMessage, customerUpdateDue, emptySample, isOpenSample, latestSupplier, suggestedCustomerTemplate, supplierFollowUpDue, supplierMessage, validateSample,
  type CustomerTemplate, type SampleDraft, type SampleEnquiry, type SampleStatus, type SupplierContact, type SupplierResponse, type SupplierTemplate,
} from "../lib/samples";
import {
  addSampleSupplier, closeSample, markCustomerInformed, markSupplierMessageSent, receiveSample, reopenSample, setCustomerReply, setSupplierResponse, updateSample,
} from "../lib/store";
import { Badge, Btn, Filter, Modal, Panel, SearchBox, Stat, Table, fieldLabel, input, muted } from "./kit";

/* Admin → Sample Enquiries: counter staff receive a customer's old part as a sample, ask suppliers on
 * WhatsApp, record their answers and keep the customer updated (2-day rules). Entered manually. */

type F = "Open" | "Supplier due" | "Customer update due" | "All" | SampleStatus;
const TONE: Record<SampleStatus, "blue" | "amber" | "green" | "red" | "orange" | "purple" | "grey"> = {
  Received: "blue", "Supplier Enquired": "amber", "Part Found": "green", "Not Available": "red", "Restock Expected": "orange", "Customer Approved": "purple", Closed: "grey",
};
const RESP_TONE: Record<SupplierResponse, "grey" | "green" | "red" | "orange"> = { "Pending / No Response": "grey", "Part Available": "green", "Part Not Available": "red", "Restock Expected": "orange" };

const shopOf = (db: Db) => {
  const city = db.settings.address.split(",").map((x) => x.trim()).filter((x) => x && !/^\d/.test(x)).slice(-1)[0]?.replace(/\s*\d{6}$/, "") ?? "";
  return { company: db.settings.company, phone: db.settings.phone.replace(/^\+91\s*/, ""), city };
};

export function SamplesSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const all = db.samples ?? [];
  const t = isoDay(0);
  const [f, setF] = useState<F>("Open");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ id: string | null; tab: 0 | 1 | 2 } | null>(null);
  const match = (s: SampleEnquiry, x: F) => x === "All" ? true : x === "Open" ? isOpenSample(s) : x === "Supplier due" ? supplierFollowUpDue(s, t) : x === "Customer update due" ? customerUpdateDue(s, t) : s.status === x;
  const FILTERS: F[] = ["Open", "Supplier due", "Customer update due", "All", ...SAMPLE_STATUSES];
  const counts = Object.fromEntries(FILTERS.map((x) => [x, all.filter((s) => match(s, x)).length])) as Partial<Record<F, number>>;
  const rows = all.filter((s) => match(s, f)).filter((s) => !q.trim() || `${s.id} ${s.customer.name} ${s.customer.phone} ${s.brand} ${s.model} ${s.part} ${s.suppliers.map((x) => x.name).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const sample = open?.id ? all.find((s) => s.id === open.id) : undefined;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="admin-grid-4">
        <Stat label="Open samples" value={String(counts.Open ?? 0)} sub="at the counter" tone="blue" />
        <Stat label="Supplier follow-up due" value={String(counts["Supplier due"] ?? 0)} sub="no reply in 2 days" tone={counts["Supplier due"] ? "amber" : "green"} />
        <Stat label="Customer update due" value={String(counts["Customer update due"] ?? 0)} sub="2-day customer update rule" tone={counts["Customer update due"] ? "red" : "green"} />
        <Stat label="Part found" value={String(counts["Part Found"] ?? 0)} sub={`${counts["Customer Approved"] ?? 0} approved by customer`} tone="green" />
      </div>

      <Panel title="Spare-part sample enquiries" actions={<><SearchBox value={q} onChange={setQ} placeholder="Search customer, mobile, part, supplier…" /><Btn onClick={() => setOpen({ id: null, tab: 0 })}>＋ Receive New Sample</Btn></>} pad={false}>
        <div style={{ padding: "12px 16px 0" }}><Filter options={FILTERS} value={f} onChange={setF} counts={counts} /></div>
        <Table<SampleEnquiry> rowKey={(s) => s.id} rows={rows} empty="No samples here. Use “Receive New Sample” when a customer brings a part." cols={[
          { key: "id", head: "Sample", render: (s) => <div><b>{s.id}</b><div style={muted}>{fmtDateTime(s.receivedAt)}{s.storage ? ` · ${s.storage}` : ""}</div></div> },
          { key: "cust", head: "Customer", render: (s) => <div>{s.customer.name}<div style={muted}>{s.customer.phone}</div></div> },
          { key: "part", head: "Part", render: (s) => <div><b>{s.part}</b> × {s.qty}<div style={muted}>{APPLIANCE_NAME[s.appliance]} · {s.brand}{s.model ? ` ${s.model}` : ""}</div></div> },
          { key: "sup", head: "Supplier", render: (s) => { const l = latestSupplier(s); return l ? <div>{l.name}<div><Badge tone={RESP_TONE[l.response]}>{l.response}</Badge></div></div> : <span style={muted}>Not asked yet</span>; } },
          { key: "due", head: "Due", render: (s) => !isOpenSample(s) ? <span style={muted}>—</span> : <div style={{ fontSize: 12 }}>
            <div style={{ color: supplierFollowUpDue(s, t) ? "var(--gold-dark)" : undefined, fontWeight: supplierFollowUpDue(s, t) ? 700 : 400 }}>Supplier: {fmtDate(s.supplierDue)}</div>
            <div style={{ color: customerUpdateDue(s, t) ? "var(--error-text)" : undefined, fontWeight: customerUpdateDue(s, t) ? 700 : 400 }}>Customer: {fmtDate(s.customerDue)}</div>
          </div> },
          { key: "status", head: "Status", render: (s) => <Badge tone={TONE[s.status]}>{s.status}</Badge> },
          { key: "act", head: "", render: (s) => <div style={{ display: "flex", gap: 6 }}><Btn small kind="ghost" onClick={() => setOpen({ id: s.id, tab: 1 })}>Supplier</Btn><Btn small onClick={() => setOpen({ id: s.id, tab: 2 })}>Customer</Btn></div> },
        ]} />
      </Panel>

      {open && (
        <Modal title={sample ? `${sample.id} · ${sample.brand} ${sample.part}` : "Receive New Sample"} onClose={() => setOpen(null)} width={680}>
          <Steps tab={open.tab} enabled={!!sample} onTab={(n) => setOpen({ ...open, tab: n })} />
          {open.tab === 0 && <ReceiveTab db={db} s={sample} onSaved={(id) => { setOpen({ id, tab: 1 }); notify(sample ? "Sample updated" : `Sample ${id} received`); }} who={who} />}
          {open.tab === 1 && sample && <SupplierTab db={db} s={sample} who={who} notify={notify} onNext={() => setOpen({ ...open, tab: 2 })} />}
          {open.tab === 2 && sample && <CustomerTab db={db} s={sample} who={who} notify={notify} onBack={() => setOpen({ ...open, tab: 1 })} />}
        </Modal>
      )}
    </div>
  );
}

function Steps({ tab, enabled, onTab }: { tab: number; enabled: boolean; onTab: (n: 0 | 1 | 2) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
      {(["Receive", "Supplier", "Customer"] as const).map((l, i) => (
        <button key={l} type="button" disabled={i > 0 && !enabled} onClick={() => onTab(i as 0 | 1 | 2)} style={{ background: "none", border: "none", padding: 0, cursor: i > 0 && !enabled ? "not-allowed" : "pointer", textAlign: "center" }}>
          <span style={{ display: "block", height: 5, borderRadius: 3, background: tab === i ? "#111" : "var(--line-strong)", marginBottom: 6 }} />
          <span style={{ fontSize: 13, fontWeight: tab === i ? 800 : 500, color: tab === i ? "var(--ink)" : "var(--ink-mute)" }}>{l}</span>
        </button>
      ))}
    </div>
  );
}

const L = ({ t, req, children }: { t: string; req?: boolean; children: React.ReactNode }) => <label style={{ display: "block", marginBottom: 12 }}><span style={fieldLabel}>{t}{req && <span style={{ color: "var(--red)" }}> *</span>}</span>{children}</label>;
const Info = ({ icon, title, children, tone = "plain" }: { icon: string; title: string; children: React.ReactNode; tone?: "plain" | "warn" }) => (
  <div style={{ background: tone === "warn" ? "var(--gold-tint)" : "var(--surface-dim)", borderRadius: 12, padding: "12px 14px", margin: "4px 0 14px" }}>
    <b style={{ fontSize: 14 }}>{icon} {title}</b><div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4, lineHeight: 1.5 }}>{children}</div>
  </div>
);

/* ── 1 Receive ── */
function ReceiveTab({ db, s, who, onSaved }: { db: Db; s?: SampleEnquiry; who: string; onSaved: (id: string) => void }) {
  const [d, setD] = useState<SampleDraft>(() => s ? structuredClone({ customer: s.customer, appliance: s.appliance, brand: s.brand, model: s.model, part: s.part, partNo: s.partNo, qty: s.qty, storage: s.storage, condition: s.condition, notes: s.notes, photos: s.photos }) : emptySample());
  const [more, setMore] = useState(!!s && !!(s.partNo || s.condition || s.notes || s.photos.length));
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<SampleDraft>) => setD((x) => ({ ...x, ...p }));
  const known = d.customer.phone.length === 10 ? db.customers.find((c) => c.phone === d.customer.phone && !c.mergedInto) : undefined;
  const phone = (v: string) => {
    const p = v.replace(/\D/g, "").slice(0, 10);
    const c = p.length === 10 ? db.customers.find((x) => x.phone === p && !x.mergedInto) : undefined;
    set({ customer: { ...d.customer, phone: p, customerId: c?.id ?? null, ...(c && !d.customer.name ? { name: c.name } : {}), ...(c && !d.customer.address ? { address: c.address } : {}) } });
  };
  const partList = PARTS[d.appliance];
  const save = () => {
    const e = validateSample(d);
    if (e) { setErr(e); return; }
    if (s) { const u = updateSample(s.id, d, who); if (u) { setErr(u); return; } onSaved(s.id); }
    else { const r = receiveSample(d, who); if ("error" in r) { setErr(r.error); return; } onSaved(r.id); }
  };
  return (
    <div>
      <L t="Customer mobile" req><input inputMode="tel" value={d.customer.phone} onChange={(e) => phone(e.target.value)} placeholder="10-digit mobile" style={input} /></L>
      <p style={{ ...muted, margin: "-6px 0 10px", color: known ? "var(--success-text)" : undefined }}>{known ? `✓ Existing customer — name and address filled from their profile` : "Existing customer hone par name aur address auto-fill honge."}</p>
      <L t="Customer name" req><input value={d.customer.name} onChange={(e) => set({ customer: { ...d.customer, name: e.target.value } })} style={input} /></L>
      <L t="Address (optional)"><input value={d.customer.address} onChange={(e) => set({ customer: { ...d.customer, address: e.target.value } })} style={input} /></L>
      <span style={fieldLabel}>Appliance <span style={{ color: "var(--red)" }}>*</span></span>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "4px 0 12px" }}>
        {APPLIANCES.map((a) => <label key={a} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}><input type="radio" checked={d.appliance === a} onChange={() => set({ appliance: a, part: "" })} style={{ width: 17, height: 17, accentColor: "#111" }} /> {a}</label>)}
      </div>
      <div className="form-grid">
        <L t="Brand" req><input value={d.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="IFB / LG / Daikin…" style={input} /></L>
        <L t="Model"><input value={d.model} onChange={(e) => set({ model: e.target.value })} placeholder="e.g. Senator 6 kg" style={input} /></L>
      </div>
      <L t="Part name" req>
        {partList.length ? (
          <select value={partList.includes(d.part) ? d.part : d.part ? "__other" : ""} onChange={(e) => set({ part: e.target.value === "__other" ? " " : e.target.value })} style={input}>
            <option value="">— Choose part —</option>{partList.map((p) => <option key={p}>{p}</option>)}<option value="__other">Other (type)</option>
          </select>
        ) : null}
        {(!partList.length || (d.part && !partList.includes(d.part))) && <input value={d.part.trim() ? d.part : ""} onChange={(e) => set({ part: e.target.value })} placeholder="Type the part name" style={{ ...input, marginTop: partList.length ? 6 : 0 }} />}
      </L>
      <div className="form-grid">
        <L t="Quantity"><input inputMode="numeric" value={String(d.qty)} onChange={(e) => set({ qty: Number(e.target.value.replace(/\D/g, "")) || 0 })} style={input} /></L>
        <L t="Storage location"><input value={d.storage} onChange={(e) => set({ storage: e.target.value })} placeholder="Rack A / Bin 01" style={input} /></L>
      </div>
      <button type="button" onClick={() => setMore(!more)} style={{ width: "100%", textAlign: "left", border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 12, padding: "11px 14px", fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>⚙ More part details (optional) <span style={{ float: "right" }}>{more ? "▲" : "▼"}</span></button>
      {more && (
        <div style={{ marginBottom: 6 }}>
          <div className="form-grid">
            <L t="Part number"><input value={d.partNo} onChange={(e) => set({ partNo: e.target.value })} style={input} /></L>
            <L t="Sample condition"><input value={d.condition} onChange={(e) => set({ condition: e.target.value })} placeholder="Burnt coil, cracked body…" style={input} /></L>
          </div>
          <L t="Notes"><input value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything the supplier should know" style={input} /></L>
          <span style={fieldLabel}>Photos of the sample (up to 3)</span>
          <div style={{ display: "flex", gap: 8, margin: "4px 0 12px" }}>
            {d.photos.map((p, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={p} alt={`Sample ${i + 1}`} onClick={() => set({ photos: d.photos.filter((_, j) => j !== i) })} title="Tap to remove" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, cursor: "pointer" }} />)}
            {d.photos.length < 3 && <label style={{ width: 64, height: 64, borderRadius: 8, border: "1.5px dashed var(--line-strong)", display: "grid", placeItems: "center", cursor: "pointer" }}>📷<input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => { const f0 = e.target.files?.[0]; if (f0) set({ photos: [...d.photos, await shrinkPhoto(f0, 480)] }); }} /></label>}
          </div>
        </div>
      )}
      {!s && <Info icon="🕑" title="Supplier response: 2 days">Sample receive hone par supplier follow-up aur customer update due date automatically ban jayegi.</Info>}
      {err && <p role="alert" style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
      <Btn onClick={save}>{s ? "Save Changes" : "📦 Receive Sample & Continue"}</Btn>
    </div>
  );
}

/* ── 2 Supplier ── */
function SupplierTab({ db, s, who, notify, onNext }: { db: Db; s: SampleEnquiry; who: string; notify: (m: string) => void; onNext: () => void }) {
  const known = db.suppliers ?? [];
  const [name, setName] = useState(known[0]?.name ?? "Regular Supplier");
  const [phone, setPhone] = useState(known[0]?.phone ?? "");
  const [tpl, setTpl] = useState<SupplierTemplate>("New Enquiry");
  const [err, setErr] = useState<string | null>(null);
  const shop = shopOf(db);
  const add = () => { const e = addSampleSupplier(s.id, { name, phone }, who); if (e) setErr(e); else { setErr(null); notify(`${name} added`); } };
  const last = latestSupplier(s);
  const allNo = s.suppliers.length > 0 && s.suppliers.every((x) => x.response === "Part Not Available");
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <b style={{ fontSize: 16 }}>Supplier enquiry & follow-up</b><Badge tone={TONE[s.status]}>{s.status}</Badge>
      </div>
      {supplierFollowUpDue(s, isoDay(0)) && <Info icon="⏰" title="Supplier follow-up due" tone="warn">No supplier has replied in 2 days — send a follow-up or ask another supplier.</Info>}

      {s.suppliers.map((x) => <SupplierCard key={x.id} s={s} x={x} tpl={tpl} shop={shop} who={who} notify={notify} />)}

      <div style={{ border: "1px solid var(--line-strong)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <b style={{ fontSize: 14 }}>{s.suppliers.length ? (allNo ? "🔓 Next action — ask another supplier" : "Ask another supplier") : "Supplier"}</b>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <L t="Supplier name"><input list="sample-suppliers" value={name} onChange={(e) => { setName(e.target.value); const k = known.find((y) => y.name === e.target.value); if (k) setPhone(k.phone); }} style={input} />
            <datalist id="sample-suppliers">{known.map((k) => <option key={k.name} value={k.name} />)}</datalist></L>
          <L t="Supplier WhatsApp number"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Optional" style={input} /></L>
        </div>
        {err && <p role="alert" style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
        <Btn kind="ghost" onClick={add}>＋ Add supplier</Btn>
      </div>

      <L t="Choose supplier message"><select value={tpl} onChange={(e) => setTpl(e.target.value as SupplierTemplate)} style={input}>{SUPPLIER_TEMPLATES.map((x) => <option key={x}>{x}</option>)}</select></L>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.55, background: "var(--surface-dim)", borderRadius: 12, padding: 14, margin: "0 0 12px" }}>{supplierMessage(tpl, s, shop)}</pre>
      {!last && <Btn onClick={async () => { try { await navigator.clipboard.writeText(supplierMessage(tpl, s, shop)); notify("Message copied"); } catch { notify("⚠ Could not copy"); } }}>⧉ Copy supplier WhatsApp message</Btn>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><Btn onClick={onNext}>Customer update →</Btn></div>
    </div>
  );
}

function SupplierCard({ s, x, tpl, shop, who, notify }: { s: SampleEnquiry; x: SupplierContact; tpl: SupplierTemplate; shop: { company: string; phone: string; city: string }; who: string; notify: (m: string) => void }) {
  const [resp, setResp] = useState<SupplierResponse>(x.response);
  const [price, setPrice] = useState(x.price == null ? "" : String(x.price));
  const [restock, setRestock] = useState(x.restockDate);
  const [note, setNote] = useState(x.note);
  const [err, setErr] = useState<string | null>(null);
  const msg = supplierMessage(tpl, s, shop);
  const save = (r: SupplierResponse) => { setResp(r); const e = setSupplierResponse(s.id, x.id, { response: r, price: price === "" ? null : Number(price), restockDate: restock, note }, who); setErr(e); if (!e) notify(`${x.name}: ${r}`); };
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b>{x.name}{x.phone ? <span style={muted}> · {x.phone}</span> : null}</b>
        <span style={muted}>{x.messageSentAt ? `Message sent ${fmtDateTime(x.messageSentAt)}` : "Message not sent yet"}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
        <Btn small onClick={async () => { try { await navigator.clipboard.writeText(msg); notify("Message copied"); } catch { notify("⚠ Could not copy"); } }}>⧉ Copy message</Btn>
        {x.phone && <Btn small kind="ghost" onClick={() => window.open(`https://wa.me/91${x.phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener")}>Open WhatsApp</Btn>}
        <Btn small kind="ghost" onClick={() => { markSupplierMessageSent(s.id, x.id, tpl, who); notify("Marked as sent"); }}>✓ Mark supplier message sent</Btn>
      </div>
      <span style={fieldLabel}>Supplier response</span>
      <div style={{ display: "grid", gap: 6, margin: "4px 0 10px" }}>
        {SUPPLIER_RESPONSES.map((r) => <label key={r} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}><input type="radio" checked={resp === r} onChange={() => save(r)} style={{ width: 17, height: 17, accentColor: "#111" }} /> {r}</label>)}
      </div>
      {(resp === "Part Available" || resp === "Restock Expected") && (
        <div className="form-grid">
          <L t="Price quoted (₹)"><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} onBlur={() => save(resp)} style={input} /></L>
          {resp === "Restock Expected" ? <L t="Restock expected on" req><input type="date" value={restock} onChange={(e) => setRestock(e.target.value)} onBlur={() => save(resp)} style={input} /></L> : <div />}
        </div>
      )}
      <L t="Note"><input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => save(resp)} placeholder="Warranty, delivery time, condition…" style={input} /></L>
      {err && <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
    </div>
  );
}

/* ── 3 Customer ── */
function CustomerTab({ db, s, who, notify, onBack }: { db: Db; s: SampleEnquiry; who: string; notify: (m: string) => void; onBack: () => void }) {
  const today = isoDay(0);
  const [tpl, setTpl] = useState<CustomerTemplate>(suggestedCustomerTemplate(s, today));
  const [reason, setReason] = useState<string>(CLOSE_REASONS[0]);
  const msg = customerMessage(tpl, s, { company: db.settings.company });
  const due = customerUpdateDue(s, today);
  return (
    <div>
      <b style={{ fontSize: 16 }}>Customer WhatsApp update</b>
      <L t="Customer message template"><select value={tpl} onChange={(e) => setTpl(e.target.value as CustomerTemplate)} style={{ ...input, marginTop: 8 }}>{CUSTOMER_TEMPLATES.map((x) => <option key={x}>{x}</option>)}</select></L>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.55, background: "var(--surface-dim)", borderRadius: 12, padding: 14, margin: "0 0 12px" }}>{msg}</pre>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn onClick={async () => { try { await navigator.clipboard.writeText(msg); notify("Message copied"); } catch { notify("⚠ Could not copy"); } }}>⧉ Copy customer WhatsApp message</Btn>
        <Btn kind="ghost" onClick={() => window.open(`https://wa.me/91${s.customer.phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener")}>Open WhatsApp</Btn>
        <Btn kind="ghost" onClick={() => { markCustomerInformed(s.id, tpl, who); notify("Customer informed — next update due in 2 days"); }}>✓ Mark customer informed</Btn>
      </div>

      <Info icon="📅" title="2-day customer update rule" tone={due ? "warn" : "plain"}>
        Supplier response nahi mile tab bhi 2 din ke andar customer ko update bhejna zaroori hai. Next update due: <b>{fmtDate(s.customerDue)}</b>{due ? " — DUE NOW" : ""}.
        {s.customerUpdates.length > 0 && <div style={{ marginTop: 6 }}>Last sent: {s.customerUpdates[s.customerUpdates.length - 1].template} · {fmtDateTime(s.customerUpdates[s.customerUpdates.length - 1].at)}</div>}
      </Info>

      <span style={fieldLabel}>Customer reply</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 14px" }}>
        {(["Pending", "Approved", "Declined"] as const).map((r) => <Btn key={r} small kind={s.customerReply === r ? "primary" : "ghost"} onClick={() => { setCustomerReply(s.id, r, who); notify(`Customer reply: ${r}`); }}>{r === "Pending" ? "Customer reply pending" : r}</Btn>)}
      </div>

      {s.status !== "Closed" ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <L t="Close this sample"><select value={reason} onChange={(e) => setReason(e.target.value)} style={input}>{CLOSE_REASONS.map((r) => <option key={r}>{r}</option>)}</select></L>
          <div style={{ marginBottom: 12 }}><Btn kind="danger" onClick={() => { closeSample(s.id, reason, who); notify(`${s.id} closed`); }}>Close</Btn></div>
        </div>
      ) : (
        <p style={{ fontSize: 13 }}>Closed — {s.closeReason}. <Btn small kind="ghost" onClick={() => { reopenSample(s.id, who); notify("Reopened"); }}>Reopen</Btn></p>
      )}

      <p style={{ ...fieldLabel, marginTop: 10 }}>History</p>
      {s.timeline.slice().reverse().map((e, i) => <p key={i} style={{ ...muted, margin: "0 0 3px" }}>{fmtDateTime(e.at)} · <b>{e.by}</b> · {e.text}</p>)}
      <div style={{ marginTop: 12 }}><Btn kind="ghost" onClick={onBack}>← Back to supplier follow-up</Btn></div>
    </div>
  );
}
