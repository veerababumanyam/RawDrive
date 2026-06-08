"use client";

// Intermediate "Choose Payment Method" page.
//
// Flow:
//   /settings/plans  --[click Upgrade to <Plan>]-->  /settings/plans/choose-payment?tier=<tier>
//     (this page) --[click Razorpay auto-debit card]--> Razorpay modal
//
// Why an intermediate page (not an upfront toggle): cleaner UX, the choice is
// made in context of the actual purchase, browser-back works, and the route
// is shareable / linkable. The page is the canonical owner of all payment-
// processing complexity (script load, /upgrade call, /verify, redirect) —
// the plans page just emits a navigation.
//
// Adding a third provider (Stripe, Cashfree, …) is one entry in the
// PROVIDERS array below.

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CreditCard,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { ChevronLeft } from "@/components/icons";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { usePlanCatalog } from "@/hooks/use-plan-catalog";
import { getStoredAccessToken } from "@/lib/auth";
import type { PricingCatalogProduct } from "@/lib/plans";
import { viewportThemeColors } from "@/lib/tokens";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

type ProviderId = "razorpay";

interface ProviderDescriptor {
  id: ProviderId;
  name: string;
  tagline: string;
  description: string;
  methods: string[];
  icon: typeof CreditCard;
  // Accent color class for the icon badge — uses design tokens.
  accentClass: string;
}

const ALL_PROVIDERS: ProviderDescriptor[] = [
  {
    id: "razorpay",
    name: "Razorpay Auto Debit",
    tagline: "Recurring-ready checkout",
    description:
      "Use Razorpay Checkout for this payment and keep renewals on the Razorpay billing rail.",
    methods: ["Cards", "UPI", "Netbanking", "Wallets", "Auto debit"],
    icon: CreditCard,
    accentClass: "bg-accent/10 text-accent",
  },
];

type ProviderAvailability = Record<ProviderId, boolean>;

interface PaymentProvidersResponse {
  providers?: Array<{ id: string; configured: boolean }>;
  default_provider?: ProviderId;
}

const NO_PROVIDERS: ProviderAvailability = {
  razorpay: false,
};
const GST_RATE_PERCENT = 18;

function gstAmountPaise(netAmountPaise: number): number {
  if (netAmountPaise <= 0) return netAmountPaise;
  return Math.round((netAmountPaise * GST_RATE_PERCENT) / 100);
}

function formatINRPaise(amountPaise: number): string {
  const amount = amountPaise / 100;
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: amountPaise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// Minimal Razorpay types (no @types/razorpay needed).
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}

interface PaymentOrderResponse {
  provider: ProviderId;
  upgrade_order_id: string;
  billing_order_id?: string;
  amount_paise: number;
  currency: string;
  razorpay_order_id?: string;
  razorpay_key_id?: string;
}

function ChoosePaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const tier = searchParams.get("tier") ?? "";
  const productCode = searchParams.get("product_code") ?? "";
  const targetType = searchParams.get("target_type") ?? "";
  const targetId = searchParams.get("target_id") ?? "";
  const interval =
    searchParams.get("interval") === "annual" ? "annual" : "monthly";
  const { plans, eventPacks, galleryExtensions, storageBoosters } =
    usePlanCatalog();

  const plan = useMemo(
    () =>
      plans.find(
        (p) =>
          p.id === tier &&
          p.id !== "free" &&
          p.active &&
          p.paid &&
          p.selfServe,
      ),
    [plans, tier],
  );
  const salesAssistedPlan = useMemo(
    () =>
      plans.find(
        (p) =>
          p.id === tier &&
          p.id !== "free" &&
          p.active &&
          p.paid &&
          !p.selfServe,
      ),
    [plans, tier],
  );
  const product = useMemo<PricingCatalogProduct | undefined>(
    () =>
      [...eventPacks, ...galleryExtensions, ...storageBoosters].find(
        (item) => item.code === productCode && item.active,
      ),
    [eventPacks, galleryExtensions, productCode, storageBoosters],
  );
  const isProductOrder = Boolean(productCode);

  // Remember the user's last choice for the "Last used" hint badge.
  // Doesn't auto-select — the user still clicks deliberately each time.
  const [processing, setProcessing] = useState<ProviderId | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [providersLoading, setProvidersLoading] = useState(() =>
    Boolean(getStoredAccessToken()),
  );
  const [providersError, setProvidersError] = useState(() =>
    getStoredAccessToken() ? "" : "Session expired — please log in again.",
  );
  const [providerAvailability, setProviderAvailability] =
    useState<ProviderAvailability>(NO_PROVIDERS);
  const rzpScriptLoaded = useRef(false);

  const providers = ALL_PROVIDERS;

  // Derived: which stored provider is still available (re-computed on availability change).
  const lastUsed = useMemo<ProviderId | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const v = window.localStorage.getItem("rawdrive-payment-provider");
      if (v === "razorpay") {
        return providerAvailability[v] ? v : null;
      }
    } catch {
      /* private mode — non-critical */
    }
    return null;
  }, [providerAvailability]);

  useEffect(() => {
    let active = true;
    const token = getStoredAccessToken();
    if (!token) {
      return;
    }
    fetch(`${API_BASE}/api/v1/workspace/subscription/payment-providers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const json = (await res
          .json()
          .catch(() => ({}))) as PaymentProvidersResponse & { error?: string };
        if (!active) return;
        if (!res.ok) {
          setProviderAvailability(NO_PROVIDERS);
          setProvidersError(
            json.error ||
              `Could not check payment providers (HTTP ${res.status})`,
          );
          return;
        }
        const next: ProviderAvailability = { ...NO_PROVIDERS };
        for (const provider of json.providers ?? []) {
          if (provider.id === "razorpay") {
            next[provider.id] = provider.configured;
          }
        }
        setProviderAvailability(next);
        setProvidersError("");
      })
      .catch((err) => {
        if (!active) return;
        setProviderAvailability(NO_PROVIDERS);
        setProvidersError(
          err instanceof Error
            ? err.message
            : "Could not check payment providers",
        );
      })
      .finally(() => {
        if (active) setProvidersLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Load Razorpay checkout script eagerly so the modal opens fast when the
  // user picks Razorpay. CSP must allow checkout.razorpay.com (see
  // frontend/next.config.ts script-src + frame-src).
  useEffect(() => {
    if (
      rzpScriptLoaded.current ||
      document.getElementById("razorpay-checkout-js")
    ) {
      rzpScriptLoaded.current = true;
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      rzpScriptLoaded.current = true;
    };
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
    } catch {
      /* private mode — non-critical */
    }
  }, []);

  const startPayment = useCallback(
    async (provider: ProviderId) => {
      if (!plan && !product) return;
      setErrorMsg("");
      setProcessing(provider);
      persistChoice(provider);

      try {
        const token = getStoredAccessToken();
        if (!token) throw new Error("Not authenticated — please log in again.");

        const res = await fetch(
          isProductOrder
            ? `${API_BASE}/api/v1/workspace/billing/orders`
            : `${API_BASE}/api/v1/workspace/subscription/upgrade`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(
              isProductOrder
                ? {
                    product_code: product?.code,
                    provider,
                    target_type: targetType,
                    target_id: targetId,
                  }
                : {
                    to_tier: plan?.id,
                    provider,
                    billing_interval: interval,
                  },
            ),
          },
        );
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (res.status === 503) {
            setProviderAvailability((prev) => ({ ...prev, [provider]: false }));
          }
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const order = (await res.json()) as PaymentOrderResponse;

        // Razorpay modal path.
        if (!order.razorpay_order_id || !order.razorpay_key_id) {
          throw new Error("Razorpay order missing required fields");
        }
        if (!window.Razorpay) {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(
              () => reject(new Error("Razorpay script timeout")),
              8000,
            );
            const poll = setInterval(() => {
              if (window.Razorpay) {
                clearInterval(poll);
                clearTimeout(t);
                resolve();
              }
            }, 100);
          });
        }
        const rzp = new window.Razorpay({
          key: order.razorpay_key_id,
          amount: order.amount_paise,
          currency: order.currency,
          order_id: order.razorpay_order_id,
          name: "RawDrive",
          description: isProductOrder
            ? `Purchase ${product?.name ?? "RawDrive add-on"}`
            : `Upgrade to ${plan?.name}`,
          handler: async (response) => {
            try {
              const verifyRes = await fetch(
                isProductOrder
                  ? `${API_BASE}/api/v1/workspace/billing/orders/verify`
                  : `${API_BASE}/api/v1/workspace/subscription/verify`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    provider: "razorpay",
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_signature: response.razorpay_signature,
                  }),
                },
              );
              if (!verifyRes.ok) {
                const err = (await verifyRes.json().catch(() => ({}))) as {
                  error?: string;
                };
                throw new Error(
                  err.error ?? `Verification failed (HTTP ${verifyRes.status})`,
                );
              }
              const verified = (await verifyRes.json()) as {
                status: string;
                plan_tier?: string;
              };
              if (isProductOrder) {
                router.push(
                  product?.product_type === "storage_booster"
                    ? "/settings/storage?success=storage_booster"
                    : targetId
                      ? `/galleries/${encodeURIComponent(targetId)}?success=billing`
                      : "/settings/plans?success=billing",
                );
                return;
              }
              // Sidebar plan chip refresh — same pattern as the legacy plans page.
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("rawdrive:plan-changed", {
                    detail: { plan_tier: verified.plan_tier || plan?.id },
                  }),
                );
              }
              router.push(
                `/settings/plans?success=1&tier=${encodeURIComponent(verified.plan_tier || plan?.id || "")}`,
              );
            } catch (err) {
              setErrorMsg(
                `Payment captured but plan upgrade could not be confirmed: ${err instanceof Error ? err.message : "unknown error"}. Refresh in a minute or contact support if it doesn't update.`,
              );
              setProcessing(null);
            }
          },
          theme: { color: viewportThemeColors.publicGallery },
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
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Could not start payment. Please try again.",
        );
        setProcessing(null);
      }
    },
    [
      interval,
      isProductOrder,
      persistChoice,
      plan,
      product,
      router,
      targetId,
      targetType,
    ],
  );

  if (!product && salesAssistedPlan) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 p-8">
        <div className="surface-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Sales-assisted plan
          </p>
          <h1 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-text-primary">
            {salesAssistedPlan.name}
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            This plan is handled by the RawDrive team so storage, billing, and
            workspace setup can be confirmed before activation.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-text-inverse hover:opacity-90"
            >
              Contact sales
            </Link>
            <Link
              href="/settings/plans"
              className="inline-flex items-center gap-2 rounded-full border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary hover:border-accent hover:text-accent"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to plans
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Invalid / missing purchase target — bounce back to the relevant surface.
  if (!plan && !product) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 p-8">
        <div className="surface-panel p-6">
          <p className="text-sm text-text-secondary">
            That purchase isn&apos;t available. Choose a plan or add-on first.
          </p>
          <Link
            href="/settings/plans"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-text-inverse hover:opacity-90"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to plans
          </Link>
        </div>
      </div>
    );
  }

  const baseAmountPaise =
    product
      ? product.price_paise
      : interval === "annual"
        ? (plan?.annualPricePaise ?? (plan?.annualPrice ?? 0) * 100)
        : (plan?.monthlyPricePaise ?? (plan?.monthlyPrice ?? 0) * 100);
  const taxAmountPaise = gstAmountPaise(baseAmountPaise);
  const totalAmountPaise = baseAmountPaise + taxAmountPaise;
  const formattedTotalAmount = formatINRPaise(totalAmountPaise);
  const periodLabel = product
    ? product.billing_interval === "monthly"
      ? "mo"
      : "once"
    : interval === "annual"
      ? "yr"
      : "mo";
  const billingNote =
    product
      ? product.billing_interval === "monthly"
        ? "Billed monthly"
        : "One-time add-on"
      : interval === "annual"
      ? "Billed annually · Cancel anytime"
      : "Billed monthly · Cancel anytime";
  const purchaseName = plan?.name ?? product?.name ?? "RawDrive purchase";
  const purchaseDescription = product
    ? product.description
    : `${plan?.storage} storage · ${billingNote}`;
  // Backend creates gateway orders with the same GST-inclusive total.
  return (
    <div className="max-w-4xl mx-auto space-y-8 p-8">
      {/* Header */}
      <header className="flex items-center gap-3">
        <GlassIconButton
          type="button"
          label="Back to plans"
          variant="ghost"
          size="md"
          className="bg-surface-container-high text-text-secondary hover:bg-surface-container-highest hover:text-accent"
          onClick={() => router.push("/settings/plans")}
        >
          <ChevronLeft />
        </GlassIconButton>
        <div>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight text-text-primary">
            Choose Payment Method
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            Pick how you&apos;d like to pay for the <strong>{purchaseName}</strong>{" "}
            {product ? "add-on" : "plan"}.
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
              {purchaseName}
            </h2>
            <p className="text-sm text-text-secondary">{purchaseDescription}</p>
          </div>
          <div className="min-w-[220px] text-right">
            <p className="text-xs text-text-tertiary">Total today</p>
            <p className="text-3xl font-extrabold text-text-primary">
              {formattedTotalAmount}
              <span className="text-sm font-medium text-text-tertiary">
                {" "}
                / {periodLabel}
              </span>
            </p>
            <div className="mt-3 space-y-1 text-[11px] text-text-tertiary">
              <div className="flex items-center justify-between gap-4">
                <span>Subtotal</span>
                <span>{formatINRPaise(baseAmountPaise)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>GST ({GST_RATE_PERCENT}%)</span>
                <span>{formatINRPaise(taxAmountPaise)}</span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-text-tertiary">
              Gateway charge includes GST
            </p>
          </div>
        </div>
      </section>

      {/* Error banner */}
      {errorMsg && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-5 py-4 text-sm text-feedback-error">
          {errorMsg}
        </div>
      )}

      {providersLoading && (
        <div className="surface-panel p-5 text-sm text-text-secondary">
          Checking available payment methods…
        </div>
      )}

      {!providersLoading && providersError && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-5 py-4 text-sm text-feedback-error">
          {providersError}
        </div>
      )}

      {!providersLoading &&
        !providersError &&
        !Object.values(providerAvailability).some(Boolean) && (
          <div className="surface-panel p-5 text-sm text-text-secondary">
            Payments are not configured yet. Contact support to complete this
            upgrade.
          </div>
        )}

      {/* Payment method cards */}
      {!providersLoading && (
        <section
          aria-label="Payment methods"
          className="grid grid-cols-1 gap-4"
        >
          {providers.map((provider) => {
            const Icon = provider.icon;
            const isConfigured =
              providerAvailability[provider.id] && !providersError;
            const isProcessing = processing === provider.id;
            const isOtherProcessing =
              processing !== null && processing !== provider.id;
            const isUnavailable = !isConfigured;
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => startPayment(provider.id)}
                disabled={isProcessing || isOtherProcessing || isUnavailable}
                aria-busy={isProcessing}
                className={[
                  "group relative flex flex-col gap-4 rounded-2xl border bg-surface-container-low p-6 text-left transition-all",
                  "hover:border-accent hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  isProcessing
                    ? "border-accent ring-2 ring-accent/30"
                    : "border-border-subtle",
                ].join(" ")}
              >
                {lastUsed === provider.id && (
                  <span className="absolute -top-2.5 right-4 inline-flex items-center rounded-full bg-surface-container-highest border border-border-default px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                    Last used
                  </span>
                )}
                {isUnavailable && (
                  <span className="absolute -top-2.5 right-4 inline-flex items-center rounded-full bg-surface-container-highest border border-border-default px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                    Not configured
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
                    <h3 className="text-base font-bold text-text-primary">
                      {provider.name}
                    </h3>
                    <p className="text-xs font-medium text-text-tertiary">
                      {provider.tagline}
                    </p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {provider.description}
                    </p>
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

                <div className="mt-auto flex flex-col items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-text-tertiary">
                    {isUnavailable
                      ? "Unavailable right now"
                      : "Opens secure Razorpay popup"}
                  </span>
                  <span
                    className={[
                      "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-opacity",
                      isUnavailable
                        ? "bg-surface-container-high text-text-tertiary"
                        : "bg-accent text-text-inverse group-hover:opacity-90",
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
                        {isUnavailable
                          ? `${provider.name} not configured`
                          : `Pay ${formattedTotalAmount} with ${provider.name}`}
                      </>
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Trust line */}
      <footer className="flex items-center justify-center gap-2 text-xs text-text-tertiary">
        <ShieldCheck className="h-3.5 w-3.5" />
        Payments are encrypted and processed by RBI-licensed providers. Your
        card details never touch RawDrive servers.
      </footer>
    </div>
  );
}

export default function ChoosePaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto space-y-8 p-8">
          <div className="surface-panel p-6 text-sm text-text-secondary">
            Loading payment methods…
          </div>
        </div>
      }
    >
      <ChoosePaymentContent />
    </Suspense>
  );
}
