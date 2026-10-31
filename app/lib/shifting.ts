/* AC Shifting — Pre-Removal Inspection (spec: "Developer handoff, Technician app module", v1.0, 28 Oct 2026).
 * The technician records the AC's existing condition, site access and materials BEFORE removal; the office
 * reviews and authorises removal. An inspection record, not proof of repair or refrigerant charge. */

export const INSP_STATUSES = ["Draft", "Submitted", "Correction Required", "On Hold – Unsafe", "Awaiting Customer Approval", "Approved for Removal", "Cancelled"] as const;
export type InspStatus = (typeof INSP_STATUSES)[number];

export const NOT_CHECKED = "Not Checked";
export const INACCESSIBLE = "Inaccessible";

export type CheckItem = { key: string; label: string; options: string[]; ok: string[] };
const I = (key: string, label: string, options: string[], ok: string[]): CheckItem => ({ key, label, options: [...options, INACCESSIBLE, NOT_CHECKED], ok });

/** Section 4 — Split AC indoor unit (7 items). */
export const SPLIT_INDOOR: CheckItem[] = [
  I("indoor_body", "Indoor body / front panel", ["OK", "Cracked", "Broken Clips", "Damaged"], ["OK"]),
  I("swing", "Swing / louvers", ["Working", "Not Working", "Louvers Broken", "Stuck", "N/A"], ["Working", "N/A"]),
  I("display", "Display / indicators", ["Working", "Faulty", "Not Available"], ["Working"]),
  I("remote", "Remote control", ["Working", "Faulty", "Replacement Required", "Not Available"], ["Working"]),
  I("indoor_pcb", "Indoor PCB / controls", ["Working", "Faulty"], ["Working"]),
  I("blower", "Indoor fan / blower", ["Working", "Blower Bush Worn", "Blower Broken", "Noise / Vibration"], ["Working"]),
  I("cooling", "Cooling performance", ["Normal Cooling", "Low Cooling", "No Cooling"], ["Normal Cooling"]),
];

/** Section 5 — Split AC outdoor unit (9 items). */
export const SPLIT_OUTDOOR: CheckItem[] = [
  I("grille", "Outdoor plastic grille", ["Available – OK", "Not Available", "Damaged"], ["Available – OK"]),
  I("terminal_cover", "Wiring / terminal cover panel", ["Available – OK", "Not Available", "Damaged"], ["Available – OK"]),
  I("outdoor_body", "Outdoor body / base", ["OK", "Dented", "Rusted", "Base Damaged"], ["OK"]),
  I("condenser", "Condenser coil", ["OK", "Bent Fins", "Corroded", "Damaged"], ["OK"]),
  I("compressor", "Compressor running condition", ["Normal", "Abnormal Noise", "Excessive Vibration", "Not Running"], ["Normal"]),
  I("fan_motor", "Outdoor fan motor", ["Working", "Noise / Vibration", "Faulty"], ["Working"]),
  I("fan_blade", "Outdoor fan blade", ["OK", "Cracked / Broken", "Damaged"], ["OK"]),
  I("valves", "Service valves / nuts / caps", ["OK", "Leakage Suspected", "Nut / Cap Missing", "Valve Damaged"], ["OK"]),
  I("outdoor_pcb", "Outdoor PCB / electrical", ["Working", "Faulty"], ["Working"]),
];

/** Section 8 — Window AC combined unit (recommended; to be confirmed with PRC). */
export const WINDOW_ITEMS: CheckItem[] = [
  I("w_cabinet", "Cabinet / front grille", ["OK", "Cracked", "Damaged", "Grille Missing"], ["OK"]),
  I("w_evaporator", "Evaporator (cooling) coil", ["OK", "Dirty", "Corroded", "Damaged"], ["OK", "Dirty"]),
  I("w_condenser", "Condenser coil", ["OK", "Bent Fins", "Corroded", "Damaged"], ["OK"]),
  I("w_compressor", "Compressor running condition", ["Normal", "Abnormal Noise", "Excessive Vibration", "Not Running"], ["Normal"]),
  I("w_fan", "Fan motor / blade", ["Working", "Noise / Vibration", "Blade Damaged", "Faulty"], ["Working"]),
  I("w_controls", "Controls / PCB", ["Working", "Faulty"], ["Working"]),
  I("w_drain", "Drain / water tray", ["OK", "Blocked", "Leaking", "Rusted"], ["OK"]),
  I("w_cooling", "Cooling performance", ["Normal Cooling", "Low Cooling", "No Cooling"], ["Normal Cooling"]),
  I("w_cable", "Supply cable / plug", ["OK", "Damaged", "Short / Joint"], ["OK"]),
  I("w_mounting", "Mounting / frame / access", ["OK", "Frame Rusted", "Frame Damaged", "Difficult Access"], ["OK"]),
];

