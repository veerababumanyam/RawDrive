"use client";

// Intermediate "Choose Payment Method" page.
//
// Flow:
//   /settings/plans  --[click Upgrade to <Plan>]-->  /settings/plans/choose-payment?tier=<tier>
//     (this page) --[click a payment method card]--> Razorpay modal OR PhonePe hosted page
//
// Why an intermediate page (not an upfront toggle): cleaner UX, the choice is
// made in context of the actual purchase, browser-back works, and the route
// is shareable / linkable. The page is the canonical owner of all payment-
// processing complexity (script load, /upgrade call, /verify, redirect) —
// the plans page just emits a navigation.
//
// Adding a third provider (Stripe, Cashfree, …) is one entry in the
// PROVIDERS array below.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CreditCard, Loader2, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { getStoredAccessToken } from "@/lib/auth";
import { pricingPlans } from "@/lib/tokens";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

type ProviderId = "razorpay" | "phonepe";

interface ProviderDescriptor {
  id: ProviderId;
  name: string;
  tagline: string;
  description: string;
  methods: string[];
  flow: "modal" | "redirect";
  icon: typeof CreditCard;
  // Accent color class for the icon badge — uses design tokens.
  accentClass: string;
}

// 2026-05-19: PhonePe is hidden from the subscription payment picker
// while the upstream PhonePe v2 Standard Checkout integration is broken
// on the merchant-risk-engine side (INTERNAL_SECURITY_BLOCK_1 / TXN_BLOCKED
// — escalated with PhonePe support, not a code defect on our side). When
// PhonePe support restores the merchant's payment surface, flip this flag
// back to true to restore the tile. The backend create-order route +
// payment-callback handler for provider="phonepe" are intentionally left
// wired so the path can be re-enabled without code changes.
const PHONEPE_ENABLED = false;

// All known providers. Render-time filter below uses PHONEPE_ENABLED to
// hide the PhonePe tile while keeping the descriptor in one place — when
// the gate flips back to true the user-facing UI returns to its prior
// two-tile layout without further edits.
//
// Order matters: rendered top-to-bottom on mobile, left-to-right on desktop.
const ALL_PROVIDERS: ProviderDescriptor[] = [
  {
    id: "razorpay",
    name: "Razorpay",
    tagline: "Cards, UPI, Netbanking, Wallets",
    description:
      "Pay securely without leaving RawDrive. Razorpay's checkout opens in a popup; supports all major Indian banks and wallets.",
    methods: ["Credit / Debit Cards", "UPI", "Netbanking", "Wallets", "EMI"],
    flow: "modal",
    icon: CreditCard,
    accentClass: "bg-accent/10 text-accent",
  },
  {
    id: "phonepe",
    name: "PhonePe",
    tagline: "UPI, PhonePe Wallet, Cards",
    description:
      "You'll be redirected to PhonePe's secure hosted page to complete payment, then brought back here automatically.",
    methods: ["PhonePe Wallet", "UPI", "Credit / Debit Cards", "Netbanking"],
    flow: "redirect",
    icon: Smartphone,
    accentClass: "bg-feedback-info/10 text-feedback-info",
  },
];

const PROVIDERS: ProviderDescriptor[] = ALL_PROVIDERS.filter(
  (p) => p.id !== "phonepe" || PHONEPE_ENABLED,
);

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

interface UpgradeOrderResponse {
  provider: ProviderId;
  upgrade_order_id: string;
  amount_paise: number;
  currency: string;
  // Razorpay fields:
  razorpay_order_id?: string;
  razorpay_key_id?: string;
  // PhonePe fields:
  redirect_url?: string;
  phonepe_order_id?: string;
}

