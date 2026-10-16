"use client";

import { useMemo, useState } from "react";
import { Chips, Footer, PageHeader, PrimaryButton, card, field, label, sectionTitle, small } from "../components/ui";
import { formatNum } from "../lib/calc/money";
import { CITY_CLIMATE, estimateTonnage, type TonnageInput } from "../lib/calc/tonnage";
import type { Customer, Db } from "../lib/data";
import { sizingEnquiry } from "../lib/store";

/* "Which AC size do I need?" — customer-friendly front end for the tonnage estimator.
 * Uses the same documented, editable coefficients as the admin calculator. */

const CLIMATES: [string, string][] = [["moderate", "Moderate"], ["warm_humid", "Humid / coastal"], ["hot_dry", "Hot & dry (Delhi, NCR)"], ["extreme_hot", "Extreme heat"]];
const APPLIANCES: [string, number][] = [["TV", 150], ["Fridge", 200], ["Computer", 250], ["Lights", 100], ["Cooking / oven", 1500]];
const WINDOW_SQFT = 15; // one typical window

export function SizingPage({ db, me, onBack, onBook, flash }: { db: Db; me: Customer; onBack: () => void; onBook: () => void; flash: (m: string) => void }) {
  const [room, setRoom] = useState("Bedroom");
  const [len, setLen] = useState("12");
  const [wid, setWid] = useState("10");
  const [ceil, setCeil] = useState("10");
  const [city, setCity] = useState("Delhi / NCR");
  const [otherClimate, setOtherClimate] = useState("hot_dry");
  const climate = CITY_CLIMATE.find(([n]) => n === city)?.[1] ?? otherClimate;
  const [people, setPeople] = useState(2);
  const [sun, setSun] = useState<TonnageInput["sunlight"]>("normal");
  const [top, setTop] = useState(false);
  const [windows, setWindows] = useState(1);
  const [apps, setApps] = useState<string[]>(["Lights", "TV"]);
  const [sent, setSent] = useState(false);
  const watts = APPLIANCES.filter(([n]) => apps.includes(n)).reduce((a, [, w]) => a + w, 0);
  const input: TonnageInput = {
    lengthValue: Number(len), widthValue: Number(wid), dimensionUnit: "ft", ceilingValue: Number(ceil), climate, occupants: people, sunlight: sun,
    roof: top ? "top_floor_roof_exposed" : "intermediate_floor", insulation: "average", windowAreaSqft: windows * WINDOW_SQFT, applianceWatts: watts, isKitchen: room === "Kitchen",
  };
  const res = useMemo(() => { try { return { r: estimateTonnage(input, db.fin.tonnage) }; } catch (e) { return { e: (e as Error).message }; } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [len, wid, ceil, climate, people, sun, top, windows, watts, room, db.fin.tonnage]);
  const title = res.r ? `${room} ${len}×${wid} ft, ${city === "Other" ? "other city" : city} → ${res.r.recommendedTons ?? "—"} TR` : room;
  const send = (quote: boolean) => {
    if (!res.r) return;
    sizingEnquiry(me.id, title, { input, coefficients: db.fin.tonnage }, res.r, quote, me.name);
    setSent(true);
    flash(quote ? "Request sent — we'll call you for a site visit" : "Estimate saved");
  };
  const step = (v: number, set: (n: number) => void, min = 0) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={() => set(Math.max(min, v - 1))} aria-label="Less" style={stepBtn}>−</button>
      <b style={{ minWidth: 22, textAlign: "center", fontSize: 16 }}>{v}</b>
      <button onClick={() => set(v + 1)} aria-label="More" style={stepBtn}>+</button>
    </div>
  );

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Which AC size do I need?" sub="Quick estimate in a minute" onBack={onBack} />
      <div style={{ padding: "0 16px 16px", flex: 1 }}>
        <div style={{ ...card, padding: 14 }}>
          <label style={label}>Room</label>
          <Chips options={["Bedroom", "Hall", "Office", "Shop", "Kitchen"]} value={room} onChange={setRoom} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
            <div><label style={label}>Length (ft)</label><input inputMode="decimal" value={len} onChange={(e) => setLen(e.target.value)} style={field} /></div>
            <div><label style={label}>Width (ft)</label><input inputMode="decimal" value={wid} onChange={(e) => setWid(e.target.value)} style={field} /></div>
            <div><label style={label}>Ceiling (ft)</label><input inputMode="decimal" value={ceil} onChange={(e) => setCeil(e.target.value)} style={field} /></div>
          </div>
          <label style={{ ...label, marginTop: 12 }}>City</label>
          <select value={city} onChange={(e) => setCity(e.target.value)} style={field}>{CITY_CLIMATE.map(([n]) => <option key={n}>{n}</option>)}<option value="Other">Other city</option></select>
          {city === "Other" && (<>
            <label style={{ ...label, marginTop: 12 }}>Summer weather where you live</label>
            <select value={otherClimate} onChange={(e) => setOtherClimate(e.target.value)} style={field}>{CLIMATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </>)}
          <label style={{ ...label, marginTop: 12 }}>Afternoon sunlight</label>
          <Chips options={["Shaded", "Normal", "Heavy sun"]} value={sun === "shaded" ? "Shaded" : sun === "heavy" ? "Heavy sun" : "Normal"} onChange={(v) => setSun(v === "Shaded" ? "shaded" : v === "Heavy sun" ? "heavy" : "normal")} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}><span style={label}>People usually in the room</span>{step(people, setPeople, 1)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}><span style={label}>Windows</span>{step(windows, setWindows)}</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13.5 }}><input type="checkbox" checked={top} onChange={(e) => setTop(e.target.checked)} /> Top floor (roof gets direct sun)</label>
          <label style={{ ...label, marginTop: 12 }}>Appliances in the room</label>
          <Chips multi options={APPLIANCES.map(([n]) => n)} value={apps} onChange={(o) => setApps(apps.includes(o) ? apps.filter((x) => x !== o) : [...apps, o])} />
        </div>

        <h3 style={sectionTitle}>Your estimate</h3>
        {res.e && <p style={{ ...small, color: "var(--error-text)" }}>{res.e}</p>}
        {res.r && (
          <div style={{ ...card, padding: 16, background: "linear-gradient(150deg,var(--blue-dark),var(--blue))", color: "white" }}>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>Recommended AC size</p>
            <p style={{ margin: "2px 0", fontSize: 30, fontWeight: 800 }}>{res.r.recommendedTons != null ? `${res.r.recommendedTons} Ton` : "Needs a site visit"}</p>
            <p style={{ margin: 0, fontSize: 12.5, opacity: 0.85 }}>Cooling load ≈ {formatNum(res.r.totalBtuh, 0)} BTU/h ({formatNum(res.r.tons, 2)} TR) · room {formatNum(res.r.floorAreaSqft, 0)} sq ft</p>
          </div>
        )}
        {res.r && (
          <div style={{ ...card, padding: 14, marginTop: 10 }}>
            {res.r.steps.filter((s) => s.btuh > 0).map((s) => <p key={s.label} style={{ ...small, margin: "0 0 4px", display: "flex", justifyContent: "space-between" }}><span>{s.label}</span><b>{formatNum(s.btuh, 0)} BTU/h</b></p>)}
            <p style={{ ...small, marginTop: 8 }}>We add a {db.fin.tonnage.safetyMarginPct}% safety allowance and pick the next standard size. 1 ton = 12,000 BTU/h.</p>
            <p style={{ ...small, marginTop: 8, padding: 10, borderRadius: 10, background: "var(--gold-tint)", color: "var(--gold-dark)" }}>{res.r.disclaimer}</p>
          </div>
        )}
        {sent && <p style={{ ...small, marginTop: 10, color: "var(--success-text)", fontWeight: 600 }}>✓ Saved to your account. For an existing AC you can also book a service.</p>}
      </div>
      <Footer>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => send(false)} disabled={!res.r} style={{ flex: 1, border: "1.5px solid var(--line-strong)", background: "var(--surface)", borderRadius: 14, padding: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Save</button>
          <div style={{ flex: 2 }}><PrimaryButton disabled={!res.r || sent} onClick={() => send(true)}>Get installation quote</PrimaryButton></div>
        </div>
        <button onClick={onBook} style={{ marginTop: 8, width: "100%", background: "none", border: "none", color: "var(--blue)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Book a service for an existing AC instead</button>
      </Footer>
    </div>
  );
}

const stepBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 10, border: "1.5px solid var(--line-strong)", background: "var(--surface)", fontSize: 18, fontWeight: 700, cursor: "pointer" };
