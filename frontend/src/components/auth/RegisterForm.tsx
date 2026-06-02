"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Eye, EyeOff, Sparkles } from "lucide-react";
import { getGoogleOAuthStartUrl, isAndroidWebView, openPageInChrome } from "@/lib/auth";
import { useOAuthAvailability } from "@/hooks/useOAuthAvailability";
import { pricingPlans } from "@/lib/tokens";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const REGISTER_NETWORK_ERROR =
  "RawDrive couldn't be reached. Check your connection and try again.";
const REGISTER_DEFAULT_ERROR = "We could not create your account.";
const REGISTER_RATE_LIMIT_ERROR =
  "Too many registration attempts. Please wait a minute and try again.";
const GOOGLE_SIGNUP_UNAVAILABLE =
  "Google sign-up is temporarily unavailable. Use email signup for now.";

// Self-serve plan IDs the user can pick at signup. Must match the backend
// whitelist in backend/internal/auth/handler.go (selfServePlans).
const selfServePlanIds = ["free", "starter", "professional", "business", "enterprise"] as const;
type SelfServePlanId = (typeof selfServePlanIds)[number];

function isSelfServePlan(value: string): value is SelfServePlanId {
  return (selfServePlanIds as readonly string[]).includes(value);
}

async function parseRegisterResponse(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({}));
}

async function readRegisterError(response: Response): Promise<string> {
  if (response.status === 429) {
    return REGISTER_RATE_LIMIT_ERROR;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = await parseRegisterResponse(response);
    return typeof payload.error === "string" && payload.error.trim()
      ? payload.error
      : REGISTER_DEFAULT_ERROR;
  }

  const text = await response.text().catch(() => "");
  return text.trim() || REGISTER_DEFAULT_ERROR;
}

// Hand-picked marketing copy for the featured card. We could derive this
// from plan.features, but the full feature lists are long and read poorly
// in a narrow form column — 3 short, benefit-led lines work better here.
const planHighlights: Record<SelfServePlanId, readonly string[]> = {
  free: [
    "1GB storage, 3 galleries",
    "5 client profiles",
    "30-day full-access trial",
  ],
  starter: [
    "30GB storage, 10 galleries",
    "Client proofing & basic CRM",
    "Priority email support",
  ],
  professional: [
    "300GB storage, 50 galleries",
    "AI culling & full CRM + bookings",
    "Live streaming + marketplace listing",
  ],
  business: [
    "3TB storage, 200 galleries",
    "Unlimited AI culling",
    "API access + dedicated manager",
  ],
  enterprise: [
    "6TB storage, unlimited galleries",
    "White-label + custom integrations",
    "SLA guarantee + 24/7 support",
  ],
};

