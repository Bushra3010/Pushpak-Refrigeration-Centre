"use client";

import { useEffect, useState } from "react";
import { SearchIcon } from "../../components/icons";
import { Chips, PageHeader, card, field, sectionTitle, small } from "../../components/ui";
import { fmtDateTime, type Db, type Technician } from "../../lib/data";
import { toggleFavourite, touchRecent } from "../../lib/store";
import { CATEGORIES, TOOLS, searchTools, toolById, type Category, type ToolDef } from "./registry";
import type { Ctx } from "./kit";
import { CableElectrical, CopperPipe, DrainPipe, ExtraMaterial, InstallationEstimate, Insulation, StandAccessories, Tonnage } from "./install";
import { AirDeltaT, Airflow, GasWeightPrice, PressureTemperature, RefrigerantCharge, RefrigerantUsage, RepairEstimate, SuperheatSubcool } from "./service";
import { AmcPlan, ElectricityCost, ReplacementSavings, UnitConverter } from "./energy";
import { GstCalculator } from "./gst";
import { CustomerBill, MaterialRequirement, OvertimeEstimate, TravelClaim, WorkHours } from "./daily";

/* Technician Calculators hub — /technician#calculators, each calculator at /technician#calculators/<id>. */

const SCREENS: Record<string, (p: { ctx: Ctx }) => React.ReactElement> = {
  "copper-pipe": CopperPipe, tonnage: Tonnage, "installation-estimate": InstallationEstimate, "extra-material": ExtraMaterial,
  "drain-pipe": DrainPipe, insulation: Insulation, "cable-electrical": CableElectrical, "stand-accessories": StandAccessories,
  "refrigerant-charge": RefrigerantCharge, "refrigerant-usage": RefrigerantUsage, "pressure-temperature": PressureTemperature,
  "superheat-subcooling": SuperheatSubcool, "air-delta-t": AirDeltaT, airflow: Airflow, "repair-estimate": RepairEstimate,
  "electricity-cost": ElectricityCost, "replacement-savings": ReplacementSavings, "amc-plan": AmcPlan, "unit-converter": UnitConverter,
  "work-hours": WorkHours, overtime: OvertimeEstimate, "travel-claim": TravelClaim, "material-requirement": MaterialRequirement, "customer-bill": CustomerBill,
  "gas-weight-price": GasWeightPrice, gst: GstCalculator,
};

export const CALC_ROUTE = "#calculators";
export const routeOf = (id?: string | null) => (id ? `${CALC_ROUTE}/${id}` : CALC_ROUTE);
export const parseRoute = (hash: string): { hub: boolean; tool: string | null } => {
  if (!hash.startsWith(CALC_ROUTE)) return { hub: false, tool: null };
  const id = hash.slice(CALC_ROUTE.length + 1);
  return { hub: true, tool: id && toolById(id) ? id : null };
};

export function CalculatorsHub({ db, tech, tool, onOpen, flash }: { db: Db; tech: Technician; tool: string | null; onOpen: (id: string | null) => void; flash: (m: string) => void }) {
  const def = tool ? toolById(tool) : undefined;
  useEffect(() => { if (def) touchRecent(tech.id, def.id); }, [def, tech.id]);
  if (def) {
    const Screen = SCREENS[def.id];
    return <Screen key={def.id} ctx={{ db, tech, def, flash, onBack: () => onOpen(null) }} />;
  }
  return <HubHome db={db} tech={tech} onOpen={onOpen} />;
}

