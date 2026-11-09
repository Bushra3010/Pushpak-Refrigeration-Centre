"use client";

import { useState } from "react";
import { birthdayText } from "../components/Birthday";
import { shrinkPhoto } from "../components/repair";
import { TechRegistration } from "../components/TechRegistration";
import { fmtDate, isoDay, type Db } from "../lib/data";
import { EMPTY_PAYMENT, ageOn, completion, daysToBirthday, type PaymentInfo } from "../lib/techprofile";
import { profileOf, setPaymentInfo } from "../lib/store";
import { Badge, Btn, Modal, Panel, fieldLabel, input, muted } from "./kit";

/* Admin: technician registration & document verification, shop payment details, birthdays. */

export function TechProfileModal({ db, techId, who, notify, onClose }: { db: Db; techId: string; who: string; notify: (m: string) => void; onClose: () => void }) {
  const t = db.techs.find((x) => x.id === techId)!;
  return (
    <Modal title={`${t.name} · registration & documents`} onClose={onClose} width={720}>
      <TechRegistration db={db} techId={techId} asAdmin who={who} flash={notify} />
    </Modal>
  );
}

/** Short status for the technicians table. */
export function ProfileBadge({ db, techId }: { db: Db; techId: string }) {
  const p = profileOf(db, techId);
  const c = completion(p);
  const pending = Object.values(p.docs).filter((d) => d.status === "Pending").length;
  return <div><Badge tone={c.verified === 6 ? "green" : pending ? "amber" : "grey"}>{c.verified}/6 docs verified</Badge>{pending > 0 && <div style={{ ...muted, color: "var(--gold-dark)", fontWeight: 600 }}>{pending} to verify</div>}<div style={muted}>{p.role?.title ?? "Role not set"}</div></div>;
}

export function PaymentInfoPanel({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [p, setP] = useState<PaymentInfo>(db.paymentInfo ?? EMPTY_PAYMENT);
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(p) !== JSON.stringify(db.paymentInfo ?? EMPTY_PAYMENT);
  const set = (x: Partial<PaymentInfo>) => setP({ ...p, ...x });
  return (
    <Panel title="Payment details — technicians share these with customers" actions={<Btn disabled={!dirty} onClick={() => { const e = setPaymentInfo(p, who); setErr(e); if (!e) notify("Payment details saved"); }}>Save</Btn>}>
      <div className="form-grid">
        <label><span style={fieldLabel}>Account holder name</span><input value={p.holder} onChange={(e) => set({ holder: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Bank name</span><input value={p.bankName} onChange={(e) => set({ bankName: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Account number</span><input inputMode="numeric" value={p.account} onChange={(e) => set({ account: e.target.value.replace(/\D/g, "").slice(0, 18) })} style={input} /></label>
        <label><span style={fieldLabel}>IFSC</span><input value={p.ifsc} onChange={(e) => set({ ifsc: e.target.value.toUpperCase().slice(0, 11) })} placeholder="SBIN0001234" style={input} /></label>
        <label><span style={fieldLabel}>Branch</span><input value={p.branch} onChange={(e) => set({ branch: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>UPI ID (GPay / PhonePe)</span><input value={p.upi} onChange={(e) => set({ upi: e.target.value.trim() })} placeholder="pushpak@okhdfcbank" style={input} /></label>
      </div>
      <span style={{ ...fieldLabel, marginTop: 12 }}>Payment QR (scanner) image</span>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.qr && <img src={p.qr} alt="Payment QR" style={{ width: 110, height: 110, objectFit: "contain", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />}
        <label style={{ ...input, width: "auto", cursor: "pointer", fontWeight: 600 }}>📷 {p.qr ? "Change QR" : "Upload QR"}<input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => { const f0 = e.target.files?.[0]; if (f0) set({ qr: await shrinkPhoto(f0, 700) }); }} /></label>
        {p.qr && <Btn small kind="ghost" onClick={() => set({ qr: null })}>Remove</Btn>}
      </div>
      <p style={{ ...muted, marginTop: 8 }}>Upload the QR from your bank / GPay Business app. Technicians can show it, share it as an image, or send the UPI link and bank details on WhatsApp from the job&apos;s payment screen and their profile.</p>
      {err && <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
    </Panel>
  );
}

/** Dashboard: today's birthdays (with "Send WhatsApp Wish") and the next 30 days. */
export function BirthdaysPanel({ db, notify }: { db: Db; notify: (m: string) => void }) {
  const today = isoDay(0);
  const list = db.techs.filter((t) => t.active && t.profile?.personal.dob).map((t) => ({ t, dob: t.profile!.personal.dob, days: daysToBirthday(t.profile!.personal.dob, today)! }))
    .filter((x) => x.days <= 30).sort((a, b) => a.days - b.days);
  const todays = list.filter((x) => x.days === 0);
  const upcoming = list.filter((x) => x.days > 0);
  const missing = db.techs.filter((t) => t.active && !t.profile?.personal.dob).length;
  return (
    <Panel title="🎂 Technician birthdays">
      {todays.length > 0 && (
        <div style={{ borderRadius: 12, padding: 12, marginBottom: 12, background: "linear-gradient(120deg,#5b21b6,#db2777,#f97316)", color: "#fff" }}>
          <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 800, letterSpacing: ".08em" }}>TODAY&apos;S BIRTHDAY</p>
          {todays.map(({ t, dob }) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span><b style={{ fontSize: 15 }}>{t.name}</b><span style={{ opacity: 0.85 }}> · turns {ageOn(dob, today)} · {t.profile?.designation}</span></span>
              <button type="button" onClick={() => { window.open(`https://wa.me/91${t.phone}?text=${encodeURIComponent(birthdayText(t.name.split(" ")[0], db.settings.company))}`, "_blank", "noopener"); notify(`Wish sent to ${t.name}`); }} style={{ border: "none", borderRadius: 999, padding: "9px 16px", background: "#25D366", color: "#fff", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>Send WhatsApp Wish</button>
            </div>
          ))}
        </div>
      )}
      {upcoming.length ? upcoming.map(({ t, dob, days }) => (
        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)", fontSize: 13.5 }}>
          <span><b>{t.name}</b><span style={muted}> · {fmtDate(`${today.slice(0, 4)}-${dob.slice(5)}`).replace(/ \d{4}$/, "")}</span></span>
          <Badge tone={days <= 7 ? "amber" : "grey"}>{days === 1 ? "Tomorrow" : `in ${days} days`}</Badge>
        </div>
      )) : !todays.length && <p style={{ ...muted, margin: 0 }}>No birthdays in the next 30 days.</p>}
      {missing > 0 && <p style={{ ...muted, margin: "8px 0 0" }}>{missing} technician{missing === 1 ? " has" : "s have"} no date of birth yet — add it in Technicians → Profile.</p>}
    </Panel>
  );
}
