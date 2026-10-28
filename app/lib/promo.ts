/* "Explore More at Pushpak" — spare-parts promo banners on the customer home page, and the
 * enquiries customers send from them. Admin controls the banners (add, edit, delete, enable /
 * disable, order); only enabled banners show, and only on the customer home page. */

/** Built-in product artwork (app/components/PromoArt.tsx); an uploaded photo replaces it. */
export const PROMO_ART = ["ac", "fridge", "washer", "microwave", "purifier", "parts"] as const;
export type PromoArt = (typeof PROMO_ART)[number];
export const PROMO_ART_LABEL: Record<PromoArt, string> = {
  ac: "AC", fridge: "Refrigerator", washer: "Washing machine", microwave: "Microwave oven", purifier: "Water purifier", parts: "General spare parts",
};

export interface PromoBanner {
  id: string;
  category: string;     // e.g. "AC Spare Parts"
  title: string;        // big text on the slide
  subtitle: string;     // one line under it
  parts: string[];      // a few example parts shown as tags
  art: PromoArt;        // built-in artwork when no photo
  image: string | null; // uploaded photo (data URL in this demo)
  cta: string;          // button text, default "Enquire Now"
  enabled: boolean;
  order: number;        // lower shows first
  updatedAt: string;
  updatedBy: string;
}

export type BannerDraft = Omit<PromoBanner, "id" | "updatedAt" | "updatedBy" | "order">;

export const ENQUIRY_STATUSES = ["New", "Contacted", "Quoted", "Sold", "Closed"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export interface PartEnquiry {
  id: string;
  at: string;
  bannerId: string;
  category: string;
  customerId: string | null;
  name: string;
  phone: string;
  appliance: string; // brand / model the part is for
  part: string;      // what they need
  note: string;
  status: EnquiryStatus;
  history: { at: string; status: EnquiryStatus; by: string; note?: string }[];
}

export function validateBanner(b: BannerDraft): string | null {
  if (!b.category.trim()) return "Enter the category name.";
  if (!b.title.trim()) return "Enter the banner title.";
  if (b.title.length > 40) return "Keep the title to 40 characters so it fits on a phone.";
  if (b.subtitle.length > 90) return "Keep the subtitle to 90 characters.";
  if (!b.cta.trim()) return "Enter the button text.";
  return null;
}

export function validateEnquiry(e: { name: string; phone: string; part: string }): string | null {
  if (!e.name.trim()) return "Enter your name.";
  if (!/^\d{10}$/.test(e.phone.replace(/\D/g, ""))) return "Enter a 10-digit mobile number.";
  if (!e.part.trim()) return "Tell us which part you need.";
  return null;
}

/** Enabled banners in display order — what the customer home page shows. */
export const liveBanners = (list: PromoBanner[] | undefined) => (list ?? []).filter((b) => b.enabled).sort((a, b) => a.order - b.order);

export function seedPromo(now: string): { banners: PromoBanner[]; enquiries: PartEnquiry[] } {
  const B = (id: string, order: number, category: string, title: string, subtitle: string, art: PromoArt, parts: string[]): PromoBanner =>
    ({ id, order, category, title, subtitle, art, parts, image: null, cta: "Enquire Now", enabled: true, updatedAt: now, updatedBy: "Admin" });
  return {
    banners: [
      B("pb1", 1, "AC Spare Parts", "AC Spare Parts", "Genuine parts for every brand — fitted by our technicians", "ac", ["PCB", "Compressor", "Fan Motor", "Capacitor", "Remote"]),
      B("pb2", 2, "Refrigerator Spare Parts", "Refrigerator Parts", "Cooling back to normal — thermostats to compressors", "fridge", ["Thermostat", "Relay", "Door Gasket", "Compressor"]),
      B("pb3", 3, "Washing Machine Spare Parts", "Washing Machine Parts", "Front load & top load — motors, belts, boards", "washer", ["Drain Pump", "Belt", "Inlet Valve", "PCB"]),
      B("pb4", 4, "Microwave Oven Spare Parts", "Microwave Oven Parts", "Magnetrons, turntables and more in stock", "microwave", ["Magnetron", "Turntable", "Fuse", "Door Switch"]),
      B("pb5", 5, "Water Purifier Spare Parts", "Water Purifier Parts", "RO membranes, filters and pumps for safe water", "purifier", ["RO Membrane", "Filter Set", "Booster Pump", "UV Lamp"]),
    ],
    enquiries: [
      { id: "PE-1001", at: now, bannerId: "pb2", category: "Refrigerator Spare Parts", customerId: "c2", name: "Priya Mehta", phone: "9876543211", appliance: "Samsung 253 L double door", part: "Door gasket", note: "Freezer door not sealing", status: "New", history: [{ at: now, status: "New", by: "Customer App" }] },
    ],
  };
}
