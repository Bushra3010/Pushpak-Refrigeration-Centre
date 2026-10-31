"use client";

import { useState } from "react";
import { shrinkPhoto } from "../components/repair";
import { BottomSheet, Empty, PageHeader, Pill, PrimaryButton, SectionHead, Tabs, card, field, label, small, type Tone } from "../components/ui";
import { acLabel, fmtDateTime, isOpen, siteOf, type Db, type Technician } from "../lib/data";
import {
  AC_KINDS, BRACKET, CAPACITIES, COPPER, FAULTS_EXPLAINED, GAS, INACCESSIBLE, ISOLATION, LADDER, NOT_CHECKED, OUTDOOR_AT, OVERVIEW_PHOTOS, REFRIGERANT, SAFETY, SERVICE_LOC, SERVICE_REQ,
  answerOf, blankInspection, flagsOf, isAbnormal, itemsFor, needsCustomerAck, progress, reportText, submitProblems,
  type Answer, type CheckItem, type InspStatus, type InspectionDraft, type ShiftingInspection,
} from "../lib/shifting";
import { createInspection, recordCustomerAck, saveInspectionDraft, submitInspection } from "../lib/store";

/* Technician app → AC Shifting · Pre-Removal Inspection (/technician#shifting, #shifting/<id>).
 * Five steps; every condition item starts "Not Checked"; faults need a remark (+ photo); the technician
 * submits for office review and can never authorise removal. */

export const INSP_TONE: Record<InspStatus, Tone> = {
  Draft: "grey", Submitted: "blue", "Correction Required": "amber", "On Hold – Unsafe": "red", "Awaiting Customer Approval": "orange", "Approved for Removal": "green", Cancelled: "grey",
};
const STEPS = ["Customer", "Indoor", "Outdoor", "Site", "Review"] as const;
const editable = (x: ShiftingInspection) => x.status === "Draft" || x.status === "Correction Required";
const draftOf = (x: ShiftingInspection): InspectionDraft => structuredClone({ jobId: x.jobId, customerId: x.customerId, acId: x.acId, customer: x.customer, ac: x.ac, answers: x.answers, site: x.site, materials: x.materials, overview: x.overview, customerAck: x.customerAck });

export function ShiftingScreen({ db, tech, inspectionId, onOpen, onBack, flash }: { db: Db; tech: Technician; inspectionId: string | null; onOpen: (id: string | null) => void; onBack: () => void; flash: (m: string) => void }) {
  const [tab, setTab] = useState<"open" | "done">("open");
  const mine = (db.inspections ?? []).filter((x) => x.techId === tech.id);
  const x = inspectionId ? mine.find((i) => i.id === inspectionId) : undefined;
  if (x) return <InspectionForm key={x.id + x.status} db={db} tech={tech} x={x} onBack={() => onOpen(null)} flash={flash} />;

  const open = mine.filter((i) => !["Approved for Removal", "Cancelled"].includes(i.status));
  const rows = tab === "open" ? open : mine.filter((i) => !open.includes(i));
  const start = () => { const id = createInspection(tech.id, blankInspection()); onOpen(id); };
  return (
    <div style={{ paddingBottom: 12 }}>
      <PageHeader title="AC Shifting Inspection" sub="Pre-removal checklist · office approves removal" onBack={onBack} />
      <div style={{ padding: "0 16px" }}>
        <PrimaryButton onClick={start}>＋ New Pre-Removal Inspection</PrimaryButton>
        <p style={{ ...small, textAlign: "center", margin: "8px 0 12px" }}>Record the AC&apos;s existing condition before you remove it. Removal starts only after the office approves.</p>
        <Tabs value={tab} onChange={setTab} tabs={[{ id: "open", label: `Open (${open.length})` }, { id: "done", label: "Approved / closed" }]} />
        <SectionHead title={tab === "open" ? "Drafts & submitted" : "Approved / cancelled"} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((i) => {
            const p = progress(i);
            return (
              <button key={i.id} onClick={() => onOpen(i.id)} className="press" style={{ ...card, border: "none", padding: 14, textAlign: "left", cursor: "pointer", width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <b style={{ fontSize: 14 }}>{i.id} · {i.customer.name || "New inspection"}</b><Pill tone={INSP_TONE[i.status]}>{i.status}</Pill>
                </div>
                <p style={{ ...small, margin: "3px 0 0" }}>{i.ac.kind} · {i.ac.capacity === "Other" ? i.ac.capacityOther : `${i.ac.capacity} Ton`}{i.ac.brandModel ? ` · ${i.ac.brandModel}` : ""}</p>
                <p style={{ ...small, margin: "2px 0 0", fontSize: 11.5 }}>{p.done}/{p.total} checked · {p.faults.length} faults · {fmtDateTime(i.inspectedAt)}</p>
                {i.office?.notes && i.status === "Correction Required" && <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 600, color: "var(--gold-dark)" }}>Office: {i.office.notes}</p>}
              </button>
            );
          })}
          {rows.length === 0 && <Empty>No inspections here.</Empty>}
        </div>
      </div>
    </div>
  );
}

