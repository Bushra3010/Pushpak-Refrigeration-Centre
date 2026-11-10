"use client";

import { useState } from "react";
import { PinIcon } from "../components/icons";
import { card, field, label, small } from "../components/ui";
import type { Customer, PropertyInfo, ServiceSite } from "../lib/data";
import { AREA_CATEGORIES, CONGESTED_CHECKLIST, FLOORS, PROPERTY_ICON, PROPERTY_TYPES, isCongested } from "../lib/field";

/* Service address for one booking: the saved address, or another one (office, parents' home…). */

export const siteFromProfile = (me: Customer): ServiceSite => ({ ...structuredClone(me.property ?? {}), address: me.address, area: me.area, landmark: "", contactName: me.name, contactPhone: me.phone, gps: me.gps });

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
    onChange(m === "saved" ? { ...saved, landmark: value.landmark, contactName: value.contactName, contactPhone: value.contactPhone } : { address: "", area: "", gps: "", landmark: value.landmark, contactName: value.contactName, contactPhone: value.contactPhone });
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

      <div style={{ height: 1, background: "var(--line)", margin: "16px 0 4px" }} />
      <LocationDetails value={value} onChange={(p) => set(p)} />

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
export function propertyLine(s: PropertyInfo): string {
  const area = s.areaType && s.areaType !== "Standard Area" ? `${s.areaType}${isCongested(s.areaType) && s.congested?.length ? ` (${s.congested.join(", ")})` : ""}` : "";
  return [s.propertyType, [s.building, s.unit].filter(Boolean).join(", "), s.floor, s.lift ? `Lift: ${s.lift}` : "", area].filter(Boolean).join(" · ");
}

/** Sign-up needs the area category and the premises type; everything else is optional. */
export const locationProblem = (p: PropertyInfo) => (!p.areaType || !(AREA_CATEGORIES as readonly string[]).includes(p.areaType) ? "Select the area category." : !p.propertyType ? "Select the property / premises type." : null);