export default function ChoosePaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tier = searchParams.get("tier") ?? "";
  const interval = searchParams.get("interval") === "annual" ? "annual" : "monthly";

  const plan = useMemo(
    () => pricingPlans.find((p) => p.id === tier && p.id !== "free"),
    [tier],
  );

  // Remember the user's last choice for the "Last used" hint badge.
  // Doesn't auto-select — the user still clicks deliberately each time.
  const [lastUsed, setLastUsed] = useState<ProviderId | null>(null);
  const [processing, setProcessing] = useState<ProviderId | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const rzpScriptLoaded = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem("rawdrive-payment-provider");
      if (v === "razorpay" || v === "phonepe") {
        // Only restore the "last used" hint if the provider is still
        // visible. A user whose previous attempt was PhonePe (now
        // hidden, see PHONEPE_ENABLED above) gets no badge instead of
        // a "Last used" hint pointing at a tile that no longer exists.
        if (PROVIDERS.some((p) => p.id === v)) setLastUsed(v);
      }
    } catch { /* private mode — non-critical */ }
  }, []);

  // Load Razorpay checkout script eagerly so the modal opens fast when the
  // user picks Razorpay. CSP must allow checkout.razorpay.com (see
  // frontend/next.config.ts script-src + frame-src).
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
    script.onerror = () => {
      console.error(
        "[Razorpay] checkout.js failed to load — check CSP script-src + frame-src, ad blockers, or network.",
      );
      script.remove();
    };
    document.head.appendChild(script);
  }, []);

  const persistChoice = useCallback((id: ProviderId) => {
    try {
      window.localStorage.setItem("rawdrive-payment-provider", id);
    } catch { /* private mode — non-critical */ }
  }, []);

  const startPayment = useCallback(async (provider: ProviderId) => {
    if (!plan) return;
    setErrorMsg("");
    setProcessing(provider);
    persistChoice(provider);

    try {
      const token = getStoredAccessToken();
      if (!token) throw new Error("Not authenticated — please log in again.");

      const res = await fetch(`${API_BASE}/api/v1/workspace/subscription/upgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to_tier: plan.id, provider, billing_interval: interval }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const order = (await res.json()) as UpgradeOrderResponse;

      if (order.provider === "phonepe") {
        if (!order.redirect_url) throw new Error("PhonePe order missing redirect URL");
        try {
          window.sessionStorage.setItem("rawdrive-pending-plan-name", plan.name);
        } catch { /* non-critical */ }
        window.location.assign(order.redirect_url);
        return;
      }

      // Razorpay modal path.
      if (!order.razorpay_order_id || !order.razorpay_key_id) {
        throw new Error("Razorpay order missing required fields");
      }
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("Razorpay script timeout")), 8000);
          const poll = setInterval(() => {
            if (window.Razorpay) { clearInterval(poll); clearTimeout(t); resolve(); }
          }, 100);
        });
      }
      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: order.amount_paise,
        currency: order.currency,
        order_id: order.razorpay_order_id,
        name: "RawDrive",
        description: `Upgrade to ${plan.name}`,
        handler: async (response) => {
          try {
            const verifyRes = await fetch(`${API_BASE}/api/v1/workspace/subscription/verify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            if (!verifyRes.ok) {
              const err = (await verifyRes.json().catch(() => ({}))) as { error?: string };
              throw new Error(err.error ?? `Verification failed (HTTP ${verifyRes.status})`);
            }
            const verified = (await verifyRes.json()) as { status: string; plan_tier: string };
            // Sidebar plan chip refresh — same pattern as the legacy plans page.
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("rawdrive:plan-changed", {
                  detail: { plan_tier: verified.plan_tier || plan.id },
                }),
              );
            }
            router.push(`/settings/plans?success=1&tier=${encodeURIComponent(verified.plan_tier || plan.id)}`);
          } catch (err) {
            setErrorMsg(
              `Payment captured but plan upgrade could not be confirmed: ${err instanceof Error ? err.message : "unknown error"}. Refresh in a minute or contact support if it doesn't update.`,
            );
            setProcessing(null);
          }
        },
        theme: { color: "var(--accent-default, #2d3435)" },
        modal: {
          ondismiss: () => {
            // User closed the modal — stay on the chooser page so they can
            // pick a different method or try again.
            setProcessing(null);
          },
        },
      });
      rzp.open();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not start payment. Please try again.");
      setProcessing(null);
    }
  }, [plan, persistChoice, router]);

  // Invalid / missing tier — bounce back to /settings/plans.
  if (!plan) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 p-8">
        <div className="surface-panel p-6">
          <p className="text-sm text-text-secondary">
            That plan isn&apos;t available. Choose a plan first.
          </p>
          <Link
            href="/settings/plans"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-text-inverse hover:opacity-90"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to plans
          </Link>
        </div>
      </div>
    );
  }

  const displayPrice = interval === "annual"
    ? (plan.annualPrice as number)
    : (plan.monthlyPrice as number);
  const periodLabel = interval === "annual" ? "yr" : "mo";
  const billingNote = interval === "annual" ? "Billed annually · Cancel anytime" : "Billed monthly · Cancel anytime";
  // GST is shown as a note for transparency. The actual GST inclusion is
  // backend-owned; the displayed price is what the user will be charged this cycle.
  return (
    <div className="max-w-4xl mx-auto space-y-8 p-8">
      {/* Header */}
      <header className="flex items-center gap-3">
        <Link
          href="/settings/plans"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-accent"
          aria-label="Back to plans"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight text-text-primary">
            Choose Payment Method
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            Pick how you&apos;d like to pay for the <strong>{plan.name}</strong> plan.
          </p>
        </div>
      </header>

      {/* Order summary */}
      <section className="surface-panel p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Order summary
            </p>
            <h2 className="mt-1 text-base font-bold text-text-primary">
              {plan.name} Plan
            </h2>
            <p className="text-sm text-text-secondary">
              {plan.storage} storage · {billingNote}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-text-tertiary">Total today</p>
            <p className="text-3xl font-extrabold text-text-primary">
              ₹{displayPrice.toLocaleString("en-IN")}
              <span className="text-sm font-medium text-text-tertiary"> / {periodLabel}</span>
            </p>
            <p className="text-[11px] text-text-tertiary">incl. 18% GST</p>
          </div>
        </div>
      </section>

      {/* Error banner */}
      {errorMsg && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-5 py-4 text-sm text-feedback-error">
          {errorMsg}
        </div>
      )}

      {/* Payment method cards */}
      <section aria-label="Payment methods" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const Icon = provider.icon;
          const isProcessing = processing === provider.id;
          const isOtherProcessing = processing !== null && processing !== provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => startPayment(provider.id)}
              disabled={isProcessing || isOtherProcessing}
              aria-busy={isProcessing}
              className={[
                "group relative flex flex-col gap-4 rounded-2xl border bg-surface-container-low p-6 text-left transition-all",
                "hover:border-accent hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface",
                "disabled:cursor-not-allowed disabled:opacity-60",
                isProcessing ? "border-accent ring-2 ring-accent/30" : "border-border-subtle",
              ].join(" ")}
            >
              {lastUsed === provider.id && (
                <span className="absolute -top-2.5 right-4 inline-flex items-center rounded-full bg-surface-container-highest border border-border-default px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                  Last used
                </span>
              )}

              <div className="flex items-start gap-4">
                <span
                  className={[
                    "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                    provider.accentClass,
                  ].join(" ")}
                  aria-hidden
                >
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-text-primary">{provider.name}</h3>
                  <p className="text-xs font-medium text-text-tertiary">{provider.tagline}</p>
                  <p className="mt-2 text-sm text-text-secondary">{provider.description}</p>
                </div>
              </div>

              <ul className="flex flex-wrap gap-1.5">
                {provider.methods.map((m) => (
                  <li
                    key={m}
                    className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-[11px] font-medium text-text-secondary"
                  >
                    {m}
                  </li>
                ))}
              </ul>

              <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                <span className="text-xs text-text-tertiary">
                  {provider.flow === "modal" ? "Opens secure popup" : "Redirects to PhonePe"}
                </span>
                <span
                  className={[
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-opacity",
                    "bg-accent text-text-inverse group-hover:opacity-90",
                    isProcessing ? "opacity-100" : "",
                  ].join(" ")}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting…
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" />
                      Pay ₹{displayPrice.toLocaleString("en-IN")} with {provider.name}
                    </>
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {/* Trust line */}
      <footer className="flex items-center justify-center gap-2 text-xs text-text-tertiary">
        <ShieldCheck className="h-3.5 w-3.5" />
        Payments are encrypted and processed by RBI-licensed providers. Your card details never touch RawDrive servers.
      </footer>
    </div>
  );
}
