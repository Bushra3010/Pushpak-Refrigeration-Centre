"use client";

import { useState } from "react";
import { shrinkPhoto } from "../components/repair";
import { SiteVisitSummary } from "../components/SiteVisit";
import { Empty, PageHeader, Pill, PrimaryButton, SectionHead, card, field, label, small } from "../components/ui";
import { fmtDate, isoDay, isOpen, type Db, type Technician } from "../lib/data";
import {
  EXTRA_PIPE_REASONS, FIXING_TYPES, PIPE_ROUTES, PIPE_TYPES, PUMP_REASONS, STANDARD_PIPE_FT, SV_CAPACITIES, WALL_TYPES,
  emptyVisit, extraPipeFt, visitProblems, type SiteVisit, type SiteVisitDraft, type YN,
} from "../lib/sitevisit";
import { saveSiteVisit, submitSiteVisit } from "../lib/store";

/* Technician app → AC Site Visit (/technician#sitevisit). Engineer instructions, 9 sections; submitted to the office. */

const SV_TONE = { Draft: "grey", Submitted: "blue", Reviewed: "green", "Correction Required": "amber" } as const;

export function SiteVisitScreen({ db, tech, onBack, flash }: { db: Db; tech: Technician; onBack: () => void; flash: (m: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const mine = (db.siteVisits ?? []).filter((v) => v.techId === tech.id);
  const v = open ? mine.find((x) => x.id === open) : undefined;
  if (v) return <VisitForm key={v.id + v.status} db={db} tech={tech} v={v} onBack={() => setOpen(null)} flash={flash} />;
  return (
    <div style={{ paddingBottom: 16 }}>
      <PageHeader title="AC Site Visit" sub="Engineer instructions · before installation" onBack={onBack} />
      <div style={{ padding: "0 16px" }}>
        <PrimaryButton onClick={() => setOpen(saveSiteVisit(null, tech.id, emptyVisit(isoDay(0))).id)}>＋ New Site Visit Report</PrimaryButton>
        <SectionHead title="My site visits" />
        <div style={{ display: "grid", gap: 8 }}>
          {mine.map((x) => (
            <button key={x.id} type="button" onClick={() => setOpen(x.id)} className="press" style={{ ...card, border: "none", padding: 12, textAlign: "left", cursor: "pointer", width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 14 }}>{x.id} · {x.customer.name || "New visit"}</b><Pill tone={SV_TONE[x.status]}>{x.status}</Pill></div>
              <p style={{ ...small, margin: "3px 0 0" }}>{fmtDate(x.visitDate)} · {x.customer.address || "address not entered"}</p>
              {x.status === "Correction Required" && x.office?.notes && <p style={{ margin: "4px 0 0", fontSize: 12.5, fontWeight: 700, color: "var(--gold-dark)" }}>Office: {x.office.notes}</p>}
            </button>
          ))}
          {!mine.length && <Empty>No site visits yet.</Empty>}
        </div>
      </div>
    </div>
  );
}

function VisitForm({ db, tech, v, onBack, flash }: { db: Db; tech: Technician; v: SiteVisit; onBack: () => void; flash: (m: string) => void }) {
  const { id, techId: _t, techName: _n, status, office, createdAt: _c, submittedAt: _s, ...init } = v;
  void _t; void _n; void _c; void _s;
  const [d, setD] = useState<SiteVisitDraft>(init);
  const [problems, setProblems] = useState<string[]>([]);
  const editable = status === "Draft" || status === "Correction Required";
  const set = (p: Partial<SiteVisitDraft>) => { setD((s) => ({ ...s, ...p })); setProblems([]); };
  const extra = extraPipeFt(d);
  const myJobs = db.jobs.filter((j) => (j.techId === tech.id || (j.helpers ?? []).includes(tech.id)) && isOpen(j));
  if (!editable) {
    return (
      <div style={{ paddingBottom: 16 }}>
        <PageHeader title={`${id} · ${status}`} sub={v.customer.name} onBack={onBack} />
        <div style={{ padding: "0 16px" }}>{office?.notes && <p style={{ ...card, padding: 12, fontSize: 13 }}><b>Office:</b> {office.notes}</p>}<SiteVisitSummary v={v} /></div>
      </div>
    );
  }
  const yn = (k: keyof SiteVisitDraft, l: string) => (
    <div style={{ margin: "8px 0" }}>
      <p style={{ ...label, margin: "0 0 6px" }}>{l}</p>
      <div style={{ display: "flex", gap: 8 }}>{(["Yes", "No"] as YN[]).map((o) => { const on = d[k] === o; return <button key={o} type="button" onClick={() => set({ [k]: o } as Partial<SiteVisitDraft>)} aria-pressed={on} style={{ flex: 1, border: on ? "2px solid #111" : "1.5px solid var(--line-strong)", background: on ? "#111" : "#fff", color: on ? "#fff" : "var(--ink)", borderRadius: 10, padding: 10, fontWeight: 700, cursor: "pointer" }}>{o}</button>; })}</div>
    </div>
  );
  const pick = <T extends string>(k: keyof SiteVisitDraft, l: string, opts: readonly T[]) => (
    <div style={{ margin: "8px 0" }}>
      <p style={{ ...label, margin: "0 0 6px" }}>{l}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{opts.map((o) => { const on = d[k] === o; return <button key={o} type="button" onClick={() => set({ [k]: o } as Partial<SiteVisitDraft>)} aria-pressed={on} style={{ border: on ? "2px solid #111" : "1.5px solid var(--line-strong)", background: on ? "#111" : "#fff", color: on ? "#fff" : "var(--ink)", borderRadius: 999, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{o}</button>; })}</div>
    </div>
  );
  const tick = (k: keyof SiteVisitDraft, l: string) => <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, padding: "6px 0", cursor: "pointer" }}><input type="checkbox" checked={!!d[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<SiteVisitDraft>)} style={{ width: 18, height: 18, accentColor: "#111" }} /> {l}</label>;
  const num = (k: keyof SiteVisitDraft, l: string, ph = "") => <label style={{ display: "block", margin: "8px 0" }}><span style={label}>{l}</span><input type="number" inputMode="decimal" min={0} value={(d[k] as number | null) ?? ""} onChange={(e) => set({ [k]: e.target.value === "" ? null : Number(e.target.value) } as Partial<SiteVisitDraft>)} placeholder={ph} style={field} /></label>;
  const multi = (k: "pumpReasons" | "extraReasons", opts: readonly string[]) => opts.map((o) => <label key={o} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, padding: "4px 0" }}><input type="checkbox" checked={d[k].includes(o)} onChange={(e) => set({ [k]: e.target.checked ? [...d[k], o] : d[k].filter((x) => x !== o) })} style={{ width: 17, height: 17, accentColor: "#111" }} /> {o}</label>);
  const box = (t: string, children: React.ReactNode) => <div style={{ ...card, padding: 14, marginTop: 12 }}><p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>🔹 {t}</p>{children}</div>;
  const save = () => { saveSiteVisit(id, tech.id, d); flash("Draft saved"); };
  const submit = () => { saveSiteVisit(id, tech.id, d); const p = submitSiteVisit(id, d); if (p.length) { setProblems(p); flash(`⚠ ${p.length} item${p.length === 1 ? "" : "s"} missing`); } else { flash("Site visit submitted to office"); onBack(); } };

  return (
    <div style={{ paddingBottom: 20 }}>
      <PageHeader title={`🧑‍🔧 ${id}`} sub="AC Site Visit – Engineer Instructions" onBack={() => { save(); onBack(); }} />
      <div style={{ padding: "0 16px" }}>
        {status === "Correction Required" && office?.notes && <p style={{ margin: 0, padding: 10, borderRadius: 10, background: "var(--gold-tint)", fontSize: 13, fontWeight: 600 }}>Office asked to correct: {office.notes}</p>}
        {box("Customer & site details", <>
          {myJobs.length > 0 && <label style={{ display: "block", margin: "8px 0" }}><span style={label}>Link to my job (fills details)</span>
            <select value={d.jobId ?? ""} onChange={(e) => { const j = myJobs.find((x) => x.id === e.target.value); const c = j && db.customers.find((x) => x.id === j.customerId); set({ jobId: j?.id ?? null, ...(c ? { customer: { name: c.name, phone: c.phone, address: [j?.site?.address ?? c.address, j?.site?.area ?? c.area].filter(Boolean).join(", ") } } : {}) }); }} style={field}>
              <option value="">Not linked</option>{myJobs.map((j) => <option key={j.id} value={j.id}>{j.id} · {db.customers.find((c) => c.id === j.customerId)?.name}</option>)}
            </select></label>}
          <label style={{ display: "block", margin: "8px 0" }}><span style={label}>Customer name *</span><input value={d.customer.name} onChange={(e) => set({ customer: { ...d.customer, name: e.target.value } })} style={field} /></label>
          <label style={{ display: "block", margin: "8px 0" }}><span style={label}>Customer mobile no. *</span><input inputMode="numeric" value={d.customer.phone} onChange={(e) => set({ customer: { ...d.customer, phone: e.target.value.replace(/\D/g, "").slice(0, 10) } })} style={field} /></label>
          <label style={{ display: "block", margin: "8px 0" }}><span style={label}>Site location / address *</span><textarea rows={2} value={d.customer.address} onChange={(e) => set({ customer: { ...d.customer, address: e.target.value } })} style={{ ...field, resize: "none" }} /></label>
          <label style={{ display: "block", margin: "8px 0" }}><span style={label}>Site visit date</span><input type="date" value={d.visitDate} onChange={(e) => set({ visitDate: e.target.value })} style={field} /></label>
        </>)}
        {box("1. Site & Structure", <>{pick("wallType", "Wall type", WALL_TYPES)}{yn("beamColumn", "Beam / column at the unit location?")}</>)}
        {box("2. Indoor Unit Placement", <>{tick("indoorFinal", "Indoor unit placement finalized")}{pick("fixing", "Indoor unit fixing type", FIXING_TYPES)}{yn("ceilingGap", "Proper gap between indoor unit and ceiling?")}
          <input value={d.ceilingGapNote} onChange={(e) => set({ ceilingGapNote: e.target.value })} placeholder="Gap in inches / note" style={field} /></>)}
        {box("3. Piping Laying Type", <>{pick("pipeType", "Copper pipe type", PIPE_TYPES)}
          {d.pipeType === "Concealed" && <>{yn("chasing", "Wall chasing (झिरी) required?")}{d.chasing === "Yes" && <>{num("chasingFt", "Approx chasing length (ft)")}{tick("chasingRouteMarked", "Chasing route marked")}</>}</>}</>)}
        {box("4. Drain Line Confirmation", <>{yn("drainWork", "Drain line work required?")}{d.drainWork === "Yes" && <>{yn("drainClear", "Drain route clear?")}{yn("drainSlope", "Proper slope available?")}</>}</>)}
        {box("5. Drain Pump Requirement", <>{yn("drainPump", "Drain pump required?")}{d.drainPump === "Yes" && <><p style={{ ...label, margin: "6px 0 2px" }}>Reason</p>{multi("pumpReasons", PUMP_REASONS)}{d.pumpReasons.includes("Other") && <input value={d.pumpOther} onChange={(e) => set({ pumpOther: e.target.value })} placeholder="Other reason" style={field} />}</>}</>)}
        {box("6. Core Cutting Details", <>{yn("coreCut", "Core cutting required?")}{d.coreCut === "Yes" && <>{num("holes", "Number of holes")}{num("diaMm", "Approx core cutting size (DIA mm)", "63")}{tick("coreMarked", "Core cutting location marked")}</>}</>)}
        {box("7. Copper Pipe Measurement & Route", <>{tick("pipeMeasured", "Copper pipe actual measurement taken")}{num("pipeFt", "Length (ft)")}{pick("pipeRoute", "Pipe route", PIPE_ROUTES)}
          <p style={{ ...small, margin: "4px 0 0" }}>Piping type: <b>{d.pipeType || "select in section 3"}</b></p></>)}
        {box("8. Marking & Permission (VERY IMPORTANT)", <>{d.coreCut === "Yes" ? yn("coreMarking", "Core cutting marking done?") : <p style={small}>Core cutting not required.</p>}{d.chasing === "Yes" ? yn("chasingMarking", "Wall chasing (झिरी) marking done?") : <p style={small}>Wall chasing not required.</p>}</>)}
        {box("9. Special Notes (VERY IMPORTANT)", <>
          <label style={{ display: "block", margin: "8px 0" }}><span style={label}>AC capacity (Ton)</span><select value={d.capacity} onChange={(e) => { const c = e.target.value as SiteVisitDraft["capacity"]; set({ capacity: c, standardFt: STANDARD_PIPE_FT[c] }); }} style={field}>{SV_CAPACITIES.map((c) => <option key={c} value={c}>{c} Ton</option>)}</select></label>
          {num("standardFt", "Standard pipe length (ft)")}
          <div style={{ padding: 10, borderRadius: 10, background: extra > 0 ? "#fef2f2" : "var(--bg-secondary)", fontSize: 13.5 }}>
            Actual required: <b>{d.pipeFt ?? "—"} ft</b> · Standard: <b>{d.standardFt} ft</b><br />
            {extra > 0 ? <b style={{ color: "var(--error-text)" }}>⚠ {extra} ft MORE than the standard length — mention the reason</b> : d.pipeFt ? <b style={{ color: "var(--success-text)" }}>✓ Within the standard length</b> : "Enter the measured length in section 7"}
          </div>
          {extra > 0 && <><p style={{ ...label, margin: "8px 0 2px" }}>Reason *</p>{multi("extraReasons", EXTRA_PIPE_REASONS)}</>}
          {tick("allVisible", "All markings clearly visible")}
          <p style={{ ...label, margin: "8px 0 6px" }}>Marking photos</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {d.photos.map((p, i) => (
              <div key={i} style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt={`Marking photo ${i + 1}`} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />
                <button type="button" aria-label="Remove photo" onClick={() => set({ photos: d.photos.filter((_, n) => n !== i) })} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: "none", background: "#111", color: "#fff", cursor: "pointer" }}>×</button>
              </div>
            ))}
            <label style={{ width: 72, height: 72, borderRadius: 10, border: "1.5px dashed var(--line-strong)", display: "grid", placeItems: "center", fontSize: 24, cursor: "pointer" }}>📷<input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) set({ photos: [...d.photos, await shrinkPhoto(f, 900)] }); e.target.value = ""; }} /></label>
          </div>
          <label style={{ display: "block", margin: "10px 0" }}><span style={label}>Special site challenges</span><textarea rows={2} value={d.challenges} onChange={(e) => set({ challenges: e.target.value })} style={{ ...field, resize: "none" }} /></label>
          <p style={{ ...small, margin: 0 }}>📝 Technician: <b>{tech.name}</b> · 📅 {fmtDate(d.visitDate)}</p>
          <label style={{ display: "block", margin: "8px 0" }}><span style={label}>✍ Report submitted to</span><input value={d.submittedTo} onChange={(e) => set({ submittedTo: e.target.value })} style={field} /></label>
        </>)}
        {problems.length > 0 && (
          <div role="alert" style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#fef2f2", fontSize: 13 }}>
            <b style={{ color: "var(--error-text)" }}>Fill these before submitting:</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
          <PrimaryButton onClick={submit}>Submit to office</PrimaryButton>
          <button type="button" onClick={save} style={{ border: "1.5px solid var(--line-strong)", background: "#fff", borderRadius: 12, padding: 12, fontWeight: 700, cursor: "pointer" }}>Save draft</button>
          <p style={{ ...small, textAlign: "center" }}>{visitProblems(d).length ? `${visitProblems(d).length} items left` : "✓ Ready to submit"}</p>
        </div>
      </div>
    </div>
  );
}
