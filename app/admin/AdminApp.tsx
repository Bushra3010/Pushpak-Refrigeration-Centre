"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WorkspaceIcon } from "../components/WorkspaceIcon";
import { BrandMark, Wordmark } from "../components/Brand";
import { ADMIN_DEMO, fmtDate, jobTotals, today } from "../lib/data";
import { useDb } from "../lib/store";
import { BillingSection, QuotationsSection } from "./Billing";
import { Dashboard } from "./Dashboard";
import { GrowthSection } from "./Growth";
import { InventorySection } from "./Inventory";
import { JobsSection, overdue } from "./Jobs";
import { AcAssetsSection, CustomersSection, TechniciansSection } from "./People";
import { ReportsSection } from "./Reports";
import { AuditSection, NotificationsSection, ROLES, SettingsSection, type Role } from "./System";
import { Btn, fieldLabel, input } from "./kit";
import { CalculatorsSection, CostRulesSection } from "./Calculators";
import { ExpensesSection, TimeSheetsSection } from "./Expenses";
import { PayrollSection } from "./Payroll";
import { ProfitSection, TechProfitSection } from "./Profit";
import { RepairsSection } from "./Repairs";
import { PromoSection } from "./Promo";

export type Section = "dashboard" | "jobs" | "customers" | "acs" | "technicians" | "inventory" | "quotations" | "billing" | "growth" | "reports" | "notifications" | "audit" | "settings"
  | "profit" | "techprofit" | "payroll" | "expenses" | "timesheets" | "calculators" | "costrules" | "repairs" | "promo";

const NAV: { group: string; items: { id: Section; label: string; icon: string; roles: Role[] }[] }[] = [
  { group: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "▦", roles: ["Admin", "Service Coordinator", "Accounts"] }] },
  { group: "Service", items: [
    { id: "jobs", label: "Jobs & Dispatch", icon: "🔧", roles: ["Admin", "Service Coordinator", "Accounts"] },
    { id: "customers", label: "Customers", icon: "👥", roles: ["Admin", "Service Coordinator", "Accounts"] },
    { id: "acs", label: "AC Assets", icon: "❄️", roles: ["Admin", "Service Coordinator"] },
    { id: "technicians", label: "Technicians", icon: "🧑‍🔧", roles: ["Admin", "Service Coordinator"] },
    { id: "repairs", label: "Repair Register", icon: "🔌", roles: ["Admin", "Service Coordinator", "Accounts"] },
  ] },
  { group: "Money", items: [
    { id: "quotations", label: "Quotations", icon: "📝", roles: ["Admin", "Service Coordinator", "Accounts"] },
    { id: "billing", label: "Invoices & Payments", icon: "💳", roles: ["Admin", "Accounts", "Service Coordinator"] },
    { id: "inventory", label: "Parts & Inventory", icon: "📦", roles: ["Admin", "Service Coordinator", "Accounts"] },
  ] },
  { group: "Profitability", items: [
    { id: "profit", label: "Profit Dashboard", icon: "💹", roles: ["Admin", "Accounts"] },
    { id: "techprofit", label: "Technician Profit", icon: "🏅", roles: ["Admin", "Accounts"] },
    { id: "payroll", label: "Payroll & Salary", icon: "🧾", roles: ["Admin", "Accounts"] },
    { id: "expenses", label: "Expenses & Claims", icon: "💸", roles: ["Admin", "Accounts", "Service Coordinator"] },
    { id: "timesheets", label: "Time Sheets", icon: "⏱️", roles: ["Admin", "Service Coordinator"] },
    { id: "calculators", label: "Pipe & Tonnage Calc", icon: "📐", roles: ["Admin", "Service Coordinator", "Accounts"] },
  ] },
  { group: "Growth", items: [
    { id: "growth", label: "AMC & Upsell", icon: "📈", roles: ["Admin", "Service Coordinator"] },
    { id: "promo", label: "Spare Parts Promo", icon: "🛒", roles: ["Admin", "Service Coordinator"] },
    { id: "reports", label: "Reports", icon: "📊", roles: ["Admin", "Accounts"] },
  ] },
  { group: "System", items: [
    { id: "notifications", label: "Notifications", icon: "🔔", roles: ["Admin", "Service Coordinator", "Accounts"] },
    { id: "audit", label: "Audit Log", icon: "🛡️", roles: ["Admin"] },
    { id: "settings", label: "Settings & Pricing", icon: "⚙️", roles: ["Admin"] },
    { id: "costrules", label: "Cost & Calc Rules", icon: "🧮", roles: ["Admin"] },
  ] },
];