/* ───────────── the 5-step form ───────────── */

function InspectionForm({ db, tech, x, onBack, flash }: { db: Db; tech: Technician; x: ShiftingInspection; onBack: () => void; flash: (m: string) => void }) {
  const [d, setD] = useState<InspectionDraft>(() => draftOf(x));
  const [step, setStep] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [ack, setAck] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const canEdit = editable(x);
  const rules = db.inspectionRules ?? { faultPhotoRequired: true };
  const p = progress(d);
  const sections = itemsFor(d.ac.kind);
  const set = <K extends keyof InspectionDraft>(k: K, v: Partial<InspectionDraft[K]>) => setD((s) => ({ ...s, [k]: { ...(s[k] as object), ...v } }));
  const setAns = (key: string, a: Partial<Answer>) => setD((s) => ({ ...s, answers: { ...s.answers, [key]: { ...answerOf(s, key), ...a, checkedAt: new Date().toISOString() } } }));
  const save = (quiet = false) => { if (!canEdit) return; const e = saveInspectionDraft(x.id, tech.id, d); if (e) flash(`⚠ ${e}`); else if (!quiet) flash("Draft saved"); };
  const go = (n: number) => { save(true); setStep(n); document.querySelector(".no-scroll")?.scrollTo({ top: 0 }); };
  // Window AC has one combined unit: steps 2 and 3 become one.
  const stepTitles = d.ac.kind === "Window AC" ? ["Customer", "Unit", "—", "Site", "Review"] : [...STEPS];
  const next = (n: number) => (d.ac.kind === "Window AC" && n === 2 ? (n > step ? 3 : 1) : n);

  const myJobs = db.jobs.filter((j) => (j.techId === tech.id || (j.helpers ?? []).includes(tech.id)) && (isOpen(j) || j.id === d.jobId));
  const linkJob = (jobId: string) => {
    const j = db.jobs.find((y) => y.id === jobId);
    if (!j) { setD((s) => ({ ...s, jobId: null })); return; }
    const c = db.customers.find((y) => y.id === j.customerId);
    const ac = db.acs.find((y) => y.id === j.acId);
    const st = siteOf(j, c);
    setD((s) => ({
      ...s, jobId: j.id, customerId: c?.id ?? null, acId: ac?.id ?? null,
      customer: { ...s.customer, name: c?.name ?? s.customer.name, mobile: c?.phone ?? s.customer.mobile, oldLocation: `${st.address}${st.area ? `, ${st.area}` : ""}${ac ? ` — ${ac.application}` : ""}` },
      ac: { ...s.ac, kind: ac?.acType === "Window" ? "Window AC" : "Split AC", capacity: (ac ? (["0.75", "1", "1.2", "1.5", "1.8", "2"].find((t) => `${t} Ton` === ac.capacity) ?? "Other") : s.ac.capacity) as InspectionDraft["ac"]["capacity"], capacityOther: ac && !["1 Ton", "1.5 Ton", "2 Ton"].includes(ac.capacity) ? ac.capacity : "", brandModel: ac ? acLabel(ac) : s.ac.brandModel },
    }));
  };

  const submit = () => {
    const pr = submitProblems(d, rules);
    if (pr.length) { setProblems(pr); setConfirm(false); flash(`⚠ ${pr.length} item${pr.length === 1 ? "" : "s"} to fix before submitting`); return; }
    const e = submitInspection(x.id, tech.id, d);
    if (e) { flash(`⚠ ${e}`); return; }
    setConfirm(false); flash("Submitted for office review");
  };

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Pre-Removal Inspection" sub={`${x.id} · Technician Job Card · AC Shifting`} onBack={() => { save(true); onBack(); }} right={<Pill tone={INSP_TONE[x.status]}>{x.status}</Pill>} />
      <div style={{ padding: "0 16px 120px", flex: 1 }}>
        {/* progress + steps */}
        <div style={{ ...card, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600 }}><span>Condition checks completed</span><span>{p.done}/{p.total}</span></div>
          <div style={{ height: 6, borderRadius: 3, background: "var(--line)", margin: "6px 0 10px", overflow: "hidden" }}><div style={{ width: `${(p.done / p.total) * 100}%`, height: "100%", background: p.done === p.total ? "var(--success-text)" : "#111", transition: "width .2s" }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4 }}>
            {stepTitles.map((t, i) => (
              <button key={i} type="button" disabled={t === "—"} onClick={() => go(i)} aria-current={step === i ? "step" : undefined} style={{ border: "none", borderRadius: 10, padding: "6px 0", background: step === i ? "#111" : "transparent", color: step === i ? "#fff" : t === "—" ? "var(--line-strong)" : "var(--ink-soft)", cursor: t === "—" ? "default" : "pointer", fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{i + 1}</span>{t}
              </button>
            ))}
          </div>
        </div>

        {x.status === "Correction Required" && x.office?.notes && <Banner tone="amber">Office asked for a correction: {x.office.notes}</Banner>}
        {!canEdit && <Banner tone="blue">Submitted {x.submittedAt ? fmtDateTime(x.submittedAt) : ""} — read only. Ask the office to reopen it to make changes.</Banner>}
        {problems.length > 0 && canEdit && (
          <Banner tone="red"><b>Fix before submitting:</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{problems.slice(0, 8).map((q) => <li key={q}>{q}</li>)}</ul>{problems.length > 8 && <span>…and {problems.length - 8} more</span>}</Banner>
        )}

        <fieldset disabled={!canEdit} style={{ border: "none", padding: 0, margin: 0 }}>
          {step === 0 && (
            <Box title="1. Customer & AC details">
              {myJobs.length > 0 && (
                <Field l="Link to a job (auto-fills details)">
                  <select value={d.jobId ?? ""} onChange={(e) => linkJob(e.target.value)} style={field}>
                    <option value="">— No job / enter manually —</option>
                    {myJobs.map((j) => <option key={j.id} value={j.id}>{j.id} · {db.customers.find((c) => c.id === j.customerId)?.name}</option>)}
                  </select>
                </Field>
              )}
              <Field l="Customer name" req><input value={d.customer.name} onChange={(e) => set("customer", { name: e.target.value })} placeholder="Customer name" style={field} /></Field>
              <Field l="Mobile number" req><input inputMode="tel" value={d.customer.mobile} onChange={(e) => set("customer", { mobile: e.target.value.replace(/[^\d]/g, "").slice(0, 10) })} placeholder="10-digit mobile number" style={field} /></Field>
              <Field l="Old location / removal address" req><textarea rows={2} value={d.customer.oldLocation} onChange={(e) => set("customer", { oldLocation: e.target.value })} placeholder="Current AC location — address, floor, room" style={{ ...field, resize: "vertical" }} /></Field>
              <Field l="New location / installation address"><textarea rows={2} value={d.customer.newLocation} onChange={(e) => set("customer", { newLocation: e.target.value })} placeholder="New installation location (optional until booked)" style={{ ...field, resize: "vertical" }} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field l="AC type" req><select value={d.ac.kind} onChange={(e) => set("ac", { kind: e.target.value as InspectionDraft["ac"]["kind"] })} style={field}>{AC_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
                <Field l="AC capacity" req><select value={d.ac.capacity} onChange={(e) => set("ac", { capacity: e.target.value as InspectionDraft["ac"]["capacity"] })} style={field}>{CAPACITIES.map((k) => <option key={k} value={k}>{k === "Other" ? "Other" : `${k} Ton`}</option>)}</select></Field>
              </div>
              {d.ac.capacity === "Other" && <Field l="Capacity" req><input value={d.ac.capacityOther} onChange={(e) => set("ac", { capacityOther: e.target.value })} placeholder="e.g. 2.5 Ton" style={field} /></Field>}
              <Field l="Brand / model"><input value={d.ac.brandModel} onChange={(e) => set("ac", { brandModel: e.target.value })} placeholder="AC brand / model" style={field} /></Field>
              <p style={{ ...small, margin: 0 }}>Technician: {tech.name} · inspection time is recorded automatically.</p>
            </Box>
          )}

          {(step === 1 || step === 2) && (() => {
            const s = d.ac.kind === "Window AC" ? sections[0] : sections[step - 1];
            return (
              <Box title={`${step + 1}. ${s.title} condition`}>
                {d.ac.kind === "Window AC" && <p style={{ ...small, marginTop: -4 }}>Window AC: one combined unit, so indoor/outdoor split questions are skipped.</p>}
                {s.items.map((it, n) => <ItemRow key={it.key} n={n + 1} it={it} a={answerOf(d, it.key)} photoReq={rules.faultPhotoRequired} onChange={(a) => setAns(it.key, a)} />)}
              </Box>
            );
          })()}

          {step === 3 && (
            <>
              <Box title="4. Cleaning / service requirement">
                <Radio l="Service required?" value={d.site.serviceRequired} options={SERVICE_REQ} onChange={(v) => set("site", { serviceRequired: v, serviceLocation: v === "Not Required" ? "" : d.site.serviceLocation })} />
                {d.site.serviceRequired !== "Not Required" && <Radio l="Service location" value={d.site.serviceLocation} options={SERVICE_LOC} onChange={(v) => set("site", { serviceLocation: v })} />}
              </Box>
              <Box title="5. Outdoor unit access & safety">
                <Radio l="Outdoor unit installed at" value={d.site.outdoorAt} options={OUTDOOR_AT} onChange={(v) => set("site", { outdoorAt: v })} />
                {d.site.outdoorAt === "Other" && <Field l="Describe" req><input value={d.site.outdoorOther} onChange={(e) => set("site", { outdoorOther: e.target.value })} style={field} /></Field>}
                <Field l="Approximate working height (feet)"><input inputMode="decimal" value={d.site.heightFt} onChange={(e) => set("site", { heightFt: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Height in feet" style={field} /></Field>
                <Radio l="Extra manpower required?" value={d.site.manpower} options={["Yes", "No"] as const} onChange={(v) => set("site", { manpower: v })} />
                {d.site.manpower === "Yes" && (
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8 }}>
                    <Field l="Workers" req><input inputMode="numeric" value={d.site.manpowerCount} onChange={(e) => set("site", { manpowerCount: e.target.value.replace(/\D/g, "") })} style={field} /></Field>
                    <Field l="Reason" req><input value={d.site.manpowerReason} onChange={(e) => set("site", { manpowerReason: e.target.value })} placeholder="e.g. heavy unit at height" style={field} /></Field>
                  </div>
                )}
                <Radio l="Ladder / scaffold required?" value={d.site.ladder} options={LADDER} onChange={(v) => set("site", { ladder: v })} />
                <Radio l="Site safety assessment" value={d.site.safety} options={SAFETY} onChange={(v) => set("site", { safety: v })} />
                {d.site.safety !== "Safe to Proceed" && <Banner tone={d.site.safety === "Unsafe / Hold Work" ? "red" : "amber"}>Removal cannot be approved until site safety is “Safe to Proceed”.</Banner>}
                <Radio l="Electrical isolation readiness" value={d.site.isolation} options={ISOLATION} onChange={(v) => set("site", { isolation: v })} />
                <Field l="Access notes"><textarea rows={2} value={d.site.accessNotes} onChange={(e) => set("site", { accessNotes: e.target.value })} placeholder="Access restrictions, parking, safe work area, permissions" style={{ ...field, resize: "vertical" }} /></Field>
                {(Number(d.site.heightFt) >= 10 || d.site.outdoorAt === "External Wall / Height") && <p style={{ ...small, color: "var(--gold-dark)" }}>Working at height needs competent staff, proper access equipment and site-specific safety measures.</p>}
              </Box>
            </>
          )}

          {step === 4 && (
            <>
              <Box title="6. Materials & reusability">
                <Radio l="Existing copper pipe" value={d.materials.copper} options={COPPER} onChange={(v) => set("materials", { copper: v })} />
                <Radio l="Existing outdoor stand / bracket" value={d.materials.bracket} options={BRACKET} onChange={(v) => set("materials", { bracket: v })} />
              </Box>
              <Box title="7. Refrigerant assessment">
                <Radio l="Refrigerant type" value={d.materials.refrigerant} options={REFRIGERANT} onChange={(v) => set("materials", { refrigerant: v })} />
                <Radio l="Gas / leakage assessment" value={d.materials.gas} options={GAS} onChange={(v) => set("materials", { gas: v })} />
                <p style={{ ...small, margin: 0 }}>Preliminary only — never charge gas from this checklist. Diagnose leaks and charge per the manufacturer&apos;s specification.</p>
              </Box>
              <Box title="8. Customer approval & remarks">
                <Radio l="Existing faults / additional charges explained?" value={d.materials.faultsExplained} options={FAULTS_EXPLAINED} onChange={(v) => set("materials", { faultsExplained: v })} />
                <Field l="Technician remarks / existing damage"><textarea rows={3} value={d.materials.remarks} onChange={(e) => set("materials", { remarks: e.target.value })} placeholder="Additional faults, missing accessories, site risks, customer instructions" style={{ ...field, resize: "vertical" }} /></Field>
                <span style={label}>Before-removal photos</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {OVERVIEW_PHOTOS.map((o) => <PhotoSlot key={o.key} label={o.label} photos={d.overview[o.key] ?? []} onChange={(ph) => setD((s) => ({ ...s, overview: { ...s.overview, [o.key]: ph } }))} />)}
                </div>
                <span style={label}>Customer acknowledgement</span>
                {d.customerAck
                  ? <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--success-text)" }}>✓ {d.customerAck.name} · {d.customerAck.method} · {fmtDateTime(d.customerAck.at)}</p>
                  : <>
                    <p style={{ ...small, margin: "0 0 8px" }}>{needsCustomerAck(d) ? "Required: there are existing faults or extra charges." : "Optional for this inspection."}</p>
                    <button type="button" onClick={() => { save(true); setAck(true); }} className="press" style={{ width: "100%", border: "1.5px solid #111", background: "#fff", borderRadius: 10, padding: 11, fontWeight: 700, cursor: "pointer" }}>Record customer acknowledgement</button>
                  </>}
              </Box>

              <Box title="Inspection summary">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", textAlign: "center", gap: 6, marginBottom: 10 }}>
                  {[["Checked", p.done], ["Faults", p.faults.length], ["Pending", p.pending]].map(([k, v]) => <div key={k as string} style={{ background: "var(--surface-dim)", borderRadius: 10, padding: "8px 0" }}><b style={{ fontSize: 20 }}>{v}</b><div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{k}</div></div>)}
                </div>
                {flagsOf(d).map((f) => <Banner key={f.text} tone={f.tone}>{f.text}</Banner>)}
                <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(reportText({ ...x, ...d })); flash("Report copied"); } catch { flash("⚠ Could not copy"); } }} className="press" style={{ width: "100%", border: "1.5px solid var(--line-strong)", background: "#fff", borderRadius: 10, padding: 11, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>⧉ Copy complete inspection report</button>
              </Box>
            </>
          )}
        </fieldset>
      </div>

      {/* sticky actions */}
      <div className="no-print" style={{ position: "sticky", bottom: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", display: "flex", gap: 8 }}>
        <button type="button" onClick={() => go(next(Math.max(0, step - 1)))} disabled={step === 0} style={{ ...ghostBtn, opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
        {canEdit && <button type="button" onClick={() => save()} style={ghostBtn}>Save Draft</button>}
        {step < 4
          ? <button type="button" onClick={() => go(next(step + 1))} style={blackBtn}>Next →</button>
          : canEdit && <button type="button" onClick={() => { save(true); setConfirm(true); }} style={blackBtn}>Submit</button>}
      </div>

      {confirm && (
        <BottomSheet title="Submit for office review?" onClose={() => setConfirm(false)}>
          <p style={{ ...small, marginTop: 0 }}>{p.done}/{p.total} checks · {p.faults.length} faults · site {d.site.safety}. After submitting you cannot change it unless the office reopens it. This does not approve removal — the office decides.</p>
          <PrimaryButton onClick={submit}>Submit for Office Review</PrimaryButton>
        </BottomSheet>
      )}
      {ack && <AckSheet name={d.customer.name} onClose={() => setAck(false)} onSave={(a) => {
        const e = recordCustomerAck(x.id, a, tech.name);
        if (e) return e;
        setD((s) => ({ ...s, customerAck: { name: a.name, method: a.method, at: new Date().toISOString() }, materials: { ...s.materials, faultsExplained: "Approved / Acknowledged" } }));
        setAck(false); flash("Customer acknowledgement recorded"); return null;
      }} />}
    </div>
  );
}

/* ───────────── pieces ───────────── */

const ghostBtn: React.CSSProperties = { flex: 1, border: "1.5px solid var(--line-strong)", background: "#fff", borderRadius: 999, padding: "11px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", color: "var(--ink)" };
const blackBtn: React.CSSProperties = { flex: 1.3, border: "none", background: "#111", color: "#fff", borderRadius: 999, padding: "11px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer" };

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ ...card, padding: 14, marginBottom: 12 }}><p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 15 }}>{title}</p>{children}</div>;
}
function Field({ l, req, children }: { l: string; req?: boolean; children: React.ReactNode }) {
  return <label style={{ display: "block", marginBottom: 10 }}><span style={label}>{l}{req && <span style={{ color: "var(--red)" }}> *</span>}</span>{children}</label>;
}
function Banner({ tone, children }: { tone: "red" | "amber" | "blue"; children: React.ReactNode }) {
  const c = tone === "red" ? ["var(--error)", "var(--error-text)"] : tone === "amber" ? ["var(--gold-tint)", "var(--gold-dark)"] : ["var(--info-bg)", "var(--info-text)"];
  return <div role={tone === "red" ? "alert" : undefined} style={{ background: c[0], color: c[1], borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 8, lineHeight: 1.45 }}>{children}</div>;
}
function Radio<T extends string>({ l, value, options, onChange }: { l: string; value: T | ""; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <span style={label}>{l}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((o) => (
          <label key={o} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer", padding: "2px 0" }}>
            <input type="radio" name={l} checked={value === o} onChange={() => onChange(o)} style={{ width: 18, height: 18, accentColor: "#111" }} /> {o}
          </label>
        ))}
      </div>
    </div>
  );
}

