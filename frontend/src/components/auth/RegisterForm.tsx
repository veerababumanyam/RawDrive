"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Eye, EyeOff, GoogleMark, Sparkle } from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import {
  getGoogleOAuthStartUrl,
  isAndroidWebView,
  openPageInChrome,
} from "@/lib/auth";
import { useOAuthAvailability } from "@/hooks/useOAuthAvailability";
import { usePlanCatalog } from "@/hooks/use-plan-catalog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const REGISTER_NETWORK_ERROR =
  "RawDrive couldn't be reached. Check your connection and try again.";
const REGISTER_DEFAULT_ERROR = "We could not create your account.";
const REGISTER_RATE_LIMIT_ERROR =
  "Too many registration attempts. Please wait a minute and try again.";
const GOOGLE_SIGNUP_UNAVAILABLE =
  "Google sign-up is temporarily unavailable. Use email signup for now.";

function isSignupEligiblePlanId(value: string): boolean {
  return value.trim().length > 0 && value !== "pay_per_event";
}

async function parseRegisterResponse(
  response: Response,
): Promise<Record<string, unknown>> {
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
const planHighlights: Record<string, readonly string[]> = {
  free: [
    "1GB storage, 1 event",
    "Limited AI face search",
    "Watermarked galleries",
  ],
  creator: [
    "100 GB storage, 10 events",
    "AI face search",
    "Photo selling · 10% commission",
  ],
  pro_photographer: [
    "300 GB storage, unlimited events",
    "WhatsApp delivery",
    "Photo selling · 5% commission",
  ],
  studio: [
    "1 TB storage, unlimited everything",
    "Team access and custom domain",
    "Photo selling · 0% commission",
  ],
};

// One-line sub-headers shown under the plan name inside the featured card.
const planTagline: Record<string, string> = {
  free: "Free forever for beginners",
  creator: "Side & weekend photographers getting started",
  pro_photographer: "The main money plan for working pros",
  studio: "Studios with a team and brand to protect",
};

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams?.get("plan")?.toLowerCase() ?? "";

  const initialPlan = useMemo(() => {
    return isSignupEligiblePlanId(planParam) ? planParam : "free";
  }, [planParam]);

  const [plan, setPlan] = useState(initialPlan);
  const [planParamSnapshot, setPlanParamSnapshot] = useState(initialPlan);
  if (planParamSnapshot !== initialPlan) {
    setPlanParamSnapshot(initialPlan);
    setPlan(initialPlan);
  }
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [duplicateActivationEmail, setDuplicateActivationEmail] = useState("");
  // phone-reuse epic: set when a signup is rejected because the phone already
  // has an account and a paid plan is required to add another on the same number.
  const [phonePaidRequired, setPhonePaidRequired] = useState(false);
  const [webviewNotice, setWebviewNotice] = useState(false);
  const { enabled: oauthEnabled, loading: oauthAvailabilityLoading } =
    useOAuthAvailability(API_BASE);
  const { plans } = usePlanCatalog();
  const googleUnavailable = !oauthAvailabilityLoading && !oauthEnabled;
  const googleDescriptionId = webviewNotice
    ? "register-google-webview-recovery"
    : undefined;

  const selectablePlans = useMemo(
    () =>
      plans.filter((p) => p.id !== "pay_per_event" && p.active && p.selfServe),
    [plans],
  );
  const selectablePlanIds = useMemo(
    () => new Set(selectablePlans.map((p) => p.id)),
    [selectablePlans],
  );
  const selectedPlan = selectablePlanIds.has(plan)
    ? plan
    : (selectablePlans[0]?.id ?? "free");

  const googleStartUrl = useMemo(
    () =>
      getGoogleOAuthStartUrl(API_BASE, {
        intent: "signup",
        plan: selectedPlan,
      }),
    [selectedPlan],
  );

  async function handleRegister(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!email.trim() || !fullName.trim() || !phone.trim() || !termsAccepted) {
      return;
    }

    if (password.length < 12) {
      setError("Password must be at least 12 characters long.");
      return;
    }

    setLoading(true);
    setError("");
    setDuplicateActivationEmail("");
    setPhonePaidRequired(false);

    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim(),
          plan: selectedPlan,
          // One-time Terms-of-Service / copyright acceptance. The checkbox
          // already gates this submit; sending it lets the backend record the
          // acceptance (timestamp, version, IP, UA) as IT Act §10A / DPDP
          // evidence instead of the checkbox being a client-only gate.
          terms_accepted: termsAccepted,
        }),
      });

      if (!response.ok) {
        const message = await readRegisterError(response);
        setError(message);
        if (
          response.status === 409 &&
          message.toLowerCase().includes("email already registered")
        ) {
          setDuplicateActivationEmail(email.trim());
        }
        // phone-reuse epic: the phone already has an account and a paid plan is
        // required to add another on the same number — offer the pricing page.
        if (
          response.status === 409 &&
          message.toLowerCase().includes("paid plan")
        ) {
          setPhonePaidRequired(true);
        }
        return;
      }

      const payload = await parseRegisterResponse(response);
      const acceptedPlan: string =
        typeof payload.plan === "string" ? payload.plan : selectedPlan;
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
      window.sessionStorage.setItem("rawdrive_pending_plan", selectedPlan);
    } catch {
      // SessionStorage can fail in private mode — ignore, intent is non-critical.
    }
    window.location.assign(googleStartUrl);
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => void handleRegister(event)}
    >
      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-2xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error"
        >
          {error}
        </div>
      ) : null}

      {duplicateActivationEmail ? (
        <Link
          href={`/activate?email=${encodeURIComponent(duplicateActivationEmail)}`}
          className="surface-button w-full text-sm font-semibold"
        >
          Activate account
        </Link>
      ) : null}

      {phonePaidRequired ? (
        <Link
          href="/pricing"
          className="surface-button w-full text-sm font-semibold"
        >
          View paid plans
        </Link>
      ) : null}

      {/* ── Plan selection ─────────────────────────────────────────── */}
      <fieldset className="space-y-3">
        <legend className="form-label ml-1">Plans</legend>

        {/* Segmented pill control — iOS-style, one thumb slides between 4 tabs */}
        <div
          role="radiogroup"
          aria-label="Subscription plan"
          className="relative flex rounded-2xl border border-border bg-surface-container-low p-1 shadow-inner"
        >
          {selectablePlans.map((p) => {
            const selected = selectedPlan === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPlan(p.id)}
                className={`relative z-10 flex-1 rounded-xl px-2 py-2 text-xs font-semibold uppercase transition-all duration-200 ${
                  selected
                    ? "bg-surface-elevated text-text-primary shadow-sm ring-1 ring-accent/30"
                    : "text-text-primary hover:text-text-primary"
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>

        {/* Featured detail card — dynamic, shows the currently selected plan */}
        {(() => {
          const currentPlan = selectablePlans.find(
            (p) => p.id === selectedPlan,
          );
          if (!currentPlan) return null;
          const isFree = currentPlan.monthlyPrice === 0;
          const highlights =
            currentPlan.features.length > 0
              ? currentPlan.features.slice(0, 3)
              : (planHighlights[selectedPlan] ?? []);
          const tagline =
            currentPlan.description.trim() ||
            planTagline[selectedPlan] ||
            currentPlan.name;
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
                <span className="micro-badge absolute right-4 top-4 bg-accent text-text-inverse shadow-sm">
                  <Sparkle className="h-2.5 w-2.5" aria-hidden="true" />
                  Best Value
                </span>
              )}

              <div className="relative">
                <p className="font-headline text-2xl font-extrabold text-text-primary">
                  {currentPlan.name}
                </p>
                <p className="text-micro mt-0.5 font-medium text-text-tertiary">
                  {tagline}
                </p>

                <div className="mt-4 flex items-baseline gap-1.5">
                  {isFree ? (
                    <>
                      <span className="font-headline text-5xl font-black leading-none text-text-primary">
                        Free
                      </span>
                      <span className="text-micro font-medium text-text-tertiary">
                        · {currentPlan.trialDays || 30}-day trial
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-semibold text-text-tertiary">
                        Rs.
                      </span>
                      <span className="font-headline text-5xl font-black leading-none text-text-primary">
                        {currentPlan.monthlyPrice.toLocaleString("en-IN")}
                      </span>
                      <span className="text-xs font-medium text-text-secondary">
                        /month
                      </span>
                    </>
                  )}
                </div>

                <ul className="mt-4 space-y-1.5">
                  {highlights.map((h) => (
                    <li
                      key={h}
                      className="flex items-center gap-2 text-xs leading-snug text-text-secondary"
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                        <Check
                          className="h-2.5 w-2.5"
                          strokeWidth={3}
                          aria-hidden="true"
                        />
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
        <GlassButton
          type="button"
          onClick={handleGoogleStart}
          disabled={googleLoading}
          aria-disabled={googleLoading}
          aria-describedby={googleDescriptionId}
          className="w-full"
          variant="surface"
          size="lg"
          icon={<GoogleMark className="brand-google-mark" />}
        >
          {googleLoading ? "Redirecting to Google…" : "Continue with Google"}
        </GlassButton>

        {webviewNotice ? (
          <div
            id="register-google-webview-recovery"
            className="rounded-2xl border border-border bg-surface-container-low px-4 py-4 text-sm text-text-secondary"
          >
            <p className="font-medium text-text-primary">
              Google sign-in requires Chrome
            </p>
            <p className="mt-1">
              This browser can&apos;t open Google&apos;s sign-in page. Open
              RawDrive in Chrome to continue.
            </p>
            <GlassButton
              type="button"
              onClick={() => openPageInChrome(window.location.href)}
              className="mt-3 w-full"
              variant="primary"
              size="md"
            >
              Open in Chrome
            </GlassButton>
          </div>
        ) : null}
      </div>

      <div
        className="relative flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="absolute inset-0 flex items-center">
          <div className="soft-divider w-full" />
        </div>
        <span className="text-micro relative bg-surface-elevated px-4 font-bold uppercase text-text-tertiary">
          or sign up with email
        </span>
      </div>

      {/* ── Email / password form fields ───────────────────────────── */}
      <div className="space-y-1.5">
        <label
          htmlFor="register-name"
          className="form-label ml-1 flex items-center gap-1.5"
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
        <label htmlFor="register-email" className="form-label ml-1">
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
          className="form-label ml-1 flex items-center gap-1.5"
        >
          Phone number
          <span className="text-feedback-error" aria-hidden="true">
            *
          </span>
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
        <label htmlFor="register-password" className="form-label ml-1">
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
            aria-describedby="register-password-hint"
            required
          />
          <GlassIconButton
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="input-adornment-button"
            variant="ghost"
            label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </GlassIconButton>
        </div>
        <p
          id="register-password-hint"
          className="text-micro ml-1 text-text-tertiary"
        >
          At least 12 characters.
        </p>
      </div>

      <div className="flex items-start gap-3 py-1">
        <input
          id="terms"
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => setTermsAccepted(event.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-border bg-surface-container-low text-accent focus:ring-accent/20"
        />
        <label
          htmlFor="terms"
          className="text-sm leading-tight text-text-secondary"
        >
          I accept the{" "}
          <Link
            href="/terms"
            className="font-semibold text-text-primary underline underline-offset-2"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="font-semibold text-text-primary underline underline-offset-2"
          >
            Privacy Policy
          </Link>
        </label>
      </div>

      <button
        type="submit"
        disabled={
          loading ||
          !email.trim() ||
          !fullName.trim() ||
          !phone.trim() ||
          !termsAccepted
        }
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
