"use client";

import { useState } from "react";
import { Chips, Pill, PrimaryButton, Toggle, card, field, label, small, type Tone } from "./ui";
import { fmtDate, fmtDateTime, inr, isoDay, type Db } from "../lib/data";
import {
  AC_CAPACITIES, AC_TECH, AC_TYPE_OPTIONS, APPLIANCES, EMPTY_COIL, EMPTY_PCB, EMPTY_STAB, FRIDGE_TYPES, OVEN_TYPES, PCB_ITEMS, PCB_TYPES, WASHER_KG, WASHER_TYPES, REPAIR_ITEM_TYPES, REPAIR_MODES, REPAIR_STATUSES, MODE_LABEL, STAB_BOOST, STAB_KVA, STAB_TYPES,
  COIL_ACCESSORIES, COIL_ITEMS, GAS_TYPES, HOLD_REASONS, NEXT_STEPS, STATUS_LABEL, TECH_STATUSES, accessoriesText, emptyWork, internalCost, isHold, partsCost, pcbApplianceLine, daysHeld, isDelayed, repairItemLabel, validateRepair,
  type RepairDraft, type RepairEntry, type RepairWork, type RepairItemType, type RepairMode, type RepairStatus,
} from "../lib/repair";

/* Repair register pieces shared by the technician app and the admin panel: the entry form, the
 * card, the status sheet and the WhatsApp text. */

export const STATUS_TONE: Record<RepairStatus, Tone> = { Received: "blue", "Under Diagnosis": "purple", "Repair Work in Progress": "amber", Pending: "red", Repaired: "green", "Repair Not Possible": "red", Returned: "grey" };

export function emptyDraft(by: string, as: "Technician" | "Shop Staff"): RepairDraft {
  return {
    enteredBy: by, enteredAs: as, receivedDate: isoDay(0), returnDate: null, customerName: "", customerPhone: "", customerId: null,
    techName: as === "Technician" ? by : "", itemType: "PCB Board", brand: "", issue: "", pcb: structuredClone(EMPTY_PCB), photos: [], mode: "In-house", charge: null,
  };
}

/** Shrink a photo in the browser so a few fit in localStorage (demo only — the real app uploads to storage). */
export function shrinkPhoto(file: File, max = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read the photo")); };
    img.src = url;
  });
}

const Radio = <T extends string>({ l, value, onChange, options }: { l: string; value: T; onChange: (v: T) => void; options: readonly T[] }) => (
  <div style={{ marginBottom: 10 }}>
    <span style={label}>{l}</span>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px" }}>
      {options.map((o) => (
        <label key={o} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
          <input type="radio" name={l} checked={value === o} onChange={() => onChange(o)} style={{ accentColor: "#111", width: 16, height: 16 }} /> {o}
        </label>
      ))}
    </div>
  </div>
);

const Txt = ({ l, value, onChange, placeholder, type = "text", required, multiline }: { l: string; value: string; onChange: (s: string) => void; placeholder?: string; type?: string; required?: boolean; multiline?: boolean }) => (
  <div style={{ marginBottom: 10 }}>
    <label style={label}>{l}{required && <span style={{ color: "var(--red)" }}> *</span>}</label>
    {multiline
      ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...field, resize: "vertical" }} />
      : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={type === "tel" ? "tel" : undefined} style={field} />}
  </div>
);