function ItemRow({ n, it, a, photoReq, onChange }: { n: number; it: CheckItem; a: Answer; photoReq: boolean; onChange: (a: Partial<Answer>) => void }) {
  const bad = isAbnormal(it, a);
  const inacc = a.value === INACCESSIBLE;
  return (
    <div style={{ padding: "10px 0", borderTop: n > 1 ? "1px solid var(--line)" : "none" }}>
      <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>{n}. {it.label}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {it.options.map((o) => {
          const on = a.value === o;
          const okOpt = it.ok.includes(o);
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => onChange({ value: o })} style={{
              borderRadius: 999, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              border: on ? `1.5px solid ${o === NOT_CHECKED ? "var(--ink-mute)" : okOpt ? "#15803d" : o === INACCESSIBLE ? "var(--gold-dark)" : "var(--red)"}` : "1.5px solid var(--line-strong)",
              background: on ? (o === NOT_CHECKED ? "var(--surface-dim)" : okOpt ? "#15803d" : o === INACCESSIBLE ? "var(--gold)" : "var(--red)") : "#fff",
              color: on && o !== NOT_CHECKED ? "#fff" : "var(--text-secondary)",
            }}>{o}</button>
          );
        })}
      </div>
      {(bad || inacc) && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: bad ? "var(--error)" : "var(--gold-tint)" }}>
          <input aria-label={`${it.label} remark`} value={a.remark} onChange={(e) => onChange({ remark: e.target.value })} placeholder={inacc ? "Why could it not be checked?" : "Describe the fault (required)"} style={{ ...field, background: "#fff" }} />
          {bad && <div style={{ marginTop: 8 }}><PhotoSlot label={`Fault photo${photoReq ? " (required)" : ""}`} photos={a.photos} onChange={(photos) => onChange({ photos })} /></div>}
        </div>
      )}
    </div>
  );
}

