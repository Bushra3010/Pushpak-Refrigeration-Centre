"use client";

import { PipeInputError, kgPerMetre, lengthFromWeight, nearestGauge, pipePrice, wallFromWeight, type RateBasis } from "../../lib/calc/pipe";
import { M_PER_FOOT, parseInches } from "../../lib/calc/units";
import { PIPE_PRESETS } from "../../lib/finance-types";
import { Box, CalcShell, F, Note, Sel, Seg, Two, fmt, num, rs, useCalc, type Ctx, type Result } from "./kit";
import { toLines } from "./install";

/* ───────────── 27 Copper pipe solver ─────────────
 * Find whichever one is unknown: wall thickness / gauge, total weight, total length, or the price.
 *   Wall / gauge   ← OD + total weight + total length
 *   Total weight   ← OD + wall + length + quantity
 *   Total length   ← OD + wall + total weight
 *   Total price    ← rate per kg / foot / metre × the matching weight or length */

type Mode = "Wall / Gauge" | "Total Weight" | "Total Length" | "Price";
const MODES: Mode[] = ["Wall / Gauge", "Total Weight", "Total Length", "Price"];

const wrap = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof PipeInputError) throw new Error(e.message); throw e; } };

export function CopperSolver({ ctx }: { ctx: Ctx }) {
  const f = ctx.db.fin;
  const density = f.copperDensity;
  const init = { mode: "Total Weight" as Mode, od: "3/8", odUnit: "in" as "in" | "mm", wall: "0.81", weight: "", length: "", lengthUnit: "m" as "m" | "ft", qty: "1", rate: String(f.copperRatePerKg), basis: "kg" as RateBasis, priceWeight: "", priceLength: "" };
  const calc = useCalc(init, (v): Result => wrap(() => {
    const od = v.odUnit === "in" ? parseInches(v.od) : num(v.od);
    if (od == null || !(od > 0)) throw new Error("Enter the outside diameter (e.g. 3/8 or 9.52).");
    const odMm = v.odUnit === "in" ? od * 25.4 : od;
    const toM = (x: number) => (v.lengthUnit === "ft" ? x * M_PER_FOOT : x);
    const lenText = (m: number) => `${fmt(m, 3)} m (${fmt(m / M_PER_FOOT, 2)} ft)`;
    const odText = `${v.od} ${v.odUnit === "in" ? "inch" : "mm"} (${fmt(odMm, 2)} mm)`;
    const densNote = `Copper density ${density} kg/m³ — ${f.densitySource}`;

    if (v.mode === "Wall / Gauge") {
      const W = num(v.weight), L = toM(num(v.length));
      const t = wallFromWeight(odMm, W, L, density);
      const matches = f.gauges.map((g) => ({ g, n: nearestGauge(t, g.sizes)! })).filter((x) => x.n);
      return {
        summary: [
          { k: "Outside diameter", v: odText }, { k: "Total weight", v: `${fmt(W, 3)} kg` }, { k: "Total length", v: lenText(L) },
          { k: "Wall thickness", v: `${fmt(t, 3)} mm (${fmt(t / 25.4, 4)} in)`, strong: true },
          { k: "Inside diameter", v: `${fmt(odMm - 2 * t, 2)} mm` },
          ...matches.map(({ g, n }) => ({ k: `Nearest ${g.code} gauge`, v: `${n.gauge} (${fmt(n.mm, 3)} mm, ${n.diffMm >= 0 ? "+" : "−"}${fmt(Math.abs(n.diffMm), 3)} mm)`, strong: true })),
        ],
        breakdown: [
          `Metal area = weight ÷ (density × length) = ${fmt(W, 3)} ÷ (${density} × ${fmt(L, 3)}) = ${(W / (density * L)).toExponential(4)} m²`,
          "ID = √(OD² − 4 × area ÷ π); wall = (OD − ID) ÷ 2",
        ],
        warnings: matches.some(({ n }) => Math.abs(n.diffMm) > 0.05) ? ["The wall does not match a standard gauge closely — the pipe may be a non-standard wall, or the weight / length includes fittings or insulation."] : undefined,
        assumptions: [densNote, ...f.gauges.map((g) => `${g.code}: ${g.source}${g.verified ? "" : " (not yet verified by office)"}`)],
        outputs: { odMm, wallMm: t, weightKg: W, lengthM: L },
      };
    }
    const wall = num(v.wall);
    if (!(wall > 0) || 2 * wall >= odMm) throw new Error("Wall thickness must be more than 0 and less than half the OD.");
    const kgM = kgPerMetre(odMm, odMm - 2 * wall, density);

    if (v.mode === "Total Weight") {
      const L1 = toM(num(v.length)), q = num(v.qty);
      if (!(L1 > 0)) throw new Error("Enter the length per piece."); if (!(q > 0)) throw new Error("Quantity must be more than 0.");
      const L = L1 * q, W = kgM * L;
      return {
        summary: [
          { k: "Outside diameter", v: odText }, { k: "Wall thickness", v: `${fmt(wall, 3)} mm` }, { k: "Length", v: `${lenText(L1)} × ${q}` },
          { k: "Weight per metre", v: `${fmt(kgM, 4)} kg/m (${fmt(kgM * M_PER_FOOT, 4)} kg/ft)` },
          { k: "Total length", v: lenText(L) }, { k: "Total weight", v: `${fmt(W, 3)} kg (${fmt(W * 1000, 0)} g)`, strong: true },
        ],
        breakdown: [`kg/m = π/4 × (OD² − ID²) × ρ = π/4 × (${fmt(odMm, 2)}² − ${fmt(odMm - 2 * wall, 2)}²) mm² × ${density} kg/m³ = ${fmt(kgM, 4)} kg/m`, `Total = ${fmt(kgM, 4)} × ${fmt(L, 3)} m = ${fmt(W, 3)} kg`],
        assumptions: [densNote, "Net metal weight only — add wastage and insulation separately."],
        outputs: { odMm, wallMm: wall, lengthM: L, weightKg: W, kgPerM: kgM },
      };
    }
    if (v.mode === "Total Length") {
      const W = num(v.weight);
      const L = lengthFromWeight(odMm, wall, W, density);
      return {
        summary: [
          { k: "Outside diameter", v: odText }, { k: "Wall thickness", v: `${fmt(wall, 3)} mm` }, { k: "Total weight", v: `${fmt(W, 3)} kg` },
          { k: "Weight per metre", v: `${fmt(kgM, 4)} kg/m` }, { k: "Total length", v: lenText(L), strong: true },
        ],
        breakdown: [`Length = weight ÷ kg/m = ${fmt(W, 3)} ÷ ${fmt(kgM, 4)} = ${fmt(L, 3)} m`],
        assumptions: [densNote],
        outputs: { odMm, wallMm: wall, weightKg: W, lengthM: L },
      };
    }
    // Price: use whichever total is given; derive the other from the pipe size so any rate basis works.
    const rate = num(v.rate);
    const Wgiven = v.priceWeight.trim() !== "" ? num(v.priceWeight) : null;
    const Lgiven = v.priceLength.trim() !== "" ? toM(num(v.priceLength)) : null;
    if (Wgiven == null && Lgiven == null) throw new Error("Enter the total weight or the total length to price.");
    const L = Lgiven ?? Wgiven! / kgM;
    const W = Wgiven ?? kgM * L;
    const p = pipePrice(rate, v.basis, W, L);
    return {
      summary: [
        { k: "Pipe", v: `${odText} × ${fmt(wall, 3)} mm wall` },
        { k: "Total weight", v: `${fmt(W, 3)} kg${Wgiven == null ? " (from length)" : ""}` }, { k: "Total length", v: `${lenText(L)}${Lgiven == null ? " (from weight)" : ""}` },
        { k: `Rate per ${p.unit}`, v: rs(rate) }, { k: "Quantity priced", v: `${fmt(p.qty, 3)} ${p.unit}` },
        { k: "Total price", v: rs(p.amount), strong: true },
      ],
      breakdown: [`Price = ${fmt(p.qty, 3)} ${p.unit} × ${rs(rate)} = ${rs(p.amount)}`, `Weight per metre ${fmt(kgM, 4)} kg/m links weight and length.`],
      assumptions: [densNote, "Price before GST and wastage. Use Copper Pipe Calculator (01) for a customer quotation."],
      outputs: { odMm, wallMm: wall, weightKg: W, lengthM: L, rate, basis: v.basis, amount: p.amount },
      lines: toLines([{ name: `Copper pipe ${v.od}${v.odUnit === "in" ? '"' : " mm"} × ${fmt(wall, 2)} mm`, kind: "Material", qty: Math.round(p.qty * 1000) / 1000, unit: p.unit, rate }]),
    };
  }));
  const { v, set } = calc;
  const needWall = v.mode !== "Wall / Gauge";
  return <CalcShell ctx={ctx} calc={calc} onDemo={() => calc.load({ ...init, mode: "Wall / Gauge", weight: "2.75", length: "15" })} form={<Box>
    <Seg l="Find" value={v.mode} onChange={(x) => set({ mode: x })} options={MODES} />
    <Two>
      <F l="Outside diameter" type="text" value={v.od} onChange={(x) => set({ od: x })} placeholder={v.odUnit === "in" ? "3/8" : "9.52"} />
      <Sel l="OD unit" value={v.odUnit} onChange={(x) => set({ odUnit: x })} options={[["in", "inch"], ["mm", "mm"]]} />
    </Two>
    <Sel l="Preset (ASTM B280 ACR)" value="" onChange={(x) => { const p = PIPE_PRESETS.find((y) => y.label === x); if (p) set({ od: String(p.odMm), odUnit: "mm", wall: String(p.wallMm) }); }} options={[["", "— pick a size —"], ...PIPE_PRESETS.map((p) => [p.label, p.label] as [string, string])]} />
    {needWall && <F l="Wall thickness" unit="mm" value={v.wall} onChange={(x) => set({ wall: x })} hint="0.81 mm = 0.032 in (common for 3/8″ and 1/2″)." />}
    {v.mode === "Wall / Gauge" && <>
      <F l="Total weight" unit="kg" value={v.weight} onChange={(x) => set({ weight: x })} />
      <Two><F l="Total length" value={v.length} onChange={(x) => set({ length: x })} /><Sel l="Unit" value={v.lengthUnit} onChange={(x) => set({ lengthUnit: x })} options={["m", "ft"]} /></Two>
    </>}
    {v.mode === "Total Weight" && <>
      <Two><F l="Length per piece" value={v.length} onChange={(x) => set({ length: x })} /><Sel l="Unit" value={v.lengthUnit} onChange={(x) => set({ lengthUnit: x })} options={["m", "ft"]} /></Two>
      <F l="Quantity (pieces)" value={v.qty} onChange={(x) => set({ qty: x })} />
    </>}
    {v.mode === "Total Length" && <F l="Total weight" unit="kg" value={v.weight} onChange={(x) => set({ weight: x })} />}
    {v.mode === "Price" && <>
      <Two><F l="Rate" unit="₹" value={v.rate} onChange={(x) => set({ rate: x })} /><Sel l="Rate per" value={v.basis} onChange={(x) => set({ basis: x })} options={[["kg", "kg"], ["m", "metre"], ["ft", "foot"]]} /></Two>
      <F l="Total weight (optional)" unit="kg" value={v.priceWeight} onChange={(x) => set({ priceWeight: x })} />
      <Two><F l="Total length (optional)" value={v.priceLength} onChange={(x) => set({ priceLength: x })} /><Sel l="Unit" value={v.lengthUnit} onChange={(x) => set({ lengthUnit: x })} options={["m", "ft"]} /></Two>
      <Note>Give weight or length — the other is worked out from the pipe size.</Note>
    </>}
  </Box>} />;
}
