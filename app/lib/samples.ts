/* Spare-part sample enquiries — the counter receives a customer's old part as a sample, asks suppliers
 * for a match on WhatsApp, and keeps the customer updated. Rules: supplier response expected in 2 days;
 * the customer must get an update within 2 days even if the supplier has not replied. */

export const APPLIANCES = ["AC", "Fridge", "WM", "Oven", "Water Purifier", "Other"] as const;
export type Appliance = (typeof APPLIANCES)[number];
export const APPLIANCE_NAME: Record<Appliance, string> = { AC: "Air Conditioner", Fridge: "Refrigerator", WM: "Washing Machine", Oven: "Microwave Oven", "Water Purifier": "Water Purifier", Other: "Appliance" };

export const PARTS: Record<Appliance, string[]> = {
  AC: ["PCB", "Compressor", "Fan Motor", "Blower", "Capacitor", "Swing Motor", "Sensor", "Remote"],
  Fridge: ["Thermostat", "Relay / OLP", "Door Gasket", "Compressor", "Defrost Timer", "Fan Motor", "PCB"],
  WM: ["Water Inlet Valve", "Drain Pump", "Belt", "PCB", "Door Lock", "Motor", "Shock Absorber"],
  Oven: ["Magnetron", "Turntable Motor", "Fuse", "Door Switch", "High-Voltage Capacitor", "PCB"],
  "Water Purifier": ["RO Membrane", "Filter Set", "Booster Pump", "SMPS / Adapter", "UV Lamp", "Solenoid Valve"],
  Other: [],
};

export const SUPPLIER_RESPONSES = ["Pending / No Response", "Part Available", "Part Not Available", "Restock Expected"] as const;
export type SupplierResponse = (typeof SUPPLIER_RESPONSES)[number];

export const SUPPLIER_TEMPLATES = ["New Enquiry", "Follow-up Reminder", "Urgent Requirement"] as const;
export type SupplierTemplate = (typeof SUPPLIER_TEMPLATES)[number];
export const CUSTOMER_TEMPLATES = ["Awaiting Supplier Response", "Supplier Delay", "Not Available", "Part Found"] as const;
export type CustomerTemplate = (typeof CUSTOMER_TEMPLATES)[number];

export const SAMPLE_STATUSES = ["Received", "Supplier Enquired", "Part Found", "Not Available", "Restock Expected", "Customer Approved", "Closed"] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];
export const CLOSE_REASONS = ["Part sold / fitted", "Customer declined", "Not available anywhere", "Sample returned to customer"] as const;

export interface SupplierContact {
  id: string;
  name: string;
  phone: string;
  messageSentAt: string | null;
  response: SupplierResponse;
  respondedAt: string | null;
  price: number | null;
  restockDate: string;
  note: string;
}

export interface SampleEnquiry {
  id: string;            // PRC-SMP-0001
  receivedAt: string;
  receivedBy: string;
  customer: { name: string; phone: string; address: string; customerId: string | null };
  appliance: Appliance;
  brand: string;
  model: string;
  part: string;
  partNo: string;
  qty: number;
  storage: string;       // Rack / bin where the sample is kept
  condition: string;
  notes: string;
  photos: string[];
  supplierDue: string;   // yyyy-mm-dd, receive + 2 days
  customerDue: string;   // next customer update due, yyyy-mm-dd
  suppliers: SupplierContact[];
  customerUpdates: { at: string; template: CustomerTemplate; by: string }[];
  customerReply: "Pending" | "Approved" | "Declined";
  status: SampleStatus;
  closeReason: string;
  timeline: { at: string; by: string; text: string }[];
}

export type SampleDraft = Pick<SampleEnquiry, "customer" | "appliance" | "brand" | "model" | "part" | "partNo" | "qty" | "storage" | "condition" | "notes" | "photos">;

export const emptySample = (): SampleDraft => ({
  customer: { name: "", phone: "", address: "", customerId: null },
  appliance: "AC", brand: "", model: "", part: "", partNo: "", qty: 1, storage: "", condition: "", notes: "", photos: [],
});

