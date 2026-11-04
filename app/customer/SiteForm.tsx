"use client";

import { useState } from "react";
import { PinIcon } from "../components/icons";
import { card, field, label, small } from "../components/ui";
import type { Customer, ServiceSite } from "../lib/data";
import { AREA_TYPES, CONGESTED_CHECKLIST, FLOORS, PROPERTY_TYPES } from "../lib/field";

/* Service address for one booking: the saved address, or another one (office, parents' home…). */

export const siteFromProfile = (me: Customer): ServiceSite => ({ address: me.address, area: me.area, landmark: "", contactName: me.name, contactPhone: me.phone, gps: me.gps });

export function SiteForm({ me, value, onChange, saveDefault, onSaveDefault }: {
  me: Customer; value: ServiceSite; onChange: (s: ServiceSite) => void; saveDefault?: boolean; onSaveDefault?: (b: boolean) => void;
}) {
  const saved = siteFromProfile(me);
  const [mode, setMode] = useState<"saved" | "other">(value.address === me.address && value.area === me.area ? "saved" : "other");
  const [locating, setLocating] = useState(false);
  const [gpsMsg, setGpsMsg] = useState("");
  const set = (p: Partial<ServiceSite>) => onChange({ ...value, ...p });
  const pick = (m: "saved" | "other") => {
    setMode(m);
    onChange(m === "saved" ? { ...saved, landmark: value.landmark, contactName: value.contactName, contactPhone: value.contactPhone } : { ...value, address: "", area: "", gps: "" });
  };
  const locate = () => {
    if (!("geolocation" in navigator)) { setGpsMsg("Location is not available on this device."); return; }
    setLocating(true); setGpsMsg("");
    navigator.geolocation.getCurrentPosition(
      (p) => { set({ gps: `${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}` }); setLocating(false); setGpsMsg("✓ Location pinned — the technician can navigate straight here."); },
      () => { setLocating(false); setGpsMsg("Could not get your location. You can still type the address."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const radio = (m: "saved" | "other", title: string, sub: string) => (
    <button type="button" onClick={() => pick(m)} aria-pressed={mode === m} className="press" style={{ ...card, width: "100%", textAlign: "left", padding: 12, cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", border: mode === m ? "2px solid #111" : "2px solid var(--line)", boxShadow: "none" }}>
      <span aria-hidden style={{ width: 18, height: 18, borderRadius: 9, border: "2px solid #111", marginTop: 2, flexShrink: 0, display: "grid", placeItems: "center" }}>{mode === m && <span style={{ width: 8, height: 8, borderRadius: 4, background: "#111" }} />}</span>
      <span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{title}</span><span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.45 }}>{sub}</span></span>
    </button>
  );

  return (
    <div>
      <span style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}><PinIcon s={16} c="var(--ink)" /> Service address</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {radio("saved", "My saved address", `${me.address}${me.area ? ` · ${me.area}` : ""}`)}
        {radio("other", "Different address", "Office, shop, relative's home…")}
      </div>

      {mode === "other" && (
        <div style={{ marginTop: 10 }}>
          <label style={{ display: "block", marginBottom: 10 }}><span style={label}>Full address <span style={{ color: "var(--red)" }}>*</span></span>
            <textarea aria-label="Full address" rows={2} value={value.address} onChange={(e) => set({ address: e.target.value })} placeholder="House / flat no., building, street, city, PIN" style={{ ...field, resize: "none" }} /></label>
          <label style={{ display: "block", marginBottom: 10 }}><span style={label}>Area / locality <span style={{ color: "var(--red)" }}>*</span></span>
            <input aria-label="Area" value={value.area} onChange={(e) => set({ area: e.target.value })} placeholder="e.g. Dwarka Sector 7" style={field} /></label>
        </div>
      )}

      <label style={{ display: "block", margin: "10px 0" }}><span style={label}>Landmark</span>
        <input aria-label="Landmark" value={value.landmark} onChange={(e) => set({ landmark: e.target.value })} placeholder="Near metro station, opposite park…" style={field} /></label>

      <button type="button" onClick={locate} disabled={locating} className="press" style={{ width: "100%", border: "1.5px solid var(--line-strong)", background: "var(--surface)", borderRadius: 10, padding: 11, fontWeight: 700, fontSize: 13.5, cursor: "pointer", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <PinIcon s={16} c="var(--ink)" /> {locating ? "Finding your location…" : value.gps && mode === "other" ? "Update current location" : "Use my current location"}
      </button>
      {gpsMsg && <p style={{ ...small, marginTop: 6 }}>{gpsMsg}</p>}

      {/* Property identification */}
      <p style={{ ...label, margin: "16px 0 6px" }}>Property type</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {PROPERTY_TYPES.map((t) => (
          <button key={t} type="button" onClick={() => set({ propertyType: t })} aria-pressed={value.propertyType === t} style={{ border: value.propertyType === t ? "1.5px solid #111" : "1.5px solid var(--line-strong)", background: value.propertyType === t ? "#111" : "#fff", color: value.propertyType === t ? "#fff" : "var(--ink)", borderRadius: 10, padding: "9px 8px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>📍 {t}</button>
        ))}
      </div>
      <label style={{ display: "block", margin: "10px 0" }}><span style={label}>Building / apartment / complex name</span>
        <input aria-label="Building name" value={value.building ?? ""} onChange={(e) => set({ building: e.target.value })} placeholder="e.g. ABC Apartments / Jain Complex" style={field} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label><span style={label}>Flat / shop / unit no.</span><input aria-label="Unit number" value={value.unit ?? ""} onChange={(e) => set({ unit: e.target.value })} placeholder="e.g. B-204" style={field} /></label>
        <label><span style={label}>Floor</span><select aria-label="Floor" value={value.floor ?? ""} onChange={(e) => set({ floor: e.target.value })} style={field}><option value="">Select</option>{FLOORS.map((f) => <option key={f}>{f}</option>)}</select></label>
      </div>
      <p style={{ ...label, margin: "12px 0 6px" }}>Lift available?</p>
      <div style={{ display: "flex", gap: 18 }}>
        {(["Yes", "No", "Not Sure"] as const).map((o) => <label key={o} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}><input type="radio" name="lift" checked={value.lift === o} onChange={() => set({ lift: o })} style={{ width: 17, height: 17, accentColor: "#111" }} /> {o}</label>)}
      </div>
      <p style={{ ...label, margin: "12px 0 6px" }}>Area type</p>
      <div style={{ display: "flex", gap: 8 }}>
        {AREA_TYPES.map((a) => <button key={a} type="button" onClick={() => set({ areaType: a, congested: a === "Congested Area" ? value.congested ?? [] : [] })} aria-pressed={(value.areaType ?? "Standard Area") === a} style={{ flex: 1, border: (value.areaType ?? "Standard Area") === a ? "1.5px solid #111" : "1.5px solid var(--line-strong)", background: (value.areaType ?? "Standard Area") === a ? "#111" : "#fff", color: (value.areaType ?? "Standard Area") === a ? "#fff" : "var(--ink)", borderRadius: 10, padding: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{a}</button>)}
      </div>
      {(value.areaType ?? "Standard Area") === "Standard Area"
        ? <p style={{ ...small, marginTop: 6 }}>✓ Standard area selected. The congested-area checklist opens only for Congested Area.</p>
        : (
          <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: "var(--gold-tint)" }}>
            <p style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 700, color: "var(--gold-dark)" }}>Tick what applies — the technician plans for it</p>
            {CONGESTED_CHECKLIST.map((c) => <label key={c} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "3px 0", cursor: "pointer" }}><input type="checkbox" checked={(value.congested ?? []).includes(c)} onChange={(e) => set({ congested: e.target.checked ? [...(value.congested ?? []), c] : (value.congested ?? []).filter((x) => x !== c) })} style={{ width: 16, height: 16, accentColor: "#111" }} /> {c}</label>)}
          </div>
        )}
      <label style={{ display: "block", margin: "12px 0 0" }}><span style={label}>Additional instructions (optional)</span>
        <textarea aria-label="Additional instructions" rows={2} value={value.instructions ?? ""} onChange={(e) => set({ instructions: e.target.value })} placeholder="Gate number, security, landmark, access instructions" style={{ ...field, resize: "none" }} /></label>

      <p style={{ ...label, margin: "14px 0 6px" }}>Contact person at the address</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input aria-label="Contact name" value={value.contactName} onChange={(e) => set({ contactName: e.target.value })} placeholder="Name" style={field} />
        <input aria-label="Contact mobile" inputMode="tel" value={value.contactPhone} onChange={(e) => set({ contactPhone: e.target.value.replace(/[^\d+ ]/g, "") })} placeholder="10-digit mobile" style={field} />
      </div>
      <p style={{ ...small, fontSize: 11.5 }}>The technician will call this number before reaching.</p>

      {mode === "other" && onSaveDefault && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={!!saveDefault} onChange={(e) => onSaveDefault(e.target.checked)} style={{ width: 17, height: 17, accentColor: "#111" }} /> Save as my default address
        </label>
      )}
    </div>
  );
}

/** Read-only address card for the booking page / lists. */
export function SiteCard({ site, onChange }: { site: ServiceSite; onChange?: () => void }) {
  return (
    <div style={{ ...card, padding: 14, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><PinIcon s={16} c="var(--ink)" /> Service address</span>
        {onChange && <button type="button" onClick={onChange} style={{ background: "none", border: "none", color: "var(--ink)", fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0 }}>Change</button>}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.55 }}>{site.address}{site.area ? <><br /><b>{site.area}</b></> : null}</p>
      {site.landmark && <p style={{ ...small, marginTop: 2 }}>Landmark: {site.landmark}</p>}
      {propertyLine(site) && <p style={{ ...small, marginTop: 2 }}>{propertyLine(site)}</p>}
      {site.instructions && <p style={{ ...small, marginTop: 2 }}>Note: {site.instructions}</p>}
      <p style={{ ...small, marginTop: 4 }}>Contact: {site.contactName} · +91 {site.contactPhone}</p>
      {site.gps && <a href={`https://www.google.com/maps?q=${site.gps}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>View on map ↗</a>}
    </div>
  );
}

/** "Flat / Apartment · ABC Apartments, B-204 · 3rd Floor · Lift: No · Congested (No parking nearby)". */
export function propertyLine(s: ServiceSite): string {
  return [s.propertyType, [s.building, s.unit].filter(Boolean).join(", "), s.floor, s.lift ? `Lift: ${s.lift}` : "", s.areaType === "Congested Area" ? `Congested${s.congested?.length ? ` (${s.congested.join(", ")})` : ""}` : ""].filter(Boolean).join(" · ");
}
