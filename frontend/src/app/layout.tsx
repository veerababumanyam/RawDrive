/* eslint-disable @next/next/no-sync-scripts -- The theme bootstrap must run before hydration,
   and Next's beforeInteractive wrapper cannot suppress nonce hydration warnings. */
import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import {
  buildSiteJsonLd,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  SITE_LOCALE,
  SITE_NAME,
  SITE_URL,
  SITE_TAGLINE,
} from "@/lib/seo";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} - ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Photography business software",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: "website",
    locale: SITE_LOCALE,
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} - ${SITE_TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - ${SITE_TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE.url],
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // F-098: the per-request CSP nonce set by frontend/src/middleware.ts. Passed
  // to the theme-init <script> so it executes under the nonce/strict-dynamic
  // policy that replaces script-src 'unsafe-inline'. undefined in contexts
  // where middleware didn't run (the static next.config.ts header is gone).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      // No hardcoded data-theme attribute on SSR — the theme-init
      // bootstrap script sets it before first paint
      // based on localStorage → OS `prefers-color-scheme` → fallback.
      // This ensures every route opens in a theme consistent with the
      // visitor's OS and their in-app choice, with no flash of wrong
      // theme. `suppressHydrationWarning` prevents React from complaining
      // about the mismatch between the serverless HTML and the client DOM
      // after the init script runs.
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b1326" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <JsonLd id="rawdrive-site-schema" data={buildSiteJsonLd()} nonce={nonce} />
        {/* Theme init MUST run before React hydrates so data-theme is set
            on <html> before first paint — otherwise the page flashes the
            default theme then snaps to the user's choice.
            Fix: serve as an external static asset (public/theme-init.js)
            through a plain head <script>. It is intentionally parser-blocking
            because it must set data-theme before React hydrates and before
            first paint.
            Cross-route navigation still works because data-theme stays
            on <html> and the layout never unmounts. The constants are
            duplicated between this file (implicitly via theme-init.js)
            and ThemeProvider.tsx — see the sync comment at the top of
            public/theme-init.js.
            The browser masks nonce attributes from getAttribute(), so React
            dev hydration can compare the client nonce prop with an empty DOM
            attribute. Keep the nonce for CSP and suppress that one expected
            attribute mismatch on this script only. */}
        <script
          id="rawdrive-theme-init"
          src="/theme-init.js"
          nonce={nonce}
          suppressHydrationWarning
        />
      </head>
      <body className="flex min-h-full flex-col bg-surface font-sans text-text-primary">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
