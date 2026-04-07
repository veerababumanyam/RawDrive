import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";

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
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3B82F6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body
        className="min-h-full flex flex-col bg-surface text-text-primary"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <Navbar />
        <ServiceWorkerRegister />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
