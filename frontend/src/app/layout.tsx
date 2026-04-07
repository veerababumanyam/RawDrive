import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: {
    default: "RawDrive — The Operating System for Photography Businesses in India",
    template: "%s | RawDrive",
  },
  description:
    "RawDrive is the all-in-one platform for Indian photographers — gallery delivery, client proofing, AI culling, CRM, live streaming, and marketplaces.",
  metadataBase: new URL("https://rawdrive.in"),
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://rawdrive.in",
    siteName: "RawDrive",
    title: "RawDrive — The Operating System for Photography Businesses in India",
    description:
      "All-in-one platform for Indian photographers — gallery delivery, client proofing, AI culling, CRM, live streaming, and marketplaces.",
  },
  twitter: {
    card: "summary_large_image",
    title: "RawDrive — The Operating System for Photography Businesses in India",
    description:
      "All-in-one platform for Indian photographers — gallery delivery, client proofing, AI culling, CRM, live streaming, and marketplaces.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="liquid-glass" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col bg-surface text-text-primary"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
