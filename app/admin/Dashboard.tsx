"use client";

import { JOB_TONE } from "../components/service";
import { acSummary, daysBetween, inr, isDone, isOpen, jobTotals, relDay, today, type Db } from "../lib/data";
import { custName, overdue } from "./Jobs";
import { Badge, Btn, Panel, Stat, Table, muted } from "./kit";
import type { Section } from "./AdminApp";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function Dashboard({ db, go, openJob }: { db: Db; go: (s: Section) => void; openJob: (id: string) => void }) {
  const t0 = today();
  const s = db.settings;
  const live = db.customers.filter((c) => !c.mergedInto);
  const activeCust = live.filter((c) => db.jobs.some((j) => j.customerId === c.id && daysBetween(j.date, t0) <= 180));
  const todayReq = db.jobs.filter((j) => j.createdAt.startsWith(t0) || (j.date === t0 && j.status !== "Cancelled"));
  const count = (f: (j: (typeof db.jobs)[number]) => boolean) => db.jobs.filter(f).length;
  const open = count((j) => j.status === "New Request");
  const assigned = count((j) => j.status === "Assigned" || j.status === "Accepted");
  const inProg = count((j) => isOpen(j) && !["New Request", "Assigned", "Accepted"].includes(j.status));
  const completedToday = count((j) => isDone(j) && j.timeline.some((e) => e.status === "Invoiced" && e.at.startsWith(t0)));
  const billedToday = db.jobs.filter((j) => j.invoice?.at.startsWith(t0)).reduce((x, j) => x + jobTotals(j, s).total, 0);
  const collectedToday = db.jobs.flatMap((j) => j.payments).filter((p) => p.at.startsWith(t0) && !p.refund).reduce((x, p) => x + p.amount, 0);
  const monthStart = t0.slice(0, 8) + "01";
  const monthRev = db.jobs.filter((j) => isDone(j) && j.date >= monthStart).reduce((x, j) => x + jobTotals(j, s).total, 0);
  const pendingPay = db.jobs.filter((j) => j.invoice && jobTotals(j, s).due > 0);
  const upsellRev = db.jobs.filter(isDone).reduce((x, j) => x + j.lines.filter((l) => l.upsell).reduce((y, l) => y + l.qty * l.price, 0), 0);
  const amcOpps = live.filter((c) => !c.amc && (db.jobs.filter((j) => j.customerId === c.id && isDone(j)).length >= 2 || db.acs.filter((a) => a.customerId === c.id).length > 1)).length;
  const lowStock = db.parts.filter((p) => p.stock <= p.minStock);
  const awaitingApproval = db.jobs.filter((j) => j.status === "Estimate Prepared" && j.quote?.status === "Pending");
  const overdueJobs = db.jobs.filter(overdue);
  const repeatJobs = db.jobs.filter((j) => isOpen(j) && acSummary(db, j.acId).repeatIssues.length > 0);

  const cats = new Map<string, number>();
  db.jobs.filter(isDone).forEach((j) => j.lines.filter((l) => l.kind === "Service").forEach((l) => {
    const c = db.services.find((x) => x.id === l.refId)?.category ?? "Other";
    cats.set(c, (cats.get(c) ?? 0) + 1);
  }));
  const topCats = [...cats].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const catMax = Math.max(1, ...topCats.map(([, n]) => n));

  const attention: { label: string; n: number; tone: "red" | "amber" | "purple"; to: Section }[] = [
    { label: "Requests waiting for a technician", n: open, tone: "red", to: "jobs" },
    { label: "Overdue jobs (SLA)", n: overdueJobs.length, tone: "red", to: "jobs" },
    { label: "Quotations awaiting customer approval", n: awaitingApproval.length, tone: "amber", to: "quotations" },
    { label: "Invoices with payment pending", n: pendingPay.length, tone: "amber", to: "billing" },
    { label: "Open jobs on repeat-problem ACs", n: repeatJobs.length, tone: "purple", to: "jobs" },
    { label: "Parts low on stock", n: lowStock.length, tone: "amber", to: "inventory" },
    { label: "AMC opportunities", n: amcOpps, tone: "purple", to: "growth" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="admin-grid-4">
        <Stat label="Customers" value={String(live.length)} sub={`${activeCust.length} active (6 months) · ${db.acs.length} AC units`} tone="purple" />
        <Stat label="Today's service requests" value={String(todayReq.length)} sub={`${open} unassigned · ${completedToday} completed today`} tone={open ? "red" : "blue"} />
        <Stat label="Revenue today" value={inr(billedToday)} sub={`${inr(collectedToday)} collected · ${inr(monthRev)} this month`} tone="green" />
        <Stat label="Pending payments" value={inr(pendingPay.reduce((x, j) => x + jobTotals(j, s).due, 0))} sub={`${plural(pendingPay.length, "invoice")} · upsell ${inr(upsellRev)}`} tone="amber" />
      </div>

      <div className="admin-grid-2">
        <Panel title="Job pipeline" actions={<Btn kind="ghost" small onClick={() => go("jobs")}>Dispatch</Btn>}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[["Open", open, "var(--error-text)"], ["Assigned", assigned, "var(--purple)"], ["In progress", inProg, "var(--info-text)"], ["Completed today", completedToday, "var(--success-text)"]].map(([l, n, c]) => (
              <div key={l as string} style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: c as string }}>{n}</p>
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-soft)" }}>{l}</p>
              </div>
            ))}
          </div>
          <p style={{ margin: "16px 0 8px", fontSize: 13, fontWeight: 700 }}>Technician workload today</p>
          {db.techs.filter((t) => t.active).map((t) => {
            const n = db.jobs.filter((j) => j.techId === t.id && j.date === t0 && j.status !== "Cancelled").length;
            const done = db.jobs.filter((j) => j.techId === t.id && j.date === t0 && isDone(j)).length;
            return (
              <div key={t.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                  <span>{t.name} <span style={muted}>· {t.availability}</span></span><b>{done}/{n}</b>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--line)" }}>
                  <div style={{ width: `${Math.min(100, n * 20)}%`, height: "100%", borderRadius: 3, background: n >= 4 ? "var(--gold)" : "var(--blue)" }} />
                </div>
              </div>
            );
          })}
        </Panel>

        <Panel title="Needs attention">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {attention.map((a) => (
              <button key={a.label} onClick={() => go(a.to)} className="admin-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 8px", borderRadius: 10, border: "none", background: "none", cursor: "pointer", textAlign: "left" }}>
                <Badge tone={a.n ? a.tone : "grey"}>{a.n}</Badge>
                <span style={{ flex: 1, fontSize: 13, color: a.n ? "var(--ink)" : "var(--ink-mute)" }}>{a.label}</span>
                <span style={{ color: "var(--ink-mute)" }}>›</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="admin-grid-2">
        <Panel title="Today's jobs" pad={false} actions={<Btn kind="ghost" small onClick={() => go("jobs")}>All jobs</Btn>}>
          <Table rows={db.jobs.filter((j) => j.date === t0 || (j.status === "New Request" && j.date <= t0)).sort((a, b) => a.slot.localeCompare(b.slot))} rowKey={(j) => j.id} empty="No jobs today." cols={[
            { key: "id", head: "Job", render: (j) => <button onClick={() => openJob(j.id)} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontWeight: 700, cursor: "pointer" }}>{j.id}</button> },
            { key: "c", head: "Customer", render: (j) => <>{custName(db, j.customerId)}<div style={muted}>{j.complaint.issues.join(", ")}</div></> },
            { key: "s", head: "Slot", render: (j) => <span style={muted}>{relDay(j.date)} · {j.slot}</span> },
            { key: "t", head: "Technician", render: (j) => db.techs.find((t) => t.id === j.techId)?.name ?? <Badge tone="red">Unassigned</Badge> },
            { key: "st", head: "Status", render: (j) => <Badge tone={JOB_TONE[j.status]}>{j.status}</Badge> },
          ]} />
        </Panel>
        <Panel title="Top service categories">
          {topCats.map(([c, n]) => (
            <div key={c} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}><span>{c}</span><b>{n}</b></div>
              <div style={{ height: 7, borderRadius: 4, background: "var(--line)" }}><div style={{ width: `${(n / catMax) * 100}%`, height: "100%", borderRadius: 4, background: "var(--blue)" }} /></div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <div style={{ flex: 1, background: "var(--gold-tint)", borderRadius: 12, padding: 12 }}><p style={{ margin: 0, fontSize: 11.5, color: "var(--gold-dark)", fontWeight: 700 }}>UPSELL REVENUE</p><p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{inr(upsellRev)}</p></div>
            <button onClick={() => go("growth")} style={{ flex: 1, background: "var(--purple-tint)", borderRadius: 12, padding: 12, border: "none", textAlign: "left", cursor: "pointer" }}><p style={{ margin: 0, fontSize: 11.5, color: "var(--purple)", fontWeight: 700 }}>AMC OPPORTUNITIES</p><p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{amcOpps} customers ›</p></button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
