"use client";

import { useState } from "react";
import { BrandMark, Wordmark } from "../components/Brand";
import { ArrowRight, PinIcon, SnowIcon } from "../components/icons";
import { AcForm, EMPTY_AC, type AcDraft } from "../components/service";
import { Chips, Footer, PageHeader, PrimaryButton, field, label, small } from "../components/ui";
import { CUSTOMER_DEMO_PHONE, DEMO_OTP, type CustomerType, type ContactPref } from "../lib/data";
import type { NewCustomer } from "../lib/store";

/** Brand splash — deep navy so the PRC gradient logo reads the way it was drawn. */
export function SplashScreen({ onStart }: { onStart: () => void }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 200,
      background: "linear-gradient(165deg,#0847c7 0%,#04246b 55%,#020b24 100%)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", right: -80, top: -90, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(92,207,219,0.35), transparent 70%)" }} />
      <div style={{ position: "absolute", left: -70, bottom: 140, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,138,31,0.18), transparent 70%)" }} />
      {/* Drifting snowflakes, echoing cool air */}
      {[[12, 18, 26], [78, 12, 18], [64, 30, 14], [20, 62, 16], [84, 58, 22], [42, 80, 12]].map(([x, y, s], i) => (
        <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, opacity: 0.18 }}><SnowIcon s={s} c="white" w={1.5} /></div>
      ))}

      <div className="fade-up" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1, padding: "0 24px", textAlign: "center" }}>
        <div style={{ padding: 6, borderRadius: "50%", background: "rgba(255,255,255,0.1)", boxShadow: "0 0 60px rgba(92,207,219,0.35)" }}>
          <BrandMark size={132} />
        </div>
        <h1 style={{ margin: "22px 0 0", fontSize: 30, fontWeight: 800, color: "white", letterSpacing: "-0.02em" }}>Pushpak</h1>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", color: "rgba(255,255,255,0.75)" }}>REFRIGERATION CENTRE</p>
        <p style={{ margin: "18px 0 0", fontSize: 14.5, color: "rgba(255,255,255,0.75)", maxWidth: 280, lineHeight: 1.5 }}>Smarter AC service. Every repair, part and payment — remembered for every AC you own.</p>
      </div>

      <div style={{ padding: "0 20px calc(28px + env(safe-area-inset-bottom))", position: "relative", zIndex: 1 }}>
        <PrimaryButton tone="gold" onClick={onStart}>Get Started <ArrowRight s={18} c="white" /></PrimaryButton>
      </div>
    </div>
  );
}

/** Mobile + OTP login. Existing numbers go straight in; new numbers go to profile setup. */
export function LoginScreen({ onVerified }: { onVerified: (phone: string) => void }) {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const send = () => {
    if (!/^[6-9]\d{9}$/.test(phone)) { setErr("Enter a valid 10-digit mobile number"); return; }
    setErr(null); setSent(true);
  };
  const verify = () => { if (code !== DEMO_OTP) { setErr("Incorrect OTP"); return; } onVerified(phone); };

  return (
    <div className="fade-up" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 20px", overflowY: "auto" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><BrandMark size={50} /><Wordmark /></div>
        <h1 style={{ margin: "28px 0 4px", fontSize: 26, fontWeight: 800 }}>Welcome back</h1>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-soft)" }}>Log in with your mobile number to book service and see your AC history.</p>

        <div style={{ marginTop: 26 }}>
          <label style={label} htmlFor="c-phone">Mobile number</label>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ ...field, width: "auto", display: "flex", alignItems: "center", color: "var(--ink-soft)" }}>+91</span>
            <input id="c-phone" inputMode="numeric" autoComplete="tel-national" value={phone} disabled={sent} placeholder="98765 43210"
              onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setErr(null); }} style={{ ...field, flex: 1 }} />
          </div>
          {!sent && <p style={{ margin: "6px 2px 0", fontSize: 11.5, color: "var(--ink-mute)" }}>Demo: {CUSTOMER_DEMO_PHONE} is Rajesh Sharma (existing customer). Any other number signs up as new.</p>}
          {sent && (
            <div className="fade-up" style={{ marginTop: 16 }}>
              <label style={label} htmlFor="c-otp">OTP sent to +91 {phone}</label>
              <input id="c-otp" inputMode="numeric" autoComplete="one-time-code" value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(null); }}
                style={{ ...field, fontSize: 22, fontWeight: 800, letterSpacing: "0.5em", textAlign: "center" }} />
              <p style={{ margin: "6px 2px 0", fontSize: 11.5, color: "var(--ink-mute)" }}>Demo OTP: {DEMO_OTP} · <button onClick={() => { setSent(false); setCode(""); }} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Change number</button></p>
            </div>
          )}
          {err && <p role="alert" style={{ margin: "8px 2px 0", fontSize: 12.5, color: "var(--error-text)", fontWeight: 600 }}>{err}</p>}
        </div>
      </div>
      <div style={{ padding: "16px 0 calc(24px + env(safe-area-inset-bottom))" }}>
        {sent
          ? <PrimaryButton disabled={code.length !== 4} onClick={verify}>Verify &amp; Continue</PrimaryButton>
          : <PrimaryButton disabled={phone.length !== 10} onClick={send}>Get OTP</PrimaryButton>}
      </div>
    </div>
  );
}

