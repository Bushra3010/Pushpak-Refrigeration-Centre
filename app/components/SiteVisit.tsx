"use client";

import { fmtDate } from "../lib/data";
import { extraPipeFt, type SiteVisit } from "../lib/sitevisit";

/* Read-only site visit report — admin review and the technician's submitted copy. */

export function SiteVisitSummary({ v }: { v: SiteVisit }) {
  const extra = extraPipeFt(v);
  const sec = (t: string, rows: [string, string | number | null | undefined | boolean][]) => (
    <div style={{ marginTop: 12 }}>
      <p style={{ margin: "0 0 4px", fontSize: 13.5, fontWeight: 800 }}>🔹 {t}</p>
      {rows.filter(([, val]) => val !== undefined && val !== "" && val !== null).map(([k, val]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
          <span style={{ color: "var(--ink-soft)" }}>{k}</span><b style={{ textAlign: "right" }}>{val === true ? "✓ Yes" : val === false ? "✗ No" : String(val)}</b>
        </div>
      ))}
    </div>
  );
  return (
    <div>
      {sec("Customer & site", [["Customer", `${v.customer.name} · ${v.customer.phone}`], ["Site address", v.customer.address], ["Visit date", fmtDate(v.visitDate)], ["Technician", v.techName], ["Linked job", v.jobId]])}
      {sec("1. Site & Structure", [["Wall type", v.wallType], ["Beam / column", v.beamColumn]])}
      {sec("2. Indoor Unit Placement", [["Placement finalized", v.indoorFinal], ["Fixing type", v.fixing], ["Gap to ceiling", v.ceilingGap], ["Gap note", v.ceilingGapNote]])}
      {sec("3. Piping Laying Type", [["Copper pipe type", v.pipeType], ["Wall chasing required", v.pipeType === "Concealed" ? v.chasing : ""], ["Chasing length (ft)", v.chasing === "Yes" ? v.chasingFt : null], ["Chasing route marked", v.chasing === "Yes" ? v.chasingRouteMarked : ""]])}
      {sec("4. Drain Line", [["Drain line work", v.drainWork], ["Route clear", v.drainWork === "Yes" ? v.drainClear : ""], ["Proper slope", v.drainWork === "Yes" ? v.drainSlope : ""]])}
      {sec("5. Drain Pump", [["Drain pump required", v.drainPump], ["Reason", v.drainPump === "Yes" ? [...v.pumpReasons.filter((r) => r !== "Other"), v.pumpOther].filter(Boolean).join(", ") : ""]])}
      {sec("6. Core Cutting", [["Core cutting required", v.coreCut], ["Holes", v.coreCut === "Yes" ? v.holes : null], ["Size (DIA mm)", v.coreCut === "Yes" ? v.diaMm : null], ["Location marked", v.coreCut === "Yes" ? v.coreMarked : ""]])}
      {sec("7. Copper Pipe", [["Measurement taken", v.pipeMeasured], ["Length (ft)", v.pipeFt], ["Pipe route", v.pipeRoute], ["Piping type confirmed", v.pipingConfirmed]])}
      {sec("8. Marking & Permission", [["Core cutting marking", v.coreCut === "Yes" ? v.coreMarking : ""], ["Wall chasing marking", v.chasing === "Yes" ? v.chasingMarking : ""]])}
      {sec("9. Special Notes", [["AC capacity", `${v.capacity} Ton`], ["Standard pipe length", `${v.standardFt} ft`], ["Actual required", v.pipeFt != null ? `${v.pipeFt} ft` : ""], ["Extra pipe", extra ? `⚠ ${extra} ft` : "None"], ["Reason", v.extraReasons.join(", ")], ["All markings visible", v.allVisible], ["Marking photos clicked", v.photosTaken], ["Site challenges noted", v.challengesNoted], ["Site challenges", v.challenges], ["Submitted to", v.submittedTo]])}
      {v.photos.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {v.photos.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer"><img src={p} alt={`Marking photo ${i + 1}`} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10 }} /></a>)}
        </div>
      )}
    </div>
  );
}