export const AC_KINDS = ["Split AC", "Window AC"] as const;
export const CAPACITIES = ["0.75", "1", "1.2", "1.5", "1.8", "2", "Other"] as const;
export const SERVICE_REQ = ["Not Required", "Normal Service", "Deep Cleaning"] as const;
export const SERVICE_LOC = ["Old Location", "New Location"] as const;
export const OUTDOOR_AT = ["Balcony", "Terrace / Rooftop", "Outdoor Slab / Projection", "Back-to-Back Installation", "External Wall / Height", "Other"] as const;
export const LADDER = ["Not Required", "Ladder Required", "Scaffold / Lift Required"] as const;
export const SAFETY = ["Safe to Proceed", "Unsafe / Hold Work", "Pending Assessment"] as const;
export const ISOLATION = ["Confirmed", "Not Confirmed", "Not Applicable"] as const;
export const COPPER = ["Reusable After Inspection", "New Copper Pipe Required", NOT_CHECKED] as const;
export const BRACKET = ["Reusable After Inspection", "New Stand Required", NOT_CHECKED] as const;
export const REFRIGERANT = ["R22", "R32", "R410A", "Not Confirmed"] as const;
export const GAS = ["OK – No Charging Indicated", "Top-up Assessment Required", "Full Recharge Assessment Required", "Leak Suspected", NOT_CHECKED] as const;
export const FAULTS_EXPLAINED = ["Approved / Acknowledged", "Pending", "Not Applicable"] as const;

/** Suggested mandatory overview photos (section 9). */
export const OVERVIEW_PHOTOS = [
  { key: "ov_indoor", label: "Indoor unit — front" },
  { key: "ov_outdoor", label: "Outdoor unit — front / base" },
  { key: "ov_piping", label: "Piping / service valves" },
  { key: "ov_mounting", label: "Outdoor mounting / access" },
] as const;

export interface Answer { value: string; remark: string; photos: string[]; checkedAt?: string }
export interface AuditEvent { at: string; by: string; action: string; detail?: string }

export interface ShiftingInspection {
  id: string;
  jobId: string | null;
  customerId: string | null;
  acId: string | null;
  techId: string;
  techName: string;
  status: InspStatus;
  createdAt: string;
  inspectedAt: string;
  submittedAt?: string;
  customer: { name: string; mobile: string; oldLocation: string; newLocation: string };
  ac: { kind: (typeof AC_KINDS)[number]; capacity: (typeof CAPACITIES)[number]; capacityOther: string; brandModel: string };
  answers: Record<string, Answer>;
  site: {
    serviceRequired: (typeof SERVICE_REQ)[number]; serviceLocation: (typeof SERVICE_LOC)[number] | "";
    outdoorAt: (typeof OUTDOOR_AT)[number]; outdoorOther: string; heightFt: string;
    manpower: "Yes" | "No"; manpowerCount: string; manpowerReason: string;
    ladder: (typeof LADDER)[number]; safety: (typeof SAFETY)[number]; accessNotes: string; isolation: (typeof ISOLATION)[number];
  };
  materials: {
    copper: (typeof COPPER)[number]; bracket: (typeof BRACKET)[number];
    refrigerant: (typeof REFRIGERANT)[number]; gas: (typeof GAS)[number];
    faultsExplained: (typeof FAULTS_EXPLAINED)[number]; remarks: string;
  };
  overview: Record<string, string[]>;
  customerAck: { name: string; at: string; method: "OTP" | "Signature on paper" | "Recorded call" } | null;
  office: { decision: "Approved" | "Hold" | "Correction" | null; by: string; at: string; notes: string } | null;
  audit: AuditEvent[];
}

export type InspectionDraft = Pick<ShiftingInspection, "customer" | "ac" | "answers" | "site" | "materials" | "overview" | "customerAck" | "jobId" | "customerId" | "acId">;

