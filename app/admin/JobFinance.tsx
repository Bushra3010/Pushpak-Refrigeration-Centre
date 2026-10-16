"use client";

import { useMemo, useState } from "react";
import { SLOTS, fmtDateTime, isDone, isoDay, type Db, type Job } from "../lib/data";
import { buildPeriod, currentMonth, fmtH, inr2, jobTechs, logHours, monthOf, pct } from "../lib/finance";
import { logCallback, setJobSplit, setJobTeam } from "../lib/store";
import { Badge, Btn, fieldLabel, input, muted } from "./kit";

/** Admin job drawer tab: team, revenue split, time, expenses and estimated vs actual profit. */
export function JobFinance({ db, job, who, notify }: { db: Db; job: Job; who: string; notify: (m: string) => void }) {
  const say = (err: string | null, ok: string) => notify(err ? `⚠ ${err}` : ok);
  const team = jobTechs(job);
  const [helpers, setHelpers] = useState<string[]>(job.helpers ?? []);
  const [split, setSplit] = useState<Record<string, number>>(job.split ?? Object.fromEntries(team.map((t) => [t, Math.round(100 / Math.max(1, team.length))])));
  const [cb, setCb] = useState({ date: isoDay(1), slot: SLOTS[0], note: "" });
  const tech = (id: string) => db.techs.find((t) => t.id === id)?.name ?? id;
  const row = useMemo(() => {
    const from = monthOf(job.createdAt) < monthOf(isoDay(-365)) ? monthOf(isoDay(-365)) : monthOf(job.createdAt);
    return buildPeriod(db, { from, to: currentMonth() }).full.jobs.find((r) => r.job.id === job.id);
  }, [db, job.id, job.createdAt]);
  const logs = db.timeLogs.filter((l) => l.jobId === job.id).sort((a, b) => a.start.localeCompare(b.start));
  const exps = db.expenses.filter((e) => e.jobId === job.id);
  const callbacks = db.jobs.filter((j) => j.parentJobId === job.id);
  const total = Object.values(split).reduce((a, b) => a + (Number(b) || 0), 0);
  const line = (k: string, est: number | null, act: number, bold = false) => (
    <tr key={k} style={{ borderTop: "1px solid var(--line)", fontWeight: bold ? 800 : 500 }}>
      <td style={{ padding: "6px 0" }}>{k}</td><td style={{ textAlign: "right", color: "var(--ink-soft)" }}>{est == null ? "—" : inr2(est)}</td>
      <td style={{ textAlign: "right", color: act < 0 ? "var(--error-text)" : undefined }}>{inr2(act)}</td>
    </tr>
  );
  return (
    <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
      <section>
        <h4 style={{ margin: "0 0 6px" }}>Estimated vs actual profitability</h4>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <thead><tr style={{ color: "var(--ink-mute)", fontSize: 11, textTransform: "uppercase" }}><th style={{ textAlign: "left" }}>Line</th><th style={{ textAlign: "right" }}>Estimated</th><th style={{ textAlign: "right" }}>Actual</th></tr></thead>
          <tbody>
            {line("Revenue (ex GST, earned)", row?.job.estimatedRevenue ?? null, row?.revenue ?? 0)}
            {line("Materials consumed", row?.job.estimatedCost ?? null, row?.materials ?? 0)}
            {line("Direct labour", null, row?.labour ?? 0)}
            {line("Direct job expenses", null, row?.directExpenses ?? 0)}
            {line("Gross profit", row ? row.job.estimatedRevenue - row.job.estimatedCost : null, row?.grossProfit ?? 0, true)}
            {line("Allocated technician shared costs", null, row?.sharedTechAlloc ?? 0)}
            {line("Allocated company overhead", null, row?.companyOverheadAlloc ?? 0)}
            {line("Job allocated profit", null, row?.allocatedProfit ?? 0, true)}
          </tbody>
        </table>
        <p style={{ ...muted, margin: "6px 0 0" }}>
          Gross margin {pct(row?.grossMarginPct)} · est. {job.estHours ?? "—"} h vs actual {fmtH(logs.filter((l) => l.status === "Approved" && l.kind === "Work").reduce((a, l) => a + logHours(l), 0))} work
          {row?.flags.wip && <> · <Badge tone="amber">Work in progress</Badge></>}{row?.flags.notInvoiced && <> · <Badge tone="amber">Not invoiced</Badge></>}
          {row?.flags.incompleteTime && <> · <Badge tone="amber">Time awaiting approval</Badge></>}{row?.flags.pendingExpenses && <> · <Badge tone="amber">Claim pending</Badge></>}
          · Overhead is a reporting allocation, deducted once in company totals.
        </p>
      </section>

      <section>
        <h4 style={{ margin: "0 0 6px" }}>Team & revenue split</h4>
        <p style={{ ...muted, margin: "0 0 6px" }}>Lead: <b>{job.techId ? tech(job.techId) : "not assigned"}</b>. Add helpers for multi-technician jobs.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {db.techs.filter((t) => t.id !== job.techId && t.active).map((t) => (
            <label key={t.id} style={{ fontSize: 13, display: "flex", gap: 5 }}><input type="checkbox" checked={helpers.includes(t.id)} onChange={(e) => setHelpers(e.target.checked ? [...helpers, t.id] : helpers.filter((h) => h !== t.id))} />{t.name}</label>
          ))}
          <Btn small kind="ghost" onClick={() => { setJobTeam(job.id, helpers, who); notify("Team saved"); }}>Save team</Btn>
        </div>
        {team.length > 1 && (
          <div style={{ marginTop: 10, background: "var(--bg-secondary)", borderRadius: 12, padding: 10 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12.5 }}>Current split: <b>{job.splitApprovedBy ? `manual, approved by ${job.splitApprovedBy}` : "by approved labour hours"}</b></p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              {team.map((t) => <label key={t}><span style={fieldLabel}>{tech(t)} %</span><input type="number" min={0} max={100} value={split[t] ?? 0} onChange={(e) => setSplit({ ...split, [t]: Number(e.target.value) })} style={{ ...input, width: 90 }} /></label>)}
              <Btn small disabled={Math.abs(total - 100) > 0.001} onClick={() => say(setJobSplit(job.id, Object.fromEntries(team.map((t) => [t, split[t] ?? 0])), who), "Manual split approved")}>Approve split ({total}%)</Btn>
              {job.splitApprovedBy && <Btn small kind="ghost" onClick={() => say(setJobSplit(job.id, null, who), "Split by approved hours")}>Use hours</Btn>}
            </div>
            <p style={{ ...muted, margin: "6px 0 0" }}>Percentages must total exactly 100%. Revenue is never counted in full for each technician.</p>
          </div>
        )}
      </section>

      <section>
        <h4 style={{ margin: "0 0 6px" }}>Time ({fmtH(logs.reduce((a, l) => a + (l.kind !== "Break" ? logHours(l) : 0), 0))} travel + work)</h4>
        {logs.map((l) => (
          <p key={l.id} style={{ margin: "0 0 4px", fontSize: 12.5 }}>
            <Badge tone={l.kind === "Work" ? "green" : l.kind === "Travel" ? "blue" : "amber"}>{l.kind}</Badge> {tech(l.techId)} · {fmtDateTime(l.start)} → {l.end ? fmtDateTime(l.end) : "running"} · {fmtH(logHours(l))} · <span style={muted}>{l.status}</span>
          </p>
        ))}
        {!logs.length && <p style={muted}>No time recorded yet. Technicians use the timer in their app.</p>}
      </section>

      <section>
        <h4 style={{ margin: "0 0 6px" }}>Job expenses</h4>
        {exps.map((e) => <p key={e.id} style={{ margin: "0 0 4px", fontSize: 12.5 }}>{e.category} · {inr2(e.amount)} · {e.paidBy} · <span style={muted}>{e.status}</span></p>)}
        {!exps.length && <p style={muted}>None.</p>}
      </section>

      <section>
        <h4 style={{ margin: "0 0 6px" }}>Callbacks</h4>
        {job.parentJobId && <p style={{ margin: "0 0 6px", fontSize: 13 }}>This visit is a callback for <b>{job.parentJobId}</b>.</p>}
        {callbacks.map((c) => <p key={c.id} style={{ margin: "0 0 4px", fontSize: 12.5 }}>{c.id} · {c.status} · {c.date}</p>)}
        {isDone(job) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label><span style={fieldLabel}>Date</span><input type="date" value={cb.date} onChange={(e) => setCb({ ...cb, date: e.target.value })} style={{ ...input, width: "auto" }} /></label>
            <label><span style={fieldLabel}>Slot</span><select value={cb.slot} onChange={(e) => setCb({ ...cb, slot: e.target.value })} style={{ ...input, width: "auto" }}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></label>
            <input placeholder="What came back?" value={cb.note} onChange={(e) => setCb({ ...cb, note: e.target.value })} style={{ ...input, width: 200 }} />
            <Btn small kind="ghost" disabled={!cb.note.trim()} onClick={() => notify(`${logCallback(job.id, cb.date, cb.slot, cb.note.trim(), who)} logged as a callback`)}>Log callback</Btn>
          </div>
        )}
      </section>
    </div>
  );
}