/** New / edit entry form. `db` is used to auto-fill a known customer from the mobile number. */
export function RepairForm({ db, initial, techNames, onSave, onCancel, saveLabel = "Save Inward Entry" }: {
  db: Db; initial: RepairDraft; techNames: string[]; onSave: (d: RepairDraft) => string | null | void; onCancel?: () => void; saveLabel?: string;
}) {
  const [d, setD] = useState<RepairDraft>(initial);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<RepairDraft>) => setD((x) => ({ ...x, ...p }));
  const pcb = d.pcb ?? EMPTY_PCB, stab = d.stabilizer ?? EMPTY_STAB, coil = d.coil ?? EMPTY_COIL;
  const setPcb = (p: Partial<typeof pcb>) => set({ pcb: { ...pcb, ...p } });
  const items = PCB_ITEMS[pcb.appliance ?? "AC"];

  const setItem = (itemType: RepairItemType) => set({
    itemType,
    pcb: itemType === "PCB Board" ? (d.pcb ?? structuredClone(EMPTY_PCB)) : undefined,
    stabilizer: itemType === "Stabilizer" ? (d.stabilizer ?? structuredClone(EMPTY_STAB)) : undefined,
    coil: itemType === "Indoor Coil" ? (d.coil ?? structuredClone(EMPTY_COIL)) : undefined,
  });
  const setMode = (mode: RepairMode) => set({ mode, vendor: mode === "Out Source" ? (d.vendor ?? { name: "", phone: "", sentDate: isoDay(0), expectedDate: isoDay(3), charge: null }) : undefined });
  const phone = (p: string) => {
    const digits = p.replace(/\D/g, "").slice(0, 10);
    const hit = digits.length === 10 ? db.customers.find((c) => c.phone === digits && !c.mergedInto) : undefined;
    set({ customerPhone: digits, customerId: hit?.id ?? null, ...(hit && !d.customerName.trim() ? { customerName: hit.name } : {}) });
  };
  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    try {
      const urls = await Promise.all([...files].slice(0, 3 - d.photos.length).map((f) => shrinkPhoto(f)));
      set({ photos: [...d.photos, ...urls].slice(0, 3) });
    } catch { setErr("Could not read the photo."); }
  };
  const submit = () => {
    const e = validateRepair(d);
    if (e) { setErr(e); return; }
    const r = onSave(d);
    if (r) setErr(r);
  };

  return (
    <div>
      <div style={{ ...card, padding: 14, marginBottom: 12 }}>
        <span style={label}>Item received for repair <span style={{ color: "var(--red)" }}>*</span></span>
        <Chips options={REPAIR_ITEM_TYPES} value={d.itemType} onChange={setItem} />
        <div style={{ height: 12 }} />
        <span style={label}>Repair method</span>
        <Chips options={REPAIR_MODES} value={d.mode} onChange={setMode} labelOf={(m) => MODE_LABEL[m]} />
        {d.mode === "Out Source" && <p style={{ ...small, marginTop: 6 }}>Outsourced — sent to an outside vendor for repair.</p>}
      </div>

      <div style={{ ...card, padding: 14, marginBottom: 12 }}>
        <Txt l="Receive date" type="date" value={d.receivedDate} onChange={(x) => set({ receivedDate: x })} required />
        <Txt l="Customer mobile number" type="tel" value={d.customerPhone} onChange={phone} placeholder="10-digit mobile" required />
        <Txt l="Customer name" value={d.customerName} onChange={(x) => set({ customerName: x })} placeholder="Customer name" required />
        {d.customerId && <p style={{ ...small, marginTop: -6, marginBottom: 8, color: "var(--success-text)" }}>✓ Existing customer — linked to their account</p>}
        <div style={{ marginBottom: 10 }}>
          <label style={label}>Brought by (technician) <span style={{ color: "var(--red)" }}>*</span></label>
          <input list="repair-techs" value={d.techName} onChange={(e) => set({ techName: e.target.value })} placeholder="Technician name" style={field} />
          <datalist id="repair-techs">{techNames.map((n) => <option key={n} value={n} />)}<option value="Walk-in customer" /></datalist>
        </div>
        <Txt l="Brand / manufacturer" value={d.brand} onChange={(x) => set({ brand: x })} placeholder="e.g. LG / Daikin / Samsung / V-Guard" required />
        <Txt l="Model number" value={d.model ?? ""} onChange={(x) => set({ model: x.toUpperCase() })} placeholder="e.g. FTKM50 (optional)" />
      </div>

      {d.itemType === "PCB Board" && (
        <div style={{ ...card, padding: 14, marginBottom: 12 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14 }}>PCB details</p>
          <span style={label}>Appliance type <span style={{ color: "var(--red)" }}>*</span></span>
          <Chips options={APPLIANCES} value={pcb.appliance ?? "AC"} onChange={(x) => setPcb({ appliance: x, kind: undefined, litres: undefined, accessories: {} })} />
          <div style={{ height: 10 }} />
          {(pcb.appliance ?? "AC") === "AC" && <>
            <div style={{ marginBottom: 10 }}><span style={label}>AC type</span><select aria-label="AC type" value={pcb.acType} onChange={(e) => setPcb({ acType: e.target.value })} style={field}>{AC_TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select></div>
            <Radio l="AC capacity" value={pcb.capacity} onChange={(x) => setPcb({ capacity: x })} options={AC_CAPACITIES} />
            <Radio l="PCB location" value={pcb.pcbType} onChange={(x) => setPcb({ pcbType: x })} options={PCB_TYPES} />
          </>}
          {pcb.appliance === "Refrigerator" && <>
            <Radio l="Refrigerator type" value={pcb.kind ?? ""} onChange={(x) => setPcb({ kind: x })} options={FRIDGE_TYPES} />
            <Txt l="Refrigerator capacity (litres)" value={pcb.litres ?? ""} onChange={(x) => setPcb({ litres: x.replace(/[^\d.]/g, "") })} placeholder="e.g. 260" />
          </>}
          {pcb.appliance === "Washing Machine" && <>
            <Radio l="Washing machine type" value={pcb.kind ?? ""} onChange={(x) => setPcb({ kind: x })} options={WASHER_TYPES} />
            <Txt l="Washing machine model" value={pcb.model ?? ""} onChange={(x) => setPcb({ model: x.toUpperCase() })} placeholder="Enter model number" />
            <div style={{ marginBottom: 10 }}><span style={label}>Washing machine capacity (KG)</span><select aria-label="Washing machine capacity" value={pcb.kg ?? "7 KG"} onChange={(e) => setPcb({ kg: e.target.value })} style={field}>{WASHER_KG.map((k) => <option key={k}>{k}</option>)}</select></div>
          </>}
          {pcb.appliance === "Oven" && <>
            <Radio l="Oven type" value={pcb.kind ?? ""} onChange={(x) => setPcb({ kind: x })} options={OVEN_TYPES} />
            <Txt l="Oven capacity (litres)" value={pcb.litres ?? ""} onChange={(x) => setPcb({ litres: x.replace(/[^\d.]/g, "") })} placeholder="e.g. 28" />
          </>}
          {pcb.appliance === "Other" && <Txt l="Appliance name" value={pcb.applianceName ?? ""} onChange={(x) => setPcb({ applianceName: x })} placeholder="e.g. Water dispenser, Deep freezer" required />}
          <Radio l="Inverter type" value={pcb.tech} onChange={(x) => setPcb({ tech: x })} options={AC_TECH} />
          <span style={label}>Items received along with PCB board</span>
          {items.map((k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
              <span>{k}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: pcb.accessories[k] ? "var(--success-text)" : "var(--ink-mute)" }}>
                {pcb.accessories[k] ? "Yes" : "No"}<Toggle on={!!pcb.accessories[k]} onChange={(b) => setPcb({ accessories: { ...pcb.accessories, [k]: b } })} label={k} />
              </span>
            </div>
          ))}
          {pcb.appliance === "Other" && <Txt l="Items received with the PCB" value={pcb.otherItems ?? ""} onChange={(x) => setPcb({ otherItems: x })} placeholder="e.g. Sensor, wiring, case" />}
        </div>
      )}
      {d.itemType === "Other" && (
        <div style={{ ...card, padding: 14, marginBottom: 12 }}>
          <Txt l="Item received" value={d.otherItem ?? ""} onChange={(x) => set({ otherItem: x })} placeholder="e.g. Fan motor, Compressor relay, Remote" required />
        </div>
      )}
      {d.itemType === "Stabilizer" && (
        <div style={{ ...card, padding: 14, marginBottom: 12 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14 }}>Stabilizer details</p>
          <Radio l="Stabilizer type" value={stab.type ?? "AC Stabilizer"} onChange={(x) => set({ stabilizer: { ...stab, type: x } })} options={STAB_TYPES} />
          {stab.type === "Other" && <Txt l="Stabilizer type (other)" value={stab.otherType ?? ""} onChange={(x) => set({ stabilizer: { ...stab, otherType: x } })} placeholder="e.g. Washing machine stabilizer" required />}
          <Radio l="Capacity (KVA)" value={stab.kva} onChange={(x) => set({ stabilizer: { ...stab, kva: x } })} options={STAB_KVA} />
          <Radio l="Boost type" value={stab.boost} onChange={(x) => set({ stabilizer: { ...stab, boost: x } })} options={STAB_BOOST} />
        </div>
      )}
      {d.itemType === "Indoor Coil" && (
        <div style={{ ...card, padding: 14, marginBottom: 12 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14 }}>Indoor coil / unit details</p>
          <Radio l="Item received" value={coil.item ?? "Only Indoor Coil"} onChange={(x) => set({ coil: { ...coil, item: x } })} options={COIL_ITEMS} />
          <div style={{ marginBottom: 10 }}><span style={label}>AC type</span><select aria-label="AC type" value={coil.acType} onChange={(e) => set({ coil: { ...coil, acType: e.target.value } })} style={field}>{AC_TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div style={{ marginBottom: 10 }}><span style={label}>AC capacity</span><select aria-label="AC capacity" value={coil.capacity} onChange={(e) => set({ coil: { ...coil, capacity: e.target.value as typeof coil.capacity } })} style={field}>{AC_CAPACITIES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <span style={label}>Refrigerant gas type</span>
          <Chips options={GAS_TYPES} value={coil.gas ?? "Unknown"} onChange={(x) => set({ coil: { ...coil, gas: x } })} />
          <div style={{ height: 10 }} />
          <Radio l="Inverter type" value={coil.tech} onChange={(x) => set({ coil: { ...coil, tech: x } })} options={AC_TECH} />
          <span style={label}>Items received along with indoor coil</span>
          {COIL_ACCESSORIES.map((k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
              <span>{k}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: coil.accessories?.[k] ? "var(--success-text)" : "var(--ink-mute)" }}>
                {coil.accessories?.[k] ? "Yes" : "No"}<Toggle on={!!coil.accessories?.[k]} onChange={(b) => set({ coil: { ...coil, accessories: { ...(coil.accessories ?? {}), [k]: b } } })} label={k} />
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...card, padding: 14, marginBottom: 12 }}>
        <Txt l="Reported problem" value={d.issue} onChange={(x) => set({ issue: x })} placeholder="Describe the problem reported by customer or technician" required multiline />
        <span style={label}>{d.itemType} photos (up to 3)</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {d.photos.map((p, i) => (
            <div key={i} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt={`Photo ${i + 1}`} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
              <button type="button" onClick={() => set({ photos: d.photos.filter((_, j) => j !== i) })} aria-label="Remove photo" style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontSize: 12, cursor: "pointer" }}>×</button>
            </div>
          ))}
          {d.photos.length < 3 && (
            <label style={{ width: 72, height: 72, borderRadius: 8, border: "1.5px dashed var(--line-strong)", display: "grid", placeItems: "center", fontSize: 11, color: "var(--ink-soft)", cursor: "pointer", textAlign: "center" }}>
              📷 Add<input type="file" accept="image/*" capture="environment" multiple onChange={(e) => addPhotos(e.target.files)} style={{ display: "none" }} />
            </label>
          )}
        </div>
        <p style={small}>Camera or gallery. Photos are shrunk for this demo; the real app uploads full size.</p>
      </div>

      {d.mode === "Out Source" && d.vendor && (
        <div style={{ ...card, padding: 14, marginBottom: 12, border: "1.5px solid var(--gold)" }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14 }}>Out Source — vendor</p>
          <Txt l="Vendor name" value={d.vendor.name} onChange={(x) => set({ vendor: { ...d.vendor!, name: x } })} placeholder="Repair shop / vendor" required />
          <Txt l="Vendor mobile" type="tel" value={d.vendor.phone} onChange={(x) => set({ vendor: { ...d.vendor!, phone: x.replace(/\D/g, "").slice(0, 10) } })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Txt l="Sent on" type="date" value={d.vendor.sentDate} onChange={(x) => set({ vendor: { ...d.vendor!, sentDate: x } })} />
            <Txt l="Expected back" type="date" value={d.vendor.expectedDate} onChange={(x) => set({ vendor: { ...d.vendor!, expectedDate: x } })} />
          </div>
          <Txt l="Vendor charge (₹)" type="number" value={d.vendor.charge == null ? "" : String(d.vendor.charge)} onChange={(x) => set({ vendor: { ...d.vendor!, charge: x === "" ? null : Number(x) } })} />
        </div>
      )}

      <div style={{ ...card, padding: 14, marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Txt l="Promised return date" type="date" value={d.returnDate ?? ""} onChange={(x) => set({ returnDate: x || null })} />
          <Txt l="Customer charge (₹)" type="number" value={d.charge == null ? "" : String(d.charge)} onChange={(x) => set({ charge: x === "" ? null : Number(x) })} />
        </div>
      </div>

      {err && <p role="alert" style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
      <PrimaryButton onClick={submit}>{saveLabel}</PrimaryButton>
      {onCancel && <button type="button" onClick={onCancel} style={{ width: "100%", marginTop: 8, background: "none", border: "none", color: "var(--ink-soft)", fontWeight: 600, fontSize: 13.5, cursor: "pointer", padding: 10 }}>Cancel</button>}
    </div>
  );
}

export function RepairCard({ r, onOpen }: { r: RepairEntry; onOpen: () => void }) {
  const t = isoDay(0);
  const late = isDelayed(r, t);
  return (
    <button onClick={onOpen} className="press" style={{ ...card, width: "100%", border: late ? "1.5px solid var(--red)" : "none", padding: 12, cursor: "pointer", textAlign: "left", display: "flex", gap: 12 }}>
      <div style={{ width: 52, height: 52, borderRadius: 8, flexShrink: 0, background: "linear-gradient(160deg,#262626,#0c0c0c)", border: "2px solid var(--gold)", display: "grid", placeItems: "center", fontSize: 22, overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {r.photos[0] ? <img src={r.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : r.itemType === "PCB Board" ? "🔌" : r.itemType === "Stabilizer" ? "🔋" : r.itemType === "Other" ? "🔧" : "🌀"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{r.id} · {r.itemType}</span>
          <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repairItemLabel(r)}</p>
        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ink-mute)" }}>{r.customerName} · {fmtDate(r.receivedDate)} · {daysHeld(r, t)} day{daysHeld(r, t) === 1 ? "" : "s"} · {MODE_LABEL[r.mode]}{late ? " · ⚠ delayed" : ""}</p>
      </div>
    </button>
  );
}

/** Full details for the detail page / admin drawer. */
export function RepairDetails({ r }: { r: RepairEntry }) {
  const row = (k: string, v: React.ReactNode) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}><span style={{ color: "var(--ink-soft)" }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span></div>;
  return (
    <div>
      {r.photos.length > 0 && <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>{r.photos.map((p, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={p} alt={`Photo ${i + 1}`} style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 8 }} />)}</div>}
      {row("Status", <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>)}
      {row("Received", `${fmtDate(r.receivedDate)} · ${daysHeld(r, isoDay(0))} days ago`)}
      {row("Return date", r.returnDate ? fmtDate(r.returnDate) : "—")}
      {row("Customer", `${r.customerName} · ${r.customerPhone}`)}
      {row("Brought by", r.techName)}
      {row("Entered by", `${r.enteredBy} (${r.enteredAs})`)}
      {row("Item", `${r.itemType} · ${r.brand}`)}
      {r.model && row("Model", r.model)}
      {r.otherItem && row("Item received", r.otherItem)}
      {r.pcb && <>{row("Appliance", pcbApplianceLine(r.pcb))}{row("Items with PCB", accessoriesText(r.pcb))}</>}
      {r.stabilizer && row("Stabilizer", `${r.stabilizer.type === "Other" ? r.stabilizer.otherType : r.stabilizer.type ?? "AC Stabilizer"} · ${r.stabilizer.kva} · ${r.stabilizer.boost}`)}
      {r.coil && <>{row("Coil", `${r.coil.item ?? "Only Indoor Coil"} · ${r.coil.acType} · ${r.coil.capacity} · ${r.coil.tech}${r.coil.gas ? ` · ${r.coil.gas}` : ""}`)}{row("Items with coil", Object.keys(r.coil.accessories ?? {}).filter((k) => r.coil!.accessories![k]).join(", ") || "None")}</>}
      {row("Problem", r.issue)}
      {row("Repair method", MODE_LABEL[r.mode])}
      {r.vendor && <>{row("Vendor", `${r.vendor.name}${r.vendor.phone ? ` · ${r.vendor.phone}` : ""}`)}{row("Sent / expected", `${fmtDate(r.vendor.sentDate)} → ${fmtDate(r.vendor.expectedDate)}`)}{row("Vendor charge", r.vendor.charge == null ? "—" : inr(r.vendor.charge))}</>}
      {row("Customer charge", r.charge == null ? "—" : inr(r.charge))}
      {r.pendingReason && row("On hold reason", r.pendingReason)}
      {r.work && <>
        {row("Repair technician", r.work.techName)}
        {r.work.diagnosis && row("Problem found", r.work.diagnosis)}
        {r.work.action && row("Work done", r.work.action)}
        {r.work.hold && <>{row("Next step", `${r.work.hold.nextStep}${r.work.hold.supplier ? ` · ${r.work.hold.supplier}` : ""}`)}{r.work.hold.followUp && row("Follow-up", fmtDate(r.work.hold.followUp))}</>}
        {r.work.parts.length > 0 && row("Spare parts", r.work.parts.map((x) => `${x.name} ×${x.qty}`).join(", "))}
        {row("Internal cost", `${inr(internalCost(r.work))}${r.work.hours != null ? ` · ${r.work.hours} h` : ""}`)}
      </>}
      {r.delayReason && row("Delay / late reason", r.delayReason)}
      <p style={{ ...label, margin: "14px 0 4px", fontSize: 12.5 }}>Timeline</p>
      {r.timeline.map((e, i) => <p key={i} style={{ ...small, margin: "0 0 4px" }}><b>{STATUS_LABEL[e.status] ?? e.status}</b> · {fmtDateTime(e.at)} · {e.by}{e.note ? ` — ${e.note}` : ""}</p>)}
    </div>
  );
}

/** Status update: Repaired / Pending / In progress / Returned with the reasons the register needs. */
export function RepairStatusForm({ r, onSave }: { r: RepairEntry; onSave: (status: RepairStatus, info: { note: string; pendingReason: string; delayReason: string; returnDate: string | null; charge: number | null }) => string | null | void }) {
  const [status, setStatus] = useState<RepairStatus>(r.status);
  const [note, setNote] = useState("");
  const [pendingReason, setPendingReason] = useState(r.pendingReason);
  const [delayReason, setDelayReason] = useState(r.delayReason);
  const [returnDate, setReturnDate] = useState(r.returnDate ?? "");
  const [charge, setCharge] = useState(r.charge == null ? "" : String(r.charge));
  const [err, setErr] = useState<string | null>(null);
  const late = isDelayed(r, isoDay(0));
  return (
    <div>
      <span style={label}>Repair status</span>
      <Chips options={REPAIR_STATUSES} value={status} onChange={setStatus} labelOf={(x) => STATUS_LABEL[x]} />
      <div style={{ height: 12 }} />
      {status === "Pending" && <Txt l="On hold reason" value={pendingReason} onChange={setPendingReason} placeholder="Why is the repair pending?" required multiline />}
      {(late || status === "Pending" || delayReason) && <Txt l="Delay / late reason" value={delayReason} onChange={setDelayReason} placeholder="Why is it late?" multiline />}
      {(status === "Repaired" || status === "Returned") && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Txt l="Return date" type="date" value={returnDate} onChange={setReturnDate} required={status === "Returned"} />
        <Txt l="Customer charge (₹)" type="number" value={charge} onChange={setCharge} />
      </div>}
      <Txt l="Note" value={note} onChange={setNote} placeholder="What was done / told to the customer" />
      {err && <p role="alert" style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
      <PrimaryButton onClick={() => { const e = onSave(status, { note, pendingReason, delayReason, returnDate: returnDate || null, charge: charge === "" ? null : Number(charge) }); if (e) setErr(e); }}>Update Status</PrimaryButton>
    </div>
  );
}

export function repairWhatsApp(r: RepairEntry): string {
  return [
    `Pushpak Refrigeration Centre — Repair ${r.id}`,
    `${r.itemType}: ${repairItemLabel(r)}`,
    `Customer: ${r.customerName} (${r.customerPhone})`,
    `Received: ${fmtDate(r.receivedDate)}${r.returnDate ? ` · Return: ${fmtDate(r.returnDate)}` : ""}`,
    `Status: ${STATUS_LABEL[r.status]}${r.pendingReason ? ` — ${r.pendingReason}` : ""}`,
    ...(r.charge != null ? [`Charge: ${inr(r.charge)}`] : []),
  ].join("\n");
}

/** Read-only inward details, shown when a Repair ID is picked in the technician update. */
export function InwardSummary({ r }: { r: RepairEntry }) {
  const cell = (k: string, v: React.ReactNode) => <div style={{ minWidth: 0 }}><p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-soft)" }}>{k}</p><p style={{ margin: "2px 0 0", fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{v || "—"}</p></div>;
  const pcbItems = r.pcb ? accessoriesText(r.pcb) : "";
  const items = (r.pcb ? (pcbItems.startsWith("With ") ? pcbItems.slice(5).split(", ") : []) : r.coil ? Object.keys(r.coil.accessories ?? {}).filter((k) => r.coil!.accessories![k]) : []).filter(Boolean);
  return (
    <div style={{ ...card, padding: 14, marginBottom: 12, border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}><b style={{ fontSize: 14.5 }}>Inward details — auto-filled</b><Pill tone="grey">Read only</Pill></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
        {cell("Customer name", r.customerName)}{cell("Mobile number", r.customerPhone)}
        {cell("Brand name", r.brand)}{cell("Item received", r.itemType === "Other" ? r.otherItem : r.itemType)}
        {cell("Model number", r.model)}{cell("Brought by technician", r.techName)}
        {cell("Inward date", fmtDate(r.receivedDate))}{cell("Repair ID", r.id)}
      </div>
      <div style={{ marginTop: 10 }}>{cell("Technical details", repairItemLabel(r).replace(new RegExp(`^${r.brand} `), ""))}</div>
      <div style={{ marginTop: 10 }}>{cell("Reported problem", r.issue)}</div>
      {items.length > 0 && <div style={{ marginTop: 10 }}><p style={{ margin: "0 0 4px", fontSize: 11.5, color: "var(--ink-soft)" }}>Accessories received</p><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{items.map((x) => <Pill key={x} tone="grey">{x}</Pill>)}</div></div>}
    </div>
  );
}

/** Technician Repair Update — pick a Repair ID, the inward details fill in, the technician records the repair. */
export function RepairUpdateForm({ db, repairId, onPick, defaultTechId, onSave }: {
  db: Db; repairId: string | null; onPick?: (id: string) => void; defaultTechId?: string;
  onSave: (id: string, status: RepairStatus, w: RepairWork) => string | null;
}) {
  const open = (db.repairs ?? []).filter((r) => r.status !== "Returned");
  const r = repairId ? (db.repairs ?? []).find((x) => x.id === repairId) : undefined;
  const techs = db.techs.filter((t) => t.active);
  const init = (): { status: RepairStatus; w: RepairWork } => {
    const w = structuredClone(r?.work ?? emptyWork());
    if (!w.techId && defaultTechId) { w.techId = defaultTechId; w.techName = techs.find((t) => t.id === defaultTechId)?.name ?? ""; }
    return { status: r && TECH_STATUSES.includes(r.status) ? r.status : "Under Diagnosis", w };
  };
  const [st, setSt] = useState(init);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const w = st.w;
  const setW = (p: Partial<RepairWork>) => { setSt((s) => ({ ...s, w: { ...s.w, ...p } })); setErr(null); setSaved(false); };
  const hold = w.hold ?? { reason: "", nextStep: "", supplier: "", expectedDate: "", followUp: "" };
  const setHold = (p: Partial<typeof hold>) => setW({ hold: { ...hold, ...p } });
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const sec = (t: string) => <p style={{ margin: "16px 0 10px", fontSize: 15, fontWeight: 800 }}>{t}</p>;
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <span style={label}>Select inward Repair ID</span>
        <select aria-label="Select inward Repair ID" value={repairId ?? ""} onChange={(e) => onPick?.(e.target.value)} disabled={!onPick} style={field}>
          <option value="">Choose a Repair ID</option>
          {open.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.customerName} · {x.brand} · {STATUS_LABEL[x.status]}</option>)}
        </select>
      </div>
      {!r ? <p style={small}>Pick a Repair ID — the customer, item, model and complaint fill in automatically, so nothing is typed twice.</p> : <>
        <InwardSummary r={r} />
        <div style={{ ...card, padding: 14 }}>
          {sec("1. Repair technician details")}
          <div style={{ marginBottom: 10 }}><span style={label}>Repair done by / assigned technician <span style={{ color: "var(--red)" }}>*</span></span>
            <select aria-label="Repair technician" value={w.techId} onChange={(e) => setW({ techId: e.target.value, techName: techs.find((t) => t.id === e.target.value)?.name ?? "" })} style={field}><option value="">Select technician</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <span style={label}>Repair status <span style={{ color: "var(--red)" }}>*</span></span>
          <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            {TECH_STATUSES.map((x) => <label key={x} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}><input type="radio" name="repair-status" checked={st.status === x} onChange={() => { setSt((s) => ({ ...s, status: x })); setErr(null); setSaved(false); }} style={{ accentColor: "#111", width: 17, height: 17 }} /> {STATUS_LABEL[x]}</label>)}
          </div>
          <Txt l="Problem found / fault diagnosis" value={w.diagnosis} onChange={(x) => setW({ diagnosis: x })} placeholder="e.g. SMPS IC damaged, output voltage missing" required={st.status !== "Under Diagnosis"} multiline />
          <Txt l="Repair work done / action taken" value={w.action} onChange={(x) => setW({ action: x })} placeholder="e.g. Replaced faulty IC, soldering and circuit checking" required={st.status === "Repaired"} multiline />

          {isHold(st.status) && <>
            {sec(`2. ${st.status === "Pending" ? "On hold" : "Repair failed"}`)}
            <div style={{ marginBottom: 10 }}><span style={label}>Reason <span style={{ color: "var(--red)" }}>*</span></span><select aria-label="Reason" value={hold.reason} onChange={(e) => setHold({ reason: e.target.value })} style={field}><option value="">Select reason</option>{HOLD_REASONS.map((x) => <option key={x}>{x}</option>)}</select></div>
            <div style={{ marginBottom: 10 }}><span style={label}>Next step / action <span style={{ color: "var(--red)" }}>*</span></span><select aria-label="Next step" value={hold.nextStep} onChange={(e) => setHold({ nextStep: e.target.value })} style={field}><option value="">Select next step</option>{NEXT_STEPS.map((x) => <option key={x}>{x}</option>)}</select></div>
            <Txt l="Supplier / repair centre" value={hold.supplier} onChange={(x) => setHold({ supplier: x })} placeholder="Name / source" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Txt l="Expected action completion date" type="date" value={hold.expectedDate} onChange={(x) => setHold({ expectedDate: x })} />
              <Txt l="Next follow-up date" type="date" value={hold.followUp} onChange={(x) => setHold({ followUp: x })} />
            </div>
            {hold.followUp && <p style={{ ...small, marginTop: -4 }}>A follow-up task for the office is created for {fmtDate(hold.followUp)}.</p>}
          </>}

          {sec(`${isHold(st.status) ? 3 : 2}. Spare parts used`)}
          {w.parts.map((p, i) => (
            <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}><input aria-label="Part name" value={p.name} onChange={(e) => setW({ parts: w.parts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Part name — IC, capacitor, relay…" style={field} /><button type="button" aria-label="Remove part" onClick={() => setW({ parts: w.parts.filter((_, j) => j !== i) })} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "var(--error-text)" }}>×</button></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label><span style={label}>Quantity</span><input type="number" min={1} value={p.qty || ""} onChange={(e) => setW({ parts: w.parts.map((x, j) => (j === i ? { ...x, qty: num(e.target.value) } : x)) })} style={field} /></label>
                <label><span style={label}>Unit cost (₹)</span><input type="number" min={0} value={p.unitCost || ""} onChange={(e) => setW({ parts: w.parts.map((x, j) => (j === i ? { ...x, unitCost: num(e.target.value) } : x)) })} style={field} /></label>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setW({ parts: [...w.parts, { name: "", qty: 1, unitCost: 0 }] })} style={{ width: "100%", border: "1.5px dashed var(--line-strong)", background: "none", borderRadius: 12, padding: 10, fontWeight: 700, cursor: "pointer" }}>＋ Add spare part</button>
          {w.parts.length > 0 && <p style={{ ...small, marginTop: 6 }}>Parts total: <b>{inr(partsCost(w))}</b></p>}

          {sec(`${isHold(st.status) ? 4 : 3}. Repair time & cost`)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label><span style={label}>Time taken (hours)</span><input type="number" min={0} step={0.5} value={w.hours ?? ""} onChange={(e) => setW({ hours: e.target.value === "" ? null : Number(e.target.value) })} placeholder="2.5" style={field} /></label>
            <label><span style={label}>Labour cost ₹</span><input type="number" min={0} value={w.labour || ""} onChange={(e) => setW({ labour: num(e.target.value) })} placeholder="250" style={field} /></label>
            <label><span style={label}>Other expenses ₹</span><input type="number" min={0} value={w.other || ""} onChange={(e) => setW({ other: num(e.target.value) })} placeholder="0" style={field} /></label>
            <div style={{ borderRadius: 12, background: "var(--bg-secondary)", padding: 10 }}><p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Total internal cost</p><p style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 800 }}>{inr(internalCost(w))}</p></div>
          </div>
          {err && <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
          <div style={{ marginTop: 12 }}><PrimaryButton onClick={() => { const e = onSave(r.id, st.status, w); setErr(e); setSaved(!e); }}>{saved ? "✓ Saved" : "Save technician repair update"}</PrimaryButton></div>
          <p style={{ ...small, textAlign: "center", marginTop: 6 }}>After “Repaired”, the next steps are testing → verification → return to the customer (Update status → Returned).</p>
        </div>
      </>}
    </div>
  );
}
