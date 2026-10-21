"use client";

import { useState } from "react";
import { PageHeader, card, small } from "../../components/ui";
import { GST_RATES, gstCalc, type GstMode, type GstSupply } from "../../lib/calc/tools";
import { Box, F, Note, Seg, Sel, Two, num, type Ctx } from "./kit";

/* ───────────── 26 GST calculator ─────────────
 * Updates as you type (no Calculate button). Pure client-side maths, so it keeps working offline. */

const MODES: Record<string, GstMode> = { "Excluding GST": "exclusive", "Including GST": "inclusive" };
const SUPPLIES: Record<string, GstSupply> = { "CGST + SGST": "intra", IGST: "inter" };
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 3 })}%`;

const INIT = { amount: "", qty: "1", rate: "18", mode: "Excluding GST", supply: "CGST + SGST" };

export function GstCalculator({ ctx }: { ctx: Ctx }) {
  const { def, flash } = ctx;
  const [v, setV] = useState(INIT);
  const set = (p: Partial<typeof INIT>) => setV((x) => ({ ...x, ...p }));

  let r: ReturnType<typeof gstCalc> | null = null;
  let error = "";
  if (v.amount.trim() !== "") {
    try { r = gstCalc(num(v.amount), num(v.qty), Number(v.rate), MODES[v.mode], SUPPLIES[v.supply]); } catch (e) { error = (e as Error).message; }
  }
  const rate = Number(v.rate);
  const inclusive = MODES[v.mode] === "inclusive";
  const intra = SUPPLIES[v.supply] === "intra";

  const rows: { k: string; v: string; strong?: boolean }[] = r ? [
    { k: inclusive ? "Amount (incl. GST)" : "Amount (excl. GST)", v: `${money(num(v.amount))} × ${v.qty}` },
    { k: "Taxable value", v: money(r.taxable), strong: true },
    ...(intra ? [{ k: `CGST @ ${pct(r.halfRate)}`, v: money(r.cgst) }, { k: `SGST @ ${pct(r.halfRate)}`, v: money(r.sgst) }] : [{ k: `IGST @ ${pct(rate)}`, v: money(r.igst) }]),
    { k: `Tax amount (GST ${pct(rate)})`, v: money(r.tax), strong: true },
    { k: "Final total", v: money(r.total), strong: true },
    ...(num(v.qty) !== 1 ? [{ k: "Per unit (taxable → total)", v: `${money(r.unitTaxable)} → ${money(r.unitTotal)}` }] : []),
  ] : [];

  const text = () => r ? [
    `GST Calculation — Pushpak Refrigeration`,
    `${v.mode} · GST ${pct(rate)} · ${v.supply}`,
    `Amount: ${money(num(v.amount))} × ${v.qty}`,
    `Taxable value: ${money(r.taxable)}`,
    ...(intra ? [`CGST @ ${pct(r.halfRate)}: ${money(r.cgst)}`, `SGST @ ${pct(r.halfRate)}: ${money(r.sgst)}`] : [`IGST @ ${pct(rate)}: ${money(r.igst)}`]),
    `Tax amount: ${money(r.tax)}`,
    `Final total: ${money(r.total)}`,
  ].join("\n") : "";

  const copy = async () => {
    try { await navigator.clipboard.writeText(text()); flash("Copied"); } catch { flash("⚠ Could not copy on this device"); }
  };
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(text())}`, "_blank", "noopener");

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title={def.name} sub={`${def.no.toString().padStart(2, "0")} · ${def.category}`} onBack={ctx.onBack} />
      <div style={{ padding: "0 16px 24px" }}>
        <Box>
          <Seg l="Amount is" value={v.mode} onChange={(x) => set({ mode: x })} options={Object.keys(MODES)} />
          <Two>
            <F l="Amount" unit="₹" value={v.amount} onChange={(x) => set({ amount: x })} placeholder="10000" />
            <F l="Quantity" value={v.qty} onChange={(x) => set({ qty: x })} />
          </Two>
          <Sel l="GST rate" value={v.rate} onChange={(x) => set({ rate: x })} options={GST_RATES.map((g) => [String(g), pct(g)] as [string, string])} hint="Split AC / window AC: 18% (from 22 Sep 2025). Check the HSN rate for other items." />
          <Seg l="Supply" value={v.supply} onChange={(x) => set({ supply: x })} options={Object.keys(SUPPLIES)} />
          <p style={{ ...small, marginTop: -4 }}>{intra ? "Same state — GST split equally into CGST + SGST." : "Other state — full GST charged as IGST."}</p>
        </Box>

        <div style={{ ...card, padding: 14 }} aria-live="polite">
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 14 }}>Result</p>
          {!r && !error && <p style={{ ...small, margin: 0 }}>Enter an amount — the result updates as you type.</p>}
          {error && <p role="alert" style={{ ...small, color: "var(--error-text)", margin: 0 }}>{error}</p>}
          {r && (
            <dl style={{ margin: 0 }}>{rows.map((x, i) => (
              <div key={x.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: i ? "1px solid var(--line)" : "none", fontSize: x.k === "Final total" ? 16 : 13.5 }}>
                <dt style={{ color: "var(--ink-soft)" }}>{x.k}</dt><dd style={{ margin: 0, fontWeight: x.strong ? 800 : 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{x.v}</dd>
              </div>))}
            </dl>
          )}
          {r && <p style={{ ...small, marginTop: 8 }}>{inclusive ? `Taxable = ${money(r.gross)} ÷ ${1 + rate / 100}` : `GST = ${money(r.taxable)} × ${pct(rate)}`} · all values rounded to 2 decimals.</p>}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button disabled={!r} onClick={copy} className="press" style={{ ...btn, opacity: r ? 1 : 0.5 }}>Copy</button>
          <button onClick={() => setV(INIT)} className="press" style={btn}>Reset</button>
          <button disabled={!r} onClick={whatsapp} className="press" style={{ ...btn, background: "#25D366", borderColor: "#25D366", color: "#fff", opacity: r ? 1 : 0.5 }}>WhatsApp</button>
        </div>
        <div style={{ marginTop: 12 }}><Note tone="off">Works offline — no internet needed for the calculation.</Note></div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { flex: 1, border: "1.5px solid var(--line-strong)", background: "var(--surface)", borderRadius: 14, padding: "12px 10px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", color: "var(--text-secondary)" };