/* ───────────────────────── Customer details (PRD §3A) ───────────────────────── */

export type ProfileDraft = Pick<NewCustomer, "name" | "phone" | "altPhone" | "address" | "area" | "gps" | "type" | "contactPref">;

const TYPES: CustomerType[] = ["Residential", "Office", "Shop", "Commercial", "Other"];

export function ProfileForm({ value, onChange }: { value: ProfileDraft; onChange: (v: ProfileDraft) => void }) {
  const [locating, setLocating] = useState(false);
  const set = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => onChange({ ...value, [k]: v });

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); onChange({ ...value, gps: `${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}` }); },
      () => setLocating(false),
      { timeout: 8000 },
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label><span style={label}>Full name</span><input value={value.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" placeholder="e.g. Neha Gupta" style={field} /></label>
      <div className="form-grid">
        <label><span style={label}>Mobile number</span><input value={`+91 ${value.phone}`} disabled style={{ ...field, color: "var(--ink-soft)" }} /></label>
        <label><span style={label}>Alternate number</span><input inputMode="numeric" value={value.altPhone} onChange={(e) => set("altPhone", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Optional" style={field} /></label>
      </div>
      <label><span style={label}>Full address</span><textarea rows={2} value={value.address} onChange={(e) => set("address", e.target.value)} placeholder="House / flat, street, landmark, city, PIN" style={{ ...field, resize: "none" }} /></label>
      <div className="form-grid">
        <label><span style={label}>Area / locality</span><input value={value.area} onChange={(e) => set("area", e.target.value)} placeholder="e.g. Dwarka" style={field} /></label>
        <div>
          <span style={label}>Map location</span>
          <button type="button" onClick={locate} className="press" style={{ ...field, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: value.gps ? "var(--success-text)" : "var(--blue)", fontWeight: 600 }}>
            <PinIcon s={16} c={value.gps ? "var(--success-text)" : "var(--blue)"} /> {locating ? "Locating…" : value.gps ? "Location saved" : "Use my location"}
          </button>
        </div>
      </div>
      <div><span style={label}>Customer type</span><Chips options={TYPES} value={value.type} onChange={(v) => set("type", v)} /></div>
      <div><span style={label}>Preferred contact</span><Chips options={["Call", "WhatsApp"] as ContactPref[]} value={value.contactPref} onChange={(v) => set("contactPref", v)} /></div>
    </div>
  );
}

export const profileValid = (p: ProfileDraft) => p.name.trim().length >= 2 && p.address.trim().length >= 8 && (!p.altPhone || /^[6-9]\d{9}$/.test(p.altPhone));

/** First-run for a new number: customer details, then the first AC. */
export function SignupFlow({ phone, onDone }: { phone: string; onDone: (profile: ProfileDraft, ac: AcDraft | null) => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [p, setP] = useState<ProfileDraft>({ name: "", phone, altPhone: "", address: "", area: "", gps: "", type: "Residential", contactPref: "WhatsApp" });
  const [ac, setAc] = useState<AcDraft>(EMPTY_AC);

  return (
    <div className="no-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <PageHeader title={step === 0 ? "Your details" : "Add your AC"} sub={`Step ${step + 1} of 2`} onBack={step === 1 ? () => setStep(0) : undefined} />
      <div style={{ padding: "0 16px 8px", flex: 1 }}>
        {step === 0 ? (
          <>
            <p style={{ ...small, margin: "0 0 14px" }}>We use this to reach you and send the technician to the right place.</p>
            <ProfileForm value={p} onChange={setP} />
          </>
        ) : (
          <>
            <p style={{ ...small, margin: "0 0 14px" }}>Each AC gets its own service history. You can add more ACs later.</p>
            <AcForm value={ac} onChange={setAc} />
          </>
        )}
      </div>
      <Footer>
        {step === 0
          ? <PrimaryButton disabled={!profileValid(p)} onClick={() => setStep(1)}>Next</PrimaryButton>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <PrimaryButton disabled={!ac.brand} onClick={() => onDone(p, ac)}>Save &amp; Continue</PrimaryButton>
              <button onClick={() => onDone(p, null)} style={{ background: "none", border: "none", color: "var(--ink-soft)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 6 }}>Skip — I&apos;ll add my AC later</button>
            </div>
          )}
      </Footer>
    </div>
  );
}
