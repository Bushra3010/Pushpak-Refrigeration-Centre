"use client";

import { useMemo, useState } from "react";
import { Chips, Dropdown, MultiDropdown, PrimaryButton, PageHeader, card, field, label, sectionTitle, small } from "../components/ui";
import { formatNum } from "../lib/calc/money";
import { CITY_CLIMATE, estimateTonnage, type TonnageInput } from "../lib/calc/tonnage";
import type { Customer, Db } from "../lib/data";
import { requestAcQuote, sizingEnquiry } from "../lib/store";

/* Customer new-AC journey: "Find My AC Size" (tonnage estimate) → "Get Best AC Quote" form right under the
 * result → "AC Installation Accessories". Uses the same documented, editable coefficients as the admin
 * calculator. */

const CLIMATES: [string, string][] = [["moderate", "Moderate"], ["warm_humid", "Humid / coastal"], ["hot_dry", "Hot & dry (Delhi, NCR)"], ["extreme_hot", "Extreme heat"]];
/** Typical heat given off while running, in watts. */
const APPLIANCES: [name: string, watts: number][] = [["Refrigerator", 200], ["Bulb / tube light (LED)", 20], ["Ceiling fan", 60], ["TV", 150], ["Computer", 250]];
const FLOORS: [string, TonnageInput["roof"]][] = [["Ground floor", "intermediate_floor"], ["Middle floor", "intermediate_floor"], ["Top floor (roof above)", "top_floor_roof_exposed"], ["Independent house (single storey)", "single_storey_roof_exposed"]];
/** Afternoon sun through the glass: west/south-facing windows get the most in India, north the least. */
const DIRECTIONS: [string, TonnageInput["sunlight"]][] = [
  ["North", "shaded"], ["North-East", "shaded"], ["East", "normal"], ["South-East", "normal"],
  ["South", "heavy"], ["South-West", "heavy"], ["West", "heavy"], ["North-West", "normal"],
];

const AC_TYPES = ["Split AC", "Window AC", "Cassette AC", "Tower AC", "Ductable AC", "Portable AC"] as const;
const BRANDS = ["Any brand", "Daikin", "Voltas", "LG", "Samsung", "Blue Star", "Hitachi", "Panasonic", "Lloyd", "Carrier", "Godrej", "Haier", "O General", "Mitsubishi Electric"] as const;
const STARS = ["3 Star", "4 Star", "5 Star", "No preference"] as const;
const INVERTER = ["Inverter", "Non-inverter", "No preference"] as const;
const PRICE = ["With installation", "Only unit price"] as const;
const TIMELINE = ["Immediate", "Within 10–15 days", "Just exploring"] as const;
const HELP_ME = "Help me choose";

