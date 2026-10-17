/* The 25 technician calculators: id (also the route, /technician#calculators/<id>), card text and which
 * actions they offer. "estimate" = Add to Estimate · "readings" = Save Readings to Job · "claim" =
 * Create Claim · "time" = follows the time-approval workflow · "save" = save only. */

export const CATEGORIES = ["Installation & Quotation", "Service & Diagnostics", "Energy & Customer Planning", "Daily Work & Billing"] as const;
export type Category = (typeof CATEGORIES)[number];
export type ToolAction = "estimate" | "readings" | "claim" | "time" | "save";

export interface ToolDef { id: string; no: number; name: string; desc: string; icon: string; category: Category; action: ToolAction; keywords: string }

const d = (no: number, id: string, name: string, icon: string, category: Category, action: ToolAction, desc: string, keywords = ""): ToolDef => ({ no, id, name, icon, category, action, desc, keywords });

export const TOOLS: ToolDef[] = [
  d(1, "copper-pipe", "Copper Pipe Calculator", "🟠", "Installation & Quotation", "estimate", "Liquid + suction pipe weight, wastage and customer price.", "copper weight kg gauge swg liquid suction line od wall"),
  d(2, "tonnage", "AC Tonnage Estimator", "❄️", "Installation & Quotation", "save", "Room cooling load in BTU/h and a suggested AC size.", "ton tr btu room size capacity cooling load sizing"),
  d(3, "installation-estimate", "Installation Estimate", "🛠️", "Installation & Quotation", "estimate", "Package, materials, labour, transport and GST in one quote.", "installation quote package new ac fitting"),
  d(4, "extra-material", "Extra Material Charges", "➕", "Installation & Quotation", "estimate", "Charge only what is used beyond the package allowance.", "extra copper cable drain beyond package included"),
  d(5, "drain-pipe", "Drain Pipe Calculator", "💧", "Installation & Quotation", "estimate", "Pipe length, slope height drop, fittings and price.", "drain slope fall gradient water"),
  d(6, "insulation", "Insulation Calculator", "🧣", "Installation & Quotation", "estimate", "Insulation bore, total length, stock pieces and price.", "insulation tube foam armaflex pieces"),
  d(7, "cable-electrical", "Cable & Electrical Estimate", "⚡", "Installation & Quotation", "estimate", "Voltage drop, cable quantity and rating check from approved tables.", "cable wire voltage drop mcb ampere electrical"),
  d(8, "stand-accessories", "AC Stand & Accessories", "🧱", "Installation & Quotation", "estimate", "Stand load check, accessory checklist and price.", "stand bracket outdoor weight fasteners pads"),
  d(9, "refrigerant-charge", "Refrigerant Charge Adjustment", "🧪", "Service & Diagnostics", "readings", "Additional charge for long pipe runs, per the manufacturer's rule.", "gas charge additional refrigerant pipe length grams"),
  d(10, "refrigerant-usage", "Refrigerant Usage & Billing", "⚖️", "Service & Diagnostics", "estimate", "Measured cylinder usage and the customer charge.", "gas cylinder weight usage bill kg"),
  d(11, "pressure-temperature", "Pressure–Temperature Reference", "🌡️", "Service & Diagnostics", "readings", "Saturation pressure ↔ temperature from verified tables.", "pt chart saturation pressure temperature dew bubble"),
  d(12, "superheat-subcooling", "Superheat / Subcooling", "📉", "Service & Diagnostics", "readings", "Superheat and subcooling from pressure and line temperatures.", "superheat subcooling sh sc diagnosis"),
  d(13, "air-delta-t", "Air Temperature Difference", "🌬️", "Service & Diagnostics", "readings", "Return vs supply air temperature difference.", "delta t air temperature supply return grill"),
  d(14, "airflow", "Airflow Calculator", "🌀", "Service & Diagnostics", "readings", "Approximate CFM and m³/h from velocity and free area.", "airflow cfm velocity anemometer m3h"),
  d(15, "repair-estimate", "Repair Estimate", "🔧", "Service & Diagnostics", "estimate", "Parts, labour, visit, transport, discount and GST.", "repair quote spare parts labour"),
  d(16, "electricity-cost", "Electricity Cost Estimator", "💡", "Energy & Customer Planning", "save", "Daily and monthly running cost from electrical input.", "electricity bill units kwh power consumption cost"),
  d(17, "replacement-savings", "AC Replacement Savings", "♻️", "Energy & Customer Planning", "save", "Annual savings and simple payback of a new AC.", "replacement savings payback star rating inverter"),
  d(18, "amc-plan", "AMC Plan Calculator", "📅", "Energy & Customer Planning", "estimate", "Annual maintenance quotation with per-visit equivalent.", "amc annual maintenance contract plan"),
  d(19, "unit-converter", "Unit Converter", "🔁", "Energy & Customer Planning", "save", "Length, mass, temperature, pressure, cooling and airflow units.", "convert units psi bar kpa feet metre btu kw cfm fahrenheit"),
  d(20, "work-hours", "Work & Travel Hours", "⏱️", "Daily Work & Billing", "time", "Work, travel and break hours from your timer records.", "hours time timer travel work break duty"),
  d(21, "overtime", "Overtime Estimate", "🕘", "Daily Work & Billing", "time", "Eligible overtime hours under the office rules.", "overtime ot extra hours"),
  d(22, "travel-claim", "Travel / Petrol Claim", "⛽", "Daily Work & Billing", "claim", "Claim amount under the office travel policy.", "petrol fuel travel claim mileage km reimbursement"),
  d(23, "material-requirement", "Material Requirement", "📦", "Daily Work & Billing", "save", "Shortage, consumption and unused material to return.", "material stock van shortage return issue"),
  d(24, "customer-bill", "Customer Bill Calculator", "🧾", "Daily Work & Billing", "save", "Final bill, GST breakdown, paid and balance.", "bill invoice balance payment gst total"),
  d(25, "gas-weight-price", "Gas Weight & Price", "🧮", "Service & Diagnostics", "estimate", "Grams of gas → price, or customer budget → grams to give.", "gas refrigerant weight grams price rupees budget rate kg loose top up"),
];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);

/** Search by name, purpose or keyword; every word must match somewhere. */
export function searchTools(q: string, cat: Category | "All") {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return TOOLS.filter((t) => (cat === "All" || t.category === cat) && words.every((w) => `${t.name} ${t.desc} ${t.keywords} ${t.category}`.toLowerCase().includes(w)));
}
