import type { Metadata } from "next";
import { Suspense } from "react";
import { Camera } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { createNoIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = createNoIndexMetadata(
  "Login",
  "Enter your details to access your RawDrive studio workspace.",
  "/login",
);

function LoginFormFallback() {
  return (
    <div className="mt-10 space-y-6">
      <div className="h-12 animate-pulse rounded-xl bg-surface-container-high" />
      <div className="h-14 animate-pulse rounded-xl bg-surface-container-highest" />
      <div className="flex items-center gap-4">
        <div className="soft-divider flex-1" />
        <div className="h-3 w-10 rounded bg-surface-container-high" />
        <div className="soft-divider flex-1" />
      </div>
      <div className="h-14 animate-pulse rounded-xl bg-surface-container-high" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface text-text-primary">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent-primary)_22%,transparent)_0,transparent_36%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--accent-secondary)_16%,transparent)_0,transparent_34%)]" />
      <div className="pointer-events-none absolute bottom-[-10rem] right-[-7rem] h-[24rem] w-[24rem] rounded-full bg-accent-muted blur-[120px]" />

      <div className="flex min-h-[100dvh] items-center justify-center px-4 py-16">
        <div className="glass-card w-full max-w-md p-8 md:p-10">
          <div className="mb-10 text-center">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-subtle text-accent shadow-glass">
              <Camera className="h-8 w-8" />
            </div>
            <h1 className="font-headline text-3xl font-extrabold tracking-tight text-text-primary">
              Welcome back
            </h1>
          </div>

          <Suspense fallback={<LoginFormFallback />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
