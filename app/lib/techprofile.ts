/* Technician registration (Personal · Family · Documents · Bank & GPay · Uniform), document verification,
 * admin-set job role & responsibilities, birthdays, and the shop's payment details technicians share. */

export const DESIGNATIONS = ["AC Technician", "Senior AC Technician", "Helper", "Refrigerator Technician", "Washing Machine Technician", "PCB Technician", "Installation Technician", "Supervisor"] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const TSHIRT_SIZES = ["S", "M", "L", "XL", "XXL"] as const;
export const UNIFORM_ITEMS = ["T-shirts", "Trousers", "Safety shoes", "Cap", "ID card", "Tool bag"] as const;

export const DOC_KEYS = ["photo", "aadhaar", "pan", "iti", "licence", "bankProof"] as const;
export type DocKey = (typeof DOC_KEYS)[number];
export const DOC_LABEL: Record<DocKey, string> = { photo: "Photo", aadhaar: "Aadhaar", pan: "PAN", iti: "ITI Certificate", licence: "Licence", bankProof: "Bank Proof" };
export type DocStatus = "Not uploaded" | "Pending" | "Verified" | "Rejected";
export interface DocItem { number: string; file: string | null; status: DocStatus; note: string; at?: string }

/** Admin picks from these, or types their own. */
export const RESPONSIBILITY_TEMPLATES: Record<string, string[]> = {
  "AC Technician": ["Attend assigned AC service & repair jobs on time", "Diagnose faults and prepare the quotation in the app", "Take customer approval (OTP) before starting work", "Keep van stock and record parts used", "Collect payment and share the receipt", "Keep the site clean and take before / after photos"],
  "Senior AC Technician": ["Handle complex repairs, gas charging and PCB faults", "Guide and check the work of helpers", "Approve material use and quality on site", "Handle escalated / repeat-complaint customers"],
  Helper: ["Assist the technician on site", "Carry tools, ladder and material safely", "Clean the indoor / outdoor unit and the work area", "Help with installation and removal"],
  "Installation Technician": ["New AC installation and shifting", "Copper piping, insulation, drain and stand fitting", "Vacuum and leak test before handover", "Pre-removal inspection for AC shifting"],
  "PCB Technician": ["Repair PCB boards in the workshop", "Update the repair register status daily", "Coordinate with out-source vendors"],
  Supervisor: ["Plan the daily schedule and dispatch", "Check job quality and customer feedback", "Approve time sheets and expense claims"],
};

export interface TechProfile {
  empId: string;                 // PRC-T001
  designation: string;
  photo: string | null;
  personal: { dob: string; bloodGroup: string; address: string; altPhone: string };
  family: { fatherName: string; motherName: string; spouseName: string; emergencyName: string; emergencyRelation: string; emergencyPhone: string };
  docs: Record<DocKey, DocItem>;
  bank: { holder: string; bankName: string; account: string; ifsc: string; gpay: string; upi: string };
  uniform: { tshirt: string; trouser: string; shoes: string; issued: string[] };
  /** set by admin */
  role: { title: string; responsibilities: string[]; setBy: string; at: string } | null;
  submittedAt?: string;
}

export const emptyDoc = (): DocItem => ({ number: "", file: null, status: "Not uploaded", note: "" });

export function emptyProfile(empId: string): TechProfile {
  return {
    empId, designation: "AC Technician", photo: null,
    personal: { dob: "", bloodGroup: "", address: "", altPhone: "" },
    family: { fatherName: "", motherName: "", spouseName: "", emergencyName: "", emergencyRelation: "", emergencyPhone: "" },
    docs: Object.fromEntries(DOC_KEYS.map((k) => [k, emptyDoc()])) as Record<DocKey, DocItem>,
    bank: { holder: "", bankName: "", account: "", ifsc: "", gpay: "", upi: "" },
    uniform: { tshirt: "L", trouser: "", shoes: "8", issued: [] },
    role: null,
  };
}

