import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("register");

// Matches the silhouette of the real form so the page doesn't jump when the
// client component hydrates. Mirrors the pattern in app/login/page.tsx.
function RegisterFormFallback() {
  return (
    <div className="mt-2 space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-container-high" />
        ))}
      </div>
      <div className="h-12 animate-pulse rounded-xl bg-surface-container-high" />
      <div className="flex items-center gap-4">
        <div className="soft-divider flex-1" />
        <div className="h-3 w-20 rounded bg-surface-container-high" />
        <div className="soft-divider flex-1" />
      </div>
      <div className="h-12 animate-pulse rounded-xl bg-surface-container-high" />
      <div className="h-12 animate-pulse rounded-xl bg-surface-container-high" />
      <div className="h-14 animate-pulse rounded-xl bg-surface-container-highest" />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-[100dvh] bg-surface px-4 py-4 md:px-8 md:py-8">
      <main className="surface-panel mx-auto grid w-full max-w-7xl overflow-hidden lg:min-h-[850px] lg:grid-cols-10">
        <section className="relative hidden overflow-hidden lg:col-span-6 lg:block">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDj6kjH-QI3GOc1rJWAu5bOeoi0-vpnK0VMatssT2HbrD5bNWGyuxHSVB-TyF5MUK6lmvNLqAmc2_Vjy4myrxjBcn3-mrCmEPTBbLW0CFizGnnYkpP_osJMIWCRQWVkpTdf6FxNcc6wR-APtq1aFmpa-9eTC-tXutWPaWPlEFQvI-rGdmCG3nTh031ySE4IfKbMSfXrY-C6Ev4D7o5y9PXjTs7yd1WQXOubsSFlrSAxr8-SsDtMyM31KMLdkBrkzQxBsUMftjO_2os"
            alt="Professional Indian wedding photography"
            className="absolute inset-0 h-full w-full object-cover"
          />

          <div
            className="absolute inset-0 flex flex-col justify-between p-12 text-text-media backdrop-blur-[2px]"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--surface-scrim) 38%, transparent) 0%, color-mix(in srgb, var(--surface-scrim) 62%, transparent) 100%)",
            }}
          >
            <div className="glass-card inline-flex w-fit flex-col gap-2 p-6 text-text-media">
              <div className="font-headline text-3xl font-extrabold tracking-[-0.08em]">
                RawDrive India
              </div>
              <div className="soft-divider w-12 bg-text-media/50" />
              <p className="text-lg font-medium opacity-90">
                Your Photography Business, Elevated.
              </p>
            </div>

            <div className="max-w-md">
              <h2 className="font-headline text-4xl font-bold leading-tight text-text-media">
                Store, Share, and Scale your creative vision.
              </h2>
              <p className="mt-4 text-text-media opacity-80">
                The only photography workflow platform designed for the vibrant Indian
                wedding industry.
              </p>
            </div>
          </div>
        </section>

        <section className="col-span-1 flex flex-col bg-surface-elevated px-8 py-8 md:px-12 lg:col-span-4">
          <div className="mb-6 lg:hidden">
            <div className="font-headline text-2xl font-extrabold tracking-[-0.08em] text-text-primary">
              RawDrive India
            </div>
          </div>

          <Suspense fallback={<RegisterFormFallback />}>
            <RegisterForm />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
