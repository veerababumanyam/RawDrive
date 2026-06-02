import type { Metadata } from "next";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { MFAVerifyForm } from "@/components/auth/MFAVerifyForm";
import { createNoIndexMetadata } from "@/lib/seo";

// F-007 (M17 wave 3): TOTP step-up page. Reached from /login when the
// backend returns 401 + mfa_required, and from OAuth when the backend sets
// a short-lived HttpOnly challenge cookie. The form posts the current TOTP
// code to /auth/verify-totp.

export const metadata: Metadata = createNoIndexMetadata(
  "Two-factor verification",
  "Enter your authenticator app code to finish signing in.",
  "/login/mfa",
);

function Fallback() {
  return (
    <div className="mt-10 space-y-6">
      <div className="h-12 animate-pulse rounded-xl bg-surface-container-high" />
      <div className="h-14 animate-pulse rounded-xl bg-surface-container-highest" />
    </div>
  );
}

export default function MFAVerifyPage() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface text-text-primary">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent-primary)_22%,transparent)_0,transparent_36%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--accent-secondary)_16%,transparent)_0,transparent_34%)]" />
      <div className="pointer-events-none absolute bottom-[-10rem] right-[-7rem] h-[24rem] w-[24rem] rounded-full bg-accent-muted blur-[120px]" />

      <div className="flex min-h-[100dvh] items-center justify-center px-4 py-16">
        <div className="glass-card w-full max-w-md p-8 md:p-10">
          <div className="mb-10 text-center">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-subtle text-accent shadow-glass">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="font-headline text-3xl font-extrabold tracking-tight text-text-primary">
              Two-factor check
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              Open your authenticator app and enter the current 6-digit code.
            </p>
          </div>

          <Suspense fallback={<Fallback />}>
            <MFAVerifyForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
