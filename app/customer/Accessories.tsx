"use client";

import { useState } from "react";
import { Chips, PageHeader, card, small } from "../components/ui";

/* "AC Installation Accessories" — what fitting a new AC can need, so customers know what the quotation
 * lines mean. Illustrations are drawn inline (no stock photos); prices come in the quotation itself. */

type Kind = "Usually included" | "If your site needs it";
type Item = { name: string; hi: string; kind: Kind; what: string; when: string; art: React.ReactNode };

const COPPER = "#c8743a";
const RUBBER = "#2b2f36";
const s = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ITEMS: Item[] = [
  {
    name: "Copper pipe set", hi: "कॉपर पाइप", kind: "Usually included",
    what: "Two copper lines (liquid + suction) carry gas between the indoor and outdoor units.",
    when: "Every split AC. Length beyond the package allowance is charged per foot.",
    art: <svg viewBox="0 0 64 64"><ellipse cx="32" cy="34" rx="22" ry="12" {...s} stroke={COPPER} /><ellipse cx="32" cy="34" rx="16" ry="8" {...s} stroke={COPPER} /><path d="M54 34v10M48 40v10" {...s} stroke={COPPER} /></svg>,
  },
  {
    name: "Insulation tube", hi: "इंसुलेशन", kind: "Usually included",
    what: "Foam sleeve over the copper pipes so they don't sweat, drip or lose cooling.",
    when: "Always with copper pipe; replaced if old insulation is torn.",
    art: <svg viewBox="0 0 64 64"><rect x="8" y="24" width="48" height="16" rx="8" fill={RUBBER} /><ellipse cx="56" cy="32" rx="4" ry="8" fill="#555b66" /><ellipse cx="56" cy="32" rx="2" ry="4" fill={COPPER} /></svg>,
  },
  {
    name: "Drain pipe", hi: "ड्रेन पाइप", kind: "Usually included",
    what: "Flexible hose that carries condensed water away from the indoor unit.",
    when: "Every split AC. Long runs to a far drain point cost extra.",
    art: <svg viewBox="0 0 64 64"><path d="M10 14c14 0 14 18 26 18s12 18 20 18" {...s} strokeWidth={7} stroke="#9aa5b1" /><path d="M10 14c14 0 14 18 26 18s12 18 20 18" {...s} strokeWidth={7} strokeDasharray="2 4" stroke="#6b7684" /></svg>,
  },
  {
    name: "Connecting cable", hi: "कनेक्टिंग वायर", kind: "Usually included",
    what: "Power and signal wire between the indoor and outdoor units.",
    when: "Every split AC; length depends on the pipe run.",
    art: <svg viewBox="0 0 64 64"><circle cx="30" cy="32" r="16" {...s} stroke="#d14b3a" /><circle cx="30" cy="32" r="10" {...s} stroke="#2f6fd6" /><circle cx="30" cy="32" r="4" {...s} stroke="#2a9d5c" /><path d="M46 32h10" {...s} /></svg>,
  },
  {
    name: "Outdoor unit stand", hi: "आउटडोर स्टैंड", kind: "If your site needs it",
    what: "Wall bracket or floor stand that holds the outdoor unit safely and level.",
    when: "When the outdoor unit can't sit on a flat floor or ledge.",
    art: <svg viewBox="0 0 64 64"><path d="M12 10v44M12 20h40M12 44l40-24" {...s} strokeWidth={4} /><rect x="26" y="8" width="24" height="12" rx="2" fill="var(--blue-tint)" stroke="currentColor" strokeWidth={2} /></svg>,
  },
  {
    name: "Anti-vibration pads", hi: "रबर पैड", kind: "If your site needs it",
    what: "Rubber pads under the outdoor unit that cut noise and shaking.",
    when: "Recommended on stands and rooftops.",
    art: <svg viewBox="0 0 64 64"><rect x="8" y="30" width="20" height="12" rx="3" fill={RUBBER} /><rect x="36" y="30" width="20" height="12" rx="3" fill={RUBBER} /><path d="M12 30v-4M24 30v-4M40 30v-4M52 30v-4" {...s} stroke={RUBBER} /></svg>,
  },
  {
    name: "MCB / isolator", hi: "एमसीबी", kind: "If your site needs it",
    what: "A dedicated switch and breaker so the AC is on its own protected circuit.",
    when: "When there's no suitable AC point near the indoor unit.",
    art: <svg viewBox="0 0 64 64"><rect x="18" y="8" width="28" height="48" rx="4" {...s} /><rect x="26" y="22" width="12" height="20" rx="2" fill="var(--blue)" /><rect x="28" y="24" width="8" height="8" rx="1" fill="white" /></svg>,
  },
  {
    name: "Voltage stabilizer", hi: "स्टेबलाइज़र", kind: "If your site needs it",
    what: "Protects the AC from low or high voltage.",
    when: "Where voltage swings, or if the AC is not stabilizer-free.",
    art: <svg viewBox="0 0 64 64"><rect x="10" y="14" width="44" height="36" rx="5" {...s} /><path d="M20 38a12 12 0 0 1 24 0" {...s} /><path d="M32 38l6-8" {...s} stroke="var(--blue)" /><circle cx="46" cy="22" r="2" fill="#2a9d5c" /></svg>,
  },
  {
    name: "PVC pipe cover", hi: "पाइप कवर", kind: "If your site needs it",
    what: "Neat channel that hides pipes and wires along the wall.",
    when: "Inside rooms where exposed pipes would look untidy.",
    art: <svg viewBox="0 0 64 64"><path d="M8 26h48v12H8z" fill="#eef1f5" stroke="currentColor" strokeWidth={2} /><path d="M8 26l6-6h48l-6 6M56 38l6-6V20" {...s} strokeWidth={2} /></svg>,
  },
  {
    name: "Wall core cut", hi: "दीवार में छेद", kind: "If your site needs it",
    what: "A clean round hole through the wall for the pipes, drain and cable.",
    when: "New installations without an existing pipe hole; thick or concrete walls cost more.",
    art: <svg viewBox="0 0 64 64"><rect x="8" y="10" width="48" height="44" rx="2" fill="#e7dccd" /><circle cx="32" cy="32" r="10" fill="#6e5a43" /><circle cx="32" cy="32" r="10" {...s} /></svg>,
  },
  {
    name: "Fasteners & anchor bolts", hi: "बोल्ट / फिक्सिंग", kind: "Usually included",
    what: "Screws, rawl plugs and anchor bolts that hold the indoor unit plate and stand.",
    when: "Every installation; heavy-duty anchors for stands.",
    art: <svg viewBox="0 0 64 64"><path d="M22 10h12l-2 8H24z" fill="#8a94a3" /><path d="M28 18v34" {...s} strokeWidth={4} /><path d="M24 26l8 3M24 32l8 3M24 38l8 3M24 44l8 3" {...s} strokeWidth={1.5} /><rect x="40" y="22" width="8" height="26" rx="2" fill="#d9a441" /></svg>,
  },
  {
    name: "Extra gas charge", hi: "अतिरिक्त गैस", kind: "If your site needs it",
    what: "Additional refrigerant when the pipe run is longer than the factory charge covers.",
    when: "Long pipe runs, as per the AC maker's chart.",
    art: <svg viewBox="0 0 64 64"><rect x="20" y="16" width="24" height="40" rx="10" fill="#3aa7c9" /><rect x="27" y="8" width="10" height="8" rx="2" fill="#8a94a3" /><path d="M26 30h12" stroke="white" strokeWidth={3} strokeLinecap="round" /></svg>,
  },
];

