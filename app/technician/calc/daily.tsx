"use client";

import { ToolError, customerBill, materialRequirement, summariseIntervals, travelClaim, type BillLine, type Interval } from "../../lib/calc/tools";
import { addMonths, computeMonth, currentMonth, fmtMonth, salaryFor } from "../../lib/finance";
import { fmtDate, isoDay, nowIso, type Job } from "../../lib/data";
import { createToolClaim, requestCorrection, requestReturn, requestStock } from "../../lib/store";
import { Box, CalcShell, F, Note, Sel, Seg, Two, fmt, myJobs, num, rs, useCalc, type Ctx, type Result } from "./kit";

/* 20–24 · Daily Work & Billing. Calculating never changes time, payroll, claims, stock or invoices;
 * every change goes through the existing request → office approval workflow. */

const jobOptions = (ctx: Ctx, blank = "— Select job —") => [["", blank], ...myJobs(ctx.db, ctx.tech.id).map((j) => [j.id, `${j.id} · ${ctx.db.customers.find((c) => c.id === j.customerId)?.name ?? ""}${j.techId !== ctx.tech.id ? " (helper)" : ""}`] as [string, string])] as [string, string][];
const h = (x: number) => `${fmt(x, 2)} h`;

/* ───────────── 20 Work & travel hours ───────────── */

type Manual = { kind: Interval["kind"]; start: string; end: string; reason: string };
export function WorkHours({ ctx }: { ctx: Ctx }) {
  const { db, tech } = ctx;
  const init = { from: isoDay(0), to: isoDay(0), job: "", manual: [] as Manual[] };
  const calc = useCalc(init, (v): Result => {
    if (!v.from || !v.to || v.to < v.from) throw new ToolError("Choose a valid date range.");
    const logs = db.timeLogs.filter((l) => l.techId === tech.id && l.status !== "Rejected" && l.start.slice(0, 10) <= v.to && (l.end ?? l.start).slice(0, 10) >= v.from && (!v.job || l.jobId === v.job));
    const running = logs.filter((l) => !l.end);
    const ints: Interval[] = [...logs.map((l) => ({ id: l.id, kind: l.kind, start: l.start, end: l.end ?? nowIso() })), ...v.manual.map((m) => ({ kind: m.kind, start: m.start, end: m.end }))];
    if (!ints.length) return { summary: [{ k: "Recorded", v: "No timer entries in this range" }] };
    const s = summariseIntervals(ints);
    const approved = logs.filter((l) => l.status === "Approved").length;
    return {
      summary: [{ k: "Work", v: h(s.work), strong: true }, { k: "Travel", v: h(s.travel) }, { k: "Break", v: h(s.break) }, { k: "Total recorded duty", v: h(s.duty), strong: true }, { k: "Entries", v: `${logs.length} timer (${approved} approved, ${logs.length - approved} awaiting approval)${v.manual.length ? ` + ${v.manual.length} manual (not yet approved)` : ""}` }],
      warnings: [...(s.overlaps.length ? [`${s.overlaps.length} overlapping entr${s.overlaps.length === 1 ? "y" : "ies"} — overlapping time counted once (break > work > travel). Send a correction to fix the record.`] : []), ...(running.length ? ["A timer is still running — its time is counted up to now."] : [])],
      breakdown: ["Each minute is counted once: overlaps are merged so nothing is double counted.", ...(s.overnight ? ["Includes an overnight entry — counted across midnight."] : [])],
      assumptions: ["Only your own entries. Payroll uses approved entries only; manual entries count after the office approves them."],
      outputs: { work: s.work, travel: s.travel, break: s.break, duty: s.duty },
    };
  });
  const { v, set } = calc;
  const upd = (i: number, p: Partial<Manual>) => set({ manual: v.manual.map((m, j) => (j === i ? { ...m, ...p } : m)) });
  return <CalcShell ctx={ctx} calc={calc}
    extraActions={() => v.manual.length > 0 && (
      <button className="press" onClick={() => {
        for (const m of v.manual) {
          const err = requestCorrection({ logId: null, techId: tech.id, jobId: v.job || null, kind: m.kind, start: m.start, end: m.end, reason: m.reason }, tech.name);
          if (err) { ctx.flash(`⚠ ${err}`); return; }
        }
        ctx.flash(`${v.manual.length} manual entr${v.manual.length === 1 ? "y" : "ies"} sent to the office for approval`);
        set({ manual: [] });
      }} style={{ border: "none", borderRadius: 14, padding: 12, fontWeight: 700, background: "var(--blue-tint)", color: "var(--blue)", cursor: "pointer" }}>Send manual entries for approval</button>
    )}
    form={<>
      <Box>
        <Two><F l="From" type="text" value={v.from} onChange={(x) => set({ from: x })} placeholder="YYYY-MM-DD" /><F l="To" type="text" value={v.to} onChange={(x) => set({ to: x })} placeholder="YYYY-MM-DD" /></Two>
        <Sel l="Job" value={v.job} onChange={(x) => set({ job: x })} options={jobOptions(ctx, "All jobs")} />
      </Box>
      <Box title="Manual entries (need approval)">
        {v.manual.map((m, i) => (
          <div key={i} style={{ borderTop: i ? "1px solid var(--line)" : "none", paddingTop: i ? 8 : 0 }}>
            <Sel l="Kind" value={m.kind} onChange={(x) => upd(i, { kind: x })} options={["Work", "Travel", "Break"] as const} />
            <F l="Start" type="datetime" value={m.start} onChange={(x) => upd(i, { start: x })} />
            <F l="End (next day allowed)" type="datetime" value={m.end} onChange={(x) => upd(i, { end: x })} />
            <F l="Reason" type="text" value={m.reason} onChange={(x) => upd(i, { reason: x })} />
          </div>
        ))}
        <button onClick={() => set({ manual: [...v.manual, { kind: "Work", start: `${isoDay(0)}T09:00`, end: `${isoDay(0)}T10:00`, reason: "" }] })} style={{ background: "none", border: "none", color: "var(--blue)", fontWeight: 600, cursor: "pointer", padding: 0 }}>+ Add manual entry</button>
      </Box>
    </>} />;
}

