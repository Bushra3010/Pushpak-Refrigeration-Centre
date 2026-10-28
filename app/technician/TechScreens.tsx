"use client";

import { useMemo, useState } from "react";
import { MyFinance } from "./Timer";
import { PipeCalcSheet } from "./PipeSheet";
import { BrandMark, Wordmark } from "../components/Brand";
import { AlertIcon, ChevronRight, ClockIcon, LogoutIcon, MinusIcon, PinIcon, PlusIcon, SearchIcon, StarIcon } from "../components/icons";
import { AcHistory, AcSpecs, JobPill, PriorityPill, SecureScreen } from "../components/service";
import { AppHeader, Avatar, BottomSheet, Empty, GoldTiles, Hello, PageHeader, Pill, PrimaryButton, SectionHead, Tabs, Toggle, card, field, label, sectionTitle, small } from "../components/ui";
import {
  DEMO_OTP, acLabel, acSummary, fmtDateTime, initials, inr, isDone, isOpen, jobTotals, relDay, today,
  type AppNotification, type Db, type Job, type Technician, siteOf,
} from "../lib/data";

/* ───────────────────────── Login ───────────────────────── */

export function TechLogin({ db, onDone }: { db: Db; onDone: (techId: string) => void }) {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const send = () => {
    const t = db.techs.find((x) => x.phone === phone);
    if (!t) { setErr("This number isn't registered as a Pushpak technician"); return; }
    if (!t.active) { setErr("Your account is deactivated. Contact the office."); return; }
    setErr(null); setSent(true);
  };
  const verify = () => {
    if (code !== DEMO_OTP) { setErr("Incorrect OTP"); return; }
    onDone(db.techs.find((x) => x.phone === phone)!.id);
  };

  return (
    <div className="fade-up" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 20px", overflowY: "auto" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><BrandMark size={50} /><Wordmark /></div>
        <span style={{ alignSelf: "flex-start", marginTop: 18, background: "var(--gold)", color: "white", fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 8, letterSpacing: "0.05em" }}>TECHNICIAN APP</span>
        <h1 style={{ margin: "12px 0 4px", fontSize: 26, fontWeight: 800 }}>Technician login</h1>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-soft)" }}>Your jobs, customer history, parts and payments.</p>
        <div style={{ marginTop: 26 }}>
          <label style={label} htmlFor="t-phone">Registered mobile number</label>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ ...field, width: "auto", display: "flex", alignItems: "center", color: "var(--ink-soft)" }}>+91</span>
            <input id="t-phone" inputMode="numeric" autoComplete="tel-national" value={phone} disabled={sent}
              onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setErr(null); }} style={{ ...field, flex: 1 }} />
          </div>
          {!sent && <p style={{ margin: "6px 2px 0", fontSize: 11.5, color: "var(--ink-mute)" }}>Demo: {db.techs[0].phone} ({db.techs[0].name})</p>}
          {sent && (
            <div className="fade-up" style={{ marginTop: 16 }}>
              <label style={label} htmlFor="t-otp">OTP sent to +91 {phone}</label>
              <input id="t-otp" inputMode="numeric" autoComplete="one-time-code" value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(null); }}
                style={{ ...field, fontSize: 22, fontWeight: 800, letterSpacing: "0.5em", textAlign: "center" }} />
              <p style={{ margin: "6px 2px 0", fontSize: 11.5, color: "var(--ink-mute)" }}>Demo OTP: {DEMO_OTP}</p>
            </div>
          )}
          {err && <p role="alert" style={{ margin: "8px 2px 0", fontSize: 12.5, color: "var(--error-text)", fontWeight: 600 }}>{err}</p>}
        </div>
      </div>
      <div style={{ padding: "16px 0 calc(24px + env(safe-area-inset-bottom))" }}>
        {sent ? <PrimaryButton disabled={code.length !== 4} onClick={verify}>Verify &amp; Log In</PrimaryButton>
          : <PrimaryButton disabled={phone.length !== 10} onClick={send}>Send OTP</PrimaryButton>}
      </div>
    </div>
  );
}

/* ───────────────────────── Dashboard ───────────────────────── */

type JobTab = "today" | "upcoming" | "done";
const ACTIVE = (j: Job) => isOpen(j) || (j.status === "Invoiced");