export const itemsFor = (kind: ShiftingInspection["ac"]["kind"]) =>
  kind === "Window AC" ? [{ title: "Window AC unit", items: WINDOW_ITEMS }] : [{ title: "Indoor unit", items: SPLIT_INDOOR }, { title: "Outdoor unit", items: SPLIT_OUTDOOR }];
export const allItems = (kind: ShiftingInspection["ac"]["kind"]) => itemsFor(kind).flatMap((s) => s.items);

export const emptyAnswer = (): Answer => ({ value: NOT_CHECKED, remark: "", photos: [] });

export function blankInspection(): InspectionDraft {
  return {
    jobId: null, customerId: null, acId: null,
    customer: { name: "", mobile: "", oldLocation: "", newLocation: "" },
    ac: { kind: "Split AC", capacity: "1.5", capacityOther: "", brandModel: "" },
    answers: {},
    site: { serviceRequired: "Not Required", serviceLocation: "", outdoorAt: "Balcony", outdoorOther: "", heightFt: "", manpower: "No", manpowerCount: "", manpowerReason: "", ladder: "Not Required", safety: "Pending Assessment", accessNotes: "", isolation: "Not Confirmed" },
    materials: { copper: NOT_CHECKED, bracket: NOT_CHECKED, refrigerant: "Not Confirmed", gas: NOT_CHECKED, faultsExplained: "Pending", remarks: "" },
    overview: {}, customerAck: null,
  };
}

export const answerOf = (d: Pick<InspectionDraft, "answers">, key: string): Answer => d.answers[key] ?? emptyAnswer();
export const isAbnormal = (item: CheckItem, a: Answer) => a.value !== NOT_CHECKED && a.value !== INACCESSIBLE && !item.ok.includes(a.value);

/** "Not Checked" is incomplete, not OK. Inaccessible counts once a reason is written. */
export function progress(d: Pick<InspectionDraft, "answers" | "ac">) {
  const items = allItems(d.ac.kind);
  const done = items.filter((it) => { const a = answerOf(d, it.key); return a.value !== NOT_CHECKED && (a.value !== INACCESSIBLE || a.remark.trim()); }).length;
  const faults = items.filter((it) => isAbnormal(it, answerOf(d, it.key)));
  return { done, total: items.length, pending: items.length - done, faults };
}

export type Flag = { tone: "red" | "amber" | "blue"; text: string };

/** Office flags (section 8 / 11): logistics, materials, safety, faults. Never automatic bills. */
export function flagsOf(d: InspectionDraft): Flag[] {
  const f: Flag[] = [];
  const p = progress(d);
  if (d.site.safety === "Unsafe / Hold Work") f.push({ tone: "red", text: "Site marked UNSAFE — hold work" });
  if (d.site.safety === "Pending Assessment") f.push({ tone: "amber", text: "Site safety assessment pending" });
  if (d.site.isolation !== "Confirmed" && d.site.isolation !== "Not Applicable") f.push({ tone: "amber", text: "Electrical isolation not confirmed" });
  if (p.faults.length) f.push({ tone: "red", text: `${p.faults.length} existing fault${p.faults.length === 1 ? "" : "s"}: ${p.faults.map((x) => x.label).join(", ")}` });
  if (d.materials.copper === "New Copper Pipe Required") f.push({ tone: "blue", text: "New copper pipe required — confirm estimate" });
  if (d.materials.bracket === "New Stand Required") f.push({ tone: "blue", text: "New outdoor stand required — confirm estimate" });
  if (d.site.manpower === "Yes") f.push({ tone: "blue", text: `Extra manpower: ${d.site.manpowerCount || "?"} (${d.site.manpowerReason || "no reason given"})` });
  if (d.site.ladder !== "Not Required") f.push({ tone: "blue", text: d.site.ladder });
  if (["Leak Suspected", "Full Recharge Assessment Required", "Top-up Assessment Required"].includes(d.materials.gas)) f.push({ tone: "amber", text: `Gas: ${d.materials.gas} — diagnose before any charging` });
  if (d.site.serviceRequired !== "Not Required") f.push({ tone: "blue", text: `${d.site.serviceRequired} at ${d.site.serviceLocation || "location not set"}` });
  return f;
}

/** Existing defects or extra charges → customer acknowledgement needed before office approval. */
export const needsCustomerAck = (d: InspectionDraft) =>
  progress(d).faults.length > 0 || d.materials.copper === "New Copper Pipe Required" || d.materials.bracket === "New Stand Required" || d.site.manpower === "Yes" || d.site.ladder !== "Not Required" || d.site.serviceRequired !== "Not Required";

