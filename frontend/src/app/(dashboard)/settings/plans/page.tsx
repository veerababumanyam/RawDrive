"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Crown, HardDrive, Loader2, Zap } from "lucide-react";
import { getStoredAccessToken } from "@/lib/auth";
import { pricingPlans } from "@/lib/tokens";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// Build the upgrade-eligible plan list from the canonical pricingPlans token.
const UPGRADE_PLANS = pricingPlans
  .filter((p) => p.id !== "free")
  .map((p) => ({
    tier: p.id,
    name: p.name,
    price: p.monthlyPrice as number,
    storage: p.storage,
    features: [...p.features],
    highlighted: p.popular,
  }));

const TIER_ORDER = ["free", "starter", "professional", "business", "enterprise"];

function tierIndex(tier: string): number {
  return TIER_ORDER.indexOf(tier);
}

// Minimal Razorpay types (no @types/razorpay needed).
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}

export default function PlansPage() {
  const searchParams = useSearchParams();
  const upgradeTo = searchParams.get("upgrade_to") ?? "";

  const [currentTier, setCurrentTier] = useState<string>("free");
  const [loading, setLoading] = useState(true);
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const rzpScriptLoaded = useRef(false);
  const autoUpgradeTriggered = useRef(false);

  // Load Razorpay checkout script once.
  useEffect(() => {
    if (rzpScriptLoaded.current || document.getElementById("razorpay-checkout-js")) {
      rzpScriptLoaded.current = true;
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => { rzpScriptLoaded.current = true; };
    document.head.appendChild(script);
  }, []);

  // Fetch current subscription tier.
  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) { setLoading(false); return; }
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

  const handleUpgrade = useCallback(async (tier: string, name: string, price: number) => {
    setNotice(null);
    setUpgradingTier(tier);
    try {
      const token = getStoredAccessToken();
      if (!token) throw new Error("Not authenticated");

      // Create Razorpay order on backend.
      const res = await fetch(`${API_BASE}/api/v1/workspace/subscription/upgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to_tier: tier }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const order = (await res.json()) as {
        razorpay_order_id: string;
        amount_paise: number;
        currency: string;
        razorpay_key_id: string;
      };

      // Wait for Razorpay script to load.
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("Razorpay script timeout")), 8000);
          const check = setInterval(() => {
            if (window.Razorpay) { clearInterval(check); clearTimeout(t); resolve(); }
          }, 100);
        });
      }

      // Open Razorpay checkout modal.
      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: order.amount_paise,
        currency: order.currency,
        order_id: order.razorpay_order_id,
        name: "RawDrive",
        description: `Upgrade to ${name}`,
        handler: () => {
          setNotice({
            type: "success",
            text: `Payment successful! Your plan is being upgraded to ${name}. This may take a moment to reflect.`,
          });
          setCurrentTier(tier);
          setUpgradingTier(null);
        },
        theme: { color: "var(--accent-default, #2d3435)" },
        modal: {
          ondismiss: () => {
            setUpgradingTier(null);
          },
        },
      });
      rzp.open();
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Could not initiate payment. Please try again.",
      });
      setUpgradingTier(null);
    }
  }, []);

  // Auto-trigger upgrade when arriving from onboarding with upgrade_to param.
  useEffect(() => {
    if (!upgradeTo || loading || autoUpgradeTriggered.current) return;
    const target = UPGRADE_PLANS.find((p) => p.tier === upgradeTo);
    if (!target) return;
    autoUpgradeTriggered.current = true;
    void handleUpgrade(target.tier, target.name, target.price);
  }, [upgradeTo, loading, handleUpgrade]);

  const isOnboardingUpgrade = Boolean(upgradeTo);

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
            {isOnboardingUpgrade ? "Complete Your Subscription" : "Choose a Plan"}
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {isOnboardingUpgrade
              ? "Complete payment to activate your selected plan and unlock all features."
              : "All plans include Cloudflare R2 storage, WebP delivery, and client galleries."}
          </p>
        </div>
      </header>

      {isOnboardingUpgrade && !notice && (
        <div className="rounded-xl border border-accent/30 bg-accent/8 px-5 py-4 text-sm text-accent">
          Your workspace is ready. Complete payment below to activate your <strong>{UPGRADE_PLANS.find((p) => p.tier === upgradeTo)?.name ?? upgradeTo}</strong> plan.
        </div>
      )}

      {notice && (
        <div
          className={[
            "rounded-xl border px-5 py-4 text-sm",
            notice.type === "success"
              ? "border-success/30 bg-success/8 text-success"
              : "border-feedback-error/30 bg-feedback-error/10 text-feedback-error",
          ].join(" ")}
        >
          {notice.text}
          {notice.type === "success" && (
            <div className="mt-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-text-inverse hover:opacity-90"
              >
                Go to Dashboard
              </Link>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border-subtle bg-surface-container-low p-8 text-center text-text-secondary text-sm">
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {UPGRADE_PLANS.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            const isUpgrade = tierIndex(plan.tier) > tierIndex(currentTier);
            const isProcessing = upgradingTier === plan.tier;
            const isHighlighted = plan.highlighted && !isCurrent;
            const isAutoTarget = plan.tier === upgradeTo;

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
                  <h2 className="text-base font-bold text-text-primary">{plan.name}</h2>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-text-primary">
                      ₹{plan.price.toLocaleString("en-IN")}
                    </span>
                    <span className="text-sm text-text-tertiary">/ mo</span>
                  </div>
                </div>

                {/* Storage callout */}
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2">
                  <HardDrive className="h-4 w-4 shrink-0 text-text-tertiary" />
                  <span className="text-sm font-semibold text-text-primary">{plan.storage}</span>
                  <span className="text-xs text-text-tertiary">storage</span>
                </div>

                {/* Feature list */}
                <ul className="mb-6 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-text-secondary">
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
                    disabled={isProcessing || upgradingTier !== null}
                    onClick={() => handleUpgrade(plan.tier, plan.name, plan.price)}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Opening…
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Upgrade to {plan.name}
                      </>
                    )}
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
        Prices in Indian Rupees (₹), billed monthly. 18% GST applicable. Payments processed via Razorpay.{" "}
        Enterprise pricing and annual plans:{" "}
        <a
          href="mailto:sales@rawdrive.in"
          className="underline underline-offset-2 hover:text-text-secondary"
        >
          sales@rawdrive.in
        </a>
      </p>
    </div>
  );
}
