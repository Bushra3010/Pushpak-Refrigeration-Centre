"use client";

import { useMemo } from "react";

/* Colourful birthday greeting with falling confetti — shown in the technician app on their birthday. */

export function birthdayText(name: string, company: string) {
  return `🎂🎉 Happy Birthday, ${name}! 🎉🎂\n\nWishing you happiness, good health, success and a wonderful year ahead!\n\nWarm wishes from all of us at ${company}. 🎈`;
}

export function BirthdayCard({ name, company, onThanks, confetti = true }: { name: string; company: string; onThanks?: () => void; confetti?: boolean }) {
  const bits = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i % 9) * 0.35, dur: 3.2 + (i % 5) * 0.5, size: 5 + (i % 4) * 2,
    color: ["#ffd166", "#06d6a0", "#ef476f", "#7bdff2", "#f4a261", "#ffffff"][i % 6], round: i % 3 !== 0,
  })), []);
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 22, padding: "26px 20px 22px", textAlign: "center", color: "#fff", background: "linear-gradient(150deg,#5b21b6 0%,#a21caf 45%,#db2777 75%,#f97316 100%)", boxShadow: "0 16px 40px rgba(91,33,182,.35)" }}>
      <style>{`@keyframes bd-fall{0%{transform:translateY(-30px) rotate(0)}100%{transform:translateY(520px) rotate(540deg)}} @keyframes bd-pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
      {confetti && bits.map((b, i) => (
        <span key={i} aria-hidden style={{ position: "absolute", top: 0, left: `${b.left}%`, width: b.size, height: b.round ? b.size : b.size * 2, background: b.color, borderRadius: b.round ? "50%" : 2, opacity: 0.9, animation: `bd-fall ${b.dur}s linear ${b.delay}s infinite` }} />
      ))}
      <div aria-hidden style={{ fontSize: 58, lineHeight: 1, animation: "bd-pop .6s ease both" }}>🎂🎉🎈</div>
      <p style={{ margin: "16px 0 0", fontSize: 13, fontWeight: 800, letterSpacing: ".12em", color: "#fde68a" }}>A SPECIAL DAY FOR YOU</p>
      <h2 style={{ margin: "8px 0 0", fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em" }}>Happy Birthday!</h2>
      <p style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 700 }}>{name}</p>
      <p style={{ margin: "14px auto 0", maxWidth: 300, fontSize: 15, lineHeight: 1.5 }}>Wishing you happiness, good health, success and a wonderful year ahead!</p>
      <div style={{ height: 1, background: "rgba(255,255,255,.35)", margin: "18px 0 14px" }} />
      <p style={{ margin: 0, fontSize: 14, color: "#fde68a" }}>Warm wishes from</p>
      <p style={{ margin: "6px 0 0", fontSize: 17, fontWeight: 800, letterSpacing: ".02em" }}>{company.toUpperCase()}</p>
      {onThanks && <button type="button" onClick={onThanks} className="press" style={{ marginTop: 18, border: "none", borderRadius: 999, padding: "12px 26px", background: "rgba(0,0,0,.35)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Thank You! ♡</button>}
    </div>
  );
}

/** Full-screen birthday greeting shown once when the technician opens the app on their birthday. */
export function BirthdayPopup({ name, company, onClose }: { name: string; company: string; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Happy Birthday" style={{ position: "absolute", inset: 0, zIndex: 400, background: "rgba(10,6,30,.86)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div style={{ width: "100%", maxWidth: 380 }}><BirthdayCard name={name} company={company} onThanks={onClose} /></div>
    </div>
  );
}
