import type { Metadata } from "next";
import AdminApp from "./AdminApp";

export const metadata: Metadata = {
  title: "Pushpak Admin",
  description: "Pushpak admin panel — customers, AC assets, jobs & dispatch, technicians, inventory, billing, AMC and reports.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminApp />;
}
