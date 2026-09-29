"use client";

import { useEffect, useRef, useState } from "react";
import { BookService } from "./customer/Booking";
import { CustomerJobPage, InvoicePage } from "./customer/JobPage";
import { LoginScreen, SignupFlow, SplashScreen } from "./customer/Onboard";
import {
  AcEditPage, AcPage, AcsScreen, AmcPage, BookingsScreen, EditProfilePage, HomeScreen, InfoPage, NotificationsPage, PaymentsPage, ProfileScreen,
  type ProfileKey,
} from "./customer/Screens";
import { PhoneShell, PillNav, Toast } from "./components/ui";
import type { AcDraft } from "./components/service";
import { useDb, addAc, addCustomer, cancelJob, createJob, decideQuote, markRead, rateJob, recordPayment, resetDemo, updateAc, updateCustomer } from "./lib/store";

const SESSION_KEY = "prc:customer";

type Tab = "home" | "acs" | "bookings" | "profile";
type Detail =
  | { k: "book"; acId?: string }
  | { k: "job"; id: string }
  | { k: "invoice"; id: string }
  | { k: "ac"; id: string }
  | { k: "addAc"; thenBook?: boolean }
  | { k: "editAc"; id: string }
  | { k: "editProfile" }
  | { k: "notifications" }
  | { k: "bookings" }
  | { k: "amc" }
  | { k: "payments" }
  | { k: "info"; which: "help" | "about" };

const readSession = () => { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } };
const writeSession = (id: string | null) => { try { if (id) localStorage.setItem(SESSION_KEY, id); else localStorage.removeItem(SESSION_KEY); } catch { /* storage blocked */ } };

