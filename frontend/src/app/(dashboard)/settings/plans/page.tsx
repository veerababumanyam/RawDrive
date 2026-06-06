"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Crown, HardDrive, Zap } from "lucide-react";
import { usePlanCatalog } from "@/hooks/use-plan-catalog";
import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

type BillingInterval = "monthly" | "annual";

// 2026-05-18 — payment-method picker moved to /settings/plans/choose-payment.
// The plans page is now purely a tier-selection surface; the chooser page
// owns the order summary, the Razorpay vs PhonePe decision, the SDK
// script load, and the /upgrade + /verify orchestration. This lets the
// user evaluate plans without committing to a payment method, and makes
// the payment-method choice an in-context decision tied to a specific
// plan purchase.
function PlansPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const upgradeTo = searchParams.get("upgrade_to") ?? "";
  // Set when the user returns from a successful payment (chooser page
  // redirects here with ?success=1&tier=...).
  const successTier =
    searchParams.get("success") === "1" ? (searchParams.get("tier") ?? "") : "";

  const [currentTier, setCurrentTier] = useState<string>("free");
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("monthly");
  const { plans } = usePlanCatalog();
  const upgradePlans = useMemo(
    () =>
      plans
        .filter((plan) => plan.id !== "free" && plan.active && plan.paid)
        .map((plan) => ({
          tier: plan.id,
          name: plan.name,
          monthlyPrice: plan.monthlyPrice,
          annualPrice: plan.annualPrice,
          storage: plan.storage,
          features: [...plan.features],
          highlighted: plan.popular,
          rank: plan.rank,
        })),
    [plans],
  );
  const currentRank =
    plans.find((plan) => plan.id === currentTier)?.rank ??
    plans.find((plan) => plan.id === "free")?.rank ??
    -1;
  // Compute initial loading state synchronously — if there's no auth token,
  // there's nothing to fetch, so we start in the not-loading state. This
  // avoids the React 19 `react-hooks/set-state-in-effect` lint because the
  // effect below now only sets state from the async fetch result.
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return !!getStoredAccessToken();
  });
  const autoUpgradeTriggered = useRef(false);

  // Fetch current subscription tier.
  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    fetch(`${API_BASE}/api/v1/workspace/subscription`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { plan_tier?: string } | null) => {
        if (d?.plan_tier) setCurrentTier(d.plan_tier);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Navigate to the chooser page. Replacing the previous in-page payment
  // flow — the chooser owns all payment orchestration so this page stays
  // focused on tier selection.
  const handleUpgrade = useCallback(
    (tier: string) => {
      router.push(
        `/settings/plans/choose-payment?tier=${encodeURIComponent(tier)}&interval=${billingInterval}`,
      );
    },
    [router, billingInterval],
  );

  // Auto-trigger upgrade when arriving from onboarding with upgrade_to param.
  useEffect(() => {
    if (!upgradeTo || loading || autoUpgradeTriggered.current) return;
    const target = upgradePlans.find((p) => p.tier === upgradeTo);
    if (!target) return;
    autoUpgradeTriggered.current = true;
    handleUpgrade(target.tier);
  }, [upgradeTo, loading, handleUpgrade, upgradePlans]);

  const isOnboardingUpgrade = Boolean(upgradeTo);
  const successPlanName = successTier
    ? (upgradePlans.find((p) => p.tier === successTier)?.name ?? successTier)
    : "";

  return (
    <div className="max-w-6xl mx-auto space-y-10 p-8">
      <header className="flex items-center gap-3">
        <Link
          href="/settings/subscription"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-accent"
          aria-label="Back to subscription"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight text-text-primary">
            {isOnboardingUpgrade
              ? "Complete Your Subscription"
              : "Choose a Plan"}
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {isOnboardingUpgrade
              ? "Complete payment to activate your selected plan and unlock all features."
              : "All plans include managed storage, WebP delivery, and client galleries."}
          </p>
        </div>
      </header>

      {isOnboardingUpgrade && !successTier && (
        <div className="rounded-xl border border-accent/30 bg-accent/8 px-5 py-4 text-sm text-accent">
          Your workspace is ready. Complete payment below to activate your{" "}
          <strong>
            {upgradePlans.find((p) => p.tier === upgradeTo)?.name ?? upgradeTo}
          </strong>{" "}
          plan.
        </div>
      )}

      {successTier && (
        <div className="rounded-xl border border-success/30 bg-success/8 px-5 py-4 text-sm text-success">
          Payment successful! Your plan has been upgraded to{" "}
          <strong>{successPlanName}</strong>.
          <div className="mt-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-text-inverse hover:opacity-90"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      )}

      {/* Billing interval toggle */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setBillingInterval("monthly")}
          className={[
            "rounded-full px-5 py-2 text-sm font-semibold transition-colors",
            billingInterval === "monthly"
              ? "bg-accent text-text-inverse"
              : "bg-surface-container-high text-text-secondary hover:bg-surface-container-highest",
          ].join(" ")}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setBillingInterval("annual")}
          className={[
            "inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors",
            billingInterval === "annual"
              ? "bg-accent text-text-inverse"
              : "bg-surface-container-high text-text-secondary hover:bg-surface-container-highest",
          ].join(" ")}
        >
          Annual
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              billingInterval === "annual"
                ? "bg-surface-overlay/20 text-text-inverse"
                : "bg-feedback-success/15 text-feedback-success",
            ].join(" ")}
          >
            Save ~17%
          </span>
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border-subtle bg-surface-container-low p-8 text-center text-text-secondary text-sm">
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {upgradePlans.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            const isUpgrade = plan.rank > currentRank;
            const isHighlighted = plan.highlighted && !isCurrent;
            const isAutoTarget = plan.tier === upgradeTo;
            const displayPrice =
              billingInterval === "annual"
                ? plan.annualPrice
                : plan.monthlyPrice;

            return (
              <div
                key={plan.tier}
                className={[
                  "relative flex flex-col rounded-2xl border p-6 transition-shadow",
                  isCurrent
                    ? "border-accent bg-accent/5 shadow-md"
                    : isAutoTarget
                      ? "border-accent/60 bg-accent/5 shadow-md ring-2 ring-accent/20"
                      : isHighlighted
                        ? "border-border-strong bg-surface-container-low shadow-md"
                        : "border-border-subtle bg-surface-container-low",
                ].join(" ")}
              >
                {isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-0.5 text-[11px] font-semibold text-text-inverse">
                    <Crown className="h-3 w-3" />
                    Current Plan
                  </span>
                )}
                {!isCurrent && isHighlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-surface-container-highest border border-border-default px-3 py-0.5 text-[11px] font-semibold text-text-secondary">
                    <Zap className="h-3 w-3" />
                    Popular
                  </span>
                )}
                {!isCurrent && isAutoTarget && !isHighlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-0.5 text-[11px] font-semibold text-text-inverse">
                    Selected
                  </span>
                )}

                {/* Plan name & price */}
                <div className="mb-4 space-y-1">
                  <h2 className="text-base font-bold text-text-primary">
                    {plan.name}
                  </h2>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-text-primary">
                      ₹{displayPrice.toLocaleString("en-IN")}
                    </span>
                    <span className="text-sm text-text-tertiary">
                      {billingInterval === "annual" ? "/ yr" : "/ mo"}
                    </span>
                  </div>
                  {billingInterval === "annual" && (
                    <p className="text-[11px] text-text-tertiary">
                      ₹
                      {Math.round(plan.annualPrice / 12).toLocaleString(
                        "en-IN",
                      )}{" "}
                      / mo effective
                    </p>
                  )}
                </div>

                {/* Storage callout */}
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2">
                  <HardDrive className="h-4 w-4 shrink-0 text-text-tertiary" />
                  <span className="text-sm font-semibold text-text-primary">
                    {plan.storage}
                  </span>
                  <span className="text-xs text-text-tertiary">storage</span>
                </div>

                {/* Feature list */}
                <ul className="mb-6 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-text-secondary"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <div className="flex items-center justify-center rounded-full border border-accent/30 bg-accent/10 py-2 text-sm font-semibold text-accent">
                    Your current plan
                  </div>
                ) : isUpgrade ? (
                  <button
                    type="button"
                    onClick={() => handleUpgrade(plan.tier)}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90"
                  >
                    <Zap className="h-4 w-4" />
                    Upgrade to {plan.name}
                  </button>
                ) : (
                  <div className="flex items-center justify-center rounded-full border border-border-subtle py-2 text-sm text-text-tertiary">
                    Lower tier
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-text-tertiary">
        Prices in Indian Rupees (₹), billed{" "}
        {billingInterval === "annual" ? "annually" : "monthly"}. 18% GST
        applicable. Payments processed via Razorpay or PhonePe. Enterprise
        pricing:{" "}
        <a
          href="mailto:info@rawdrive.in"
          className="underline underline-offset-2 hover:text-text-secondary"
        >
          info@rawdrive.in
        </a>
      </p>
    </div>
  );
}

// Next 15/16 requires useSearchParams() to sit inside a Suspense boundary;
// without it this client page de-opts static prerendering / bails the whole
// route to CSR (and can error during static generation). Mirror the pattern
// used by login/page.tsx (LoginForm), forgot-password, and reset-password:
// keep the search-param-dependent logic in a child client component wrapped
// in <Suspense>.
export default function PlansPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto space-y-10 p-8">
          <div className="rounded-xl border border-border-subtle bg-surface-container-low p-8 text-center text-text-secondary text-sm">
            Loading…
          </div>
        </div>
      }
    >
      <PlansPageContent />
    </Suspense>
  );
}
