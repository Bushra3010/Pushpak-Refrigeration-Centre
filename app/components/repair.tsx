"use client";

import { useState } from "react";
import { Chips, Pill, PrimaryButton, Toggle, card, field, label, small, type Tone } from "./ui";
import { fmtDate, fmtDateTime, inr, isoDay, type Db } from "../lib/data";
import {
  AC_CAPACITIES, AC_TECH, EMPTY_COIL, EMPTY_PCB, EMPTY_STAB, OUTSOURCE_ITEMS, PCB_ACCESSORIES, PCB_TYPES, REPAIR_ITEM_TYPES, REPAIR_MODES, REPAIR_STATUSES, STAB_BOOST, STAB_KVA,
  accessoriesText, daysHeld, isDelayed, repairItemLabel, validateRepair,
  type PcbAccessory, type RepairDraft, type RepairEntry, type RepairItemType, type RepairMode, type RepairStatus,
} from "../lib/repair";

/* Repair register pieces shared by the technician app and the admin panel: the entry form, the
 * card, the status sheet and the WhatsApp text. */

export const STATUS_TONE: Record<RepairStatus, Tone> = { Received: "blue", "Repair Work in Progress": "amber", Pending: "red", Repaired: "green", Returned: "grey" };

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

  const setItem = (itemType: RepairItemType) => set({
    itemType,
    pcb: itemType === "PCB Board" ? (d.pcb ?? structuredClone(EMPTY_PCB)) : undefined,
    stabilizer: itemType === "Stabilizer" ? (d.stabilizer ?? structuredClone(EMPTY_STAB)) : undefined,
    coil: itemType === "Indoor Coil" ? (d.coil ?? structuredClone(EMPTY_COIL)) : undefined,
    mode: itemType === "Stabilizer" ? "In-house" : d.mode,
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
        <span style={label}>Item type</span>
        <Chips options={REPAIR_ITEM_TYPES} value={d.itemType} onChange={setItem} />
        <div style={{ height: 12 }} />
        <span style={label}>Repair</span>
        <Chips options={d.itemType === "Stabilizer" ? (["In-house"] as const) : REPAIR_MODES} value={d.mode} onChange={setMode} />
        {d.mode === "Out Source" && <p style={{ ...small, marginTop: 6 }}>Out Source is used for {OUTSOURCE_ITEMS.join(" and ")} repair at an outside vendor.</p>}
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
        <Txt l="Brand name" value={d.brand} onChange={(x) => set({ brand: x })} placeholder="LG / Daikin / V-Guard…" required />
      </div>

      {d.itemType === "PCB Board" && (
        <div style={{ ...card, padding: 14, marginBottom: 12 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14 }}>PCB Board details</p>
          <Txt l="AC type" value={pcb.acType} onChange={(x) => set({ pcb: { ...pcb, acType: x } })} placeholder="Split AC / Window AC / Cassette" />
          <Radio l="AC capacity" value={pcb.capacity} onChange={(x) => set({ pcb: { ...pcb, capacity: x } })} options={AC_CAPACITIES} />
          <Radio l="Technology" value={pcb.tech} onChange={(x) => set({ pcb: { ...pcb, tech: x } })} options={AC_TECH} />
          <Radio l="PCB type" value={pcb.pcbType} onChange={(x) => set({ pcb: { ...pcb, pcbType: x } })} options={PCB_TYPES} />
          <span style={label}>Accessories received with the PCB</span>
          {(Object.keys(PCB_ACCESSORIES) as PcbAccessory[]).map((k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
              <span>With {PCB_ACCESSORIES[k]}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: pcb.accessories[k] ? "var(--success-text)" : "var(--ink-mute)" }}>
                {pcb.accessories[k] ? "Yes" : "No"}<Toggle on={pcb.accessories[k]} onChange={(b) => set({ pcb: { ...pcb, accessories: { ...pcb.accessories, [k]: b } } })} label={`With ${PCB_ACCESSORIES[k]}`} />
              </span>
            </div>
          ))}
        </div>
      )}
      {d.itemType === "Stabilizer" && (
        <div style={{ ...card, padding: 14, marginBottom: 12 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14 }}>Stabilizer details</p>
          <Radio l="Capacity (KVA)" value={stab.kva} onChange={(x) => set({ stabilizer: { ...stab, kva: x } })} options={STAB_KVA} />
          <Radio l="Boost type" value={stab.boost} onChange={(x) => set({ stabilizer: { ...stab, boost: x } })} options={STAB_BOOST} />
        </div>
      )}
      {d.itemType === "Indoor Coil" && (
        <div style={{ ...card, padding: 14, marginBottom: 12 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14 }}>Indoor coil details (Split AC)</p>
          <Txt l="AC type" value={coil.acType} onChange={(x) => set({ coil: { ...coil, acType: x } })} />
          <Radio l="AC capacity" value={coil.capacity} onChange={(x) => set({ coil: { ...coil, capacity: x } })} options={AC_CAPACITIES} />
          <Radio l="Technology" value={coil.tech} onChange={(x) => set({ coil: { ...coil, tech: x } })} options={AC_TECH} />
        </div>
      )}

      <div style={{ ...card, padding: 14, marginBottom: 12 }}>
        <Txt l={`${d.itemType} problem / issue`} value={d.issue} onChange={(x) => set({ issue: x })} placeholder="Describe the complaint" required multiline />
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
        {r.photos[0] ? <img src={r.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : r.itemType === "PCB Board" ? "🔌" : r.itemType === "Stabilizer" ? "🔋" : "🌀"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{r.id} · {r.itemType}</span>
          <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill>
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repairItemLabel(r)}</p>
        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ink-mute)" }}>{r.customerName} · {fmtDate(r.receivedDate)} · {daysHeld(r, t)} day{daysHeld(r, t) === 1 ? "" : "s"} · {r.mode}{late ? " · ⚠ delayed" : ""}</p>
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
      {row("Status", <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill>)}
      {row("Received", `${fmtDate(r.receivedDate)} · ${daysHeld(r, isoDay(0))} days ago`)}
      {row("Return date", r.returnDate ? fmtDate(r.returnDate) : "—")}
      {row("Customer", `${r.customerName} · ${r.customerPhone}`)}
      {row("Brought by", r.techName)}
      {row("Entered by", `${r.enteredBy} (${r.enteredAs})`)}
      {row("Item", `${r.itemType} · ${r.brand}`)}
      {r.pcb && <>{row("AC", `${r.pcb.acType} · ${r.pcb.capacity} · ${r.pcb.tech}`)}{row("PCB type", r.pcb.pcbType)}{row("Accessories", accessoriesText(r.pcb))}</>}
      {r.stabilizer && row("Stabilizer", `${r.stabilizer.kva} · ${r.stabilizer.boost}`)}
      {r.coil && row("Coil", `${r.coil.acType} · ${r.coil.capacity} · ${r.coil.tech}`)}
      {row("Problem", r.issue)}
      {row("Repair", r.mode)}
      {r.vendor && <>{row("Vendor", `${r.vendor.name}${r.vendor.phone ? ` · ${r.vendor.phone}` : ""}`)}{row("Sent / expected", `${fmtDate(r.vendor.sentDate)} → ${fmtDate(r.vendor.expectedDate)}`)}{row("Vendor charge", r.vendor.charge == null ? "—" : inr(r.vendor.charge))}</>}
      {row("Customer charge", r.charge == null ? "—" : inr(r.charge))}
      {r.pendingReason && row("Pending reason", r.pendingReason)}
      {r.delayReason && row("Delay / late reason", r.delayReason)}
      <p style={{ ...label, margin: "14px 0 4px", fontSize: 12.5 }}>Timeline</p>
      {r.timeline.map((e, i) => <p key={i} style={{ ...small, margin: "0 0 4px" }}><b>{e.status}</b> · {fmtDateTime(e.at)} · {e.by}{e.note ? ` — ${e.note}` : ""}</p>)}
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
      <Chips options={REPAIR_STATUSES} value={status} onChange={setStatus} />
      <div style={{ height: 12 }} />
      {status === "Pending" && <Txt l="Pending reason" value={pendingReason} onChange={setPendingReason} placeholder="Why is the repair pending?" required multiline />}
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
    `Status: ${r.status}${r.pendingReason ? ` — ${r.pendingReason}` : ""}`,
    ...(r.charge != null ? [`Charge: ${inr(r.charge)}`] : []),
  ].join("\n");
}
