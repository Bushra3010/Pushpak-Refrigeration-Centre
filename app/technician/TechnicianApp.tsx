"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneShell, PillNav, Toast } from "../components/ui";
import { markRead, requestStock, updateTech, useDb } from "../lib/store";
import { JobDetailPage } from "./JobDetail";
import { Dashboard, NotificationSheet, ProfileScreen, SearchScreen, StockScreen, TechLogin } from "./TechScreens";
import { CalculatorsHub, parseRoute, routeOf } from "./calc/Hub";

const SESSION_KEY = "prc:tech";
type Tab = "jobs" | "search" | "calc" | "stock" | "profile";

const readSession = () => { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } };
const writeSession = (id: string | null) => { try { if (id) localStorage.setItem(SESSION_KEY, id); else localStorage.removeItem(SESSION_KEY); } catch { /* storage blocked */ } };

export default function TechnicianApp() {
  const db = useDb();
  const [techId, setTechId] = useState<string | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("jobs");
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [calcTool, setCalcTool] = useState<string | null>(null);
  const [bell, setBell] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { setTechId(readSession()); }, []);
  // Calculators live at /technician#calculators and /technician#calculators/<id>, so they can be linked and the back button works.
  useEffect(() => {
    const sync = () => { const r = parseRoute(window.location.hash); if (r.hub) { setTab("calc"); setCalcTool(r.tool); setOpenJob(null); } else setCalcTool(null); };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [tab, openJob, calcTool]);
  const goTab = (t: Tab) => {
    setTab(t);
    if (t === "calc") window.location.hash = routeOf(null);
    else if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  };
  const openCalc = (id: string | null) => { window.location.hash = routeOf(id); };

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  if (techId === undefined) return <PhoneShell role="technician">{null}</PhoneShell>;
  const tech = db.techs.find((t) => t.id === techId && t.active);
  if (!tech) {
    return (
      <PhoneShell role="technician">
        <TechLogin db={db} onDone={(id) => { writeSession(id); setTechId(id); }} />
      </PhoneShell>
    );
  }

  const inbox = db.notifications.filter((n) => n.to === `tech:${tech.id}`);
  const unread = inbox.filter((n) => !n.read).length;
  // Technicians only see jobs assigned to them (PRD §15).
  const job = openJob ? db.jobs.find((j) => j.id === openJob && (j.techId === tech.id || (j.helpers ?? []).includes(tech.id))) : undefined;
  const showNav = !job;
  const logout = () => { writeSession(null); setTechId(null); goTab("jobs"); setOpenJob(null); };

  return (
    <PhoneShell role="technician">
      <div ref={scrollRef} className="no-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", paddingBottom: showNav ? "calc(76px + env(safe-area-inset-bottom))" : undefined }}>
        {job ? (
          <JobDetailPage key={job.id} db={db} job={job} tech={tech} onBack={() => setOpenJob(null)} flash={flash} />
        ) : (
          <>
            {tab === "jobs" && (
              <Dashboard db={db} tech={tech} unread={unread} onOpen={setOpenJob} onBell={() => setBell(true)}
                onSearch={() => goTab("search")} onStock={() => goTab("stock")} onCalc={(id) => { setTab("calc"); openCalc(id ?? null); }}
                onToggleDuty={(on) => { updateTech(tech.id, { availability: on ? "Available" : "Off Duty" }, tech.name); flash(on ? "You're on duty" : "You're off duty"); }} />
            )}
            {tab === "search" && <SearchScreen db={db} tech={tech} onOpenJob={setOpenJob} />}
            {tab === "calc" && <CalculatorsHub db={db} tech={tech} tool={calcTool} onOpen={openCalc} flash={flash} />}
            {tab === "stock" && <StockScreen db={db} tech={tech} onRequest={(items) => { requestStock(tech.id, items); flash("Stock request sent to office"); }} />}
            {tab === "profile" && <ProfileScreen db={db} tech={tech} onLogout={logout} flash={flash} />}
          </>
        )}
      </div>

      {showNav && (
        <PillNav<Tab> active={tab} onChange={goTab} tabs={[
          { id: "jobs", label: "Jobs", icon: (c) => <svg width="21" height="21" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2.5" fill={c} /><path d="M9 3.5v3M15 3.5v3" stroke={c} strokeWidth="2" strokeLinecap="round" /><path d="M8.5 13l2.3 2.3 4.7-4.7" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>, dot: db.jobs.filter((j) => j.techId === tech.id && j.status === "Assigned").length },
          { id: "search", label: "Customers", icon: (c) => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.6-4.6" /></svg> },
          { id: "calc", label: "Calculators", icon: (c) => <svg width="21" height="21" viewBox="0 0 24 24"><rect x="4.5" y="3" width="15" height="18" rx="2.5" fill={c} /><rect x="7" y="5.5" width="10" height="4" rx="1" fill="white" /><g fill="white"><circle cx="8.7" cy="13" r="1.1" /><circle cx="12" cy="13" r="1.1" /><circle cx="15.3" cy="13" r="1.1" /><circle cx="8.7" cy="16.8" r="1.1" /><circle cx="12" cy="16.8" r="1.1" /><circle cx="15.3" cy="16.8" r="1.1" /></g></svg> },
          { id: "stock", label: "Stock", icon: (c) => <svg width="21" height="21" viewBox="0 0 24 24"><path d="M3.5 8L12 3.5 20.5 8v8.5L12 21l-8.5-4.5z" fill={c} /><path d="M3.8 8.2L12 12.5l8.2-4.3M12 12.5V21" stroke="white" strokeWidth="1.6" fill="none" /></svg> },
          { id: "profile", label: "Profile", icon: (c) => <svg width="21" height="21" viewBox="0 0 24 24" fill={c}><circle cx="12" cy="7.8" r="4.3" /><path d="M3.8 20.2a8.2 8.2 0 0 1 16.4 0 1 1 0 0 1-1 1H4.8a1 1 0 0 1-1-1z" /></svg> },
        ]} />
      )}

      {bell && (
        <NotificationSheet items={inbox} onClose={() => { setBell(false); markRead(`tech:${tech.id}`); }}
          onOpen={(n) => { markRead(`tech:${tech.id}`, n.id); setBell(false); if (n.jobId && db.jobs.some((j) => j.id === n.jobId && (j.techId === tech.id || (j.helpers ?? []).includes(tech.id)))) setOpenJob(n.jobId); }} />
      )}
      <Toast msg={toast} raised={showNav} />
    </PhoneShell>
  );
}
