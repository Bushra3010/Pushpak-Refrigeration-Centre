"use client";

import { useEffect, useState } from "react";
import { PhoneIcon } from "./icons";
import { logCall } from "../lib/store";

/* App-to-app call between customer and technician: numbers stay hidden and each call is logged on the
 * job. In this demo the call is simulated; the live app connects it through a calling provider
 * (e.g. Exotel / Twilio masked numbers or WebRTC). */

export function InAppCall({ jobId, from, to, onClose }: { jobId: string | null; from: string; to: string; onClose: () => void }) {
  const [stage, setStage] = useState<"ringing" | "connected">("ringing");
  const [sec, setSec] = useState(0);
  useEffect(() => { const t = setTimeout(() => setStage("connected"), 2200); return () => clearTimeout(t); }, []);
  useEffect(() => { if (stage !== "connected") return; const t = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(t); }, [stage]);
  const end = () => { logCall(jobId, from, to, sec); onClose(); };
  return (
    <div role="dialog" aria-modal="true" aria-label={`Calling ${to}`} style={{ position: "absolute", inset: 0, zIndex: 300, background: "linear-gradient(180deg,#1c1c1c,#050505)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "60px 24px calc(40px + env(safe-area-inset-bottom))" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: ".12em", color: "var(--gold)", fontWeight: 800 }}>PUSHPAK IN-APP CALL</p>
        <div style={{ width: 96, height: 96, borderRadius: 48, margin: "26px auto 16px", border: "2px solid var(--gold)", display: "grid", placeItems: "center", fontSize: 36, fontWeight: 800, background: "#222" }}>{to.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
        <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{to}</p>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#bdbdbd" }}>{stage === "ringing" ? "Ringing…" : `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`}</p>
        <p style={{ margin: "18px 0 0", fontSize: 12, color: "#8d8d8d" }}>🔒 Numbers are hidden on both sides · call is logged on the job</p>
      </div>
      <button type="button" onClick={end} aria-label="End call" className="press" style={{ width: 72, height: 72, borderRadius: 36, border: "none", background: "#e03131", display: "grid", placeItems: "center", cursor: "pointer", transform: "rotate(135deg)" }}><PhoneIcon s={30} c="#fff" /></button>
    </div>
  );
}