// One-line sub-headers shown under the plan name inside the featured card.
const planTagline: Record<SelfServePlanId, string> = {
  free: "Kick the tires, no card required",
  starter: "For solo photographers finding their rhythm",
  professional: "The sweet spot for growing studios",
  business: "For teams running back-to-back weddings",
  enterprise: "Full-scale studio with white-label control",
};

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPlan: SelfServePlanId = useMemo(() => {
    const raw = searchParams.get("plan")?.toLowerCase() ?? "";
    return isSelfServePlan(raw) ? raw : "starter";
  }, [searchParams]);

  const [plan, setPlan] = useState<SelfServePlanId>(initialPlan);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [webviewNotice, setWebviewNotice] = useState(false);
  const { enabled: oauthEnabled, loading: oauthAvailabilityLoading } =
    useOAuthAvailability(API_BASE);
  const googleUnavailable = !oauthAvailabilityLoading && !oauthEnabled;
  const googleDescriptionId = webviewNotice ? "register-google-webview-recovery" : undefined;

  // Keep local plan state in sync if the user navigates from /pricing?plan=X to
  // /register?plan=Y without a full reload (Next.js soft nav).
  useEffect(() => {
    setPlan(initialPlan);
  }, [initialPlan]);

  const googleStartUrl = useMemo(
    () => getGoogleOAuthStartUrl(API_BASE, { intent: "signup", plan }),
    [plan],
  );

  const selectablePlans = useMemo(
    () => pricingPlans.filter((p) => isSelfServePlan(p.id)),
    [],
  );

  async function handleRegister(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!email.trim() || !fullName.trim() || !phone.trim() || !termsAccepted) {
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim(),
          plan,
          // One-time Terms-of-Service / copyright acceptance. The checkbox
          // already gates this submit; sending it lets the backend record the
          // acceptance (timestamp, version, IP, UA) as IT Act §10A / DPDP
          // evidence instead of the checkbox being a client-only gate.
          terms_accepted: termsAccepted,
        }),
      });

      if (!response.ok) {
        setError(await readRegisterError(response));
        return;
      }

      const payload = await parseRegisterResponse(response);
      const acceptedPlan: string = typeof payload.plan === "string" ? payload.plan : plan;
      router.push(
        `/activate?email=${encodeURIComponent(email.trim())}` +
          `&plan=${encodeURIComponent(acceptedPlan)}`,
      );
    } catch {
      setError(REGISTER_NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleStart() {
    if (googleUnavailable) {
      setError(GOOGLE_SIGNUP_UNAVAILABLE);
      return;
    }
    if (isAndroidWebView()) {
      setWebviewNotice(true);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError(REGISTER_NETWORK_ERROR);
      return;
    }
    setGoogleLoading(true);
    try {
      window.sessionStorage.setItem("rawdrive_pending_plan", plan);
    } catch {
      // SessionStorage can fail in private mode — ignore, intent is non-critical.
    }
    window.location.assign(googleStartUrl);
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void handleRegister(event)}>
      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-2xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error"
        >
          {error}
        </div>
      ) : null}

      {/* ── Plan selection ─────────────────────────────────────────── */}
      <fieldset className="space-y-3">
        <legend className="ml-1 text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary">
          Plans
        </legend>

        {/* Segmented pill control — iOS-style, one thumb slides between 4 tabs */}
        <div
          role="radiogroup"
          aria-label="Subscription plan"
          className="relative flex rounded-2xl border border-border bg-surface-container-low p-1 shadow-inner"
        >
          {selectablePlans.map((p) => {
            const selected = plan === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPlan(p.id as SelfServePlanId)}
                className={`relative z-10 flex-1 rounded-xl px-2 py-2 text-[0.72rem] font-semibold uppercase tracking-wide transition-all duration-200 ${
                  selected
                    ? "bg-surface-elevated text-text-primary shadow-sm ring-1 ring-accent/30"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>

        {/* Featured detail card — dynamic, shows the currently selected plan */}
        {(() => {
          const currentPlan = selectablePlans.find((p) => p.id === plan);
          if (!currentPlan) return null;
          const isFree = currentPlan.monthlyPrice === 0;
          const highlights = planHighlights[plan];
          const tagline = planTagline[plan];
          return (
            <div className="relative overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent-subtle/80 via-surface-elevated to-surface-container-low p-5 shadow-glass">
              {/* ambient glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-accent/20 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-20 -left-10 h-32 w-32 rounded-full bg-accent-muted/30 blur-3xl"
              />

              {currentPlan.popular && (
                <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-text-inverse shadow-sm">
                  <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                  Most Popular
                </span>
              )}

              <div className="relative">
                <p className="font-headline text-2xl font-extrabold tracking-tight text-text-primary">
                  {currentPlan.name}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-text-tertiary">
                  {tagline}
                </p>

                <div className="mt-4 flex items-baseline gap-1.5">
                  {isFree ? (
                    <>
                      <span className="font-headline text-[2.75rem] font-black leading-none tracking-tight text-text-primary">
                        Free
                      </span>
                      <span className="text-[11px] font-medium text-text-tertiary">
                        · 30-day trial
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-semibold text-text-tertiary">Rs.</span>
                      <span className="font-headline text-[2.75rem] font-black leading-none tracking-tight text-text-primary">
                        {currentPlan.monthlyPrice.toLocaleString("en-IN")}
                      </span>
                      <span className="text-xs font-medium text-text-tertiary">/month</span>
                    </>
                  )}
                </div>

                <ul className="mt-4 space-y-1.5">
                  {highlights.map((h) => (
                    <li
                      key={h}
                      className="flex items-center gap-2 text-[12px] leading-snug text-text-secondary"
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
                      </span>
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })()}

      </fieldset>

      {/* ── Google OAuth (primary, above email form) ───────────────── */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleGoogleStart}
          disabled={googleLoading}
          aria-disabled={googleLoading}
          aria-describedby={googleDescriptionId}
          className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface-container-low font-semibold text-text-primary transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {googleLoading ? "Redirecting to Google…" : "Continue with Google"}
        </button>

        {webviewNotice ? (
          <div
            id="register-google-webview-recovery"
            className="rounded-2xl border border-border bg-surface-container-low px-4 py-4 text-sm text-text-secondary"
          >
            <p className="font-medium text-text-primary">
              Google sign-in requires Chrome
            </p>
            <p className="mt-1">
              This browser can&apos;t open Google&apos;s sign-in page. Open RawDrive in
              Chrome to continue.
            </p>
            <button
              type="button"
              onClick={() => openPageInChrome(window.location.href)}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Open in Chrome
            </button>
          </div>
        ) : null}
      </div>

      <div className="relative flex items-center justify-center" aria-hidden="true">
        <div className="absolute inset-0 flex items-center">
          <div className="soft-divider w-full" />
        </div>
        <span className="relative bg-surface-elevated px-4 text-[11px] font-bold uppercase tracking-[0.22em] text-text-tertiary">
          or sign up with email
        </span>
      </div>

      {/* ── Email / password form fields ───────────────────────────── */}
      <div className="space-y-1.5">
        <label
          htmlFor="register-name"
          className="ml-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary"
        >
          Full name
          <span className="text-feedback-error" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="register-name"
          type="text"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Arjun Malhotra"
          className="input-base w-full"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="register-email"
          className="ml-1 text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary"
        >
          Email address <span className="text-feedback-error">*</span>
        </label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="arjun@studio.in"
          className="input-base w-full"
          autoComplete="email"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="register-phone"
          className="ml-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary"
        >
          Phone number
          <span className="text-feedback-error" aria-hidden="true">*</span>
        </label>
        <input
          id="register-phone"
          type="tel"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="98765 43210"
          className="input-base w-full"
          autoComplete="tel"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="register-password"
          className="ml-1 text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary"
        >
          Password <span className="text-feedback-error">*</span>
        </label>
        <div className="relative">
          <input
            id="register-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="input-base w-full pr-12"
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 py-1">
        <input
          id="terms"
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => setTermsAccepted(event.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-border bg-surface-container-low text-accent focus:ring-accent/20"
        />
        <label htmlFor="terms" className="text-sm leading-tight text-text-secondary">
          I accept the{" "}
          <Link href="/terms" className="font-semibold text-text-primary underline underline-offset-2">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold text-text-primary underline underline-offset-2">
            Privacy Policy
          </Link>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading || !email.trim() || !fullName.trim() || !phone.trim() || !termsAccepted}
        className="btn-primary h-14 w-full font-headline disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Creating Account..." : "Create Account"}
      </button>

      <div className="space-y-4 pt-2 text-center">
        <div className="soft-divider w-full" />
        <p className="text-sm text-text-secondary">
          Already have an account?
          <Link
            href="/login"
            className="ml-1 font-bold text-accent transition-colors hover:text-accent-hover"
          >
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
}
