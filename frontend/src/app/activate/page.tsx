import type { Metadata } from "next";
import { Suspense } from "react";
import { MailCheck } from "lucide-react";
import { ActivateForm } from "@/components/auth/ActivateForm";
import { createNoIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = createNoIndexMetadata(
  "Activate account",
  "Verify your email to activate your RawDrive account.",
  "/activate",
);

function Fallback() {
  return <div className="h-40 animate-pulse rounded-xl bg-surface-container-high" />;
}

export default function ActivatePage() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface text-text-primary">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent-primary)_22%,transparent)_0,transparent_36%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--accent-secondary)_16%,transparent)_0,transparent_34%)]" />
      <div className="pointer-events-none absolute bottom-[-10rem] right-[-7rem] h-[24rem] w-[24rem] rounded-full bg-accent-muted blur-[120px]" />

      <div className="flex min-h-[100dvh] items-center justify-center px-4 py-16">
        <div className="glass-card w-full max-w-md p-8 md:p-10">
          <div className="mb-6 text-center">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-subtle text-accent shadow-glass">
              <MailCheck className="h-8 w-8" />
            </div>
            <h1 className="font-headline text-3xl font-extrabold tracking-tight text-text-primary">
              Verify your email
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              Please enter the code we sent you
            </p>
          </div>

          <Suspense fallback={<Fallback />}>
            <ActivateForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