export function validateSample(d: SampleDraft): string | null {
  if (!/^[6-9]\d{9}$/.test(d.customer.phone.replace(/\D/g, "").slice(-10))) return "Enter the customer's 10-digit mobile number.";
  if (!d.customer.name.trim()) return "Enter the customer name.";
  if (!d.brand.trim()) return "Enter the brand.";
  if (!d.part.trim()) return "Choose or type the part name.";
  if (!(d.qty >= 1 && Number.isInteger(d.qty))) return "Quantity must be a whole number, 1 or more.";
  return null;
}

/** yyyy-mm-dd + n days. */
export const addDays = (isoDate: string, n: number) => { const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export const isOpenSample = (s: SampleEnquiry) => s.status !== "Closed";
/** Supplier follow-up is due when no supplier has answered and the 2-day window has passed. */
export const supplierFollowUpDue = (s: SampleEnquiry, today: string) => isOpenSample(s) && !s.suppliers.some((x) => x.response !== "Pending / No Response") && s.supplierDue <= today;
/** Customer update is due every 2 days while the sample is open. */
export const customerUpdateDue = (s: SampleEnquiry, today: string) => isOpenSample(s) && s.customerDue <= today;

export const latestSupplier = (s: SampleEnquiry) => s.suppliers[s.suppliers.length - 1];

const partLines = (s: Pick<SampleEnquiry, "appliance" | "brand" | "model" | "part" | "partNo" | "qty">) => [
  `Appliance: ${APPLIANCE_NAME[s.appliance]}`, `Brand: ${s.brand}`, `Model: ${s.model || "Not available"}`, `Part: ${s.part}`, `Part No: ${s.partNo || "Not available"}`, `Quantity: ${s.qty}`,
];

export function supplierMessage(t: SupplierTemplate, s: SampleEnquiry, shop: { company: string; phone: string; city: string }) {
  const sign = [shop.company, [shop.city, shop.phone].filter(Boolean).join(" | ")].filter(Boolean);
  if (t === "Follow-up Reminder") return ["Hello,", "", `Gentle reminder about our enquiry (${s.id}) for:`, "", ...partLines(s), "", "Please share availability, price and delivery time today if possible.", "", ...sign].join("\n");
  if (t === "Urgent Requirement") return ["Hello,", "", "URGENT — customer is waiting. Please check availability of:", "", ...partLines(s), "", "Please confirm availability, price, GST, warranty and delivery time at the earliest.", "", ...sign].join("\n");
  return ["Hello,", "", "Please check availability of the following spare part:", "", ...partLines(s), "", "Please confirm availability, price, GST, warranty and delivery time.", "", ...sign].join("\n");
}

export function customerMessage(t: CustomerTemplate, s: SampleEnquiry, shop: { company: string }) {
  const part = `${s.brand} ${s.part}`.trim();
  const body: Record<CustomerTemplate, string[]> = {
    "Awaiting Supplier Response": [`We have received your ${part} sample and shared it with our suppliers.`, "", "We are waiting for their reply on availability and price, and will update you within 2 days."],
    "Supplier Delay": [`Our suppliers are taking longer than expected to confirm the ${part}.`, "", "We are following up and checking other suppliers. Thank you for your patience — we will update you again within 2 days."],
    "Not Available": [`Sorry, the ${part} is currently not available with our suppliers.`, "", "We can keep checking for a restock or a compatible alternative, or you can collect your sample. Please reply with what you prefer."],
    "Part Found": [`We have located a potential matching ${part}.`, "", "We will confirm compatibility, price, condition and expected delivery before requesting your approval."],
  };
  return [`Dear ${s.customer.name},`, "", ...body[t], "", `Sample ID: ${s.id}`, shop.company].join("\n");
}

/** Suggested next customer message from where the enquiry stands. */
export function suggestedCustomerTemplate(s: SampleEnquiry, today: string): CustomerTemplate {
  const r = latestSupplier(s)?.response;
  if (r === "Part Available") return "Part Found";
  if (r === "Part Not Available" && !s.suppliers.some((x) => x.response === "Pending / No Response")) return "Not Available";
  if (s.supplierDue < today) return "Supplier Delay";
  return "Awaiting Supplier Response";
}
