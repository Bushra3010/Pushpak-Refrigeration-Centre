"use client";

import { useState } from "react";
import { REVENUE_HISTORY, fmtDate, inr, isDone, isoDay, jobTotals, type Db, type Job } from "../lib/data";
import { Btn, Filter, Panel, Stat, Table, muted } from "./kit";
import { FinanceReports } from "./FinanceReports";

type Range = "7 days" | "30 days" | "All time";

/** Horizontal bar list — the simplest honest chart for ranked categories. */
function Bars({ rows, money }: { rows: [string, number][]; money?: boolean }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}><span>{k}</span><b>{money ? inr(v) : v}</b></div>
          <div style={{ height: 7, borderRadius: 4, background: "var(--line)" }}><div style={{ width: `${(v / max) * 100}%`, height: "100%", borderRadius: 4, background: "var(--blue)" }} /></div>
        </div>
      ))}
      {rows.length === 0 && <p style={muted}>No data in this range.</p>}
    </div>
  );
}

const tally = <T,>(items: T[], key: (x: T) => string | string[], val: (x: T) => number = () => 1) => {
  const m = new Map<string, number>();
  items.forEach((x) => { const ks = key(x); (Array.isArray(ks) ? ks : [ks]).filter(Boolean).forEach((k) => m.set(k, (m.get(k) ?? 0) + val(x))); });
  return [...m].sort((a, b) => b[1] - a[1]);
};

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function ReportsSection({ db }: { db: Db }) {
  const [range, setRange] = useState<Range>("30 days");
  const from = range === "7 days" ? isoDay(-6) : range === "30 days" ? isoDay(-29) : "0000";
  const done = db.jobs.filter((j) => isDone(j) && j.date >= from);
  const all = db.jobs.filter((j) => j.date >= from && j.status !== "Cancelled");
  const s = db.settings;
  const tot = (j: Job) => jobTotals(j, s);
  const revenue = done.reduce((t, j) => t + tot(j).total, 0);
  const collected = done.reduce((t, j) => t + tot(j).paid, 0);
  const partsMargin = done.flatMap((j) => j.lines.filter((l) => l.kind === "Part")).reduce((t, l) => t + l.qty * (l.price - (db.parts.find((p) => p.id === l.refId)?.cost ?? l.price)), 0);
  const byKind = tally(done.flatMap((j) => j.lines), (l) => l.kind, (l) => l.qty * l.price);
  const byCategory = tally(done.flatMap((j) => j.lines.filter((l) => l.kind === "Service")), (l) => db.services.find((x) => x.id === l.refId)?.category ?? "Other", (l) => l.qty * l.price);
  const complaints = tally(all, (j) => j.complaint.issues as unknown as string[]).slice(0, 8);
  const causes = tally(done, (j) => j.diagnosis.rootCause).slice(0, 8);
  const parts = tally(done.flatMap((j) => j.lines.filter((l) => l.kind === "Part")), (l) => l.name, (l) => l.qty).slice(0, 8);
  const techRows = db.techs.map((t) => {
    const mine = done.filter((j) => j.techId === t.id);
    const rated = mine.filter((j) => j.rating);
    return {
      t, jobs: mine.length, value: mine.reduce((x, j) => x + tot(j).total, 0),
      upsell: mine.reduce((x, j) => x + j.lines.filter((l) => l.upsell).reduce((y, l) => y + l.qty * l.price, 0), 0),
      rating: rated.length ? rated.reduce((x, j) => x + (j.rating ?? 0), 0) / rated.length : 0,
    };
  });
  const repeat = all.filter((j) => j.preWork.occurrence === "Repeat Problem").length;

  const exportJobs = () => downloadCsv(`pushpak-jobs-${isoDay(0)}.csv`, [
    ["Job", "Date", "Customer", "AC", "Complaint", "Root cause", "Technician", "Status", "Total", "Paid", "Due"],
    ...db.jobs.filter((j) => j.date >= from).map((j) => {
      const t = tot(j); const ac = db.acs.find((a) => a.id === j.acId);
      return [j.id, j.date, db.customers.find((c) => c.id === j.customerId)?.name ?? "", ac ? `${ac.brand} ${ac.capacity} ${ac.acType}` : "", j.complaint.issues.join("; "), j.diagnosis.rootCause, db.techs.find((x) => x.id === j.techId)?.name ?? "", j.status, t.total, t.paid, t.due];
    }),
  ]);

  // 14-day revenue: seeded history for older days, live data for the last few.
  const days = Array.from({ length: 14 }, (_, i) => isoDay(i - 13));
  const series = days.map((d, i) => {
    const live = db.jobs.filter((j) => isDone(j) && j.date === d).reduce((t, j) => t + tot(j).total, 0);
    return { d, v: i >= 11 ? live : REVENUE_HISTORY[i] + live };
  });
  const max = Math.max(1, ...series.map((x) => x.v));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Filter<Range> options={["7 days", "30 days", "All time"]} value={range} onChange={setRange} />
        <Btn kind="ghost" onClick={exportJobs}>⬇ Export jobs (CSV)</Btn>
      </div>
      <div className="admin-grid-4">
        <Stat label="Revenue (billed)" value={inr(revenue)} sub={`${done.length} completed jobs`} tone="green" />
        <Stat label="Collected" value={inr(collected)} sub={revenue ? `${Math.round((collected / revenue) * 100)}% collection` : undefined} tone="blue" />
        <Stat label="Avg job value" value={inr(done.length ? revenue / done.length : 0)} tone="purple" />
        <Stat label="Parts margin" value={inr(partsMargin)} sub={`${repeat} repeat-problem jobs`} tone="amber" />
      </div>
      <Panel title="Revenue · last 14 days">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 170 }}>
          {series.map((x, i) => (
            <div key={x.d} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
              <div title={`${fmtDate(x.d)} · ${inr(x.v)}`} style={{ width: "100%", height: `${Math.max(3, (x.v / max) * 100)}%`, borderRadius: 5, background: i === 13 ? "var(--gold)" : "var(--blue)", opacity: i === 13 ? 1 : 0.8 }} />
              <span style={{ fontSize: 10, color: "var(--ink-mute)" }}>{Number(x.d.slice(8))}</span>
            </div>
          ))}
        </div>
      </Panel>
      <div className="admin-grid-3">
        <Panel title="Revenue by type"><Bars money rows={byKind} /></Panel>
        <Panel title="Top service categories"><Bars money rows={byCategory} /></Panel>
        <Panel title="Parts consumed (qty)"><Bars rows={parts} /></Panel>
      </div>
      <div className="admin-grid-2">
        <Panel title="Top customer complaints"><Bars rows={complaints} /></Panel>
        <Panel title="Top root causes (diagnosis)"><Bars rows={causes} /></Panel>
      </div>
      <FinanceReports db={db} />
      <Panel title="Technician performance" pad={false}>
        <Table rows={techRows} rowKey={(r) => r.t.id} cols={[
          { key: "n", head: "Technician", render: (r) => <b>{r.t.name}</b> },
          { key: "j", head: "Jobs done", align: "center", render: (r) => r.jobs },
          { key: "v", head: "Job value", align: "right", render: (r) => inr(r.value) },
          { key: "a", head: "Avg job", align: "right", render: (r) => inr(r.jobs ? r.value / r.jobs : 0) },
          { key: "u", head: "Upsell", align: "right", render: (r) => inr(r.upsell) },
          { key: "r", head: "Rating", align: "center", render: (r) => (r.rating ? `${r.rating.toFixed(1)} ★` : "—") },
        ]} />
      </Panel>
    </div>
  );
}
