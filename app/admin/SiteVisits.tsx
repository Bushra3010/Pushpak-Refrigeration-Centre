"use client";

import { useState } from "react";
import { SiteVisitSummary } from "../components/SiteVisit";
import { fmtDate, type Db } from "../lib/data";
import { extraPipeFt, type SiteVisit } from "../lib/sitevisit";
import { reviewSiteVisit } from "../lib/store";
import { Badge, Btn, Filter, Modal, Panel, Table, fieldLabel, input, muted, type Tone } from "./kit";

/* Admin → Site Visits: engineer site-visit reports from the technician app, reviewed before installation. */

const TONE: Record<SiteVisit["status"], Tone> = { Draft: "grey", Submitted: "blue", Reviewed: "green", "Correction Required": "amber" };
type F = "To review" | "All" | SiteVisit["status"];

export function SiteVisitsSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [f, setF] = useState<F>("To review");
  const [open, setOpen] = useState<string | null>(null);
  const all = (db.siteVisits ?? []).filter((v) => v.status !== "Draft" || f === "All" || f === "Draft");
  const match = (v: SiteVisit, k: F) => k === "All" || (k === "To review" ? v.status === "Submitted" : v.status === k);
  const opts: F[] = ["To review", "Reviewed", "Correction Required", "Draft", "All"];
  const v = open ? (db.siteVisits ?? []).find((x) => x.id === open) : undefined;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="AC site visit reports" pad={false}>
        <div style={{ padding: "12px 16px 0" }}><Filter options={opts} value={f} onChange={setF} counts={Object.fromEntries(opts.map((k) => [k, (db.siteVisits ?? []).filter((x) => match(x, k)).length]))} /></div>
        <Table<SiteVisit> rowKey={(x) => x.id} rows={all.filter((x) => match(x, f))} empty="No site visit reports here." cols={[
          { key: "id", head: "Report", render: (x) => <div><b>{x.id}</b><div style={muted}>{fmtDate(x.visitDate)}</div></div> },
          { key: "c", head: "Customer / site", render: (x) => <div>{x.customer.name}<div style={muted}>{x.customer.phone} · {x.customer.address}</div></div> },
          { key: "t", head: "Technician", render: (x) => x.techName },
          { key: "w", head: "Work needed", render: (x) => <div style={{ fontSize: 12.5 }}>{[x.coreCut === "Yes" && `Core cut ×${x.holes}`, x.chasing === "Yes" && `Chasing ${x.chasingFt} ft`, x.drainPump === "Yes" && "Drain pump", x.pipeFt && `Pipe ${x.pipeFt} ft`].filter(Boolean).join(" · ") || "—"}{extraPipeFt(x) > 0 && <div style={{ color: "var(--error-text)", fontWeight: 700 }}>⚠ {extraPipeFt(x)} ft extra pipe</div>}</div> },
          { key: "s", head: "Status", render: (x) => <Badge tone={TONE[x.status]}>{x.status}</Badge> },
          { key: "a", head: "", render: (x) => <Btn small kind="ghost" onClick={() => setOpen(x.id)}>Open</Btn> },
        ]} />
      </Panel>
      {v && <Review v={v} who={who} notify={notify} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Review({ v, who, notify, onClose }: { v: SiteVisit; who: string; notify: (m: string) => void; onClose: () => void }) {
  const [notes, setNotes] = useState(v.office?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);
  const act = (ok: boolean) => { const e = reviewSiteVisit(v.id, ok, notes, who); setErr(e); if (!e) { notify(ok ? "Marked reviewed" : "Sent back to technician"); onClose(); } };
  return (
    <Modal title={`${v.id} · ${v.customer.name} · ${v.status}`} onClose={onClose} width={680} footer={v.status === "Submitted" ? <><Btn kind="ghost" onClick={() => act(false)}>Send back for correction</Btn><Btn onClick={() => act(true)}>Mark reviewed</Btn></> : undefined}>
      <SiteVisitSummary v={v} />
      {v.status === "Submitted" && <label style={{ display: "block", marginTop: 14 }}><span style={fieldLabel}>Office notes</span><textarea rows={2} value={notes} onChange={(e) => { setNotes(e.target.value); setErr(null); }} placeholder="Approved — order 25 ft pipe + drain pump" style={{ ...input, resize: "vertical" }} /></label>}
      {v.office && v.status !== "Submitted" && <p style={{ ...muted, marginTop: 12 }}>Office ({v.office.by}, {fmtDate(v.office.at)}): {v.office.notes || "—"}</p>}
      {err && <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
    </Modal>
  );
}