/* ───────────── 21 Overtime estimate ───────────── */

export function OvertimeEstimate({ ctx }: { ctx: Ctx }) {
  const { db, tech } = ctx;
  const months = [0, -1, -2].map((n) => addMonths(currentMonth(), n));
  const visible = db.fin.salaryVisibleTo.includes(tech.id);
  const init = { month: months[0] };
  const calc = useCalc(init, (v): Result => {
    const st = salaryFor(db, tech.id, v.month);
    if (!st) return { summary: [], unavailable: "No salary record for this month — ask the office." };
    if (!st.otEnabled) return { summary: [{ k: "Overtime", v: "Not eligible under your current rules" }], assumptions: ["Overtime is switched off on your salary record. Ask the office if this is wrong."] };
    const me = computeMonth(db, v.month).find((m) => m.techId === tech.id);
    if (!me) throw new ToolError("Could not compute this month.");
    const run = db.payrollRuns.find((r) => r.month === v.month && r.status === "Approved");
    const approvedOt = run?.lines.filter((l) => l.techId === tech.id && l.type === "overtime").reduce((a, l) => a + l.amount, 0);
    return {
      summary: [
        { k: "Estimated eligible overtime", v: h(me.result.overtimeHours), strong: true },
        ...(visible ? [{ k: "Estimated overtime amount", v: rs(me.result.overtimePay) }] : [{ k: "Amount", v: "Hidden — salary details not shared with you" }]),
        { k: "Entries awaiting approval", v: String(me.pending) },
        ...(run ? [{ k: "Approved payroll", v: visible ? `Overtime paid ${rs(approvedOt ?? 0)}` : "Approved" }] : [{ k: "Payroll", v: `${fmtMonth(v.month)} not approved yet` }]),
      ],
      breakdown: [`Rule: hours beyond ${st.hoursPerDay} h on scheduled working days, and all hours on off days, at ×${st.otMultiplier}.`, "Counts APPROVED time only — pending entries are excluded until approved."],
      assumptions: ["Estimate only. Approved payroll is final and may differ.", ...(visible ? [] : ["Your hourly rate is not shown."])],
      outputs: { hours: me.result.overtimeHours },
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<Box><Sel l="Month" value={v.month} onChange={(x) => set({ month: x })} options={months.map((m) => [m, fmtMonth(m)] as [string, string])} /></Box>} />;
}

/* ───────────── 22 Travel / petrol claim ───────────── */

export function TravelClaim({ ctx }: { ctx: Ctx }) {
  const { db, tech } = ctx;
  const pol = db.fin.tools.travel;
  const methods = (pol.mode === "both" ? ["mileage", "actual", "both"] : pol.mode === "either" ? ["mileage", "actual"] : [pol.mode]) as ("mileage" | "actual" | "both")[];
  const init = { job: "", date: isoDay(0), method: methods[0], km: "", actual: "", receipt: "" };
  const calc = useCalc(init, (v): Result => {
    if (!v.date || v.date > isoDay(0)) throw new ToolError("Choose a date up to today.");
    const r = travelClaim(pol, { method: v.method, km: num(v.km), actual: num(v.actual), receiptRef: v.receipt });
    return {
      summary: [...(r.mileage ? [{ k: `Mileage ${v.km} km × ${rs(pol.ratePerKm)}`, v: rs(r.mileage) }] : []), ...(r.actual ? [{ k: `Actual fuel (receipt ${v.receipt || "—"})`, v: rs(r.actual) }] : []), { k: "Claim amount", v: rs(r.amount), strong: true }, { k: "For", v: `${v.job || "Monthly travel (no job)"} · ${fmtDate(v.date)}` }],
      breakdown: [`Office policy: ${pol.mode === "either" ? "mileage OR actual fuel per trip" : pol.mode === "both" ? "mileage and actual allowed together" : `${pol.mode} only`}. ${pol.note}`],
      assumptions: ["Submitting sends the claim for approval — it is not approved or reimbursed automatically."],
      outputs: r,
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} claimLabel="Create Claim"
    onClaim={(r, id) => {
      const out = r.outputs as { amount: number };
      return createToolClaim(id, { date: v.date, category: v.job ? (v.method === "actual" ? "Petrol (job)" : "Travel / auto fare (job)") : "Petrol (monthly pool)", cls: v.job ? "Direct job" : "Technician shared", amount: out.amount, jobId: v.job || null, techId: tech.id, paidBy: "Employee", note: `${v.method}${v.km ? ` ${v.km} km` : ""}${v.receipt ? ` · receipt ${v.receipt}` : ""} (Calculators)`, submittedBy: tech.name, claimMethod: v.method }, tech.name);
    }}
    form={<Box>
      <Sel l="Job" value={v.job} onChange={(x) => set({ job: x })} options={jobOptions(ctx, "No job — monthly travel")} />
      <F l="Date" type="text" value={v.date} onChange={(x) => set({ date: x })} placeholder="YYYY-MM-DD" />
      {methods.length > 1 ? <Seg l="Claim method" value={v.method} onChange={(x) => set({ method: x })} options={methods} /> : <Note>Policy: {pol.mode} claims only.</Note>}
      {(v.method === "mileage" || v.method === "both") && <F l="Distance" unit="km" value={v.km} onChange={(x) => set({ km: x })} hint={`Approved rate ${rs(pol.ratePerKm)} per km.`} />}
      {(v.method === "actual" || v.method === "both") && (<>
        <F l="Actual eligible amount" unit="₹" value={v.actual} onChange={(x) => set({ actual: x })} />
        <F l={`Receipt no. / photo ref${pol.receiptsRequired ? " (required)" : ""}`} type="text" value={v.receipt} onChange={(x) => set({ receipt: x })} />
      </>)}
    </Box>} />;
}

/* ───────────── 23 Material requirement ───────────── */

type Mat = { partId: string; planned: string; issued: string; consumed: string; returned: string };
const rowsForJob = (ctx: Ctx, j: Job | undefined): Mat[] => {
  const planned = new Map<string, number>();
  for (const l of j?.lines ?? []) if (l.kind === "Part" && l.refId && ctx.db.parts.some((p) => p.id === l.refId)) planned.set(l.refId, (planned.get(l.refId) ?? 0) + l.qty);
  return [...planned].map(([partId, n]) => ({ partId, planned: String(n), issued: "0", consumed: "0", returned: "0" }));
};

export function MaterialRequirement({ ctx }: { ctx: Ctx }) {
  const { db, tech } = ctx;
  const init = { job: "", rows: [] as Mat[] };
  const calc = useCalc(init, (v): Result => {
    if (!v.rows.length) throw new ToolError("Add at least one material (or pick a job with parts on its estimate).");
    const res = materialRequirement(v.rows.map((r) => { const p = db.parts.find((x) => x.id === r.partId); if (!p) throw new ToolError("Choose a material for every row."); return { name: p.name, unit: p.unit, partId: p.id, planned: num(r.planned), van: tech.van[p.id] ?? 0, issued: num(r.issued), consumed: num(r.consumed), returned: num(r.returned) }; }));
    const short = res.filter((r) => r.shortage > 0);
    const unused = res.filter((r) => r.unusedForReturn > 0);
    return {
      summary: [...res.flatMap((r) => [{ k: `${r.name}`, v: `need ${fmt(r.stillNeeded)} · van ${fmt(r.van)} ${r.unit}` }, ...(r.shortage ? [{ k: "  Shortage", v: `${fmt(r.shortage)} ${r.unit}`, strong: true }] : []), ...(r.unusedForReturn ? [{ k: "  Unused, can return", v: `${fmt(r.unusedForReturn)} ${r.unit}` }] : [])]), { k: "Consumed in total", v: res.map((r) => `${fmt(r.consumed)} ${r.unit} ${r.name.split(" ")[0]}`).join(", ") }],
      breakdown: ["Still needed = planned − consumed", "Shortage = still needed − held for this job − other van stock", "Unused = issued − consumed − returned − still needed"],
      assumptions: ["Calculating does not change stock. Shortages and returns go to the office as requests and are confirmed through the normal issue / return."],
      outputs: { shortage: Object.fromEntries(short.map((r) => [r.partId!, r.shortage])), unused: Object.fromEntries(unused.map((r) => [r.partId!, r.unusedForReturn])) },
    };
  });
  const { v, set } = calc;
  const upd = (i: number, p: Partial<Mat>) => set({ rows: v.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  return <CalcShell ctx={ctx} calc={calc}
    extraActions={(r) => { const o = r.outputs as { shortage: Record<string, number>; unused: Record<string, number> }; return (<>
      {Object.keys(o.shortage).length > 0 && <button className="press" onClick={() => { requestStock(tech.id, Object.fromEntries(Object.entries(o.shortage).map(([k, n]) => [k, Math.ceil(n)]))); ctx.flash("Stock request sent to the office"); }} style={act}>Request shortage from office</button>}
      {Object.keys(o.unused).length > 0 && <button className="press" onClick={() => { requestReturn(tech.id, o.unused, v.job || null); ctx.flash("Return request sent — the office confirms it"); }} style={act}>Request return of unused material</button>}
    </>); }}
    form={<>
      <Box><Sel l="Job" value={v.job} onChange={(x) => set({ job: x, rows: rowsForJob(ctx, db.jobs.find((j) => j.id === x)) })} options={jobOptions(ctx, "No job")} hint="Planned quantities come from the parts on the job's estimate." /></Box>
      {v.rows.map((r, i) => (
        <Box key={i}>
          <Sel l="Material" value={r.partId} onChange={(x) => upd(i, { partId: x })} options={[["", "—"], ...db.parts.map((p) => [p.id, `${p.name} (van: ${tech.van[p.id] ?? 0} ${p.unit})`] as [string, string])]} />
          <Two><F l="Planned" value={r.planned} onChange={(x) => upd(i, { planned: x })} /><F l="Issued for job" value={r.issued} onChange={(x) => upd(i, { issued: x })} /></Two>
          <Two><F l="Consumed" value={r.consumed} onChange={(x) => upd(i, { consumed: x })} /><F l="Returned" value={r.returned} onChange={(x) => upd(i, { returned: x })} /></Two>
        </Box>
      ))}
      <button onClick={() => set({ rows: [...v.rows, { partId: "", planned: "1", issued: "0", consumed: "0", returned: "0" }] })} style={{ background: "none", border: "none", color: "var(--blue)", fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 10 }}>+ Add material</button>
    </>} />;
}
const act: React.CSSProperties = { border: "none", borderRadius: 14, padding: 12, fontWeight: 700, background: "var(--blue-tint)", color: "var(--blue)", cursor: "pointer" };

/* ───────────── 24 Customer bill ───────────── */

/** Which estimate lines the customer has approved: all after approval; on a pending revision, the earlier lines. */
export function billLines(j: Job): BillLine[] {
  const q = j.quote;
  const allApproved = q?.status === "Approved" || !!j.invoice;
  const baseApproved = allApproved || (q?.status === "Pending" && (q.revision ?? 1) > 1);
  return j.lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, price: l.price, approved: allApproved || (baseApproved && !l.addOn) }));
}

export function CustomerBill({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const T = db.fin.tools;
  const init = { job: "", discount: "" };
  const calc = useCalc(init, (v): Result => {
    const j = myJobs(db, ctx.tech.id).find((x) => x.id === v.job);
    if (!j) throw new ToolError("Select one of your jobs.");
    const lines = billLines(j);
    const proposed = v.discount.trim() !== "";
    const disc = proposed ? num(v.discount) : j.discount;
    const sub0 = lines.filter((l) => l.approved).reduce((a, l) => a + l.qty * l.price, 0);
    if (proposed && !(disc >= 0)) throw new ToolError("Discount must be 0 or more.");
    if (proposed && disc > (sub0 * T.maxTechDiscountPct) / 100 + 1e-9) throw new ToolError(`Discount above ${T.maxTechDiscountPct}% needs office approval.`);
    const b = customerBill(lines, disc, db.settings.gstEnabled, db.settings.gstPercent, j.payments);
    return {
      summary: [
        ...b.billed.map((l) => ({ k: `${l.name}${l.qty !== 1 ? ` × ${l.qty}` : ""}`, v: rs(l.qty * l.price) })),
        { k: "Subtotal", v: rs(b.subtotal) }, ...(b.discount ? [{ k: proposed ? "Discount (proposed)" : "Discount", v: `− ${rs(b.discount)}` }] : []), { k: "Taxable value", v: rs(b.taxable) },
        { k: `CGST ${db.settings.gstPercent / 2}%`, v: rs(b.cgst) }, { k: `SGST ${db.settings.gstPercent / 2}%`, v: rs(b.sgst) },
        { k: "Final bill", v: rs(b.total), strong: true }, { k: "Paid (advances & payments)", v: rs(b.paid) },
        b.credit ? { k: "Customer credit", v: rs(b.credit), strong: true } : { k: "Balance due", v: rs(b.balance), strong: true },
      ],
      warnings: [...(b.pending.length ? [`${b.pending.length} line(s) not approved by the customer yet — not billed: ${b.pending.map((l) => l.name).join(", ")}`] : []), ...(proposed && disc !== j.discount ? ["Proposed discount only — the invoice is unchanged until the office applies it."] : [])],
      breakdown: ["Only customer-approved estimate lines are billed, each once.", "GST is rounded to the rupee, as on the invoice; shown as CGST + SGST (intra-state)."],
      assumptions: ["Saving this calculation does not create, change or mark any invoice as paid."],
      outputs: { total: b.total, paid: b.paid, balance: b.balance, credit: b.credit },
    };
  });
  const { v, set } = calc;
  return <CalcShell ctx={ctx} calc={calc} form={<Box>
    <Sel l="Job" value={v.job} onChange={(x) => set({ job: x })} options={jobOptions(ctx)} />
    <F l="Proposed discount (optional)" unit="₹" value={v.discount} onChange={(x) => set({ discount: x })} hint={`Leave blank to use the job's current discount. Up to ${T.maxTechDiscountPct}% without office approval.`} />
  </Box>} />;
}