const TITLES: Record<Section, string> = {
  dashboard: "Dashboard", jobs: "Jobs & Dispatch", customers: "Customers", acs: "AC Assets", technicians: "Technicians",
  inventory: "Parts & Inventory", quotations: "Quotations", billing: "Invoices & Payments", growth: "AMC, Upsell & Reminders",
  reports: "Reports", notifications: "Notifications", audit: "Audit Log", settings: "Settings & Pricing",
  profit: "Profit Dashboard", techprofit: "Technician Profitability", payroll: "Payroll & Salary", expenses: "Expenses & Claims",
  timesheets: "Time Sheets", calculators: "Copper Pipe & Tonnage Calculators", costrules: "Cost & Calculation Rules",
  repairs: "Repair Register — PCB Board · Stabilizer · Indoor Coil",
  promo: "Spare Parts Promo — Explore More at Pushpak",
};

const SESSION_KEY = "prc:admin";
const IDLE_MS = 30 * 60 * 1000; // PRD §15 — session timeout
const readSession = () => { try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; } };
const writeSession = (v: boolean) => { try { if (v) sessionStorage.setItem(SESSION_KEY, "1"); else sessionStorage.removeItem(SESSION_KEY); } catch { /* storage blocked */ } };

export default function AdminApp() {
  const db = useDb();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [role, setRole] = useState<Role>("Admin");
  const [menuOpen, setMenuOpen] = useState(false);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { setAuthed(readSession()); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [section]);

  // Log out after 30 minutes without activity.
  useEffect(() => {
    if (!authed) return;
    let t = setTimeout(() => { writeSession(false); setAuthed(false); }, IDLE_MS);
    const reset = () => { clearTimeout(t); t = setTimeout(() => { writeSession(false); setAuthed(false); }, IDLE_MS); };
    ["mousedown", "keydown", "touchstart"].forEach((e) => window.addEventListener(e, reset));
    return () => { clearTimeout(t); ["mousedown", "keydown", "touchstart"].forEach((e) => window.removeEventListener(e, reset)); };
  }, [authed]);

  const notify = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), msg.startsWith("⚠") ? 5000 : 2400);
  };
  const go = (s: Section) => { setSection(s); setMenuOpen(false); };
  const openJob = (id: string) => { setSection("jobs"); setOpenJobId(id); setMenuOpen(false); };
  const who = role === "Admin" ? "Admin" : role;

  if (authed === null) return null;
  if (!authed) return <AdminLogin onDone={() => { writeSession(true); setAuthed(true); }} />;

  const allowed = (s: Section) => NAV.some((g) => g.items.some((i) => i.id === s && i.roles.includes(role)));
  const current = allowed(section) ? section : "dashboard";
  const badges: Partial<Record<Section, number>> = {
    jobs: db.jobs.filter((j) => j.status === "New Request" || overdue(j)).length,
    quotations: db.jobs.filter((j) => j.status === "Estimate Prepared" && j.quote?.status === "Pending").length,
    billing: db.jobs.filter((j) => j.invoice && jobTotals(j, db.settings).due > 0).length,
    inventory: db.parts.filter((p) => p.stock <= p.minStock).length,
    notifications: db.notifications.filter((n) => n.to === "admin" && !n.read).length,
    customers: db.customers.filter((c) => !c.mergedInto && db.customers.some((o) => o.id !== c.id && !o.mergedInto && o.name.toLowerCase() === c.name.toLowerCase())).length,
    timesheets: db.timeLogs.filter((l) => l.status === "Submitted").length + db.corrections.filter((c) => c.status === "Pending").length,
    expenses: db.expenses.filter((e) => e.status === "Pending").length,
    repairs: (db.repairs ?? []).filter((r) => r.status !== "Repaired" && r.status !== "Returned").length,
    promo: (db.partEnquiries ?? []).filter((e) => e.status === "New").length,
  };

  const sidebar = (
    <aside className={`admin-side no-scroll${menuOpen ? " open" : ""}`} style={{ background: "var(--blue-dark)", color: "white", padding: "18px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 18px" }}>
        <BrandMark size={38} />
        <div><p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Pushpak</p><p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 600, letterSpacing: "0.08em" }}>ADMIN PANEL</p></div>
      </div>
      {NAV.map((g) => {
        const items = g.items.filter((i) => i.roles.includes(role));
        if (!items.length) return null;
        return (
          <div key={g.group} style={{ marginBottom: 14 }}>
            <p style={{ margin: "0 10px 6px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{g.group}</p>
            {items.map((it) => {
              const on = current === it.id;
              const n = badges[it.id];
              return (
                <button key={it.id} onClick={() => go(it.id)} aria-current={on ? "page" : undefined} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: on ? "rgba(255,255,255,0.14)" : "transparent", color: on ? "white" : "rgba(255,255,255,0.78)", fontSize: 13.5, fontWeight: on ? 700 : 500, textAlign: "left",
                }}>
                  <span style={{ width: 20, display: "flex", alignItems: "center" }}><WorkspaceIcon name={it.id} /></span>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {n ? <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: "var(--gold)", color: "white", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span> : null}
                </button>
              );
            })}
          </div>
        );
      })}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 12, marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        <Link href="/" target="_blank" style={sideLink}>↗ Customer app</Link>
        <Link href="/technician" target="_blank" style={sideLink}>↗ Technician app</Link>
      </div>
    </aside>
  );

  return (
    <div style={{ background: "var(--app-bg)", minHeight: "100vh" }}>
      <div className="admin-shell">
        {sidebar}
        {menuOpen && <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 140, background: "rgba(15,23,41,0.4)" }} />}

        <div style={{ minWidth: 0 }}>
          <div className="admin-topbar" style={{ alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--blue-dark)", color: "white", position: "sticky", top: 0, zIndex: 100 }}>
            <button onClick={() => setMenuOpen(true)} aria-label="Open menu" style={{ background: "none", border: "none", color: "white", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>☰</button>
            <span style={{ fontWeight: 800 }}>Pushpak Admin</span>
          </div>

          <main className="admin-main">
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-soft)" }}>{new Date().toLocaleDateString("en-IN", { weekday: "long" })}, {fmtDate(today())}</p>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{TITLES[current]}</h1>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-soft)" }}>
                  Role
                  <select value={role} onChange={(e) => setRole(e.target.value as Role)} style={{ ...input, width: "auto", padding: "6px 8px", fontSize: 12.5 }}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{role}</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-mute)" }}>{ADMIN_DEMO.email}</p>
                </div>
                <Btn kind="ghost" small onClick={() => { writeSession(false); setAuthed(false); }}>Log out</Btn>
              </div>
            </header>

            {current === "dashboard" && <Dashboard db={db} go={go} openJob={openJob} />}
            {current === "jobs" && <JobsSection db={db} who={who} openJobId={openJobId} setOpenJobId={setOpenJobId} notify={notify} />}
            {current === "customers" && <CustomersSection db={db} who={who} notify={notify} openJob={openJob} />}
            {current === "acs" && <AcAssetsSection db={db} openJob={openJob} />}
            {current === "technicians" && <TechniciansSection db={db} who={who} notify={notify} />}
            {current === "inventory" && <InventorySection db={db} who={who} notify={notify} />}
            {current === "quotations" && <QuotationsSection db={db} openJob={openJob} />}
            {current === "billing" && <BillingSection db={db} who={who} notify={notify} openJob={openJob} />}
            {current === "growth" && <GrowthSection db={db} who={who} notify={notify} openJob={openJob} />}
            {current === "reports" && <ReportsSection db={db} />}
            {current === "notifications" && <NotificationsSection db={db} openJob={openJob} />}
            {current === "audit" && <AuditSection db={db} />}
            {current === "settings" && <SettingsSection key={JSON.stringify(db.settings)} db={db} who={who} notify={notify} />}
            {current === "profit" && <ProfitSection db={db} openJob={openJob} />}
            {current === "techprofit" && <TechProfitSection db={db} />}
            {current === "payroll" && <PayrollSection db={db} who={who} notify={notify} />}
            {current === "expenses" && <ExpensesSection db={db} who={who} notify={notify} />}
            {current === "timesheets" && <TimeSheetsSection db={db} who={who} notify={notify} />}
            {current === "calculators" && <CalculatorsSection db={db} who={who} notify={notify} />}
            {current === "promo" && <PromoSection db={db} who={who} notify={notify} />}
            {current === "repairs" && <RepairsSection db={db} who={who} notify={notify} />}
            {current === "costrules" && <CostRulesSection key={JSON.stringify(db.fin)} db={db} who={who} notify={notify} />}

            <p style={{ margin: "28px 0 0", textAlign: "center", fontSize: 11.5, color: "var(--ink-mute)" }}>Pushpak workspace · Demo data shared across apps in this browser</p>
          </main>
        </div>
      </div>

      {toast && (
        <div className="fade-up" role="status" style={{
          position: "fixed", right: 20, bottom: 20, left: "auto", zIndex: 300, maxWidth: "calc(100vw - 40px)",
          background: toast.startsWith("⚠") ? "var(--error-text)" : "var(--ink)", color: "white", borderRadius: 12, padding: "12px 16px", fontSize: 13.5, fontWeight: 500, boxShadow: "var(--shadow-xl)",
        }}>{toast.startsWith("⚠") ? toast : `✓ ${toast}`}</div>
      )}
    </div>
  );
}

