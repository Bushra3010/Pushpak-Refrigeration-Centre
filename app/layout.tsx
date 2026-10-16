import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Same typeface as the zevto apps — self-hosted via next/font.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Pushpak Refrigeration Centre",
  description: "Book AC service, approve quotations, pay and keep the full service history of every AC.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f6f8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={poppins.variable}>
      <body style={{ margin: 0, padding: 0, minHeight: "100vh", fontFamily: "var(--font-poppins)" }}>
        {children}
      </body>
    </html>
  );
}
