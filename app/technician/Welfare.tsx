"use client";

import { useState } from "react";
import { CurrentCylinder, LpgForm, UsageSummary } from "../components/Lpg";
import { BottomSheet, Empty, PageHeader, Pill, PrimaryButton, SectionHead, card, field, label, small } from "../components/ui";
import { fmtDate, isoDay, type Db, type Technician } from "../lib/data";
import { addCylinder } from "../lib/store";
import { issueStatus, missingOf, rentalOverdue } from "../lib/tools";
import { daysOf, finishedCylinders } from "../lib/welfare";

/* Technician app → Mess LPG (/technician#lpg): any technician can enter a new cylinder; and My Tools (/technician#tools). */

export function MessLpgScreen({ db, tech, onBack, flash }: { db: Db; tech: Technician; onBack: () => void; flash: (m: string) => void }) {
  const [adding, setAdding] = useState(false);
  const history = finishedCylinders(db.cylinders ?? []).slice(0, 6);
  return (
    <div style={{ paddingBottom: 16 }}>
      <PageHeader title="Mess LPG Cylinder" sub="Company kitchen / technician mess" onBack={onBack} />
      <div style={{ padding: "0 16px" }}>
        <div style={{ ...card, padding: 14 }}><CurrentCylinder db={db} compact /></div>
        <div style={{ marginTop: 12 }}><PrimaryButton onClick={() => setAdding(true)}>＋ New cylinder started today</PrimaryButton></div>
        <p style={{ ...small, textAlign: "center", marginTop: 6 }}>Enter it the day the new cylinder is connected — the old one is closed automatically and the office is notified.</p>
        <SectionHead title="Usage summary" />
        <div style={{ ...card, padding: "4px 14px 10px" }}><UsageSummary db={db} /></div>
        <SectionHead title="Last cylinders" />
        <div style={{ display: "grid", gap: 8 }}>
          {history.map((c) => (
            <div key={c.id} style={{ ...card, padding: 12, display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5 }}>
              <span><b>{c.no}</b><span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)" }}>{fmtDate(c.start)} → {fmtDate(c.end!)}</span></span>
              <b>{daysOf(c, isoDay(0))} days</b>
            </div>
          ))}
          {history.length === 0 && <Empty>No finished cylinders yet.</Empty>}
        </div>
      </div>
      {adding && (
        <BottomSheet title="New cylinder started" onClose={() => setAdding(false)}>
          <LpgForm db={db} inp={field} lab={label} showCost={false} onSave={(d) => { const e = addCylinder(d, tech.name, "Technician"); if (!e) { setAdding(false); flash(`${d.no} saved — office informed`); } return e; }} />
        </BottomSheet>
      )}
    </div>
  );
}

export function MyToolsScreen({ db, tech, onBack }: { db: Db; tech: Technician; onBack: () => void }) {
  const t0 = isoDay(0);
  const mine = (db.toolIssues ?? []).filter((x) => x.techId === tech.id || x.techName === tech.name);
  const out = mine.filter((x) => !x.ret);
  const rented = (db.toolRentals ?? []).filter((r) => r.techName === tech.name && r.status === "In Use");
  return (
    <div style={{ paddingBottom: 16 }}>
      <PageHeader title="My Tools" sub="Shop tools with you · return on time" onBack={onBack} />
      <div style={{ padding: "0 16px" }}>
        <SectionHead title={`With me now (${out.length + rented.length})`} />
        <div style={{ display: "grid", gap: 8 }}>
          {out.map((x) => {
            const s = issueStatus(x, t0);
            return (
              <div key={x.id} style={{ ...card, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 14 }}>{x.tool} × {x.qty}</b><Pill tone={s === "Overdue" ? "red" : "blue"}>{s}</Pill></div>
                <p style={{ ...small, margin: "3px 0 0" }}>{x.site} · issued {fmtDate(x.issueDate)} by {x.handedBy}</p>
                <p style={{ margin: "3px 0 0", fontSize: 12.5, fontWeight: 700, color: s === "Overdue" ? "var(--error-text)" : "var(--ink)" }}>Return by {fmtDate(x.expectedReturn)} → {x.location}</p>
                {x.accessories.length > 0 && <p style={{ ...small, margin: "3px 0 0" }}>With: {[...x.accessories, x.otherAccessories].filter(Boolean).join(", ")}</p>}
              </div>
            );
          })}
          {rented.map((r) => (
            <div key={r.id} style={{ ...card, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 14 }}>{r.tool} × {r.qty}</b><Pill tone={rentalOverdue(r, t0) ? "red" : "purple"}>Rented{rentalOverdue(r, t0) ? " · late" : ""}</Pill></div>
              <p style={{ ...small, margin: "3px 0 0" }}>{r.site} · from {r.vendor || "outside vendor"}</p>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, fontWeight: 700 }}>Return by {fmtDate(r.expectedReturn)} — late charge applies after this</p>
            </div>
          ))}
          {out.length + rented.length === 0 && <Empty>No tools issued to you right now.</Empty>}
        </div>
        <SectionHead title="Returned" />
        <div style={{ display: "grid", gap: 8 }}>
          {mine.filter((x) => x.ret).slice(0, 10).map((x) => (
            <div key={x.id} style={{ ...card, padding: 12, fontSize: 13 }}>
              <b>{x.tool} × {x.qty}</b><span style={{ display: "block", color: "var(--ink-soft)" }}>Returned {fmtDate(x.ret!.date)} · {x.ret!.condition}{missingOf(x).length ? ` · missing ${missingOf(x).join(", ")}` : ""}</span>
            </div>
          ))}
          {!mine.some((x) => x.ret) && <Empty>Nothing returned yet.</Empty>}
        </div>
      </div>
    </div>
  );
}