export function Dashboard({ db, tech, unread, onOpen, onBell, onToggleDuty, onSearch, onCalc, onStock, onRepairs }: {
  db: Db; tech: Technician; unread: number; onOpen: (id: string) => void; onBell: () => void; onToggleDuty: (on: boolean) => void;
  onSearch?: () => void; onCalc?: (id?: string) => void; onStock?: () => void; onRepairs?: () => void;
}) {
  const [tab, setTab] = useState<JobTab>("today");
  const mine = db.jobs.filter((j) => j.techId === tech.id || (j.helpers ?? []).includes(tech.id));
  const t0 = today();
  const todays = mine.filter((j) => j.date === t0 && j.status !== "Cancelled");
  const pending = mine.filter((j) => ["Assigned", "Accepted"].includes(j.status));
  const progress = mine.filter((j) => ACTIVE(j) && !["Assigned", "Accepted"].includes(j.status));
  const doneToday = mine.filter((j) => isDone(j) && j.timeline.some((e) => e.status === "Invoiced" && e.at.startsWith(t0)));
  const collected = mine.flatMap((j) => j.payments).filter((p) => p.at.startsWith(t0) && !p.refund).reduce((s, p) => s + p.amount, 0);
  const newJobs = mine.filter((j) => j.status === "Assigned");
  const current = mine.find((j) => ["On the Way", "Arrived", "Diagnosis", "Estimate Prepared", "Approved", "Work Started"].includes(j.status));
  const priority = mine.filter((j) => ACTIVE(j) && j.priority !== "Normal");
  const rows = mine.filter((j) => tab === "today" ? j.date <= t0 && ACTIVE(j) : tab === "upcoming" ? j.date > t0 && ACTIVE(j) : !ACTIVE(j))
    .sort((a, b) => (tab === "done" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot)));
  const onDuty = tech.availability !== "Off Duty";

  return (
    <div style={{ paddingBottom: 12, background: "#fff", minHeight: "100%" }}>
      <AppHeader onSearch={onSearch} onBell={onBell} unread={unread} tagline="Technician App" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
        <Hello name={tech.name} sub={`${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} · ${tech.area}`} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: onDuty ? "var(--success-text)" : "var(--ink-mute)" }}>{onDuty ? "ON DUTY" : "OFF"}</span>
          <Toggle on={onDuty} onChange={onToggleDuty} label="On duty" />
        </div>
      </div>

      {onCalc && (
        <GoldTiles tiles={[
          { icon: "📋", label: "New Jobs", onClick: () => document.getElementById("job-list")?.scrollIntoView({ behavior: "smooth" }), count: newJobs.length },
          { icon: "🧮", label: "All Calculators", onClick: () => onCalc() },
          { icon: "％", label: "GST Calculator", onClick: () => onCalc("gst") },
          { icon: "📏", label: "Unit Converter", onClick: () => onCalc("unit-converter") },
          ...(onRepairs ? [{ icon: "🔌", label: "Repair Register", onClick: onRepairs, count: (db.repairs ?? []).filter((r) => r.status !== "Repaired" && r.status !== "Returned").length }] : []),
          ...(onSearch ? [{ icon: "👥", label: "My Customers", onClick: onSearch }] : []),
          ...(onStock ? [{ icon: "📦", label: "Van Stock", onClick: onStock }] : []),
        ]} />
      )}

      <div style={{ padding: "14px 16px 0" }}>
        <div className="shift-summary">
          {[[String(todays.length), "Today"], [String(pending.length), "Pending"], [String(progress.length), "In progress"], [String(doneToday.length), "Completed"]].map(([v, l], i) => (
            <div key={l} style={{ flex: 1, textAlign: "center", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.18)" : "none" }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{v}</p>
              <p style={{ margin: 0, fontSize: 10.5, color: "rgba(255,255,255,0.75)" }}>{l}</p>
            </div>
          ))}
        </div>
        <div style={{ ...card, marginTop: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
          <span style={{ color: "var(--ink-soft)" }}>Collected today</span><b style={{ color: "var(--success-text)" }}>{inr(collected)}</b>
          <span style={{ color: "var(--ink-soft)" }}>Rating</span><b style={{ display: "flex", alignItems: "center", gap: 3 }}><StarIcon s={12} /> {tech.rating}</b>
        </div>

        {newJobs.map((j) => {
          const c = db.customers.find((x) => x.id === j.customerId);
          return (
            <button key={j.id} onClick={() => onOpen(j.id)} className="press fade-up" style={{ ...card, width: "100%", marginTop: 12, padding: 14, border: "2px solid var(--gold)", textAlign: "left", cursor: "pointer", boxShadow: "var(--shadow-card)" }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--gold-dark)", letterSpacing: "0.05em" }}>🔔 NEW JOB ASSIGNED · TAP TO ACCEPT</span>
              <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{c?.name} · {j.complaint.issues.join(", ")}</p>
              <p style={small}>{relDay(j.date)}, {j.slot} · {siteOf(j, c).area}</p>
            </button>
          );
        })}

        {current && (
          <button onClick={() => onOpen(current.id)} className="press" style={{ ...card, width: "100%", marginTop: 12, padding: 14, border: "1.5px solid var(--blue)", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" }}>
            <span className="animate-pulse-dot" style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--blue)", flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--blue)" }}>CURRENT JOB · {current.status.toUpperCase()}</span>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{db.customers.find((c) => c.id === current.customerId)?.name}</span>
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{current.complaint.issues.join(", ")}</span>
            </span>
            <ChevronRight s={16} c="var(--ink-mute)" />
          </button>
        )}

        {priority.length > 0 && (
          <>
            <h3 style={sectionTitle}>Priority jobs</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{priority.map((j) => <JobCard key={j.id} db={db} job={j} onOpen={() => onOpen(j.id)} />)}</div>
          </>
        )}

        <SectionHead title="My Jobs" />
        <div id="job-list">
          <Tabs<JobTab> value={tab} onChange={setTab} tabs={[{ id: "today", label: "Today" }, { id: "upcoming", label: "Upcoming" }, { id: "done", label: "Completed" }]} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {rows.map((j) => <JobCard key={j.id} db={db} job={j} onOpen={() => onOpen(j.id)} />)}
          {rows.length === 0 && <Empty>{tab === "done" ? "No completed jobs yet." : "No jobs here."}</Empty>}
        </div>
      </div>
    </div>
  );
}

