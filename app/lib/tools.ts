/* Tools: (1) Shop Tools Management — shop tools issued to a technician for a site and returned (Issue → Return → Register);
 * (2) Tool Rental Register — tools hired from outside, with rent per day, late charges and security deposit. */

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);

/* ───────────── Shop tools ───────────── */

export const STORAGE_LOCATIONS = ["Rack A1", "Rack A2", "Rack B1", "Rack B2", "Tool Cabinet", "Store Room", "Van"] as const;
export const ISSUE_CONDITIONS = ["Good / Working", "Average / Used", "Needs Service"] as const;
export const RETURN_CONDITIONS = ["Good / Working", "Average / Used", "Needs Service", "Damaged"] as const;
export const ACCESSORIES = ["Power Cable", "Hose", "Carry Case", "Drill Bits", "Charger", "Battery", "Handle", "Nozzle"] as const;
export const COMMON_TOOLS = ["Vacuum Pump (2 CFM)", "Vacuum Pump (4 CFM)", "Manifold Gauge Set", "Brazing Kit", "Flaring Tool", "Pipe Cutter", "Hammer Drill", "Core Cutter", "Ladder (8 ft)", "Ladder (12 ft)", "Nitrogen Cylinder", "Leak Detector", "Clamp Meter", "Jet Pump (Service)"];

export interface ToolIssue {
  id: string; // TI-0001
  tool: string;
  qty: number;
  issueDate: string;
  techId: string;
  techName: string;
  site: string;
  handedBy: string;
  location: (typeof STORAGE_LOCATIONS)[number];
  expectedReturn: string;
  condition: (typeof ISSUE_CONDITIONS)[number];
  accessories: string[];
  otherAccessories: string;
  remarks: string;
  createdAt: string;
  createdBy: string;
  ret: null | {
    date: string; receivedBy: string; qty: number; condition: (typeof RETURN_CONDITIONS)[number];
    accessories: string[]; remarks: string; resolved: boolean;
  };
}
export type IssueDraft = Omit<ToolIssue, "id" | "createdAt" | "createdBy" | "ret">;
export type ReturnDraft = NonNullable<ToolIssue["ret"]>;

export const emptyIssue = (today: string, expected: string): IssueDraft => ({
  tool: "", qty: 1, issueDate: today, techId: "", techName: "", site: "", handedBy: "", location: "Rack A1", expectedReturn: expected,
  condition: "Good / Working", accessories: [], otherAccessories: "", remarks: "",
});

export function validateIssue(d: IssueDraft): string | null {
  if (!d.tool.trim()) return "Enter the tool name.";
  if (!(d.qty >= 1)) return "Quantity must be at least 1.";
  if (!d.issueDate) return "Pick the issue date.";
  if (!d.techName.trim()) return "Choose the technician receiving the tool.";
  if (!d.site.trim()) return "Enter the site / customer / project.";
  if (!d.handedBy.trim()) return "Enter who handed it over from the shop.";
  if (!d.expectedReturn || d.expectedReturn < d.issueDate) return "Expected return must be on or after the issue date.";
  return null;
}

export function validateReturn(x: ToolIssue, r: ReturnDraft): string | null {
  if (!r.date || r.date < x.issueDate) return "Return date must be on or after the issue date.";
  if (!r.receivedBy.trim()) return "Enter who received the tool back at the shop.";
  if (!(r.qty >= 0 && r.qty <= x.qty)) return `Returned quantity must be 0–${x.qty}.`;
  if ((r.condition === "Damaged" || r.condition === "Needs Service" || missingOf(x, r).length || r.qty < x.qty) && !r.remarks.trim()) return "Write a remark for the damage / missing items.";
  return null;
}