export default function CustomerApp() {
  const db = useDb();
  const [stage, setStage] = useState<"boot" | "splash" | "login" | "signup" | "app">("boot");
  const [meId, setMeId] = useState<string | null>(null);
  const [signupPhone, setSignupPhone] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [stack, setStack] = useState<Detail[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Returning customers skip splash + login.
  useEffect(() => {
    const id = readSession();
    if (id) { setMeId(id); setStage("app"); } else setStage("splash");
  }, []);

  const detail = stack[stack.length - 1];
  const detailKey = detail ? JSON.stringify(detail) : tab;
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [detailKey]);

  // Follow a merged record to the surviving one.
  let me = db.customers.find((c) => c.id === meId);
  if (me?.mergedInto) me = db.customers.find((c) => c.id === me!.mergedInto);

  // Stale session (e.g. demo reset removed a signed-up customer).
  useEffect(() => { if (stage === "app" && meId && !db.customers.some((c) => c.id === meId)) { writeSession(null); setStage("login"); } }, [stage, meId, db.customers]);

  const push = (d: Detail) => setStack((s) => [...s, d]);
  const back = () => setStack((s) => s.slice(0, -1));
  const goTab = (t: Tab) => { setStack([]); setTab(t); };
  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const onVerified = (phone: string) => {
    const hit = db.customers.find((c) => c.phone === phone && !c.mergedInto);
    if (hit) { setMeId(hit.id); writeSession(hit.id); setStage("app"); flash(`Welcome back, ${hit.name.split(" ")[0]}!`); }
    else { setSignupPhone(phone); setStage("signup"); }
  };

  if (stage === "boot") return <PhoneShell>{null}</PhoneShell>;
  if (stage !== "app" || !me) {
    return (
      <PhoneShell>
        {stage === "splash" && <SplashScreen onStart={() => setStage("login")} />}
        {(stage === "login" || (stage === "app" && !me)) && <LoginScreen onVerified={onVerified} />}
        {stage === "signup" && (
          <SignupFlow phone={signupPhone} onDone={(p, ac) => {
            const id = addCustomer({ ...p, status: "New" }, "Customer App");
            if (ac) addAc({ ...ac, customerId: id }, "Customer App");
            setMeId(id); writeSession(id); setStage("app"); setTab("home"); setStack([]);
            flash("Account created");
          }} />
        )}
        <Toast msg={toast} />
      </PhoneShell>
    );
  }

  const inbox = db.notifications.filter((n) => n.to === `customer:${me!.id}`);
  const unread = inbox.filter((n) => !n.read).length;
  const job = (id: string) => db.jobs.find((j) => j.id === id);

  const openMenu = (k: ProfileKey) => {
    if (k === "acs") return goTab("acs");
    const map: Record<Exclude<ProfileKey, "acs">, Detail> = {
      edit: { k: "editProfile" }, bookings: { k: "bookings" }, amc: { k: "amc" }, payments: { k: "payments" },
      notifications: { k: "notifications" }, help: { k: "info", which: "help" }, about: { k: "info", which: "about" },
    };
    push(map[k]);
  };

  const saveNewAc = (a: AcDraft, thenBook?: boolean) => {
    const id = addAc({ ...a, customerId: me!.id }, "Customer App");
    flash("AC added");
    // From the booking wizard: restart booking with the new AC selected. Otherwise open the AC.
    setStack((s) => {
      const rest = s.slice(0, -1);
      return thenBook ? [...rest.filter((d) => d.k !== "book"), { k: "book", acId: id }] : [...rest, { k: "ac", id }];
    });
  };

  const logout = () => { writeSession(null); setMeId(null); setStack([]); setTab("home"); setStage("login"); };
  const showNav = !detail;

  return (
    <PhoneShell>
      <div ref={scrollRef} className="no-scroll" style={{
        flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain",
        paddingBottom: showNav ? "calc(76px + env(safe-area-inset-bottom))" : undefined,
      }}>
        {/* ── Detail pages ── */}
        {detail?.k === "book" && (
          <BookService key={detail.acId ?? "new"} db={db} me={me} initialAc={detail.acId} onBack={back} onAddAc={() => push({ k: "addAc", thenBook: true })}
            onSubmit={(j) => { const id = createJob(j, me!.name); setStack([{ k: "job", id }]); flash("Service booked! We'll assign a technician shortly."); }} />
        )}
        {detail?.k === "job" && (() => {
          const j = job(detail.id);
          return j ? (
            <CustomerJobPage key={j.id} db={db} job={j} onBack={back}
              onApprove={() => { decideQuote(j.id, true, "Customer App", me!.name); flash("Approved — technician will start the work"); }}
              onReject={() => { decideQuote(j.id, false, undefined, me!.name); flash("Quotation rejected"); }}
              onPay={(amt, m, ref) => { recordPayment(j.id, amt, m, ref, me!.name); flash("Payment successful — thank you!"); }}
              onRate={(n) => { rateJob(j.id, n); flash("Thanks for your feedback!"); }}
              onCancel={(r) => { cancelJob(j.id, r, me!.name); flash("Request cancelled"); }}
              onInvoice={() => push({ k: "invoice", id: j.id })} />
          ) : null;
        })()}
        {detail?.k === "invoice" && (() => { const j = job(detail.id); return j ? <InvoicePage db={db} job={j} onBack={back} /> : null; })()}
        {detail?.k === "ac" && (() => {
          const ac = db.acs.find((a) => a.id === detail.id);
          return ac ? <AcPage db={db} ac={ac} onBack={back} onBook={() => push({ k: "book", acId: ac.id })} onOpenJob={(id) => push({ k: "job", id })} onEdit={() => push({ k: "editAc", id: ac.id })} /> : null;
        })()}
        {detail?.k === "addAc" && <AcEditPage title="Add AC" onBack={back} onSave={(a) => saveNewAc(a, detail.thenBook)} />}
        {detail?.k === "editAc" && (() => {
          const ac = db.acs.find((a) => a.id === detail.id);
          if (!ac) return null;
          const { id: _id, customerId: _c, ...draft } = ac;
          return <AcEditPage title="Edit AC" initial={draft} onBack={back} onSave={(a) => { updateAc(ac.id, a, me!.name); back(); flash("AC updated"); }} />;
        })()}
        {detail?.k === "editProfile" && <EditProfilePage me={me} onBack={back} onSave={(p) => { updateCustomer(me!.id, p, me!.name); back(); flash("Profile updated"); }} />}
        {detail?.k === "notifications" && (
          <NotificationsPage items={inbox} onBack={back} onReadAll={() => markRead(`customer:${me!.id}`)}
            onOpen={(n) => { markRead(`customer:${me!.id}`, n.id); if (n.jobId) push({ k: "job", id: n.jobId }); }} />
        )}
        {detail?.k === "bookings" && <BookingsScreen db={db} me={me} onBack={back} onOpenJob={(id) => push({ k: "job", id })} />}
        {detail?.k === "amc" && <AmcPage db={db} me={me} onBack={back} onBook={() => push({ k: "book" })} />}
        {detail?.k === "payments" && <PaymentsPage db={db} me={me} onBack={back} onOpenJob={(id) => push({ k: "job", id })} />}
        {detail?.k === "info" && <InfoPage which={detail.which} db={db} onBack={back} />}

        {/* ── Tabs ── */}
        {!detail && tab === "home" && (
          <HomeScreen db={db} me={me} unread={unread} onBook={(acId) => push({ k: "book", acId })} onOpenJob={(id) => push({ k: "job", id })}
            onOpenAc={(id) => push({ k: "ac", id })} onAddAc={() => push({ k: "addAc" })} onNotifications={() => push({ k: "notifications" })}
            onAmc={() => push({ k: "amc" })} onAllJobs={() => goTab("bookings")} />
        )}
        {!detail && tab === "acs" && <AcsScreen db={db} me={me} onOpenAc={(id) => push({ k: "ac", id })} onAddAc={() => push({ k: "addAc" })} />}
        {!detail && tab === "bookings" && <BookingsScreen db={db} me={me} onOpenJob={(id) => push({ k: "job", id })} />}
        {!detail && tab === "profile" && (
          <ProfileScreen db={db} me={me} unread={unread} onMenu={openMenu} onLogout={logout}
            onReset={() => { resetDemo(); logout(); }} />
        )}
      </div>

      {showNav && (
        <PillNav<Tab> active={tab} onChange={goTab} tabs={[
          { id: "home", label: "Home", icon: (c) => <HomeGlyph c={c} /> },
          { id: "acs", label: "My ACs", icon: (c) => <AcGlyph c={c} /> },
          { id: "bookings", label: "Bookings", icon: (c) => <BookingsGlyph c={c} />, dot: db.jobs.filter((j) => j.customerId === me!.id && j.status === "Estimate Prepared" && j.quote?.status === "Pending").length },
          { id: "profile", label: "Profile", icon: (c) => <ProfileGlyph c={c} />, dot: unread > 0 },
        ]} />
      )}
      <Toast msg={toast} raised={showNav} />
    </PhoneShell>
  );
}

