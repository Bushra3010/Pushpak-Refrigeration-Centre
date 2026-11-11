/* AC Site Visit — engineer instructions before a new installation (9 sections, from "AC Site Visit – Engineer Instructions").
 * The technician fills it on site, the office reviews it before the installation is planned. */

export type YN = "Yes" | "No" | "";
export const WALL_TYPES = ["Brick", "RCC", "Partition"] as const;
export const FIXING_TYPES = ["Direct Wall", "Wooden Box"] as const;
export const PIPE_TYPES = ["Concealed", "Open"] as const;
export const PUMP_REASONS = ["No Proper Slope", "Long Drain Route", "Basement / Level Issue", "Other"] as const;
export const PIPE_ROUTES = ["Through False Ceiling", "Direct Wall / External"] as const;
export const EXTRA_PIPE_REASONS = ["Long Route", "False Ceiling", "Distance Issue"] as const;
export const SV_CAPACITIES = ["0.75", "1", "1.2", "1.5", "1.8", "2", "2.5", "3"] as const;
/** Copper pipe included with the AC (standard kit) — anything above this is extra and must be explained. */
export const STANDARD_PIPE_FT: Record<(typeof SV_CAPACITIES)[number], number> = { "0.75": 10, "1": 10, "1.2": 10, "1.5": 10, "1.8": 10, "2": 10, "2.5": 10, "3": 10 };
export const SV_STATUSES = ["Draft", "Submitted", "Reviewed", "Correction Required"] as const;

export interface SiteVisit {
  id: string; // SV-0001
  techId: string;
  techName: string;
  status: (typeof SV_STATUSES)[number];
  visitDate: string;
  customer: { name: string; phone: string; address: string };
  jobId: string | null;
  // 1. Site & structure
  wallType: (typeof WALL_TYPES)[number] | "";
  beamColumn: YN;
  // 2. Indoor unit placement
  indoorFinal: boolean;
  fixing: (typeof FIXING_TYPES)[number] | "";
  ceilingGap: YN;
  ceilingGapNote: string;
  // 3. Piping laying type
  pipeType: (typeof PIPE_TYPES)[number] | "";
  chasing: YN;
  chasingFt: number | null;
  chasingRouteMarked: boolean;
  // 4. Drain line
  drainWork: YN;
  drainClear: YN;
  drainSlope: YN;
  // 5. Drain pump
  drainPump: YN;
  pumpReasons: string[];
  pumpOther: string;
  // 6. Core cutting
  coreCut: YN;
  holes: number | null;
  diaMm: number | null;
  coreMarked: boolean;
  // 7. Copper pipe measurement & route
  pipeMeasured: boolean;
  pipeFt: number | null;
  pipeRoute: (typeof PIPE_ROUTES)[number] | "";
  // 8. Marking & permission
  coreMarking: YN;
  chasingMarking: YN;
  // 9. Special notes
  capacity: (typeof SV_CAPACITIES)[number];
  standardFt: number;
  extraReasons: string[];
  allVisible: boolean;
  photos: string[];
  challenges: string;
  submittedTo: string;
  office: { notes: string; by: string; at: string } | null;
  createdAt: string;
  submittedAt?: string;
}

export type SiteVisitDraft = Omit<SiteVisit, "id" | "techId" | "techName" | "status" | "office" | "createdAt" | "submittedAt">;

export const emptyVisit = (today: string): SiteVisitDraft => ({
  visitDate: today, customer: { name: "", phone: "", address: "" }, jobId: null,
  wallType: "", beamColumn: "", indoorFinal: false, fixing: "", ceilingGap: "", ceilingGapNote: "",
  pipeType: "", chasing: "", chasingFt: null, chasingRouteMarked: false,
  drainWork: "", drainClear: "", drainSlope: "", drainPump: "", pumpReasons: [], pumpOther: "",
  coreCut: "", holes: null, diaMm: null, coreMarked: false,
  pipeMeasured: false, pipeFt: null, pipeRoute: "",
  coreMarking: "", chasingMarking: "",
  capacity: "1.5", standardFt: STANDARD_PIPE_FT["1.5"], extraReasons: [], allVisible: false, photos: [], challenges: "", submittedTo: "Office",
});

/** Pipe beyond the standard kit — worked out from the measured length and the AC's capacity. */
export const extraPipeFt = (v: Pick<SiteVisit, "pipeFt" | "standardFt">) => Math.max(0, (v.pipeFt ?? 0) - v.standardFt);

/** Everything the office needs before the visit can be submitted. */
export function visitProblems(v: SiteVisitDraft): string[] {
  const p: string[] = [];
  if (v.customer.name.trim().length < 2) p.push("Customer name");
  if (!/^[6-9]\d{9}$/.test(v.customer.phone)) p.push("Customer mobile (10 digits)");
  if (v.customer.address.trim().length < 8) p.push("Site location / address");
  if (!v.wallType) p.push("1. Wall type");
  if (!v.beamColumn) p.push("1. Beam / column");
  if (!v.indoorFinal) p.push("2. Indoor unit placement finalized");
  if (!v.fixing) p.push("2. Indoor unit fixing type");
  if (!v.ceilingGap) p.push("2. Gap between indoor unit and ceiling");
  if (!v.pipeType) p.push("3. Copper pipe type");
  if (v.pipeType === "Concealed" && !v.chasing) p.push("3. Wall chasing (झिरी) required?");
  if (v.chasing === "Yes" && !(v.chasingFt && v.chasingFt > 0)) p.push("3. Approx chasing length");
  if (v.chasing === "Yes" && !v.chasingRouteMarked) p.push("3. Chasing route marked");
  if (!v.drainWork) p.push("4. Drain line work required?");
  if (v.drainWork === "Yes" && (!v.drainClear || !v.drainSlope)) p.push("4. Drain route clear / proper slope");
  if (!v.drainPump) p.push("5. Drain pump required?");
  if (v.drainPump === "Yes" && !v.pumpReasons.length) p.push("5. Drain pump reason");
  if (v.pumpReasons.includes("Other") && !v.pumpOther.trim()) p.push("5. Other reason");
  if (!v.coreCut) p.push("6. Core cutting required?");
  if (v.coreCut === "Yes" && !(v.holes && v.holes > 0)) p.push("6. Number of holes");
  if (v.coreCut === "Yes" && !(v.diaMm && v.diaMm > 0)) p.push("6. Core cutting size (DIA mm)");
  if (v.coreCut === "Yes" && !v.coreMarked) p.push("6. Core cutting location marked");
  if (!v.pipeMeasured || !(v.pipeFt && v.pipeFt > 0)) p.push("7. Copper pipe actual measurement (ft)");
  if (!v.pipeRoute) p.push("7. Pipe route");
  if (v.coreCut === "Yes" && !v.coreMarking) p.push("8. Core cutting marking done?");
  if (v.chasing === "Yes" && !v.chasingMarking) p.push("8. Wall chasing marking done?");
  if (extraPipeFt(v) > 0 && !v.extraReasons.length) p.push("9. Reason for extra copper pipe");
  if ((v.coreMarking === "Yes" || v.chasingMarking === "Yes") && !v.photos.length) p.push("9. Marking photos");
  if ((v.coreMarking === "Yes" || v.chasingMarking === "Yes") && !v.allVisible) p.push("9. All markings clearly visible");
  return p;
}
