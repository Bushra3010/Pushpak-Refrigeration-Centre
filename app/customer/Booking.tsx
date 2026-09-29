"use client";

import { useState } from "react";
import { AcIcon, CheckIcon, PlusIcon } from "../components/icons";
import { PreWorkForm, preWorkAnswered } from "../components/service";
import { Chips, Footer, PageHeader, PrimaryButton, card, field, label, small } from "../components/ui";
import {
  COMPLAINTS, EMPTY_PREWORK, SLOTS, acLabel, acSummary, fmtDate, isoDay,
  type ComplaintIssue, type Customer, type Db, type PreWork,
} from "../lib/data";
import type { NewJob } from "../lib/store";

const STEPS = ["Select AC", "Problem", "History", "Schedule"];

/** Book service: AC → complaint in the customer's words → previous history → date & slot. */
export function BookService({ db, me, initialAc, onBack, onAddAc, onSubmit }: {
  db: Db; me: Customer; initialAc?: string; onBack: () => void; onAddAc: () => void; onSubmit: (j: NewJob) => void;
}) {
  const acs = db.acs.filter((a) => a.customerId === me.id);
  const [step, setStep] = useState(initialAc ? 1 : 0);
  const [acId, setAcId] = useState(initialAc ?? acs[0]?.id ?? "");
  const [issues, setIssues] = useState<ComplaintIssue[]>([]);
  const [notes, setNotes] = useState("");
  const [code, setCode] = useState("");
  const [pre, setPre] = useState<PreWork>({ ...EMPTY_PREWORK });
  const [date, setDate] = useState(isoDay(0));
  const [slot, setSlot] = useState("");

  const toggle = (i: ComplaintIssue) => setIssues((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  const days = Array.from({ length: 7 }, (_, i) => isoDay(i));
  const canNext = [!!acId, issues.length > 0 && (issues.length > 1 || issues[0] !== "Other" || notes.trim().length > 3), true, !!slot][step];

  const submit = () => onSubmit({
    customerId: me.id, acId, date, slot, source: "Customer App",
    complaint: { issues, notes: notes.trim(), errorCode: code.trim() }, preWork: pre,
    priority: issues.includes("Gas Leakage Suspected") || me.type === "Commercial" ? "High" : "Normal",
  });

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Book Service" sub={`Step ${step + 1} of 4 · ${STEPS[step]}`} onBack={step === 0 || (initialAc && step === 1) ? onBack : () => setStep(step - 1)} />
      <div style={{ display: "flex", gap: 6, padding: "0 16px 14px" }}>
        {STEPS.map((s, i) => <span key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? "var(--blue)" : "var(--line)" }} />)}
      </div>

      <div style={{ padding: "0 16px", flex: 1 }}>
        {step === 0 && (
          <>
            <p style={{ ...small, margin: "0 0 12px" }}>Which AC needs attention?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {acs.map((a) => {
                const on = a.id === acId;
                const s = acSummary(db, a.id);
                return (
                  <button key={a.id} onClick={() => setAcId(a.id)} className="press" style={{ ...card, padding: 14, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left", border: on ? "2px solid var(--blue)" : "2px solid transparent" }}>
                    <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--blue-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}><AcIcon s={22} c="var(--blue)" /></span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{a.application} AC</span>
                      <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{acLabel(a)} · {s.lastService ? `Last service ${fmtDate(s.lastService)}` : "No service yet"}</span>
                    </span>
                    {on && <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center" }}><CheckIcon s={12} c="white" /></span>}
                  </button>
                );
              })}
              <button onClick={onAddAc} className="press" style={{ ...card, padding: 14, border: "1.5px dashed var(--line-strong)", background: "transparent", boxShadow: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", color: "var(--blue)", fontWeight: 700, fontSize: 13.5 }}>
                <PlusIcon s={16} c="var(--blue)" /> Add another AC
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <span style={label}>What&apos;s the problem? <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}>(select all that apply)</span></span>
            <Chips options={COMPLAINTS} value={issues} onChange={toggle} multi />
            {issues.includes("Error Code") && (
              <label style={{ display: "block", marginTop: 14 }}><span style={label}>Error code on display</span><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="e.g. E4, U4, CH05" style={field} /></label>
            )}
            <label style={{ display: "block", marginTop: 16 }}>
              <span style={label}>Describe it in your own words</span>
              <textarea rows={4} value={notes} maxLength={400} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Cooling is low since yesterday and water is dripping from the indoor unit" style={{ ...field, resize: "none" }} />
            </label>
            <p style={{ ...small, fontSize: 11.5 }}>Hindi or English is fine. The technician sees exactly what you write — before they diagnose.</p>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ ...card, padding: 12, marginBottom: 14, background: "var(--info-bg)", boxShadow: "none" }}>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--info-text)", lineHeight: 1.5 }}>A few quick questions about earlier repairs help us find the real cause — not just the symptom. Answer what you know; skip the rest.</p>
            </div>
            <PreWorkForm value={pre} onChange={setPre} />
          </>
        )}

        {step === 3 && (
          <>
            <span style={label}>Date</span>
            <div className="no-scroll" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {days.map((d, i) => {
                const on = d === date;
                const dt = new Date(d);
                return (
                  <button key={d} onClick={() => setDate(d)} aria-pressed={on} style={{ flex: "0 0 62px", padding: "10px 0", borderRadius: 14, cursor: "pointer", border: on ? "1.5px solid var(--blue)" : "1.5px solid var(--line)", background: on ? "var(--blue)" : "var(--surface)", color: on ? "white" : "var(--ink)" }}>
                    <span style={{ display: "block", fontSize: 11, opacity: 0.8 }}>{i === 0 ? "Today" : i === 1 ? "Tmrw" : dt.toLocaleDateString("en-IN", { weekday: "short" })}</span>
                    <span style={{ display: "block", fontSize: 17, fontWeight: 800 }}>{dt.getDate()}</span>
                  </button>
                );
              })}
            </div>
            <span style={{ ...label, marginTop: 16 }}>Time slot</span>
            <Chips options={SLOTS} value={slot} onChange={setSlot} />
            <h3 style={{ margin: "20px 2px 8px", fontSize: 14, fontWeight: 700 }}>Summary</h3>
            <div style={{ ...card, padding: 14, fontSize: 13, lineHeight: 1.7 }}>
              <div><b>AC:</b> {(() => { const a = acs.find((x) => x.id === acId); return a ? `${a.application} · ${acLabel(a)}` : ""; })()}</div>
              <div><b>Problem:</b> {issues.join(", ")}</div>
              <div><b>History answers:</b> {preWorkAnswered(pre)} captured</div>
              <div><b>Address:</b> {me.address}</div>
              <div style={{ color: "var(--ink-soft)", fontSize: 12, marginTop: 6 }}>Inspection charge ₹{db.services.find((s) => s.id === "sv-visit")?.price} (adjusted if you go ahead with the repair{me.amc ? "; free under your AMC" : ""}). You approve the quotation before any work starts.</div>
            </div>
          </>
        )}
      </div>

      <Footer>
        {step < 3
          ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <PrimaryButton disabled={!canNext} onClick={() => setStep(step + 1)}>Next</PrimaryButton>
              {step === 2 && <button onClick={() => { setPre({ ...EMPTY_PREWORK }); setStep(3); }} style={{ background: "none", border: "none", color: "var(--ink-soft)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 6 }}>Skip — the technician will ask</button>}
            </div>
          )
          : <PrimaryButton tone="gold" disabled={!slot} onClick={submit}>Confirm Booking</PrimaryButton>}
      </Footer>
    </div>
  );
}