/** Service Location Details — 1. Area category, 2. Property / premises type, 3. Property identification, review. */
export function LocationDetails({ value, onChange, review }: { value: PropertyInfo; onChange: (p: PropertyInfo) => void; review?: boolean }) {
  const [showReview, setShowReview] = useState(false);
  const set = (p: Partial<PropertyInfo>) => onChange({ ...value, ...p });
  const congested = isCongested(value.areaType);
  const head = (t: string) => <p style={{ margin: "14px 0 8px", fontSize: 14.5, fontWeight: 800, color: "var(--ink)" }}>{t}</p>;
  const line = (k: string, v?: string) => v ? <div style={{ display: "flex", gap: 10, padding: "4px 0", fontSize: 13 }}><span style={{ width: 110, flexShrink: 0, color: "var(--ink-soft)" }}>{k}</span><b style={{ minWidth: 0 }}>{v}</b></div> : null;
  return (
    <div>
      {head("1. Area Category *")}
      <div role="radiogroup" aria-label="Area category" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {AREA_CATEGORIES.map((a) => (
          <label key={a} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 2px", fontSize: 14.5, cursor: "pointer" }}>
            <input type="radio" name="area-category" checked={value.areaType === a} onChange={() => set({ areaType: a, congested: isCongested(a) ? value.congested ?? [] : [] })} style={{ width: 19, height: 19, accentColor: "#111" }} /> {a}
          </label>
        ))}
      </div>
      <div style={{ height: 1, background: "var(--line)", margin: "10px 0 0" }} />

      {head("2. Property / Premises Type *")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {PROPERTY_TYPES.map((t) => {
          const on = value.propertyType === t;
          return <button key={t} type="button" onClick={() => set({ propertyType: t })} aria-pressed={on} className="press" style={{ border: on ? "2px solid #111" : "1.5px solid var(--line-strong)", background: on ? "#111" : "#fff", color: on ? "#fff" : "var(--ink)", borderRadius: 12, padding: "11px 10px", fontSize: 12.5, fontWeight: on ? 800 : 600, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 7 }}><span aria-hidden>{PROPERTY_ICON[t]}</span>{t}</button>;
        })}
      </div>
      <div style={{ height: 1, background: "var(--line)", margin: "14px 0 0" }} />

      {head("3. Property Identification")}
      <label style={{ display: "block", marginBottom: 10 }}><span style={label}>Building / Apartment / Complex Name</span>
        <input aria-label="Building name" value={value.building ?? ""} onChange={(e) => set({ building: e.target.value })} placeholder="e.g. ABC Apartments / Jain Complex" style={field} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label><span style={label}>Flat / Shop / Unit No.</span><input aria-label="Unit number" value={value.unit ?? ""} onChange={(e) => set({ unit: e.target.value })} placeholder="e.g. B-204" style={field} /></label>
        <label><span style={label}>Floor</span><select aria-label="Floor" value={value.floor ?? ""} onChange={(e) => set({ floor: e.target.value })} style={field}><option value="">Select</option>{FLOORS.map((f) => <option key={f}>{f}</option>)}</select></label>
      </div>
      <p style={{ ...label, margin: "12px 0 6px" }}>Lift Available?</p>
      <div style={{ display: "flex", gap: 18 }}>
        {(["Yes", "No", "Not Sure"] as const).map((o) => <label key={o} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}><input type="radio" name="lift" checked={value.lift === o} onChange={() => set({ lift: o })} style={{ width: 17, height: 17, accentColor: "#111" }} /> {o}</label>)}
      </div>
      {!congested ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "var(--bg-secondary)" }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: "var(--success-text)" }}>✓ {value.areaType ? `${value.areaType.replace(" Area", "")} Area Selected` : "Standard Area"}</p>
          <p style={{ ...small, margin: "2px 0 0" }}>Congested Area Checklist केवल &quot;Congested Commercial Area&quot; Select करने पर खुलेगी।</p>
        </div>
      ) : (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "var(--gold-tint)" }}>
          <p style={{ margin: "0 0 6px", fontSize: 13.5, fontWeight: 800, color: "var(--gold-dark)" }}>⚠ Congested Area Checklist — tick what applies</p>
          {CONGESTED_CHECKLIST.map((c) => <label key={c} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "4px 0", cursor: "pointer" }}><input type="checkbox" checked={(value.congested ?? []).includes(c)} onChange={(e) => set({ congested: e.target.checked ? [...(value.congested ?? []), c] : (value.congested ?? []).filter((x) => x !== c) })} style={{ width: 16, height: 16, accentColor: "#111" }} /> {c}</label>)}
          <p style={{ ...small, margin: "4px 0 0" }}>The technician plans parking, ladder and extra hands for this visit.</p>
        </div>
      )}
      <label style={{ display: "block", margin: "12px 0 0" }}><span style={label}>Additional Instructions (Optional)</span>
        <textarea aria-label="Additional instructions" rows={2} value={value.instructions ?? ""} onChange={(e) => set({ instructions: e.target.value })} placeholder="Gate number, security, landmark, access instructions" style={{ ...field, resize: "none" }} /></label>

      {review && (
        <>
          <button type="button" onClick={() => setShowReview((v) => !v)} className="press" style={{ width: "100%", marginTop: 12, border: "1.5px solid var(--line-strong)", background: "#f4f4f4", borderRadius: 999, padding: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", color: "var(--ink)" }}>📋 {showReview ? "Hide" : "Review"} Location Details</button>
          {showReview && (
            <div style={{ ...card, marginTop: 10, padding: 12 }}>
              {locationProblem(value) && <p role="alert" style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 700, color: "var(--error-text)" }}>{locationProblem(value)}</p>}
              {line("Area category", value.areaType)}
              {line("Premises", value.propertyType)}
              {line("Building", value.building)}
              {line("Unit / floor", [value.unit, value.floor].filter(Boolean).join(" · "))}
              {line("Lift", value.lift)}
              {congested && line("Checklist", (value.congested ?? []).join(", ") || "Nothing ticked")}
              {line("Instructions", value.instructions)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
