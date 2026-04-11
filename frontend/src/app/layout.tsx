import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import {
  ThemeProvider,
  rawDriveThemeInitScript,
} from "@/components/theme/ThemeProvider";

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
      // No hardcoded data-theme attribute on SSR — the inline init
      // script (rawDriveThemeInitScript) sets it before first paint
      // based on localStorage → OS `prefers-color-scheme` → fallback.
      // This ensures every route opens in a theme consistent with the
      // visitor's OS and their in-app choice, with no flash of wrong
      // theme. `suppressHydrationWarning` prevents React from complaining
      // about the mismatch between the serverless HTML and the client DOM
      // after the init script runs.
      suppressHydrationWarning
      className={`h-full antialiased ${inter.variable} ${manrope.variable}`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b1326" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="flex min-h-full flex-col bg-surface font-sans text-text-primary">
        {/* Theme init runs before interactive so data-theme is set before
            React hydrates. Using next/script with beforeInteractive is the
            Next.js 15 App Router-compliant way to inject an inline script
            that must execute pre-hydration. */}
        <Script id="rawdrive-theme-init" strategy="beforeInteractive">
          {rawDriveThemeInitScript}
        </Script>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