const sideLink: React.CSSProperties = { color: "rgba(255,255,255,0.7)", fontSize: 12.5, fontWeight: 600, textDecoration: "none", padding: "6px 10px" };

function AdminLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim().toLowerCase() === ADMIN_DEMO.email && pw === ADMIN_DEMO.password) onDone();
    else setErr(true);
  };
  return (
    <div className="admin-login" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "linear-gradient(150deg,var(--blue-dark),var(--blue))" }}>
      <form onSubmit={submit} className="fade-up" style={{ width: "100%", maxWidth: 380, background: "var(--surface)", borderRadius: 20, padding: 26, boxShadow: "0 20px 50px rgba(4,36,107,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><BrandMark size={46} /><Wordmark /></div>
        <h1 style={{ margin: "20px 0 2px", fontSize: 22, fontWeight: 800 }}>Admin panel</h1>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--ink-soft)" }}>Manage customers, jobs, technicians, billing and reports.</p>
        <label><span style={fieldLabel}>Email</span><input type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setErr(false); }} style={input} /></label>
        <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Password</span><input type="password" autoComplete="current-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(false); }} style={input} /></label>
        {err && <p role="alert" style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--error-text)", fontWeight: 600 }}>Wrong email or password.</p>}
        <button type="submit" disabled={!email || !pw} className="press" style={{
          width: "100%", marginTop: 18, border: "none", borderRadius: 12, padding: 12, fontSize: 14.5, fontWeight: 700, cursor: email && pw ? "pointer" : "not-allowed",
          background: email && pw ? "var(--blue)" : "var(--line-strong)", color: email && pw ? "white" : "var(--ink-mute)",
        }}>Sign in</button>
        <button type="button" onClick={() => { setEmail(ADMIN_DEMO.email); setPw(ADMIN_DEMO.password); onDone(); }} className="press" style={{
          width: "100%", marginTop: 10, border: "1.5px solid var(--gold)", borderRadius: 12, padding: 11, fontSize: 14, fontWeight: 700, cursor: "pointer", background: "var(--gold-tint)", color: "var(--gold-dark)",
        }}>Use demo login</button>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--ink-mute)", lineHeight: 1.6, textAlign: "center" }}>
          Demo login: <b>{ADMIN_DEMO.email}</b> / <b>{ADMIN_DEMO.password}</b>
        </p>
      </form>
    </div>
  );
}