/** Only the last 4 digits of Aadhaar are ever kept. */
export const aadhaarLast4 = (v: string) => v.replace(/\D/g, "").slice(-4);
export const maskAccount = (v: string) => (v.length > 4 ? `${"•".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : v);

export function profileProblems(p: TechProfile): string[] {
  const out: string[] = [];
  if (p.personal.dob && !/^\d{4}-\d{2}-\d{2}$/.test(p.personal.dob)) out.push("Date of birth is not valid.");
  if (p.personal.altPhone && !/^[6-9]\d{9}$/.test(p.personal.altPhone)) out.push("Alternate mobile must be 10 digits.");
  if (p.family.emergencyPhone && !/^[6-9]\d{9}$/.test(p.family.emergencyPhone)) out.push("Emergency contact must be 10 digits.");
  if (p.docs.pan.number && !/^[A-Z]{5}\d{4}[A-Z]$/.test(p.docs.pan.number)) out.push("PAN must look like ABCDE1234F.");
  if (p.bank.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p.bank.ifsc)) out.push("IFSC must look like SBIN0001234.");
  if (p.bank.account && !/^\d{9,18}$/.test(p.bank.account)) out.push("Bank account number must be 9–18 digits.");
  if (p.bank.upi && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(p.bank.upi)) out.push("UPI ID must look like name@bank.");
  return out;
}

export function completion(p: TechProfile) {
  const checks = [p.photo, p.personal.dob, p.personal.address, p.family.fatherName, p.family.emergencyPhone, p.bank.account || p.bank.upi, p.uniform.tshirt, ...DOC_KEYS.map((k) => p.docs[k].status !== "Not uploaded" ? "x" : "")];
  const done = checks.filter(Boolean).length;
  return { done, total: checks.length, pct: Math.round((done / checks.length) * 100), verified: DOC_KEYS.filter((k) => p.docs[k].status === "Verified").length };
}

/* ── birthdays ── */

/** Days until the next birthday (0 = today), or null without a DOB. */
export function daysToBirthday(dob: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const t = new Date(`${today}T12:00:00`);
  const next = new Date(`${t.getFullYear()}-${dob.slice(5)}T12:00:00`);
  if (dob.slice(5) === "02-29" && isNaN(next.getTime())) next.setMonth(1, 28);
  if (next < new Date(`${today}T00:00:00`)) next.setFullYear(t.getFullYear() + 1);
  return Math.round((next.getTime() - t.getTime()) / 86400000);
}
export const ageOn = (dob: string, today: string) => Number(today.slice(0, 4)) - Number(dob.slice(0, 4)) - (today.slice(5) < dob.slice(5) ? 1 : 0);

/* ── shop payment details technicians share with customers ── */

export interface PaymentInfo { holder: string; bankName: string; account: string; ifsc: string; branch: string; upi: string; qr: string | null }
export const EMPTY_PAYMENT: PaymentInfo = { holder: "", bankName: "", account: "", ifsc: "", branch: "", upi: "", qr: null };

/** upi://pay link — opens any UPI app with the amount filled in. */
export const upiLink = (p: PaymentInfo, amount?: number, note?: string) =>
  `upi://pay?pa=${encodeURIComponent(p.upi)}&pn=${encodeURIComponent(p.holder)}${amount ? `&am=${amount.toFixed(2)}` : ""}&cu=INR${note ? `&tn=${encodeURIComponent(note)}` : ""}`;

export function paymentMessage(p: PaymentInfo, company: string, opts: { customer?: string; amount?: number; ref?: string } = {}) {
  return [
    `${opts.customer ? `Dear ${opts.customer},\n\n` : ""}Payment details — ${company}`,
    ...(opts.amount ? [`Amount: ₹${opts.amount.toLocaleString("en-IN")}${opts.ref ? ` (${opts.ref})` : ""}`] : []),
    "",
    ...(p.upi ? [`UPI / GPay / PhonePe: ${p.upi}`, `Pay now: ${upiLink(p, opts.amount, opts.ref)}`, ""] : []),
    ...(p.account ? [`Bank: ${p.bankName}`, `A/c name: ${p.holder}`, `A/c no: ${p.account}`, `IFSC: ${p.ifsc}${p.branch ? ` · ${p.branch}` : ""}`, ""] : []),
    "Please share the payment screenshot after paying. Thank you!",
  ].join("\n");
}