export function JobCard({ db, job, onOpen }: { db: Db; job: Job; onOpen: () => void }) {
  const c = db.customers.find((x) => x.id === job.customerId);
  const ac = db.acs.find((x) => x.id === job.acId);
  const repeat = ac ? acSummary(db, ac.id).repeatIssues.some((i) => job.complaint.issues.includes(i as never)) : false;
  return (
    <button onClick={onOpen} className="press" style={{ ...card, border: "none", padding: 14, cursor: "pointer", textAlign: "left", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{c?.name}</span>
        <span style={{ display: "flex", gap: 4 }}><PriorityPill p={job.priority} /><JobPill status={job.status} /></span>
      </div>
      <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>{job.complaint.issues.join(", ")} · {ac ? acLabel(ac) : ""}</p>
      <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--ink-mute)", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <ClockIcon s={12} c="var(--ink-mute)" /> {relDay(job.date)}, {job.slot} · <PinIcon s={12} c="var(--ink-mute)" /> {siteOf(job, c).area}
        {repeat && <span style={{ color: "var(--error-text)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}><AlertIcon s={11} c="var(--error-text)" /> Repeat</span>}
      </p>
    </button>
  );
}

/* ───────────────────────── Customer search (assigned customers only, PRD §15) ───────────────────────── */

export function SearchScreen({ db, tech, onOpenJob }: { db: Db; tech: Technician; onOpenJob: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const ids = useMemo(() => new Set(db.jobs.filter((j) => j.techId === tech.id).map((j) => j.customerId)), [db.jobs, tech.id]);
  const n = q.trim().toLowerCase();
  const list = db.customers.filter((c) => ids.has(c.id) && !c.mergedInto && (!n || `${c.name} ${c.phone} ${c.address}`.toLowerCase().includes(n) || db.acs.some((a) => a.customerId === c.id && `${a.brand} ${a.model} ${a.serial}`.toLowerCase().includes(n))));
  const cust = open ? db.customers.find((c) => c.id === open) : undefined;

  if (cust) {
    const jobs = db.jobs.filter((j) => j.customerId === cust.id && j.techId === tech.id);
    return (
      <SecureScreen>
        <PageHeader title={cust.name} sub={`+91 ${cust.phone} · ${cust.area}`} onBack={() => setOpen(null)} />
        <div style={{ padding: "0 16px" }}>
          {db.acs.filter((a) => a.customerId === cust.id).map((a) => (
            <div key={a.id} style={{ ...card, padding: 14, marginBottom: 12 }}>
              <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>{a.application} · {acLabel(a)}</p>
              <AcSpecs ac={a} />
              <div style={{ height: 1, background: "var(--line)", margin: "12px 0" }} />
              <AcHistory db={db} ac={a} onOpenJob={(id) => jobs.some((j) => j.id === id) && onOpenJob(id)} />
            </div>
          ))}
        </div>
      </SecureScreen>
    );
  }

  return (
    <div>
      <PageHeader title="Customers & ACs" sub="Customers from your assigned jobs" />
      <div style={{ padding: "0 16px" }}>
        <label style={{ ...card, display: "flex", alignItems: "center", gap: 8, padding: "11px 14px" }}>
          <SearchIcon s={18} c="var(--ink-mute)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, mobile, address, AC serial" aria-label="Search customers" style={{ border: "none", outline: "none", flex: 1, fontSize: 14, background: "transparent" }} />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {list.map((c) => (
            <button key={c.id} onClick={() => setOpen(c.id)} className="press" style={{ ...card, padding: 14, border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar initials={initials(c.name)} size={38} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{c.name}</span>
                <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{c.area} · {db.acs.filter((a) => a.customerId === c.id).length} ACs</span>
              </span>
              <ChevronRight s={16} c="var(--ink-mute)" />
            </button>
          ))}
          {list.length === 0 && <Empty>No matching customers in your jobs.</Empty>}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Van stock ───────────────────────── */

export function StockScreen({ db, tech, onRequest }: { db: Db; tech: Technician; onRequest: (items: Record<string, number>) => void }) {
  const [sheet, setSheet] = useState(false);
  const [pipeCalc, setPipeCalc] = useState(false);
  const parts = db.parts.filter((p) => (tech.van[p.id] ?? 0) > 0);
  const used = db.jobs.filter((j) => j.techId === tech.id && isDone(j)).flatMap((j) => j.lines.filter((l) => l.kind === "Part"));
  return (
    <div>
      <PageHeader title="My van stock" right={<button onClick={() => setSheet(true)} style={{ background: "var(--blue)", color: "white", border: "none", borderRadius: 10, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Request stock</button>} />
      <div style={{ padding: "0 16px" }}>
        <button onClick={() => setPipeCalc(true)} className="press" style={{ ...card, width: "100%", padding: 12, marginBottom: 12, border: "none", textAlign: "left", cursor: "pointer", fontSize: 13.5, fontWeight: 700 }}>📐 Copper pipe calculator <span style={{ fontWeight: 500, color: "var(--ink-mute)", fontSize: 12 }}>· weight & customer price</span></button>
        {pipeCalc && <PipeCalcSheet db={db} onClose={() => setPipeCalc(false)} />}
        <div style={{ ...card, padding: "2px 14px" }}>
          {parts.map((p, i) => {
            const n = tech.van[p.id] ?? 0;
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
                <div style={{ flex: 1 }}><p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{p.name}</p><p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-mute)" }}>{p.sku} · {inr(p.price)}/{p.unit}</p></div>
                {n <= 1 && <Pill tone="amber">Low</Pill>}
                <span style={{ fontSize: 15, fontWeight: 800, minWidth: 40, textAlign: "right" }}>{n} <span style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-mute)" }}>{p.unit}</span></span>
              </div>
            );
          })}
          {parts.length === 0 && <Empty>Your van is empty. Request stock from the office.</Empty>}
        </div>
        <h3 style={sectionTitle}>Parts used on your jobs</h3>
        <div style={{ ...card, padding: "2px 14px" }}>
          {Object.entries(used.reduce<Record<string, number>>((m, l) => ({ ...m, [l.name]: (m[l.name] ?? 0) + l.qty }), {})).map(([name, n], i) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: i ? "1px solid var(--line)" : "none", fontSize: 13 }}><span>{name}</span><b>{n}</b></div>
          ))}
          {used.length === 0 && <Empty>No parts used yet.</Empty>}
        </div>
      </div>
      {sheet && <RequestSheet db={db} onClose={() => setSheet(false)} onSend={(items) => { setSheet(false); onRequest(items); }} />}
    </div>
  );
}

function RequestSheet({ db, onClose, onSend }: { db: Db; onClose: () => void; onSend: (i: Record<string, number>) => void }) {
  const [q, setQ] = useState<Record<string, number>>({});
  const total = Object.values(q).reduce((s, n) => s + n, 0);
  const step: React.CSSProperties = { width: 30, height: 30, border: "none", borderRadius: 9, background: "var(--blue-tint)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
  return (
    <BottomSheet title="Request stock from office" onClose={onClose}>
      <div style={{ ...card, padding: "2px 14px" }}>
        {db.parts.map((p, i) => {
          const n = q[p.id] ?? 0;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
              <div style={{ flex: 1 }}><p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{p.name}</p><p style={{ margin: 0, fontSize: 11, color: p.stock ? "var(--ink-mute)" : "var(--error-text)" }}>{p.stock ? `${p.stock} ${p.unit} in warehouse` : "Out of stock"}</p></div>
              <button aria-label={`Less ${p.name}`} disabled={!n} onClick={() => setQ({ ...q, [p.id]: n - 1 })} style={{ ...step, opacity: n ? 1 : 0.4 }}><MinusIcon s={14} c="var(--blue)" /></button>
              <span style={{ minWidth: 18, textAlign: "center", fontWeight: 700 }}>{n}</span>
              <button aria-label={`More ${p.name}`} onClick={() => setQ({ ...q, [p.id]: n + 1 })} style={step}><PlusIcon s={14} c="var(--blue)" /></button>
            </div>
          );
        })}
      </div>
      <PrimaryButton disabled={!total} onClick={() => onSend(q)} style={{ marginTop: 14 }}>Send request ({total} items)</PrimaryButton>
    </BottomSheet>
  );
}

/* ───────────────────────── Profile ───────────────────────── */

export function ProfileScreen({ db, tech, onLogout, flash }: { db: Db; tech: Technician; onLogout: () => void; flash: (m: string) => void }) {
  const mine = db.jobs.filter((j) => j.techId === tech.id);
  const done = mine.filter(isDone);
  const assigned = mine.filter((j) => j.status !== "New Request").length;
  const value = done.reduce((s, j) => s + jobTotals(j, db.settings).total, 0);
  const upsell = done.reduce((s, j) => s + j.lines.filter((l) => l.upsell).reduce((t, l) => t + l.qty * l.price, 0), 0);
  const rated = done.filter((j) => j.rating);
  return (
    <div style={{ paddingBottom: 16 }}>
      <PageHeader title="Profile" />
      <div style={{ padding: "0 16px" }}>
        <div style={{ ...card, padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
          <Avatar initials={initials(tech.name)} size={56} />
          <div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{tech.name}</p>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-soft)" }}>+91 {tech.phone} · ID {tech.id.toUpperCase()}</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-mute)" }}>Area: {tech.area}</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          {[["Jobs completed", String(done.length)], ["Completion rate", assigned ? `${Math.round((done.length / assigned) * 100)}%` : "—"], ["Avg job value", done.length ? inr(value / done.length) : "—"], ["Upsell revenue", inr(upsell)], ["Rating", `${tech.rating} ★ (${rated.length})`], ["Joined", relDay(tech.joined)]].map(([k, v]) => (
            <div key={k} style={{ ...card, padding: 12 }}><p style={{ margin: 0, fontSize: 11, color: "var(--ink-mute)", fontWeight: 600 }}>{k}</p><p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{v}</p></div>
          ))}
        </div>
        <MyFinance db={db} tech={tech} flash={flash} />
        <h3 style={sectionTitle}>Skills</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{tech.skills.map((s) => <Pill key={s} tone="blue">{s}</Pill>)}</div>
        <div style={{ ...card, padding: 12, marginTop: 16, background: "var(--success)", boxShadow: "none" }}>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--success-text)", fontWeight: 600 }}>🔒 Customer, quotation and payment screens are protected — screenshots and screen recording are blocked in the Android app.</p>
        </div>
        <button onClick={onLogout} className="press" style={{ ...card, width: "100%", marginTop: 12, padding: 14, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--error-text)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          <LogoutIcon s={18} c="var(--error-text)" /> Log out
        </button>
      </div>
    </div>
  );
}

export function NotificationSheet({ items, onClose, onOpen }: { items: AppNotification[]; onClose: () => void; onOpen: (n: AppNotification) => void }) {
  return (
    <BottomSheet title="Notifications" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((n) => (
          <button key={n.id} onClick={() => onOpen(n)} style={{ ...card, padding: 12, border: "none", textAlign: "left", cursor: "pointer", background: n.read ? "var(--surface)" : "var(--blue-tint)" }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{n.title}</p>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>{n.body}</p>
            <p style={{ margin: 0, fontSize: 11, color: "var(--ink-mute)" }}>{fmtDateTime(n.at)}</p>
          </button>
        ))}
        {items.length === 0 && <Empty>No notifications.</Empty>}
      </div>
    </BottomSheet>
  );
}