/** Accessories that went out but did not come back. */
export const missingOf = (x: ToolIssue, r: { accessories: string[] } | null = x.ret) => (r ? x.accessories.filter((a) => !r.accessories.includes(a)) : []);
export const isOverdue = (x: ToolIssue, today: string) => !x.ret && x.expectedReturn < today;
/** Returned short, damaged, needing service or missing accessories — and not yet marked resolved. */
export const returnProblem = (x: ToolIssue) => !!x.ret && !x.ret.resolved && (x.ret.qty < x.qty || x.ret.condition === "Damaged" || x.ret.condition === "Needs Service" || missingOf(x).length > 0);
export const needsAttention = (x: ToolIssue, today: string) => isOverdue(x, today) || returnProblem(x);
export const issueStatus = (x: ToolIssue, today: string): "At Site" | "Overdue" | "Returned" | "Returned – Check" =>
  !x.ret ? (isOverdue(x, today) ? "Overdue" : "At Site") : returnProblem(x) ? "Returned – Check" : "Returned";

/* ───────────── Rented tools ───────────── */

export interface ToolRental {
  id: string; // TR-0001
  tool: string;
  qty: number;
  techName: string;
  site: string;
  vendor: string;
  vendorPhone: string;
  hireDate: string;
  expectedReturn: string;
  ratePerDay: number;
  lateRatePerDay: number;
  deposit: number;
  depositRefund: number;
  status: "In Use" | "Returned";
  returnDate: string; // actual (Returned) or planned (In Use) — drives the preview
  remarks: string;
  createdAt: string;
  createdBy: string;
}
export type RentalDraft = Omit<ToolRental, "id" | "createdAt" | "createdBy">;

export const emptyRental = (today: string, expected: string): RentalDraft => ({
  tool: "", qty: 1, techName: "", site: "", vendor: "", vendorPhone: "", hireDate: today, expectedReturn: expected,
  ratePerDay: 0, lateRatePerDay: 0, deposit: 0, depositRefund: 0, status: "In Use", returnDate: expected, remarks: "",
});

export function validateRental(d: RentalDraft): string | null {
  if (!d.tool.trim()) return "Enter the tool name.";
  if (!(d.qty >= 1)) return "Quantity must be at least 1.";
  if (!d.techName.trim()) return "Enter the technician name.";
  if (!d.site.trim()) return "Enter the site / project name.";
  if (!d.hireDate) return "Pick the hire date.";
  if (!d.expectedReturn || d.expectedReturn < d.hireDate) return "Expected return must be on or after the hire date.";
  if (d.returnDate && d.returnDate < d.hireDate) return "Return date cannot be before the hire date.";
  if (d.status === "Returned" && !d.returnDate) return "Enter the actual return date.";
  if ([d.ratePerDay, d.lateRatePerDay, d.deposit, d.depositRefund].some((n) => !(n >= 0))) return "Amounts cannot be negative.";
  if (d.depositRefund > d.deposit) return "Deposit refund cannot be more than the deposit.";
  if (d.vendorPhone && !/^\d{10}$/.test(d.vendorPhone)) return "Vendor mobile must be 10 digits.";
  return null;
}

/**
 * Rental days = hire → expected return (or → the return date if it came back early), at least 1.
 * Late days = return date beyond the expected date, charged at the late rate only.
 * Rates are per tool, so both are multiplied by quantity.
 */
export function rentalCalc(d: Pick<ToolRental, "qty" | "hireDate" | "expectedReturn" | "returnDate" | "ratePerDay" | "lateRatePerDay" | "deposit" | "depositRefund" | "status">, today: string) {
  const end = d.returnDate || (d.status === "In Use" ? today : d.expectedReturn);
  const rentalDays = Math.max(1, dayDiff(d.hireDate, end < d.expectedReturn ? end : d.expectedReturn));
  const lateDays = Math.max(0, dayDiff(d.expectedReturn, end));
  const base = rentalDays * d.ratePerDay * d.qty;
  const late = lateDays * d.lateRatePerDay * d.qty;
  return { rentalDays, base, lateDays, late, total: base + late, depositPending: d.status === "Returned" ? Math.max(0, d.deposit - d.depositRefund) : d.deposit };
}

export const rentalOverdue = (r: ToolRental, today: string) => r.status === "In Use" && r.expectedReturn < today;