/** Problems blocking "Submit for Office Review". Empty list = can submit. */
export function submitProblems(d: InspectionDraft, opts: { faultPhotoRequired: boolean }): string[] {
  const out: string[] = [];
  if (!d.customer.name.trim()) out.push("Customer name is required.");
  if (!/^[6-9]\d{9}$/.test(d.customer.mobile.replace(/\D/g, "").slice(-10))) out.push("Enter a valid 10-digit mobile number.");
  if (d.customer.oldLocation.trim().length < 5) out.push("Old location / removal address is required.");
  if (d.ac.capacity === "Other" && !d.ac.capacityOther.trim()) out.push("Enter the AC capacity.");
  for (const it of allItems(d.ac.kind)) {
    const a = answerOf(d, it.key);
    if (a.value === NOT_CHECKED) out.push(`${it.label}: not checked.`);
    else if (a.value === INACCESSIBLE && !a.remark.trim()) out.push(`${it.label}: give the reason it could not be checked.`);
    else if (isAbnormal(it, a)) {
      if (!a.remark.trim()) out.push(`${it.label}: describe the fault (${a.value}).`);
      if (opts.faultPhotoRequired && !a.photos.length) out.push(`${it.label}: add at least one photo of the fault.`);
    }
  }
  if (d.site.serviceRequired !== "Not Required" && !d.site.serviceLocation) out.push("Choose where the service should be done.");
  if (d.site.heightFt.trim() && !(Number(d.site.heightFt) >= 0 && Number(d.site.heightFt) <= 300)) out.push("Working height must be a sensible number of feet (0–300).");
  if (d.site.outdoorAt === "Other" && !d.site.outdoorOther.trim()) out.push("Describe where the outdoor unit is installed.");
  if (d.site.manpower === "Yes" && (!(Number(d.site.manpowerCount) > 0) || !d.site.manpowerReason.trim())) out.push("Extra manpower: give the number of workers and the reason.");
  if (d.materials.copper === NOT_CHECKED) out.push("Existing copper pipe: not checked.");
  if (d.materials.bracket === NOT_CHECKED) out.push("Existing outdoor stand / bracket: not checked.");
  if (d.materials.gas === NOT_CHECKED) out.push("Gas / leakage assessment: not checked.");
  return out;
}

/** Hard gates before the office can authorise removal. */
export function approvalBlockers(x: ShiftingInspection): string[] {
  const out: string[] = [];
  if (x.status !== "Submitted" && x.status !== "Awaiting Customer Approval" && x.status !== "On Hold – Unsafe") out.push("Only a submitted inspection can be approved.");
  if (x.site.safety !== "Safe to Proceed") out.push(`Site safety is "${x.site.safety}" — removal cannot be authorised until it is Safe to Proceed.`);
  if (x.site.isolation === "Not Confirmed") out.push("Electrical isolation readiness is not confirmed.");
  if (needsCustomerAck(x) && (!x.customerAck || x.materials.faultsExplained !== "Approved / Acknowledged")) out.push("Customer has not acknowledged the existing faults / extra charges.");
  return out;
}

