"use client";

import { useState } from "react";
import { shrinkPhoto } from "./repair";
import type { Db } from "../lib/data";
import {
  BLOOD_GROUPS, DESIGNATIONS, DOC_KEYS, DOC_LABEL, RESPONSIBILITY_TEMPLATES, TSHIRT_SIZES, UNIFORM_ITEMS, completion, maskAccount, profileProblems,
  type DocKey, type DocStatus, type TechProfile,
} from "../lib/techprofile";
import { profileOf, saveTechProfile, setDocStatus, setTechRole } from "../lib/store";

/* Technician registration — Personal · Family · Documents · Bank & GPay · Uniform · Preview (+ Role for admin).
 * Used by the technician (own profile; documents go to "Pending") and by admin (verify documents, set role). */

const SECTIONS = ["Personal", "Family", "Documents", "Bank & GPay", "Uniform", "Preview"] as const;
type Section = (typeof SECTIONS)[number] | "Role";
const DOC_ICON: Record<DocStatus, string> = { "Not uploaded": "◌", Pending: "⏳", Verified: "✅", Rejected: "❌" };
const DOC_COLOR: Record<DocStatus, string> = { "Not uploaded": "var(--ink-mute)", Pending: "var(--gold-dark)", Verified: "var(--success-text)", Rejected: "var(--error-text)" };

const fld: React.CSSProperties = { width: "100%", border: "1.5px solid var(--line-strong)", borderRadius: 999, padding: "12px 16px", fontSize: 14, background: "var(--surface)", color: "var(--ink)" };
const area: React.CSSProperties = { ...fld, borderRadius: 14, resize: "vertical" };
const lab: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", margin: "0 0 6px" };
const F = ({ l, req, children }: { l: string; req?: boolean; children: React.ReactNode }) => <label style={{ display: "block", marginBottom: 12 }}><span style={lab}>{l}{req && " *"}</span>{children}</label>;
const two: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };

export function TechRegistration({ db, techId, asAdmin, who, flash }: { db: Db; techId: string; asAdmin: boolean; who: string; flash: (m: string) => void }) {
  const tech = db.techs.find((t) => t.id === techId)!;
  const [p, setP] = useState<TechProfile>(() => structuredClone(profileOf(db, techId)));
  const [sec, setSec] = useState<Section>("Personal");
  const [err, setErr] = useState<string | null>(null);
  const live = profileOf(db, techId);
  const c = completion(live);
  const set = <K extends keyof TechProfile>(k: K, v: Partial<TechProfile[K]>) => setP((x) => ({ ...x, [k]: typeof x[k] === "object" && x[k] !== null ? { ...(x[k] as object), ...v } : v }));
  const setDoc = (k: DocKey, v: Partial<TechProfile["docs"][DocKey]>) => setP((x) => ({ ...x, docs: { ...x.docs, [k]: { ...x.docs[k], ...v } } }));
  const save = () => { const e = profileProblems(p)[0] ?? saveTechProfile(techId, p, who, asAdmin); setErr(e ?? null); if (!e) flash(asAdmin ? "Profile saved" : "Saved — the office will verify your documents"); };
  const photo = async (fl: FileList | null, onDone: (u: string) => void) => { const f0 = fl?.[0]; if (f0) onDone(await shrinkPhoto(f0, 640)); };
  const sections: Section[] = asAdmin ? [...SECTIONS.slice(0, 5), "Role", "Preview"] : [...SECTIONS];

  return (
    <div>
      {/* header */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
        <div style={{ width: 70, height: 70, borderRadius: 35, background: "var(--surface-dim)", overflow: "hidden", display: "grid", placeItems: "center", fontSize: 28, flexShrink: 0, border: "2px solid var(--gold)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.photo ? <img src={p.photo} alt={tech.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "👤"}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>{tech.name}</p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{p.designation} · {p.empId}</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 700, color: c.pct === 100 ? "var(--success-text)" : "var(--gold-dark)" }}>Profile {c.pct}% complete · {c.verified}/6 documents verified</p>
        </div>
      </div>

      {/* role & responsibilities (read-only for technician) */}
      {!asAdmin && (
        <div style={{ border: "1.5px solid var(--gold)", borderRadius: 14, padding: 12, marginBottom: 12, background: "var(--gold-tint)" }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: ".06em", color: "var(--gold-dark)" }}>MY JOB ROLE & RESPONSIBILITIES</p>
          {live.role ? <>
            <p style={{ margin: "4px 0 6px", fontSize: 15, fontWeight: 800 }}>{live.role.title}</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>{live.role.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink-mute)" }}>Set by {live.role.setBy}</p>
          </> : <p style={{ margin: "4px 0 0", fontSize: 13 }}>The office will set your role and responsibilities.</p>}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {sections.map((s) => <button key={s} type="button" onClick={() => setSec(s)} aria-pressed={sec === s} style={{ borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: sec === s ? "1.5px solid #111" : "1.5px solid var(--line-strong)", background: sec === s ? "#111" : "var(--surface)", color: sec === s ? "#fff" : "var(--ink)" }}>{s}</button>)}
      </div>

      {sec === "Personal" && <>
        <label style={{ display: "block", textAlign: "center", padding: 16, borderRadius: 16, background: "var(--surface-dim)", cursor: "pointer", marginBottom: 12 }}>
          <span style={{ fontSize: 26 }}>📷</span><p style={{ margin: "4px 0 0", fontWeight: 800 }}>Technician profile photo</p><p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Take photo / upload from gallery</p>
          <input type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={(e) => photo(e.target.files, (u) => { setP((x) => ({ ...x, photo: u, docs: { ...x.docs, photo: { ...x.docs.photo, file: u } } })); })} />
        </label>
        <F l="Employee ID" req><input value={p.empId} disabled={!asAdmin} onChange={(e) => setP({ ...p, empId: e.target.value })} style={fld} /></F>
        <F l="Full name"><input value={tech.name} disabled style={fld} /></F>
        <F l="Designation"><select value={p.designation} disabled={!asAdmin} onChange={(e) => setP({ ...p, designation: e.target.value })} style={fld}>{DESIGNATIONS.map((d) => <option key={d}>{d}</option>)}</select></F>
        <div style={two}>
          <F l="Mobile number"><input value={tech.phone} disabled style={fld} /></F>
          <F l="Alternate mobile"><input inputMode="tel" value={p.personal.altPhone} onChange={(e) => set("personal", { altPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })} style={fld} /></F>
        </div>
        <div style={two}>
          <F l="Date of birth"><input type="date" value={p.personal.dob} onChange={(e) => set("personal", { dob: e.target.value })} style={fld} /></F>
          <F l="Blood group"><select value={p.personal.bloodGroup} onChange={(e) => set("personal", { bloodGroup: e.target.value })} style={fld}><option value="">Select</option>{BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}</select></F>
        </div>
        <F l="Residential address"><textarea rows={2} value={p.personal.address} onChange={(e) => set("personal", { address: e.target.value })} placeholder="Door no., street, area, city, PIN code" style={area} /></F>
      </>}

      {sec === "Family" && <>
        <div style={two}>
          <F l="Father's name"><input value={p.family.fatherName} onChange={(e) => set("family", { fatherName: e.target.value })} style={fld} /></F>
          <F l="Mother's name"><input value={p.family.motherName} onChange={(e) => set("family", { motherName: e.target.value })} style={fld} /></F>
        </div>
        <F l="Spouse name (if married)"><input value={p.family.spouseName} onChange={(e) => set("family", { spouseName: e.target.value })} style={fld} /></F>
        <p style={{ ...lab, marginTop: 6 }}>Emergency contact</p>
        <div style={two}>
          <F l="Name"><input value={p.family.emergencyName} onChange={(e) => set("family", { emergencyName: e.target.value })} style={fld} /></F>
          <F l="Relation"><input value={p.family.emergencyRelation} onChange={(e) => set("family", { emergencyRelation: e.target.value })} placeholder="Father / wife / brother" style={fld} /></F>
        </div>
        <F l="Emergency mobile"><input inputMode="tel" value={p.family.emergencyPhone} onChange={(e) => set("family", { emergencyPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })} style={fld} /></F>
      </>}

      {sec === "Documents" && <>
        <DocGrid p={live} />
        {DOC_KEYS.filter((k) => k !== "photo").map((k) => (
          <div key={k} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <b>{DOC_LABEL[k]}</b><span style={{ fontSize: 12.5, fontWeight: 700, color: DOC_COLOR[live.docs[k].status] }}>{DOC_ICON[live.docs[k].status]} {live.docs[k].status}</span>
            </div>
            {k !== "bankProof" && <input value={p.docs[k].number} onChange={(e) => setDoc(k, { number: k === "aadhaar" ? e.target.value.replace(/\D/g, "").slice(0, 12) : e.target.value.toUpperCase() })} placeholder={k === "aadhaar" ? "Aadhaar number (only last 4 digits are saved)" : k === "pan" ? "ABCDE1234F" : k === "licence" ? "DL number" : "Certificate no."} style={{ ...fld, marginBottom: 8 }} />}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.docs[k].file && <img src={p.docs[k].file!} alt={DOC_LABEL[k]} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} />}
              <label style={{ border: "1.5px dashed var(--line-strong)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>📷 {p.docs[k].file ? "Replace photo" : "Upload photo"}<input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => photo(e.target.files, (u) => setDoc(k, { file: u }))} /></label>
            </div>
            {live.docs[k].note && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--error-text)" }}>Office: {live.docs[k].note}</p>}
            {asAdmin && <AdminVerify techId={techId} k={k} who={who} flash={flash} />}
          </div>
        ))}
        {asAdmin && <div style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12, marginBottom: 10 }}><b>Photo</b><AdminVerify techId={techId} k="photo" who={who} flash={flash} /></div>}
      </>}

      {sec === "Bank & GPay" && <>
        <F l="Account holder name"><input value={p.bank.holder} onChange={(e) => set("bank", { holder: e.target.value })} style={fld} /></F>
        <div style={two}>
          <F l="Bank name"><input value={p.bank.bankName} onChange={(e) => set("bank", { bankName: e.target.value })} style={fld} /></F>
          <F l="IFSC"><input value={p.bank.ifsc} onChange={(e) => set("bank", { ifsc: e.target.value.toUpperCase().slice(0, 11) })} placeholder="SBIN0001234" style={fld} /></F>
        </div>
        <F l="Account number"><input inputMode="numeric" value={p.bank.account} onChange={(e) => set("bank", { account: e.target.value.replace(/\D/g, "").slice(0, 18) })} style={fld} /></F>
        <div style={two}>
          <F l="GPay number"><input inputMode="tel" value={p.bank.gpay} onChange={(e) => set("bank", { gpay: e.target.value.replace(/\D/g, "").slice(0, 10) })} style={fld} /></F>
          <F l="UPI ID"><input value={p.bank.upi} onChange={(e) => set("bank", { upi: e.target.value.trim() })} placeholder="name@okhdfc" style={fld} /></F>
        </div>
        <div style={{ marginBottom: 12 }}><span style={lab}>GPay / PhonePe QR scanner photo</span>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {p.bank.qr
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.bank.qr} alt="My payment QR code" style={{ width: 120, height: 120, objectFit: "contain", borderRadius: 12, border: "1px solid var(--line)", background: "#fff" }} />
              : <div aria-hidden style={{ width: 120, height: 120, borderRadius: 12, border: "1.5px dashed var(--line-strong)", display: "grid", placeItems: "center", fontSize: 34, color: "var(--ink-mute)" }}>▦</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="press" style={{ border: "1.5px solid #111", borderRadius: 999, padding: "9px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "center" }}>
                📷 {p.bank.qr ? "Change QR photo" : "Upload QR photo"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => photo(e.target.files, (u) => set("bank", { qr: u }))} />
              </label>
              {p.bank.qr && <button type="button" onClick={() => set("bank", { qr: null })} style={{ background: "none", border: "none", color: "var(--error-text)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Remove</button>}
            </div>
          </div>
          <span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>Open GPay / PhonePe → your profile → QR code → screenshot, then upload it here. The office uses it to pay salary and incentives.</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 10px" }}>Used for salary, incentives and expense reimbursement. Upload a cancelled cheque / passbook under Documents → Bank Proof.</p>
      </>}

      {sec === "Uniform" && <>
        <div style={two}>
          <F l="T-shirt size"><select value={p.uniform.tshirt} onChange={(e) => set("uniform", { tshirt: e.target.value })} style={fld}>{TSHIRT_SIZES.map((s) => <option key={s}>{s}</option>)}</select></F>
          <F l="Trouser size (waist)"><input inputMode="numeric" value={p.uniform.trouser} onChange={(e) => set("uniform", { trouser: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="32" style={fld} /></F>
        </div>
        <F l="Safety shoe size"><input inputMode="numeric" value={p.uniform.shoes} onChange={(e) => set("uniform", { shoes: e.target.value.replace(/\D/g, "").slice(0, 2) })} style={fld} /></F>
        <p style={lab}>Issued items {asAdmin ? "" : "(updated by the office)"}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {UNIFORM_ITEMS.map((u) => <label key={u} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5 }}><input type="checkbox" disabled={!asAdmin} checked={p.uniform.issued.includes(u)} onChange={(e) => set("uniform", { issued: e.target.checked ? [...p.uniform.issued, u] : p.uniform.issued.filter((x) => x !== u) })} /> {u}</label>)}
        </div>
      </>}

      {sec === "Role" && asAdmin && <RoleEditor techId={techId} live={live} who={who} flash={flash} />}

      {sec === "Preview" && <Preview p={p} name={tech.name} phone={tech.phone} joined={tech.joined} />}

      {err && <p role="alert" style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
      {sec !== "Preview" && sec !== "Role" && <button type="button" onClick={save} className="press" style={{ width: "100%", border: "none", borderRadius: 999, padding: 14, background: "#111", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Save {sec}</button>}
    </div>
  );
}

export function DocGrid({ p }: { p: TechProfile }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12, marginBottom: 12 }}>
      <p style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800 }}>Document verification status</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
        {DOC_KEYS.map((k) => <span key={k} style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: DOC_COLOR[p.docs[k].status] }}>{DOC_ICON[p.docs[k].status]}</span> {DOC_LABEL[k]}</span>)}
      </div>
    </div>
  );
}

function AdminVerify({ techId, k, who, flash }: { techId: string; k: DocKey; who: string; flash: (m: string) => void }) {
  const [note, setNote] = useState("");
  const act = (s: DocStatus) => { const e = setDocStatus(techId, k, s, note, who); flash(e ? `⚠ ${e}` : `${DOC_LABEL[k]} ${s.toLowerCase()}`); if (!e) setNote(""); };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
      <button type="button" onClick={() => act("Verified")} style={{ border: "none", borderRadius: 8, padding: "7px 12px", background: "#15803d", color: "#fff", fontWeight: 700, cursor: "pointer" }}>✓ Verify</button>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason if rejecting" style={{ flex: 1, minWidth: 140, border: "1px solid var(--line-strong)", borderRadius: 8, padding: "7px 10px", fontSize: 13 }} />
      <button type="button" onClick={() => act("Rejected")} style={{ border: "1px solid #fecaca", borderRadius: 8, padding: "7px 12px", background: "#fff", color: "var(--error-text)", fontWeight: 700, cursor: "pointer" }}>Reject</button>
    </div>
  );
}

function RoleEditor({ techId, live, who, flash }: { techId: string; live: TechProfile; who: string; flash: (m: string) => void }) {
  const [title, setTitle] = useState(live.role?.title ?? live.designation);
  const [items, setItems] = useState<string[]>(live.role?.responsibilities ?? RESPONSIBILITY_TEMPLATES[live.designation] ?? []);
  const [add, setAdd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <F l="Job role" req><input list="role-titles" value={title} onChange={(e) => setTitle(e.target.value)} style={fld} /><datalist id="role-titles">{DESIGNATIONS.map((d) => <option key={d} value={d} />)}</datalist></F>
      <p style={lab}>Start from a template</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {Object.keys(RESPONSIBILITY_TEMPLATES).map((t) => <button key={t} type="button" onClick={() => { setTitle(t); setItems([...RESPONSIBILITY_TEMPLATES[t]]); }} style={{ borderRadius: 999, padding: "6px 12px", border: "1px solid var(--line-strong)", background: "#fff", fontSize: 12.5, cursor: "pointer" }}>{t}</button>)}
      </div>
      <p style={lab}>Responsibilities for this technician</p>
      {items.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input value={r} onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} style={{ ...fld, borderRadius: 10, padding: "9px 12px" }} />
          <button type="button" aria-label="Remove" onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ border: "none", background: "none", color: "var(--error-text)", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add a responsibility" style={{ ...fld, borderRadius: 10, padding: "9px 12px" }} />
        <button type="button" onClick={() => { if (add.trim()) { setItems([...items, add.trim()]); setAdd(""); } }} style={{ border: "1px solid var(--line-strong)", borderRadius: 10, padding: "0 14px", background: "#fff", fontWeight: 700, cursor: "pointer" }}>Add</button>
      </div>
      {err && <p role="alert" style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
      <button type="button" onClick={() => { const e = setTechRole(techId, title, items, who); setErr(e); if (!e) flash("Role & responsibilities saved — technician notified"); }} style={{ width: "100%", border: "none", borderRadius: 999, padding: 14, background: "#111", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Save role & responsibilities</button>
      {live.role && <p style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 6 }}>Last set by {live.role.setBy}</p>}
    </div>
  );
}

function Preview({ p, name, phone, joined }: { p: TechProfile; name: string; phone: string; joined: string }) {
  const v = (x: string | undefined | null) => (x && x.trim() ? x : "Not entered");
  const rows: [string, string][] = [
    ["Mobile", phone], ["Date of joining", joined], ["Date of birth", v(p.personal.dob)], ["Blood group", v(p.personal.bloodGroup)], ["Address", v(p.personal.address)],
    ["Father name", v(p.family.fatherName)], ["Emergency contact", p.family.emergencyPhone ? `${p.family.emergencyName} (${p.family.emergencyRelation}) ${p.family.emergencyPhone}` : "Not entered"],
    ["Aadhaar last 4", v(p.docs.aadhaar.number.slice(-4))], ["PAN", v(p.docs.pan.number)], ["ITI certificate", v(p.docs.iti.number || (p.docs.iti.file ? "Uploaded" : ""))], ["Driving licence", v(p.docs.licence.number)],
    ["Bank", v(p.bank.bankName)], ["Bank account", p.bank.account ? maskAccount(p.bank.account) : "Not entered"], ["GPay", v(p.bank.gpay)], ["UPI", v(p.bank.upi)], ["Payment QR", p.bank.qr ? "Uploaded" : "Not entered"],
    ["T-shirt size", v(p.uniform.tshirt)], ["Safety shoes", v(p.uniform.shoes)], ["Uniform issued", p.uniform.issued.join(", ") || "None yet"],
  ];
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 14 }}>
      <p style={{ margin: "0 0 2px", fontSize: 17, fontWeight: 800 }}>👤 {name}</p>
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ink-soft)" }}>{p.empId} · {p.designation}</p>
      {p.bank.qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.bank.qr} alt="Payment QR code" style={{ display: "block", width: 140, height: 140, objectFit: "contain", margin: "0 auto 10px", borderRadius: 12, border: "1px solid var(--line)", background: "#fff" }} />
      )}
      {rows.map(([k, val]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--line)", fontSize: 13.5 }}><span style={{ color: "var(--ink-soft)" }}>{k}</span><b style={{ textAlign: "right", color: val === "Not entered" ? "var(--ink-mute)" : undefined }}>{val}</b></div>)}
    </div>
  );
}