export function SizingPage({ db, me, onBack, onBook, onAccessories, flash }: { db: Db; me: Customer; onBack: () => void; onBook: () => void; onAccessories: () => void; flash: (m: string) => void }) {
  /* ── room ── */
  const [room, setRoom] = useState("Bedroom");
  const [len, setLen] = useState("12");
  const [wid, setWid] = useState("10");
  const [ceil, setCeil] = useState("10");
  const [people, setPeople] = useState("2");
  const [city, setCity] = useState("Delhi / NCR");
  const [otherClimate, setOtherClimate] = useState("hot_dry");
  const climate = CITY_CLIMATE.find(([n]) => n === city)?.[1] ?? otherClimate;
  const [floor, setFloor] = useState(FLOORS[1][0]);
  const [winL, setWinL] = useState("4");
  const [winB, setWinB] = useState("3");
  const [dir, setDir] = useState("East");
  const [counts, setCounts] = useState<Record<string, string>>({ Refrigerator: "0", "Bulb / tube light (LED)": "2", "Ceiling fan": "1", TV: "1", Computer: "0" });
  const n = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const watts = APPLIANCES.reduce((a, [name, w]) => a + n(counts[name] ?? "") * w, 0);
  const winArea = n(winL) * n(winB);

  const input: TonnageInput = {
    lengthValue: Number(len), widthValue: Number(wid), dimensionUnit: "ft", ceilingValue: Number(ceil), climate, occupants: Number(people),
    sunlight: DIRECTIONS.find(([d]) => d === dir)?.[1] ?? "normal", roof: FLOORS.find(([f]) => f === floor)?.[1] ?? "intermediate_floor",
    insulation: "average", windowAreaSqft: winArea, applianceWatts: watts, isKitchen: room === "Kitchen",
  };
  const res = useMemo(() => {
    try {
      if (!(Number(people) >= 1) || !Number.isInteger(Number(people))) throw new Error("Enter how many people usually use the room.");
      if (![winL, winB, ...Object.values(counts)].every((s) => n(s) >= 0)) throw new Error("Window size and appliance counts can't be negative.");
      return { r: estimateTonnage(input, db.fin.tonnage) };
    } catch (e) { return { e: (e as Error).message }; }
  },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [len, wid, ceil, climate, people, dir, floor, winArea, watts, room, db.fin.tonnage]);
  const place = city === "Other" ? "other city" : city;
  const sizing = res.r ? `${room} ${len}×${wid}×${ceil} ft, ${place}, ${floor.toLowerCase()} → ${res.r.recommendedTons ?? "site visit"}${res.r.recommendedTons != null ? " TR" : ""}` : "";

  /* ── quote ── */
  const [acType, setAcType] = useState<string>(AC_TYPES[0]);
  const [brands, setBrands] = useState<string[]>(["Any brand"]);
  const [cap, setCap] = useState<string | null>(null); // null = follow the estimate
  const [stars, setStars] = useState<string>("5 Star");
  const [inv, setInv] = useState<string>("Inverter");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState<string>(PRICE[0]);
  const [timeline, setTimeline] = useState<string>("");
  const [name, setName] = useState(me.name);
  const [phone, setPhone] = useState(me.phone);
  const [address, setAddress] = useState([me.address, me.area].filter(Boolean).join(", "));
  const [notes, setNotes] = useState("");
  const [sentId, setSentId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const capOptions = [...db.fin.tonnage.availableTons.map((t) => `${t} Ton`), HELP_ME];
  const recommended = res.r?.recommendedTons != null ? `${res.r.recommendedTons} Ton` : HELP_ME;
  const capPicked = cap ?? recommended;
  const toggleBrand = (b: string) => {
    if (b === "Any brand") return setBrands(["Any brand"]);
    const rest = brands.filter((x) => x !== "Any brand");
    const next = rest.includes(b) ? rest.filter((x) => x !== b) : [...rest, b];
    setBrands(next.length ? next : ["Any brand"]);
  };

  const submit = () => {
    const ph = phone.replace(/\D/g, "").slice(-10);
    const problem = !name.trim() ? "Enter your name." : ph.length !== 10 ? "Enter a 10-digit mobile number." : !address.trim() ? "Enter your address or area." : !timeline ? "When do you need the AC?" : "";
    setErr(problem);
    if (problem) return;
    if (res.r) sizingEnquiry(me.id, sizing, { input, coefficients: db.fin.tonnage }, res.r, false, me.name);
    const id = requestAcQuote({
      customerId: me.id, acType, brands, capacityTons: capPicked === HELP_ME ? null : parseFloat(capPicked), recommendedTons: res.r?.recommendedTons ?? null,
      starRating: stars, inverter: inv, quantity: qty, withInstallation: price === PRICE[0], timeline,
      contact: { name: name.trim(), phone: ph, address: address.trim() }, notes: notes.trim(), sizing,
    }, me.name);
    setSentId(id);
    flash("Quote request sent — we'll call you with the best prices");
  };

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Find My AC Size" sub="Tonnage calculator · free estimate" onBack={onBack} />
      <div style={{ padding: "0 16px 24px", flex: 1 }}>
        <div style={{ ...card, padding: 14 }}>
          <span style={label}>Room</span>
          <Chips options={["Bedroom", "Hall", "Office", "Shop", "Kitchen"]} value={room} onChange={setRoom} />

          <span style={{ ...label, marginTop: 14 }}>Room size (ft)</span>
          <div style={grid3}>
            <Num l="Length" v={len} set={setLen} /><Num l="Breadth" v={wid} set={setWid} /><Num l="Height" v={ceil} set={setCeil} />
          </div>

          <div style={{ ...grid2, marginTop: 12 }}>
            <Num l="No. of people" v={people} set={setPeople} />
            <label><span style={label}>City</span>
              <select aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} style={field}>{CITY_CLIMATE.map(([c]) => <option key={c}>{c}</option>)}<option value="Other">Other city</option></select>
            </label>
          </div>
          {city === "Other" && (
            <label style={{ display: "block", marginTop: 12 }}><span style={label}>Summer weather where you live</span>
              <select aria-label="Summer weather" value={otherClimate} onChange={(e) => setOtherClimate(e.target.value)} style={field}>{CLIMATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
          )}

          <label style={{ display: "block", marginTop: 12 }}><span style={label}>Floor level</span>
            <select aria-label="Floor level" value={floor} onChange={(e) => setFloor(e.target.value)} style={field}>{FLOORS.map(([f]) => <option key={f}>{f}</option>)}</select>
          </label>

          <span style={{ ...label, marginTop: 14 }}>Glass window area (ft) <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}>· all windows together, 0 if none</span></span>
          <div style={grid2}><Num l="Length" v={winL} set={setWinL} /><Num l="Breadth" v={winB} set={setWinB} /></div>

          <label style={{ display: "block", marginTop: 12 }}><span style={label}>Window direction</span>
            <select aria-label="Window direction" value={dir} onChange={(e) => setDir(e.target.value)} style={field}>{DIRECTIONS.map(([d]) => <option key={d}>{d}</option>)}</select>
          </label>
          <p style={{ ...small, fontSize: 11.5 }}>Not sure? The side where the evening sun comes in is West.</p>

          <span style={{ ...label, marginTop: 14 }}>No. of appliances in the room</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 8 }}>
            {APPLIANCES.map(([a]) => <Num key={a} l={a} v={counts[a] ?? ""} set={(x) => setCounts({ ...counts, [a]: x })} />)}
          </div>
        </div>

        <h3 style={sectionTitle}>Your AC size</h3>
        {res.e && <p role="alert" style={{ ...small, color: "var(--error-text)" }}>{res.e}</p>}
        {res.r && (
          <div style={{ ...card, padding: 16, background: "linear-gradient(150deg,var(--blue-dark),var(--blue))", color: "white" }}>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>Recommended AC size</p>
            <p style={{ margin: "2px 0", fontSize: 30, fontWeight: 800 }}>{res.r.recommendedTons != null ? `${res.r.recommendedTons} Ton` : "Needs a site visit"}</p>
            <p style={{ margin: 0, fontSize: 12.5, opacity: 0.85 }}>Cooling load ≈ {formatNum(res.r.totalBtuh, 0)} BTU/h ({formatNum(res.r.tons, 2)} TR) · room {formatNum(res.r.floorAreaSqft, 0)} sq ft</p>
          </div>
        )}
        {res.r && (
          <details style={{ ...card, padding: 14, marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>How we worked it out</summary>
            <div style={{ marginTop: 8 }}>
              {res.r.steps.filter((x) => x.btuh > 0).map((x) => <p key={x.label} style={{ ...small, margin: "0 0 4px", display: "flex", justifyContent: "space-between" }}><span>{x.label}</span><b>{formatNum(x.btuh, 0)} BTU/h</b></p>)}
              <p style={{ ...small, marginTop: 8 }}>We add a {db.fin.tonnage.safetyMarginPct}% safety allowance and pick the next standard size. 1 ton = 12,000 BTU/h.</p>
              <p style={{ ...small, marginTop: 8, padding: 10, borderRadius: 10, background: "var(--gold-tint)", color: "var(--gold-dark)" }}>{res.r.disclaimer}</p>
            </div>
          </details>
        )}

        {/* ── Get Best AC Quote ── */}
        <h3 style={sectionTitle} id="quote">Get Best AC Quote</h3>
        {sentId ? (
          <div role="status" style={{ ...card, padding: 16, borderLeft: "4px solid var(--success-text)" }}>
            <b style={{ fontSize: 15 }}>✓ Request sent</b>
            <p style={{ ...small, marginTop: 6 }}>{qty} × {acType} · {capPicked} · {brands.join(", ")} · {price.toLowerCase()}. Our team will call +91 {phone.replace(/\D/g, "").slice(-10)} with the best prices.</p>
            <button onClick={() => setSentId(null)} style={linkBtn}>Send another request</button>
          </div>
        ) : (
          <div style={{ ...card, padding: 14 }}>
            <p style={{ ...small, margin: "0 0 12px" }}>Tell us what you&apos;d like and we&apos;ll compare prices across brands for you — no obligation.</p>
            <Q l="AC type"><Dropdown label="AC type" options={AC_TYPES} value={acType} onChange={setAcType} /></Q>
            <Q l="Preferred AC brands" hint="Pick one or more"><MultiDropdown label="Preferred AC brands" options={BRANDS} value={brands} onToggle={toggleBrand} placeholder="Select brands" /></Q>
            <Q l="AC capacity" hint={res.r?.recommendedTons != null ? `Your room needs about ${res.r.recommendedTons} Ton` : undefined}><Dropdown label="AC capacity" options={capOptions} value={capPicked} onChange={setCap} /></Q>
            <Q l="Star rating"><Dropdown label="Star rating" options={STARS} value={stars} onChange={setStars} /></Q>
            <Q l="Inverter or non-inverter"><Dropdown label="Inverter or non-inverter" options={INVERTER} value={inv} onChange={setInv} /></Q>
            <Q l="No. of ACs">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Fewer ACs" style={stepBtn}>−</button>
                <b style={{ minWidth: 22, textAlign: "center", fontSize: 16 }} aria-live="polite">{qty}</b>
                <button onClick={() => setQty(Math.min(50, qty + 1))} aria-label="More ACs" style={stepBtn}>+</button>
              </div>
            </Q>
            <Q l="Price for"><Dropdown label="Price for" options={PRICE} value={price} onChange={setPrice} /></Q>
            <Q l="When do you need it?"><Dropdown label="When do you need it?" options={TIMELINE} value={timeline} onChange={setTimeline} /></Q>

            <span style={{ ...label, marginTop: 4 }}>Your details</span>
            <input aria-label="Your name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...field, marginBottom: 8 }} />
            <input aria-label="Mobile number" placeholder="10-digit mobile number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...field, marginBottom: 8 }} />
            <textarea aria-label="Address" placeholder="Address / area" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} style={{ ...field, marginBottom: 8, resize: "none" }} />
            <textarea aria-label="Anything else" placeholder="Anything else? (optional)" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...field, resize: "none" }} />
            {err && <p role="alert" style={{ ...small, color: "var(--error-text)", marginTop: 8 }}>{err}</p>}
            <div style={{ marginTop: 12 }}><PrimaryButton tone="gold" onClick={submit}>Get Best AC Quote</PrimaryButton></div>
          </div>
        )}

        {/* ── Accessories ── */}
        <button onClick={onAccessories} className="press" style={{ ...card, width: "100%", marginTop: 12, padding: 14, border: "none", cursor: "pointer", textAlign: "left", display: "flex", gap: 12, alignItems: "center" }}>
          <span aria-hidden style={{ width: 40, height: 40, borderRadius: 12, background: "var(--blue-tint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🧰</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>AC Installation Accessories</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Copper pipe, stand, drain pipe and more — see what fitting can need</span>
          </span>
          <span aria-hidden style={{ color: "var(--ink-mute)", fontSize: 18 }}>›</span>
        </button>

        <button onClick={onBook} style={{ ...linkBtn, display: "block", margin: "14px auto 0" }}>Book a service for an existing AC instead</button>
      </div>
    </div>
  );
}

