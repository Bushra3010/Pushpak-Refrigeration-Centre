"use client";

import { useEffect, useRef, useState } from "react";
import { PromoArtSvg } from "../components/PromoArt";
import { BottomSheet, PrimaryButton, field, label, small } from "../components/ui";
import type { Customer, Db } from "../lib/data";
import { liveBanners, validateEnquiry, type PromoBanner } from "../lib/promo";
import { addPartEnquiry } from "../lib/store";

/* "Explore More at Pushpak" — spare-parts promo slider on the customer home page only.
 * Banners come from Admin → Spare Parts Promo; only enabled ones show, in the admin's order. */

export function SpareSlide({ b, onEnquire }: { b: PromoBanner; onEnquire?: () => void }) {
  return (
    <div style={{ position: "relative", minHeight: 190, borderRadius: 14, overflow: "hidden", color: "#fff", background: "radial-gradient(circle at 80% 35%, #3a3a3a 0%, #151515 55%, #0b0b0b 100%)", border: "2px solid var(--gold)", boxShadow: "0 6px 18px rgba(0,0,0,.18)" }}>
      {b.image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={b.image} alt={b.category} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }} />
        : <span style={{ position: "absolute", right: -4, bottom: -6 }}><PromoArtSvg art={b.art} size={140} /></span>}
      <div style={{ position: "relative", padding: "16px 16px 14px", maxWidth: b.image ? "100%" : "62%" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".12em", color: "var(--gold)" }}>{b.category.toUpperCase()}</span>
        <h3 style={{ margin: "4px 0 0", fontSize: 24, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.02em", background: "linear-gradient(180deg,#ffe7b0,#e8b23a 60%,#b9851f)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{b.title}</h3>
        {b.subtitle && <p style={{ margin: "6px 0 0", fontSize: 11.5, lineHeight: 1.45, color: "#d6d6d6" }}>{b.subtitle}</p>}
        {b.parts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
            {b.parts.slice(0, 4).map((p) => <span key={p} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, border: "1px solid rgba(232,178,58,.55)", color: "#f3dfb0" }}>{p}</span>)}
          </div>
        )}
        <button type="button" onClick={onEnquire} className="press" style={{ marginTop: 12, border: "none", borderRadius: 6, padding: "8px 14px", background: "var(--red)", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{b.cta || "Enquire Now"} ›</button>
      </div>
    </div>
  );
}

export function ExploreMore({ db, me, flash }: { db: Db; me: Customer; flash: (m: string) => void }) {
  const banners = liveBanners(db.promoBanners);
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [enquire, setEnquire] = useState<PromoBanner | null>(null);

  useEffect(() => {
    if (banners.length < 2 || paused || enquire) return;
    const t = setInterval(() => {
      const el = ref.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % banners.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 4000);
    return () => clearInterval(t);
  }, [banners.length, paused, enquire]);

  if (!banners.length) return null;
  return (
    <section aria-label="Explore More at Pushpak" style={{ marginTop: 6 }}>
      <div className="bb-section"><h3>Explore More at Pushpak</h3></div>
      <p style={{ ...small, margin: "-6px 0 10px" }}>Spare parts for all your home appliances — not just AC.</p>
      <div ref={ref} className="no-scroll" onTouchStart={() => setPaused(true)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}
        style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", borderRadius: 14 }}>
        {banners.map((b) => (
          <div key={b.id} style={{ flex: "0 0 100%", scrollSnapAlign: "center" }}>
            <SpareSlide b={b} onEnquire={() => setEnquire(b)} />
          </div>
        ))}
      </div>
      {banners.length > 1 && (
        <div className="bb-dots" role="tablist" aria-label="Choose a slide">
          {banners.map((b, n) => (
            <button key={b.id} type="button" role="tab" aria-selected={n === i} aria-label={b.category}
              onClick={() => ref.current?.scrollTo({ left: n * ref.current.clientWidth, behavior: "smooth" })}
              style={{ border: "none", padding: 0, cursor: "pointer", height: 6, borderRadius: 3, width: n === i ? 18 : 6, background: n === i ? "#111" : "#cfcfd2", transition: "width .2s" }} />
          ))}
        </div>
      )}
      {enquire && <EnquirySheet b={enquire} me={me} onClose={() => setEnquire(null)} onSent={(id) => { setEnquire(null); flash(`Enquiry sent (${id}) — we'll call you shortly`); }} />}
    </section>
  );
}

function EnquirySheet({ b, me, onClose, onSent }: { b: PromoBanner; me: Customer; onClose: () => void; onSent: (id: string) => void }) {
  const [part, setPart] = useState("");
  const [appliance, setAppliance] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState(me.name);
  const [phone, setPhone] = useState(me.phone);
  const [err, setErr] = useState<string | null>(null);
  const send = () => {
    const e = validateEnquiry({ name, phone, part });
    if (e) { setErr(e); return; }
    const r = addPartEnquiry({ bannerId: b.id, category: b.category, customerId: me.id, name, phone, appliance, part, note }, me.name);
    if ("error" in r) setErr(r.error); else onSent(r.id);
  };
  return (
    <BottomSheet title={`Enquire · ${b.category}`} onClose={onClose}>
      <span style={label}>Which part do you need? <span style={{ color: "var(--red)" }}>*</span></span>
      {b.parts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {b.parts.map((p) => <button key={p} type="button" onClick={() => setPart(p)} aria-pressed={part === p} style={{ border: part === p ? "1.5px solid #111" : "1.5px solid var(--line-strong)", background: part === p ? "#111" : "#fff", color: part === p ? "#fff" : "var(--text-secondary)", borderRadius: 999, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{p}</button>)}
        </div>
      )}
      <input aria-label="Part needed" placeholder="Or type the part name" value={part} onChange={(e) => setPart(e.target.value)} style={{ ...field, marginBottom: 10 }} />
      <span style={label}>Appliance brand / model</span>
      <input aria-label="Appliance brand or model" placeholder="e.g. LG 1.5 Ton split / Samsung 253 L" value={appliance} onChange={(e) => setAppliance(e.target.value)} style={{ ...field, marginBottom: 10 }} />
      <span style={label}>Message</span>
      <textarea aria-label="Message" rows={2} placeholder="Anything else we should know" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...field, marginBottom: 10, resize: "vertical" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div><span style={label}>Name</span><input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} style={field} /></div>
        <div><span style={label}>Mobile</span><input aria-label="Mobile number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={field} /></div>
      </div>
      {err && <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
      <div style={{ marginTop: 14 }}><PrimaryButton onClick={send}>Send Enquiry</PrimaryButton></div>
      <p style={{ ...small, textAlign: "center", marginTop: 8 }}>Our team will call you with price and availability.</p>
    </BottomSheet>
  );
}