/* Solid glyphs — at 21px a filled shape stays legible where a stroke icon muddies. */
const HomeGlyph = ({ c }: { c: string }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill={c}><path d="M3.5 10.6L12 3.5l8.5 7.1V19a1.8 1.8 0 0 1-1.8 1.8h-3.9v-5.6H9.2v5.6H5.3A1.8 1.8 0 0 1 3.5 19z" /></svg>
);
const AcGlyph = ({ c }: { c: string }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill={c}><rect x="2" y="4.5" width="20" height="10" rx="2.6" /><path d="M5.5 11.3h13" stroke="white" strokeWidth="1.6" strokeLinecap="round" /><path d="M8 17.5c0 1.5-1 2-1 3M12 17.5c0 1.5-1 2-1 3M16 17.5c0 1.5-1 2-1 3" stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
);
const BookingsGlyph = ({ c }: { c: string }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill={c}><rect x="3.5" y="5" width="17" height="16" rx="2.6" /><path d="M8 3v4M16 3v4" stroke={c} strokeWidth="2" strokeLinecap="round" /><path d="M8.3 13.5l2.4 2.4 5-5" stroke="white" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const ProfileGlyph = ({ c }: { c: string }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill={c}><circle cx="12" cy="7.8" r="4.3" /><path d="M3.8 20.2a8.2 8.2 0 0 1 16.4 0 1 1 0 0 1-1 1H4.8a1 1 0 0 1-1-1z" /></svg>
);