function Num({ l, v, set }: { l: string; v: string; set: (s: string) => void }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ ...label, fontSize: 12.5, marginBottom: 6 }}>{l}</span>
      <input aria-label={l} placeholder={l} inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} style={field} />
    </label>
  );
}

function Q({ l, hint, children }: { l: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={{ ...label, marginBottom: hint ? 2 : 8 }}>{l}</span>
      {hint && <p style={{ ...small, margin: "0 0 8px", fontSize: 11.5 }}>{hint}</p>}
      {children}
    </div>
  );
}

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 };
const stepBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 10, border: "1.5px solid var(--line-strong)", background: "var(--surface)", fontSize: 18, fontWeight: 700, cursor: "pointer" };
const linkBtn: React.CSSProperties = { marginTop: 8, background: "none", border: "none", color: "var(--blue)", fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 0 };

/** Entry to the new-AC journey, on Home and in Book Service. */
export function NewAcBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={{ ...card, marginTop: 12, padding: 16, background: "linear-gradient(150deg,var(--blue-dark),var(--blue))", color: "white" }}>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>Buying a New AC? Don&apos;t Guess!</p>
      <p style={{ margin: "6px 0 12px", fontSize: 13, opacity: 0.9, lineHeight: 1.45 }}>Find the right AC size for your home, office or business in seconds.</p>
      <button onClick={onOpen} className="press" style={{ border: "none", borderRadius: 12, padding: "10px 16px", background: "white", color: "var(--blue-dark)", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}>Find My AC Size</button>
    </div>
  );
}