/** Plain-text report for copy / WhatsApp / print. */
export function reportText(x: ShiftingInspection): string {
  const p = progress(x);
  const lines = [
    `PUSHPAK REFRIGERATION CENTRE — Pre-Removal Inspection ${x.id}`,
    `Status: ${x.status}${x.office?.decision === "Approved" ? " · Removal Authorized: YES" : " · Removal Authorized: NO"}`,
    `Technician: ${x.techName} · Inspected: ${x.inspectedAt.replace("T", " ").slice(0, 16)}`,
    `Customer: ${x.customer.name} (${x.customer.mobile})`,
    `Old location: ${x.customer.oldLocation}`,
    `New location: ${x.customer.newLocation || "—"}`,
    `AC: ${x.ac.kind} · ${x.ac.capacity === "Other" ? x.ac.capacityOther : `${x.ac.capacity} Ton`} · ${x.ac.brandModel || "—"}`,
    `Checks: ${p.done}/${p.total} · Faults: ${p.faults.length}`,
    "",
    ...itemsFor(x.ac.kind).flatMap((s) => [`— ${s.title} —`, ...s.items.map((it) => { const a = answerOf(x, it.key); return `${it.label}: ${a.value}${a.remark ? ` (${a.remark})` : ""}${a.photos.length ? ` [${a.photos.length} photo]` : ""}`; })]),
    "",
    `Service: ${x.site.serviceRequired}${x.site.serviceLocation ? ` at ${x.site.serviceLocation}` : ""}`,
    `Outdoor unit at: ${x.site.outdoorAt === "Other" ? x.site.outdoorOther : x.site.outdoorAt} · Height: ${x.site.heightFt || "—"} ft`,
    `Extra manpower: ${x.site.manpower}${x.site.manpower === "Yes" ? ` (${x.site.manpowerCount}, ${x.site.manpowerReason})` : ""} · Access: ${x.site.ladder}`,
    `Site safety: ${x.site.safety} · Electrical isolation: ${x.site.isolation}`,
    ...(x.site.accessNotes ? [`Access notes: ${x.site.accessNotes}`] : []),
    `Copper pipe: ${x.materials.copper} · Stand: ${x.materials.bracket}`,
    `Refrigerant: ${x.materials.refrigerant} · Gas: ${x.materials.gas}`,
    `Faults / extra charges explained: ${x.materials.faultsExplained}`,
    ...(x.materials.remarks ? [`Remarks: ${x.materials.remarks}`] : []),
    `Customer acknowledgement: ${x.customerAck ? `${x.customerAck.name} · ${x.customerAck.method} · ${x.customerAck.at.replace("T", " ").slice(0, 16)}` : "Not recorded"}`,
    `Office: ${x.office ? `${x.office.decision} by ${x.office.by}${x.office.notes ? ` — ${x.office.notes}` : ""}` : "Not reviewed"}`,
    "",
    "Inspection record only — not proof of repair or refrigerant charge.",
  ];
  return lines.join("\n");
}

export function seedInspections(now: string): ShiftingInspection[] {
  const d = blankInspection();
  const ans = (v: string, remark = ""): Answer => ({ value: v, remark, photos: [], checkedAt: now });
  return [{
    ...d, id: "INS-201", jobId: null, customerId: "c2", acId: null, techId: "t1", techName: "Rohit Kumar", status: "Awaiting Customer Approval", createdAt: now, inspectedAt: now, submittedAt: now,
    customer: { name: "Priya Mehta", mobile: "9876543211", oldLocation: "Flat 304, Green Park Apartments, Rajouri Garden — bedroom, 3rd floor", newLocation: "B-12, Punjabi Bagh West — first floor hall" },
    ac: { kind: "Split AC", capacity: "1.5", capacityOther: "", brandModel: "Voltas 183V Vectra" },
    answers: {
      indoor_body: ans("OK"), swing: ans("Louvers Broken", "Left louver clip broken, customer aware"), display: ans("Working"), remote: ans("Working"), indoor_pcb: ans("Working"), blower: ans("Working"), cooling: ans("Low Cooling", "Supply air 16 °C at 30 °C room — gas check advised"),
      grille: ans("Available – OK"), terminal_cover: ans("Damaged", "Cover cracked at screw point"), outdoor_body: ans("Rusted", "Base rust, still firm"), condenser: ans("Bent Fins", "Minor, front face"), compressor: ans("Normal"), fan_motor: ans("Working"), fan_blade: ans("OK"), valves: ans("OK"), outdoor_pcb: ans("Working"),
    },
    site: { ...d.site, serviceRequired: "Deep Cleaning", serviceLocation: "New Location", outdoorAt: "External Wall / Height", heightFt: "28", manpower: "Yes", manpowerCount: "1", manpowerReason: "Outdoor unit on wall bracket at 3rd floor", ladder: "Ladder Required", safety: "Safe to Proceed", accessNotes: "Parking in society basement; lift available till 9 pm", isolation: "Confirmed" },
    materials: { copper: "New Copper Pipe Required", bracket: "Reusable After Inspection", refrigerant: "R32", gas: "Top-up Assessment Required", faultsExplained: "Pending", remarks: "Existing pipe too short for new location (needs ~4 m)." },
    overview: {}, customerAck: null, office: null,
    audit: [{ at: now, by: "Rohit Kumar", action: "Draft started" }, { at: now, by: "Rohit Kumar", action: "Submitted for office review" }],
  }];
}
