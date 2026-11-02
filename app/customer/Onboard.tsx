"use client";

import { useEffect, useState } from "react";
import { RoomArt } from "../components/RoomArt";
import { BrandMark, Wordmark } from "../components/Brand";
import { ArrowRight, PinIcon, ShieldIcon, WrenchIcon } from "../components/icons";
import { AcForm, EMPTY_AC, type AcDraft } from "../components/service";
import { Chips, Footer, PageHeader, PrimaryButton, field, label, small } from "../components/ui";
import { DEMO_OTP, type CustomerType, type ContactPref } from "../lib/data";
import type { NewCustomer } from "../lib/store";

/** Catchy lines that rotate on the welcome screen — one promise each, short enough for a phone. */
export const WELCOME_LINES: { eyebrow: string; title: string; text: string }[] = [
  { eyebrow: "EXPERT AC CARE AT YOUR DOORSTEP", title: "Better Cooling\nStarts Here.", text: "Book AC service, repairs & installation with trusted professionals." },
  { eyebrow: "GARMI KO BOLO BYE-BYE", title: "Thanda Ghar.\nSukoon Bhara Mann.", text: "Jet-pump deep cleaning that brings back the chill — and lowers your bill." },
  { eyebrow: "AAPKA AC, HAMARI ZIMMEDARI", title: "One Tap.\nTechnician on the Way.", text: "Pick a time slot, track your technician live, approve the price before work starts." },
  { eyebrow: "NO SURPRISES, ONLY SOLUTIONS", title: "Clear Prices.\nCool Results.", text: "See the quotation first, pay only for what you approve — GST bill every time." },
  { eyebrow: "CARE THAT REMEMBERS", title: "Every AC.\nEvery Service. Saved.", text: "Full history of each AC, service reminders and AMC plans in one app." },
];
export const SINCE_YEAR = 2001;

/** First visit introduction. */
export function SplashScreen({ onStart }: { onStart: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % WELCOME_LINES.length), 3800); return () => clearInterval(t); }, []);
  const line = WELCOME_LINES[i];
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 200, overflowY: "auto", background: "linear-gradient(180deg,#f6f8f7 0%,#eef3f1 100%)", display: "flex", flexDirection: "column", padding: "22px 20px calc(18px + env(safe-area-inset-bottom))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <BrandMark size={46} />
        <div style={{ flex: 1, lineHeight: 1.05 }}>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111", letterSpacing: "-0.02em" }}>Pushpak</p>
          <p style={{ margin: "2px 0 0", fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--gold-dark)" }}>REFRIGERATION CENTRE</p>
        </div>
        <span style={{ fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 500 }}>Since {SINCE_YEAR}</span>
      </div>

      <div style={{ marginTop: 18, padding: 8, borderRadius: 24, background: "#e7efec", boxShadow: "0 10px 28px rgba(17,17,17,.08)" }}>
        <div style={{ position: "relative", borderRadius: 18, overflow: "hidden" }}>
          <RoomArt />
          <span style={{ position: "absolute", left: 10, bottom: 10, padding: "5px 11px", borderRadius: 999, background: "rgba(17,17,17,.62)", color: "#fff", fontSize: 11, fontWeight: 700, backdropFilter: "blur(6px)" }}>❄ Cool home, calm mind</span>
        </div>
      </div>

      <div key={i} className="fade-up" style={{ marginTop: 18, minHeight: 168 }} aria-live="polite">
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", color: "var(--gold-dark)" }}>{line.eyebrow}</p>
        <h1 style={{ margin: "8px 0 0", fontSize: "clamp(28px, 8vw, 36px)", lineHeight: 1.12, fontWeight: 700, letterSpacing: "-0.03em", color: "#111", whiteSpace: "pre-line" }}>{line.title}</h1>
        <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.55, color: "var(--ink-soft)" }}>{line.text}</p>
      </div>
      <div style={{ display: "flex", gap: 6, margin: "4px 0 16px" }} aria-hidden>
        {WELCOME_LINES.map((_, n) => <span key={n} onClick={() => setI(n)} style={{ cursor: "pointer", height: 6, width: n === i ? 18 : 6, borderRadius: 3, background: n === i ? "#111" : "#cfd5d3", transition: "width .2s" }} />)}
      </div>

      <div style={{ marginTop: "auto" }}>
        <PrimaryButton tone="gold" onClick={onStart} style={{ fontSize: 17, padding: "17px 18px", borderRadius: 18 }}>Book AC Service <ArrowRight s={20} c="#111" /></PrimaryButton>
        <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 14, fontSize: 13, fontWeight: 600, color: "#2b2f36", flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><ShieldIcon s={16} c="var(--gold-dark)" /> Trusted Since {SINCE_YEAR}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><WrenchIcon s={16} c="var(--gold-dark)" /> Expert Technicians</span>
        </div>
        <div style={{ height: 1, background: "#dde3e1", margin: "16px 0 12px" }} />
        <p style={{ margin: 0, textAlign: "center", fontSize: 11.5, letterSpacing: ".06em", color: "var(--ink-mute)" }}>AC SALES • SERVICE • REPAIRS • SPARE PARTS</p>
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
          {!sent && <p style={{ margin: "6px 2px 0", fontSize: 11.5, color: "var(--ink-mute)" }}>New here? Enter your mobile number — you&apos;ll set up your profile after the OTP.</p>}
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