function HubHome({ db, tech, onOpen }: { db: Db; tech: Technician; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "All">("All");
  const prefs = db.techPrefs?.[tech.id] ?? { fav: [], recent: [] };
  const list = searchTools(q, cat);
  const recent = prefs.recent.map(toolById).filter((t): t is ToolDef => !!t).slice(0, 4);
  const favs = prefs.fav.map(toolById).filter((t): t is ToolDef => !!t);
  const saved = db.calcs.filter((c) => c.techId === tech.id && c.tool).slice(0, 5);
  const filtering = !!q.trim() || cat !== "All";
  return (
    <div>
      <PageHeader title="Calculators" sub={`${TOOLS.length} tools for site, service and billing`} />
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 14, top: 14 }}><SearchIcon s={17} c="var(--ink-mute)" /></span>
          <input aria-label="Search calculators" placeholder="Search by name or purpose — e.g. drain, gas, bill" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...field, paddingLeft: 40 }} />
        </div>
        <div style={{ marginTop: 10, overflowX: "auto" }} className="no-scroll"><Chips options={["All", ...CATEGORIES] as const} value={cat} onChange={(c) => setCat(c as Category | "All")} /></div>

        {!filtering && favs.length > 0 && (<><h3 style={sectionTitle}>★ Favourites</h3><Quick list={favs} onOpen={onOpen} /></>)}
        {!filtering && recent.length > 0 && (<><h3 style={sectionTitle}>Recently used</h3><Quick list={recent} onOpen={onOpen} /></>)}

        {(filtering ? [cat === "All" ? null : cat] : CATEGORIES).map((c) => {
          const items = list.filter((t) => !c || t.category === c);
          if (!items.length) return null;
          return (
            <section key={c ?? "results"}>
              <h3 style={sectionTitle}>{c ?? `${items.length} result${items.length === 1 ? "" : "s"}`}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                {items.map((t) => <ToolCard key={t.id} t={t} fav={prefs.fav.includes(t.id)} onOpen={() => onOpen(t.id)} onFav={() => toggleFavourite(tech.id, t.id)} />)}
              </div>
            </section>
          );
        })}
        {!list.length && <p style={{ ...small, textAlign: "center", padding: 24 }}>No calculator matches “{q}”.</p>}

        {!filtering && (<>
          <h3 style={sectionTitle}>Saved calculations</h3>
          {saved.length ? saved.map((s) => (
            <button key={s.id} onClick={() => s.tool && onOpen(s.tool)} className="press" style={{ ...card, width: "100%", border: "none", textAlign: "left", padding: 12, marginBottom: 8, cursor: "pointer" }}>
              <b style={{ fontSize: 13.5 }}>{s.title}</b>
              <p style={{ ...small, margin: 0 }}>{s.kind} · {fmtDateTime(s.at)}{s.jobId ? ` · ${s.jobId}` : ""}</p>
              {s.summary?.slice(-1).map((x) => <p key={x.k} style={{ ...small, margin: 0 }}>{x.k}: <b>{x.v}</b></p>)}
            </button>
          )) : <p style={small}>Nothing saved yet — calculations you save appear here.</p>}
        </>)}
      </div>
    </div>
  );
}

function ToolCard({ t, fav, onOpen, onFav }: { t: ToolDef; fav: boolean; onOpen: () => void; onFav: () => void }) {
  return (
    <div style={{ ...card, padding: 12, display: "flex", flexDirection: "column", gap: 6 }} data-tool={t.id}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span aria-hidden style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 21, lineHeight: 1, background: "linear-gradient(160deg,#262626,#0c0c0c)", border: "2px solid var(--gold)", color: "var(--gold)" }}>{t.icon}</span>
        <button onClick={onFav} aria-label={fav ? `Remove ${t.name} from favourites` : `Add ${t.name} to favourites`} aria-pressed={fav} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: fav ? "var(--gold)" : "var(--line-strong)", padding: 0 }}>★</button>
      </div>
      <b style={{ fontSize: 13.5, lineHeight: 1.25 }}>{t.name}</b>
      <p style={{ ...small, margin: 0, fontSize: 11.5, flex: 1 }}>{t.desc}</p>
      <button onClick={onOpen} className="press" aria-label={`Open ${t.name}`} style={{ border: "none", borderRadius: 6, padding: "8px 0", background: "var(--red)", color: "white", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>Open</button>
    </div>
  );
}

function Quick({ list, onOpen }: { list: ToolDef[]; onOpen: (id: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }} className="no-scroll">
      {list.map((t) => (
        <button key={t.id} onClick={() => onOpen(t.id)} className="press" style={{ ...card, border: "none", padding: "10px 12px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600 }}>
          <span aria-hidden>{t.icon}</span>{t.name}
        </button>
      ))}
    </div>
  );
}
