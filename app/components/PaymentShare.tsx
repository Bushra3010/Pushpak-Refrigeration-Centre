"use client";

import type { Db } from "../lib/data";
import { maskAccount, paymentMessage, upiLink, EMPTY_PAYMENT } from "../lib/techprofile";
import { BottomSheet, PrimaryButton, card, small } from "./ui";

/* Technician shares the shop's payment QR and bank details with the customer — WhatsApp, share sheet or copy. */

export function PaymentShareSheet({ db, onClose, amount, customer, phone, refNo, flash }: { db: Db; onClose: () => void; amount?: number; customer?: string; phone?: string; refNo?: string; flash: (m: string) => void }) {
  const p = db.paymentInfo ?? EMPTY_PAYMENT;
  const ready = !!(p.upi || p.account || p.qr);
  const text = paymentMessage(p, db.settings.company, { customer, amount, ref: refNo });
  const shareQr = async () => {
    try {
      if (p.qr && navigator.canShare) {
        const blob = await (await fetch(p.qr)).blob();
        const file = new File([blob], "pushpak-payment-qr.jpg", { type: blob.type || "image/jpeg" });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      }
      if (navigator.share) { await navigator.share({ title: "Payment details", text }); return; }
      await navigator.clipboard.writeText(text); flash("Copied — paste in WhatsApp");
    } catch { /* share cancelled */ }
  };
  return (
    <BottomSheet title="Share payment details" onClose={onClose}>
      {!ready ? <p style={{ ...small, marginTop: 0 }}>The office has not added the shop&apos;s payment details yet (Admin → Settings → Payment details).</p> : <>
        {amount ? <div style={{ ...card, padding: 12, textAlign: "center", marginBottom: 10 }}><p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Amount to pay</p><p style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>₹{amount.toLocaleString("en-IN")}</p></div> : null}
        {p.qr && (
          <div style={{ textAlign: "center", marginBottom: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.qr} alt="Pushpak payment QR code" style={{ width: 220, height: 220, objectFit: "contain", borderRadius: 14, border: "1px solid var(--line)", background: "#fff", padding: 8 }} />
            <p style={{ ...small, margin: "4px 0 0" }}>Customer can scan this with GPay / PhonePe / Paytm</p>
          </div>
        )}
        <div style={{ ...card, padding: 12, fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
          {p.upi && <div><b>UPI:</b> {p.upi}</div>}
          {p.account && <><div><b>Bank:</b> {p.bankName}</div><div><b>A/c name:</b> {p.holder}</div><div><b>A/c no:</b> {maskAccount(p.account)}</div><div><b>IFSC:</b> {p.ifsc}{p.branch ? ` · ${p.branch}` : ""}</div></>}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <PrimaryButton tone="green" onClick={() => window.open(`https://wa.me/${phone ? `91${phone}` : ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener")}>WhatsApp{customer ? ` to ${customer}` : ""}</PrimaryButton>
          {p.qr && <button type="button" onClick={shareQr} className="press" style={btn}>Share QR image</button>}
          {p.upi && amount ? <a href={upiLink(p, amount, refNo)} className="press" style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none" }}>Open UPI app on this phone</a> : null}
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); flash("Payment details copied"); } catch { flash("⚠ Could not copy"); } }} className="press" style={btn}>Copy details</button>
        </div>
      </>}
    </BottomSheet>
  );
}

const btn: React.CSSProperties = { border: "1.5px solid var(--line-strong)", background: "var(--surface)", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", color: "var(--ink)" };