const KINDS = ["All", "Usually included", "If your site needs it"] as const;

export function AccessoriesPage({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]>("All");
  const list = ITEMS.filter((i) => kind === "All" || i.kind === kind);
  return (
    <div style={{ minHeight: "100%" }}>
      <PageHeader title="AC Installation Accessories" sub="What fitting a new AC can need" onBack={onBack} />
      <div style={{ padding: "0 16px 24px" }}>
        <p style={{ ...small, margin: "0 0 12px" }}>Our technician checks your site and lists only what is needed in your quotation — you approve it before any work starts.</p>
        <div className="no-scroll" style={{ overflowX: "auto", marginBottom: 12 }}><Chips options={KINDS} value={kind} onChange={setKind} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {list.map((i) => (
            <div key={i.name} style={{ ...card, padding: 12, display: "flex", flexDirection: "column", gap: 6 }} data-accessory={i.name}>
              <div role="img" aria-label={i.name} style={{ height: 84, borderRadius: 12, background: "var(--surface-dim)", color: "var(--ink-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ width: 64, height: 64, display: "block" }}>{i.art}</span>
              </div>
              <b style={{ fontSize: 13.5, lineHeight: 1.25 }}>{i.name}</b>
              <span style={{ fontSize: 11.5, color: "var(--ink-mute)", marginTop: -4 }}>{i.hi}</span>
              <p style={{ ...small, margin: 0, fontSize: 12 }}>{i.what}</p>
              <p style={{ ...small, margin: 0, fontSize: 11.5, color: i.kind === "Usually included" ? "var(--success-text)" : "var(--gold-dark)", fontWeight: 600 }}>{i.when}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
