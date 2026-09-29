"use client";

import { useState } from "react";
import { BrandMark } from "../components/Brand";
import {
  AcIcon, BellIcon, ChevronRight, ClockIcon, EditIcon, HelpIcon, HistoryIcon, InfoIcon, LogoutIcon, PlusIcon, ReceiptIcon, ShieldIcon, SnowIcon, WrenchIcon,
} from "../components/icons";
import { AcForm, AcHistory, AcSpecs, EMPTY_AC, JobPill, MapMock, type AcDraft } from "../components/service";
import { Avatar, Empty, Footer, PageHeader, Pill, PrimaryButton, Tabs, ViewAll, card, iconBtn, sectionTitle, small } from "../components/ui";
import {
  acLabel, acSummary, daysBetween, fmtDate, fmtDateTime, initials, inr, isOpen, jobTotals, relDay, today,
  type AcUnit, type AppNotification, type Customer, type Db, type Job,
} from "../lib/data";
import { ProfileForm, profileValid, type ProfileDraft } from "./Onboard";

const myJobs = (db: Db, me: Customer) => db.jobs.filter((j) => j.customerId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const serviceDue = (db: Db, ac: AcUnit) => { const s = acSummary(db, ac.id); return !s.lastService || daysBetween(s.lastService, today()) >= db.settings.reminderDays; };

/* ───────────────────────── Home ───────────────────────── */

export function HomeScreen({ db, me, unread, onBook, onOpenJob, onOpenAc, onAddAc, onNotifications, onAmc, onAllJobs }: {
  db: Db; me: Customer; unread: number; onBook: (acId?: string) => void; onOpenJob: (id: string) => void; onOpenAc: (id: string) => void;
  onAddAc: () => void; onNotifications: () => void; onAmc: () => void; onAllJobs: () => void;
}) {
  const jobs = myJobs(db, me);
  const acs = db.acs.filter((a) => a.customerId === me.id);
  const active = jobs.filter((j) => isOpen(j) || (j.invoice && jobTotals(j, db.settings).due > 0));
  const needsApproval = active.filter((j) => j.status === "Estimate Prepared" && j.quote?.status === "Pending");
  const needsPay = active.filter((j) => j.invoice && jobTotals(j, db.settings).due > 0);
  const onTheWay = active.find((j) => j.status === "On the Way");
  const due = acs.filter((a) => serviceDue(db, a) && !active.some((j) => j.acId === a.id));
  const hour = new Date().getHours();

  return (
    <div style={{ paddingBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 16px 12px" }}>
        <BrandMark size={42} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Good {hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"},</p>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{me.name.split(" ")[0]} 👋</p>
        </div>
        <button onClick={onNotifications} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="press" style={{ ...iconBtn, width: 42, height: 42, borderRadius: "50%", background: "var(--surface)", justifyContent: "center", boxShadow: "var(--shadow-card)" }}>
          <BellIcon s={20} c="var(--ink)" />
          {unread > 0 && <span style={{ position: "absolute", top: 6, right: 6, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 10, background: "var(--red)", color: "white", fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid white" }}>{unread}</span>}
        </button>
      </div>

      <div style={{ padding: "0 16px" }}>
        {/* Hero */}
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 22, padding: 18, color: "white", background: "linear-gradient(150deg,var(--blue-dark),var(--blue))", boxShadow: "0 10px 28px rgba(11,92,255,0.28)" }}>
          <div style={{ position: "absolute", right: -18, top: -18, opacity: 0.16 }}><SnowIcon s={130} c="white" w={1.2} /></div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--gold-100)", letterSpacing: "0.05em" }}>AC SERVICE &amp; REPAIR</p>
          <p style={{ margin: "4px 0 2px", fontSize: 20, fontWeight: 800, lineHeight: 1.25, maxWidth: 230 }}>AC not cooling? Book a technician in a minute.</p>
          <p style={{ margin: 0, fontSize: 12.5, color: "rgba(255,255,255,0.78)" }}>Approve the quote before any work starts.</p>
          <button onClick={() => onBook()} className="press" style={{ marginTop: 14, border: "none", borderRadius: 12, padding: "10px 16px", background: "var(--gold)", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 6px 14px rgba(255,138,31,0.4)" }}>Book Service</button>
        </div>

        {/* Things waiting on the customer */}
        {needsApproval.map((j) => (
          <ActionCard key={`a${j.id}`} tone="gold" title="Quotation waiting for your approval" body={`${j.quote?.no} · ${inr(jobTotals(j, db.settings).total)} · ${db.acs.find((a) => a.id === j.acId)?.application} AC`} cta="Review" onClick={() => onOpenJob(j.id)} />
        ))}
        {needsPay.map((j) => (
          <ActionCard key={`p${j.id}`} tone="red" title="Payment due" body={`${j.invoice?.no} · ${inr(jobTotals(j, db.settings).due)} pending`} cta="Pay now" onClick={() => onOpenJob(j.id)} />
        ))}
        {onTheWay && (
          <button onClick={() => onOpenJob(onTheWay.id)} className="press" style={{ ...card, width: "100%", marginTop: 12, padding: 10, border: "none", cursor: "pointer", textAlign: "left" }}>
            <MapMock moving etaMin={18} height={130} />
            <p style={{ margin: "8px 4px 2px", fontSize: 13.5, fontWeight: 700 }}>{db.techs.find((t) => t.id === onTheWay.techId)?.name} is on the way</p>
          </button>
        )}

        {/* Active services */}
        {active.length > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={sectionTitle}>Active services</h3>
              <ViewAll onClick={onAllJobs} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {active.slice(0, 3).map((j) => <JobRow key={j.id} db={db} job={j} onOpen={() => onOpenJob(j.id)} />)}
            </div>
          </>
        )}

        {/* My ACs */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={sectionTitle}>My ACs</h3>
          <button onClick={onAddAc} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--blue)", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, marginTop: 10 }}><PlusIcon s={14} c="var(--blue)" /> Add AC</button>
        </div>
        <div className="no-scroll" style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -16px", padding: "0 16px 4px" }}>
          {acs.map((a) => {
            const s = acSummary(db, a.id);
            return (
              <button key={a.id} onClick={() => onOpenAc(a.id)} className="press" style={{ ...card, flex: "0 0 150px", padding: 12, border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, background: "var(--blue-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}><AcIcon s={20} c="var(--blue)" /></span>
                <p style={{ margin: "8px 0 0", fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{a.application}</p>
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-soft)" }}>{a.brand} · {a.capacity}</p>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: serviceDue(db, a) ? "var(--gold-dark)" : "var(--ink-mute)", fontWeight: 600 }}>{serviceDue(db, a) ? "Service due" : `Serviced ${fmtDate(s.lastService!)}`}</p>
              </button>
            );
          })}
          {acs.length === 0 && <button onClick={onAddAc} style={{ ...card, flex: 1, padding: 16, border: "1.5px dashed var(--line-strong)", boxShadow: "none", background: "transparent", color: "var(--blue)", fontWeight: 700, cursor: "pointer" }}>+ Add your first AC</button>}
        </div>

        {/* Reminder */}
        {due.length > 0 && (
          <ActionCard tone="blue" title={`Service due for ${due.length === 1 ? `your ${due[0].application.toLowerCase()} AC` : `${due.length} ACs`}`}
            body={`Regular cleaning every ${Math.round(db.settings.reminderDays / 30)} months keeps cooling strong and bills low.`} cta="Book" onClick={() => onBook(due[0].id)} />
        )}

        {/* AMC */}
        <button onClick={onAmc} className="press" style={{ ...card, width: "100%", marginTop: 12, padding: 16, border: "none", cursor: "pointer", textAlign: "left", display: "flex", gap: 12, alignItems: "center", background: me.amc ? "var(--success)" : "var(--gold-tint)" }}>
          <ShieldIcon s={30} c={me.amc ? "var(--success-text)" : "var(--gold-dark)"} />
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{me.amc ? `AMC ${me.amc.plan} · active` : "Protect every AC with AMC"}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{me.amc ? `Valid till ${fmtDate(me.amc.to)} · ${me.amc.visitsLeft} visits left` : `3 services a year + priority repairs from ${inr(db.settings.amcBasic)}/AC`}</span>
          </span>
          <ChevronRight s={16} c="var(--ink-mute)" />
        </button>
      </div>
    </div>
  );
}

function ActionCard({ tone, title, body, cta, onClick }: { tone: "gold" | "red" | "blue"; title: string; body: string; cta: string; onClick: () => void }) {
  const c = tone === "gold" ? { bg: "var(--gold-tint)", bd: "var(--gold)", fg: "var(--gold-dark)" } : tone === "red" ? { bg: "var(--error)", bd: "#fca5a5", fg: "var(--error-text)" } : { bg: "var(--info-bg)", bd: "var(--info-border)", fg: "var(--info-text)" };
  return (
    <div className="fade-up" style={{ ...card, marginTop: 12, padding: 14, background: c.bg, border: `1.5px solid ${c.bd}`, boxShadow: "none", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: c.fg }}>{title}</p>
        <p style={{ ...small, marginTop: 1 }}>{body}</p>
      </div>
      <button onClick={onClick} className="press" style={{ border: "none", borderRadius: 10, padding: "8px 14px", background: c.fg, color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{cta}</button>
    </div>
  );
}

export function JobRow({ db, job, onOpen }: { db: Db; job: Job; onOpen: () => void }) {
  const ac = db.acs.find((a) => a.id === job.acId);
  const tech = db.techs.find((t) => t.id === job.techId);
  return (
    <button onClick={onOpen} className="press" style={{ ...card, border: "none", padding: 14, display: "flex", gap: 12, cursor: "pointer", textAlign: "left", width: "100%" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--blue-tint)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><WrenchIcon s={21} c="var(--blue)" /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.complaint.issues.join(", ")}</span>
          <JobPill status={job.status} />
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-secondary)" }}>{ac ? `${ac.application} · ${acLabel(ac)}` : ""}</p>
        <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--ink-mute)", display: "flex", alignItems: "center", gap: 4 }}>
          <ClockIcon s={12} c="var(--ink-mute)" /> {relDay(job.date)}, {job.slot}{tech ? ` · ${tech.name}` : ""}
        </p>
      </div>
    </button>
  );
}

/* ───────────────────────── Bookings tab ───────────────────────── */

export function BookingsScreen({ db, me, onOpenJob, onBack }: { db: Db; me: Customer; onOpenJob: (id: string) => void; onBack?: () => void }) {
  const [tab, setTab] = useState<"active" | "past">("active");
  const jobs = myJobs(db, me);
  const rows = jobs.filter((j) => (tab === "active" ? isOpen(j) || (j.invoice && jobTotals(j, db.settings).due > 0) : !isOpen(j) && !(j.invoice && jobTotals(j, db.settings).due > 0)));
  return (
    <div>
      <PageHeader title="My Bookings" onBack={onBack} />
      <div style={{ padding: "0 16px" }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ id: "active", label: "Active" }, { id: "past", label: "Service history" }]} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {rows.map((j) => <JobRow key={j.id} db={db} job={j} onOpen={() => onOpenJob(j.id)} />)}
          {rows.length === 0 && <Empty>{tab === "active" ? "No active bookings. Your ACs are happy!" : "No past services yet."}</Empty>}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── ACs ───────────────────────── */

export function AcsScreen({ db, me, onOpenAc, onAddAc }: { db: Db; me: Customer; onOpenAc: (id: string) => void; onAddAc: () => void }) {
  const acs = db.acs.filter((a) => a.customerId === me.id);
  return (
    <div>
      <PageHeader title="My ACs" right={<button onClick={onAddAc} style={{ background: "var(--blue)", color: "white", border: "none", borderRadius: 10, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>+ Add AC</button>} />
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {acs.map((a) => {
          const s = acSummary(db, a.id);
          return (
            <button key={a.id} onClick={() => onOpenAc(a.id)} className="press" style={{ ...card, border: "none", padding: 14, cursor: "pointer", textAlign: "left", width: "100%" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: "var(--blue-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}><AcIcon s={24} c="var(--blue)" /></span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>{a.application} AC</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>{acLabel(a)} · {a.inverter ? "Inverter" : "Non-inverter"} · {a.ageYears} yr old</p>
                </div>
                {serviceDue(db, a) ? <Pill tone="orange">Service due</Pill> : <Pill tone="green">Healthy</Pill>}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11.5, color: "var(--ink-soft)" }}>
                <span><b style={{ color: "var(--ink)" }}>{s.visits}</b> visits</span>
                <span><b style={{ color: "var(--ink)" }}>{inr(s.spend)}</b> spent</span>
                <span>Last: <b style={{ color: "var(--ink)" }}>{s.lastService ? fmtDate(s.lastService) : "—"}</b></span>
              </div>
            </button>
          );
        })}
        {acs.length === 0 && <Empty>No ACs yet. Add one to book service and keep its history.</Empty>}
      </div>
    </div>
  );
}

export function AcPage({ db, ac, onBack, onBook, onOpenJob, onEdit }: { db: Db; ac: AcUnit; onBack: () => void; onBook: () => void; onOpenJob: (id: string) => void; onEdit: () => void }) {
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title={`${ac.application} AC`} sub={acLabel(ac)} onBack={onBack} right={<button onClick={onEdit} aria-label="Edit AC" style={iconBtn}><EditIcon s={20} c="var(--ink)" /></button>} />
      <div style={{ padding: "0 16px", flex: 1 }}>
        <div style={{ ...card, padding: 14 }}><AcSpecs ac={ac} /></div>
        <h3 style={sectionTitle}>Service history</h3>
        <div style={{ ...card, padding: 14 }}><AcHistory db={db} ac={ac} onOpenJob={onOpenJob} /></div>
      </div>
      <Footer><PrimaryButton onClick={onBook}>Book service for this AC</PrimaryButton></Footer>
    </div>
  );
}

export function AcEditPage({ initial, title, onBack, onSave }: { initial?: AcDraft; title: string; onBack: () => void; onSave: (a: AcDraft) => void }) {
  const [ac, setAc] = useState<AcDraft>(initial ?? EMPTY_AC);
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title={title} onBack={onBack} />
      <div style={{ padding: "0 16px", flex: 1 }}><AcForm value={ac} onChange={setAc} /></div>
      <Footer><PrimaryButton disabled={!ac.brand} onClick={() => onSave(ac)}>Save AC</PrimaryButton></Footer>
    </div>
  );
}

/* ───────────────────────── Profile & account ───────────────────────── */

export type ProfileKey = "edit" | "acs" | "bookings" | "amc" | "payments" | "notifications" | "help" | "about";

export function ProfileScreen({ db, me, unread, onMenu, onLogout, onReset }: { db: Db; me: Customer; unread: number; onMenu: (k: ProfileKey) => void; onLogout: () => void; onReset: () => void }) {
  const jobs = myJobs(db, me);
  const spend = jobs.reduce((t, j) => t + jobTotals(j, db.settings).paid, 0);
  const items: { k: ProfileKey; label: string; Icon: typeof EditIcon; badge?: number }[] = [
    { k: "edit", label: "Edit profile & address", Icon: EditIcon },
    { k: "acs", label: "My ACs", Icon: AcIcon },
    { k: "bookings", label: "Service history", Icon: HistoryIcon },
    { k: "amc", label: "AMC plan", Icon: ShieldIcon },
    { k: "payments", label: "Payments & invoices", Icon: ReceiptIcon },
    { k: "notifications", label: "Notifications", Icon: BellIcon, badge: unread },
    { k: "help", label: "Help & support", Icon: HelpIcon },
    { k: "about", label: "About Pushpak", Icon: InfoIcon },
  ];
  return (
    <div style={{ paddingBottom: 16 }}>
      <PageHeader title="Profile" />
      <div style={{ padding: "0 16px" }}>
        <div style={{ ...card, padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
          <Avatar initials={initials(me.name)} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{me.name}</p>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-soft)" }}>+91 {me.phone} · {me.type}</p>
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.address}</p>
          </div>
        </div>
        <div style={{ ...card, marginTop: 12, padding: 14, display: "flex" }}>
          {[[String(db.acs.filter((a) => a.customerId === me.id).length), "ACs"], [String(jobs.filter((j) => j.status === "Closed" || j.status === "Invoiced").length), "Services"], [inr(spend), "Paid"]].map(([v, l], i) => (
            <div key={l} style={{ flex: 1, textAlign: "center", borderLeft: i ? "1px solid var(--line)" : "none" }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{v}</p><p style={{ margin: 0, fontSize: 11, color: "var(--ink-mute)" }}>{l}</p>
            </div>
          ))}
        </div>
        <div style={{ ...card, marginTop: 12, padding: "2px 14px" }}>
          {items.map((it, i) => (
            <button key={it.k} onClick={() => onMenu(it.k)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 0", background: "none", border: "none", borderTop: i ? "1px solid var(--line)" : "none", cursor: "pointer", textAlign: "left" }}>
              <it.Icon s={20} c="var(--blue)" />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{it.label}</span>
              {!!it.badge && <span style={{ background: "var(--red)", color: "white", fontSize: 10.5, fontWeight: 700, borderRadius: 10, padding: "1px 7px" }}>{it.badge}</span>}
              <ChevronRight s={16} c="var(--ink-mute)" />
            </button>
          ))}
        </div>
        <button onClick={onLogout} className="press" style={{ ...card, width: "100%", marginTop: 12, padding: 14, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--error-text)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          <LogoutIcon s={18} c="var(--error-text)" /> Log out
        </button>
        <button onClick={onReset} style={{ display: "block", margin: "14px auto 0", background: "none", border: "1px dashed var(--line-strong)", borderRadius: 10, padding: "6px 12px", fontSize: 11.5, color: "var(--ink-mute)", cursor: "pointer" }}>Demo: reset all demo data</button>
      </div>
    </div>
  );
}

export function EditProfilePage({ me, onBack, onSave }: { me: Customer; onBack: () => void; onSave: (p: ProfileDraft) => void }) {
  const [p, setP] = useState<ProfileDraft>({ name: me.name, phone: me.phone, altPhone: me.altPhone, address: me.address, area: me.area, gps: me.gps, type: me.type, contactPref: me.contactPref });
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Edit profile" onBack={onBack} />
      <div style={{ padding: "0 16px", flex: 1 }}><ProfileForm value={p} onChange={setP} /></div>
      <Footer><PrimaryButton disabled={!profileValid(p)} onClick={() => onSave(p)}>Save changes</PrimaryButton></Footer>
    </div>
  );
}

export function NotificationsPage({ items, onBack, onOpen, onReadAll }: { items: AppNotification[]; onBack: () => void; onOpen: (n: AppNotification) => void; onReadAll: () => void }) {
  return (
    <div>
      <PageHeader title="Notifications" onBack={onBack} right={items.some((n) => !n.read) && <button onClick={onReadAll} style={{ background: "none", border: "none", color: "var(--blue)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Mark all read</button>} />
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((n) => (
          <button key={n.id} onClick={() => onOpen(n)} className="press" style={{ ...card, padding: 14, border: "none", textAlign: "left", cursor: "pointer", display: "flex", gap: 10, background: n.read ? "var(--surface)" : "var(--blue-tint)" }}>
            {!n.read && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--blue)", marginTop: 6, flexShrink: 0 }} />}
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{n.title}</span>
              <span style={{ display: "block", fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>{n.body}</span>
              <span style={{ fontSize: 11, color: "var(--ink-mute)" }}>{fmtDateTime(n.at)}</span>
            </span>
          </button>
        ))}
        {items.length === 0 && <Empty>You&apos;re all caught up.</Empty>}
      </div>
    </div>
  );
}

export function AmcPage({ db, me, onBack, onBook }: { db: Db; me: Customer; onBack: () => void; onBook: () => void }) {
  const [asked, setAsked] = useState(false);
  const acs = db.acs.filter((a) => a.customerId === me.id);
  const plans = [
    { name: "Basic", price: db.settings.amcBasic, perks: ["3 wet-wash services a year", "Free visit charge", "10% off parts", "Priority booking"] },
    { name: "Comprehensive", price: db.settings.amcComprehensive, perks: ["Everything in Basic", "Gas top-up included once", "Labour free on repairs", "Same-day visit for breakdowns"] },
  ];
  return (
    <div>
      <PageHeader title="AMC plan" onBack={onBack} />
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {me.amc && (
          <div style={{ borderRadius: 20, padding: 18, background: "linear-gradient(150deg,var(--blue-dark),var(--blue))", color: "white", boxShadow: "0 10px 28px rgba(11,92,255,0.28)" }}>
            <span style={{ background: "var(--gold)", color: "white", fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 8 }}>ACTIVE · {me.amc.plan.toUpperCase()}</span>
            <p style={{ margin: "12px 0 2px", fontSize: 17, fontWeight: 700 }}>{acs.length} AC{acs.length === 1 ? "" : "s"} covered</p>
            <p style={{ margin: 0, fontSize: 12.5, color: "rgba(255,255,255,0.78)" }}>{fmtDate(me.amc.from)} → {fmtDate(me.amc.to)} · {me.amc.visitsLeft} visits left</p>
          </div>
        )}
        {plans.map((p) => (
          <div key={p.name} style={{ ...card, padding: 16, border: me.amc?.plan === p.name ? "2px solid var(--blue)" : "2px solid transparent" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{p.name}</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--blue)" }}>{inr(p.price)}<span style={{ fontSize: 11.5, color: "var(--ink-mute)", fontWeight: 500 }}>/AC/yr</span></p>
            </div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8 }}>{p.perks.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ))}
        {asked
          ? <div style={{ ...card, padding: 14, background: "var(--success)", boxShadow: "none" }}><p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--success-text)" }}>Thanks! Our team will call you to activate your AMC.</p></div>
          : <PrimaryButton tone="gold" onClick={() => setAsked(true)}>{me.amc ? "Renew / upgrade — request a call" : "I'm interested — request a call"}</PrimaryButton>}
        <button onClick={onBook} style={{ background: "none", border: "none", color: "var(--blue)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Book a service visit instead</button>
      </div>
    </div>
  );
}

export function PaymentsPage({ db, me, onBack, onOpenJob }: { db: Db; me: Customer; onBack: () => void; onOpenJob: (id: string) => void }) {
  const billed = myJobs(db, me).filter((j) => j.invoice);
  return (
    <div>
      <PageHeader title="Payments & invoices" onBack={onBack} />
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {billed.map((j) => {
          const t = jobTotals(j, db.settings);
          return (
            <button key={j.id} onClick={() => onOpenJob(j.id)} className="press" style={{ ...card, padding: 14, border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{j.invoice!.no}</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>{inr(t.total)}</span>
              </div>
              <p style={{ ...small, marginTop: 2 }}>{fmtDate(j.invoice!.at)} · {j.lines.map((l) => l.name).slice(0, 2).join(", ")}</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 700, color: t.due ? "var(--error-text)" : "var(--success-text)" }}>
                {t.due ? `${inr(t.due)} due` : `Paid · ${j.payments.map((p) => p.method).join(" + ")}`}
              </p>
            </button>
          );
        })}
        {billed.length === 0 && <Empty>No invoices yet.</Empty>}
      </div>
    </div>
  );
}

export function InfoPage({ which, db, onBack }: { which: "help" | "about"; db: Db; onBack: () => void }) {
  const s = db.settings;
  return (
    <div>
      <PageHeader title={which === "help" ? "Help & support" : "About Pushpak"} onBack={onBack} />
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {which === "help" ? (
          <>
            {[["Do I pay before the work starts?", "No. The technician inspects your AC and sends a quotation. Work starts only after you approve it in the app."],
              ["What if more work is needed later?", "You'll get a revised quotation to approve. Nothing extra is charged without your approval."],
              ["How often should my AC be serviced?", `Every ${Math.round(s.reminderDays / 30)} months for regular use, more often for heavy or 24×7 use. We'll remind you.`],
              ["Is there a warranty on repairs?", "30 days on labour; parts carry the manufacturer's warranty."]].map(([q, a]) => (
              <div key={q} style={{ ...card, padding: 14 }}><p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{q}</p><p style={small}>{a}</p></div>
            ))}
            <a href={`tel:${s.phone.replace(/\s/g, "")}`} style={{ ...card, padding: 14, textDecoration: "none", color: "var(--ink)", fontWeight: 700, fontSize: 14, textAlign: "center" }}>Call {s.phone}</a>
          </>
        ) : (
          <div style={{ ...card, padding: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}><BrandMark size={48} /><p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{s.company}</p></div>
            <p style={{ ...small, marginTop: 10 }}>AC and refrigeration service, repair, gas charging, installation and AMC. Every visit is recorded against your AC so the next technician knows exactly what was done before.</p>
            <p style={{ ...small, marginTop: 8 }}>{s.address}<br />{s.phone}</p>
          </div>
        )}
      </div>
    </div>
  );
}
