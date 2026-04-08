import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

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
  icons: {
    icon: [
      { url: "/logo/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/logo/favicon.ico",
    apple: [
      { url: "/logo/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="liquid-glass"
      className={`h-full antialiased ${inter.variable} ${manrope.variable}`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3B82F6" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body
        className="min-h-full flex flex-col bg-surface text-text-primary"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
