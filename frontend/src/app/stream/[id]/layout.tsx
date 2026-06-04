/**
 * Public stream viewer layout — story 35-1 T1.
 *
 * Minimal layout: no dashboard chrome, no sidebar, no workspace context.
 * Theme follows the platform default — public visitors do not have studio
 * branding loaded yet (per-stream brand is rendered inside the shell).
 */

import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Stream",
  robots: { index: false, follow: false },
};

export default function PublicStreamLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="min-h-screen w-full">{children}</div>;
}
