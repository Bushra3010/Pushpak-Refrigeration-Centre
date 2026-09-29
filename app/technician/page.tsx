import type { Metadata } from "next";
import TechnicianApp from "./TechnicianApp";

export const metadata: Metadata = {
  title: "Pushpak Technician",
  description: "Pushpak technician app — assigned jobs, customer & AC history, diagnosis, quotations and payments.",
};

export default function Page() {
  return <TechnicianApp />;
}