function PhotoSlot({ label: l, photos, onChange }: { label: string; photos: string[]; onChange: (p: string[]) => void }) {
  const add = async (fl: FileList | null) => { if (!fl) return; const urls = await Promise.all([...fl].slice(0, 3 - photos.length).map((f) => shrinkPhoto(f, 480).catch(() => null))); onChange([...photos, ...urls.filter((u): u is string => !!u)].slice(0, 3)); };
  return (
    <div>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-soft)" }}>{l}</span>
      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        {photos.map((p, i) => (
          <span key={i} style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt={`${l} ${i + 1}`} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} />
            <button type="button" aria-label="Remove photo" onClick={() => onChange(photos.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: "none", background: "var(--red)", color: "#fff", fontSize: 11, cursor: "pointer" }}>×</button>
          </span>
        ))}
        {photos.length < 3 && (
          <label style={{ width: 56, height: 56, borderRadius: 8, border: "1.5px dashed var(--line-strong)", display: "grid", placeItems: "center", fontSize: 18, cursor: "pointer", background: "#fff" }}>
            📷<input type="file" accept="image/*" capture="environment" multiple onChange={(e) => add(e.target.files)} style={{ display: "none" }} />
          </label>
        )}
      </div>
    </div>
  );
}

function AckSheet({ name, onClose, onSave }: { name: string; onClose: () => void; onSave: (a: { name: string; method: "OTP" | "Signature on paper" | "Recorded call"; otp?: string }) => string | null }) {
  const [n, setN] = useState(name);
  const [method, setMethod] = useState<"OTP" | "Signature on paper" | "Recorded call">("OTP");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <BottomSheet title="Customer acknowledgement" onClose={onClose}>
      <p style={{ ...small, marginTop: 0 }}>Explain the existing faults and any extra charges to the customer, then record their acknowledgement.</p>
      <Field l="Name of person acknowledging" req><input value={n} onChange={(e) => setN(e.target.value)} style={field} /></Field>
      <Radio l="Method" value={method} options={["OTP", "Signature on paper", "Recorded call"] as const} onChange={setMethod} />
      {method === "OTP" && <Field l="OTP from customer's phone" req><input inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4-digit OTP (demo: 1234)" style={field} /></Field>}
      {err && <Banner tone="red">{err}</Banner>}
      <PrimaryButton onClick={() => { const e = onSave({ name: n, method, otp }); if (e) setErr(e); }}>Record Acknowledgement</PrimaryButton>
    </BottomSheet>
  );
}
