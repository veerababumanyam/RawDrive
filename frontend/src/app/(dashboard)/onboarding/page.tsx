"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getStoredAccessToken, refreshAuthSession } from "@/lib/auth";
import { pricingPlans } from "@/lib/tokens";
import { getDistrictsForState } from "@/lib/data/india-districts";

// Minimal Razorpay types.
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type IndianState = {
  id: number;
  name: string;
  code: string;
  is_union_territory: boolean;
};

type Step = "state_selection" | "profile" | "plan_selection" | "complete";

const STEPS: Step[] = ["state_selection", "profile", "plan_selection", "complete"];
const STEP_LABELS: Record<Step, string> = {
  state_selection: "Location",
  profile: "Profile",
  plan_selection: "Plan",
  complete: "Done",
};

const ONBOARDING_PLANS = pricingPlans.filter((p) =>
  ["free", "starter", "professional", "business", "enterprise"].includes(p.id),
);

// Short highlight lines shown on each plan card (3 max).
const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  free: ["1GB storage · 3 galleries", "5 client profiles", "30-day full-access trial"],
  starter: ["30GB storage · 10 galleries", "Client proofing & basic CRM", "Priority email support"],
  professional: ["300GB storage · 50 galleries", "AI culling + full CRM & bookings", "Live streaming · marketplace listing"],
  business: ["3TB storage · 200 galleries", "Unlimited AI culling + API access", "Dedicated account manager"],
  enterprise: ["6TB storage · unlimited galleries", "White-label + custom integrations", "SLA + 24/7 dedicated support"],
};

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("state_selection");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — state selection
  const [selectedStateID, setSelectedStateID] = useState<number | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [states, setStates] = useState<IndianState[]>([]);
  const [statesLoading, setStatesLoading] = useState(true);

  // Step 2 — profile (collected locally, submitted together with plan in step 3)
  const [businessName, setBusinessName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");

  // Step 3 — plan selection
  const [selectedPlan, setSelectedPlan] = useState<string>("starter");

  const rzpScriptLoaded = useRef(false);
  // Tracks whether the workspace has already been created so we skip the
  // profile API call on payment retry (after Razorpay modal dismiss).
  const workspaceCreated = useRef(false);

  const token = getStoredAccessToken();

  // Resume onboarding from server-side state
  useEffect(() => {
    fetch(`${API_BASE}/onboarding/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.current_step) setStep(data.current_step as Step);
        if (data.state_id) {
          const n = Number(data.state_id);
          if (!Number.isNaN(n) && n > 0) setSelectedStateID(n);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  // Fetch states list
  useEffect(() => {
    let cancelled = false;
    setStatesLoading(true);
    fetch(`${API_BASE}/api/v1/states`)
      .then((res) => res.json())
      .then((body: { states?: IndianState[] }) => {
        if (cancelled) return;
        setStates(Array.isArray(body.states) ? body.states : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStatesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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
    script.onerror = () => {
      // 2026-05-18: surface the failure in the console so the cause is
      // visible instead of the misleading 8s polling timeout. Most
      // common cause is CSP blocking checkout.razorpay.com — see
      // next.config.ts script-src + frame-src.
      console.error(
        "[Razorpay] checkout.js failed to load on /onboarding — check CSP, ad blockers, or network. URL:",
        script.src,
      );
      script.remove();
    };
    document.head.appendChild(script);
  }, []);

  // Pre-fill phone from registration profile
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/v1/users/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data: { phone?: string }) => {
        if (data.phone) setPhone(data.phone);
      })
      .catch(() => {});
  }, [token]);

  // Carry plan intent from registration
  useEffect(() => {
    let plan: string | null = null;
    try {
      plan = window.sessionStorage.getItem("rawdrive_pending_plan");
    } catch { /* ignore */ }
    if (!plan) plan = searchParams.get("plan");
    if (plan && ONBOARDING_PLANS.some((p) => p.id === plan)) {
      setSelectedPlan(plan);
    }
  }, [searchParams]);

  // Step 1: submit state
  async function handleStateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedStateID == null) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/onboarding/state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          state_id: selectedStateID,
          ...(selectedDistrict ? { district: selectedDistrict } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to save state");
      }
      setStep("profile");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  // Step 2: advance to plan selection (no API call — data collected locally)
  function handleProfileContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim() || !displayName.trim()) return;
    setStep("plan_selection");
  }

  // Step 3: submit profile + plan, create workspace, open Razorpay inline
  async function handlePlanSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let currentToken = token;

      // Only create the workspace once — skip on retry after Razorpay dismiss.
      if (!workspaceCreated.current) {
        const body: Record<string, string> = {
          business_name: businessName.trim(),
          display_name: displayName.trim(),
          plan: selectedPlan,
        };
        if (phone.trim()) body.phone = phone.trim();
        if (gstin.trim()) body.gstin = gstin.trim().toUpperCase();

        const res = await fetch(`${API_BASE}/onboarding/profile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "Failed to create workspace");
        }

        workspaceCreated.current = true;

        // Clear registration carry-over keys
        try {
          window.sessionStorage.removeItem("rawdrive_pending_plan");
          window.sessionStorage.removeItem("rawdrive_pending_state_id");
        } catch { /* non-critical */ }

        // Refresh JWT so it carries the new workspace_id before calling upgrade.
        try {
          await refreshAuthSession(API_BASE);
          currentToken = getStoredAccessToken();
        } catch { /* dashboard will refresh on next visit */ }
      }

      // Free plan — no payment needed.
      if (selectedPlan === "free") {
        setStep("complete");
        return;
      }

      // Paid plan: create Razorpay order on backend.
      if (!currentToken) throw new Error("Not authenticated");
      const upgradeRes = await fetch(`${API_BASE}/api/v1/workspace/subscription/upgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ to_tier: selectedPlan }),
      });

      if (!upgradeRes.ok) {
        const err = (await upgradeRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${upgradeRes.status}`);
      }

      const order = (await upgradeRes.json()) as {
        razorpay_order_id: string;
        amount_paise: number;
        currency: string;
        razorpay_key_id: string;
      };

      // Wait for Razorpay script to be available (up to 20s).
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => {
            clearInterval(check);
            reject(new Error("Payment gateway could not load. Please check your connection and try again."));
          }, 20000);
          const check = setInterval(() => {
            if (window.Razorpay) { clearInterval(check); clearTimeout(t); resolve(); }
          }, 200);
        });
      }

      const planName = ONBOARDING_PLANS.find((p) => p.id === selectedPlan)?.name ?? selectedPlan;

      setSubmitting(false); // let user interact with the modal

      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: order.amount_paise,
        currency: order.currency,
        order_id: order.razorpay_order_id,
        name: "RawDrive",
        description: `${planName} plan subscription`,
        prefill: { name: displayName.trim() },
        theme: { color: "var(--accent-default, #2d3435)" },
        // 2026-05-18: post the verification triple to the server so the
        // plan upgrade is settled synchronously. Without this, payment
        // succeeds at Razorpay but workspaces.plan_tier never updates
        // (the webhook can't reach localhost in dev; and even in prod
        // the user shouldn't have to wait for the webhook round-trip
        // before seeing the new plan). See plans/page.tsx for the same
        // pattern + applyPayment idempotency notes.
        handler: async (response) => {
          try {
            const verifyRes = await fetch(`${API_BASE}/api/v1/workspace/subscription/verify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
              },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            if (!verifyRes.ok) {
              // Payment captured but verify failed — webhook will reconcile;
              // still advance to the complete step so the user isn't blocked
              // on the onboarding screen.
              console.error("[Onboarding] subscription verify failed", await verifyRes.text());
            } else {
              // 2026-05-18: tell the dashboard shell to refresh the
              // sidebar plan badge so the user lands on the dashboard
              // with the new tier already showing — no reload required.
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("rawdrive:plan-changed"));
              }
            }
          } catch (err) {
            console.error("[Onboarding] subscription verify threw", err);
          }
          setStep("complete");
        },
        modal: {
          ondismiss: () => {
            // Workspace already exists — user can retry payment without re-submitting profile.
          },
        },
      });
      rzp.open();
      return; // submitting was reset above
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && step === "state_selection") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-text-secondary">Loading...</p>
      </div>
    );
  }

  const currentStepIdx = STEPS.indexOf(step);

  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-text-primary">Welcome to RawDrive</h1>
        <p className="mt-2 text-text-secondary">Set up your photography workspace in a few steps.</p>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {STEPS.map((s, i) => {
          const isDone = i < currentStepIdx;
          const isCurrent = s === step;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                    isDone
                      ? "bg-accent text-white"
                      : isCurrent
                      ? "bg-accent text-white ring-2 ring-accent/30"
                      : "bg-surface-elevated text-text-tertiary"
                  }`}
                >
                  {isDone ? "✓" : i + 1}
                </div>
                <span className={`hidden sm:block text-[10px] font-medium ${isCurrent ? "text-accent" : "text-text-tertiary"}`}>
                  {STEP_LABELS[s]}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mb-4 h-px w-8 sm:w-12 ${isDone ? "bg-accent" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {/* Step 1: State Selection */}
      {step === "state_selection" && (
        <div className="glass-surface rounded-2xl p-8">
          <h2 className="mb-2 text-xl font-semibold text-text-primary">Where are you based?</h2>
          <p className="mb-6 text-sm text-text-secondary">
            Your state determines GST rules and local compliance.
          </p>
          <form onSubmit={handleStateSubmit}>
            <select
              value={selectedStateID ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedStateID(v ? Number(v) : null);
                setSelectedDistrict("");
              }}
              className="input-base mb-4 w-full min-h-[44px]"
              disabled={statesLoading}
              required
            >
              <option value="" disabled>
                {statesLoading ? "Loading states…" : "Select your state…"}
              </option>
              {states.filter((s) => !s.is_union_territory).length > 0 && (
                <optgroup label="States">
                  {states
                    .filter((s) => !s.is_union_territory)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              )}
              {states.filter((s) => s.is_union_territory).length > 0 && (
                <optgroup label="Union Territories">
                  {states
                    .filter((s) => s.is_union_territory)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            {selectedStateID != null && (() => {
              const stateName = states.find((s) => s.id === selectedStateID)?.name ?? "";
              const districts = getDistrictsForState(stateName);
              return districts.length > 0 ? (
                <div className="mb-6">
                  <label htmlFor="onboarding-district" className="mb-1 block text-sm font-medium text-text-secondary">
                    District <span className="text-text-tertiary">(optional)</span>
                  </label>
                  <select
                    id="onboarding-district"
                    value={selectedDistrict}
                    onChange={(e) => setSelectedDistrict(e.target.value)}
                    className="input-base w-full min-h-[44px]"
                  >
                    <option value="">Select district…</option>
                    {districts.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              ) : <div className="mb-6" />;
            })()}
            <button
              type="submit"
              disabled={selectedStateID == null || submitting || statesLoading}
              className="btn-primary w-full min-h-[44px] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Saving…" : "Continue"}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Business Profile */}
      {step === "profile" && (
        <div className="glass-surface rounded-2xl p-8">
          <h2 className="mb-2 text-xl font-semibold text-text-primary">Business Profile</h2>
          <p className="mb-6 text-sm text-text-secondary">
            This appears on your invoices and client-facing pages.
          </p>
          <form onSubmit={handleProfileContinue} className="space-y-4">
            <div>
              <label htmlFor="business-name" className="mb-1 block text-sm font-medium text-text-secondary">
                Business Name <span className="text-error">*</span>
              </label>
              <input
                id="business-name"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Sharma Photography Studio"
                className="input-base w-full min-h-[44px]"
                required
              />
            </div>
            <div>
              <label htmlFor="display-name" className="mb-1 block text-sm font-medium text-text-secondary">
                Display Name <span className="text-error">*</span>
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="input-base w-full min-h-[44px]"
                required
              />
            </div>
            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-medium text-text-secondary">
                Phone number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                className="input-base w-full min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="gstin" className="mb-1 block text-sm font-medium text-text-secondary">
                GSTIN <span className="text-text-tertiary">(optional)</span>
              </label>
              <input
                id="gstin"
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="27AAAAA0000A1Z5"
                maxLength={15}
                className="input-base w-full min-h-[44px]"
              />
              <p className="mt-1 text-xs text-text-tertiary">15-character GST ID, if registered.</p>
            </div>
            <button
              type="submit"
              disabled={!businessName.trim() || !displayName.trim()}
              className="btn-primary w-full min-h-[44px] disabled:opacity-50 cursor-pointer"
            >
              Continue
            </button>
          </form>
        </div>
      )}

      {/* Step 3: Plan Selection */}
      {step === "plan_selection" && (
        <div className="glass-surface rounded-2xl p-8">
          <h2 className="mb-2 text-xl font-semibold text-text-primary">Choose your plan</h2>
          <p className="mb-6 text-sm text-text-secondary">
            You can upgrade or change your plan anytime from settings.
          </p>
          <form onSubmit={handlePlanSubmit}>
            <div className="mb-6 space-y-3">
              {ONBOARDING_PLANS.map((plan) => {
                const isSelected = selectedPlan === plan.id;
                const isFree = plan.id === "free";
                const highlights = PLAN_HIGHLIGHTS[plan.id] ?? [];
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`relative w-full rounded-xl border p-4 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-accent bg-accent/8 ring-2 ring-accent/20"
                        : "border-border bg-surface-container hover:border-accent/40 hover:bg-surface-elevated"
                    }`}
                  >
                    {plan.popular && (
                      <span className="absolute right-3 top-3 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        Popular
                      </span>
                    )}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            isSelected ? "border-accent bg-accent" : "border-border"
                          }`}
                        >
                          {isSelected && (
                            <div className="h-2 w-2 rounded-full bg-white" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-text-primary">{plan.name}</p>
                          <ul className="mt-1 space-y-0.5">
                            {highlights.map((h) => (
                              <li key={h} className="text-xs text-text-secondary">
                                {h}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {isFree ? (
                          <span className="text-lg font-bold text-text-primary">Free</span>
                        ) : (
                          <>
                            <span className="text-lg font-bold text-text-primary">
                              ₹{plan.monthlyPrice.toLocaleString("en-IN")}
                            </span>
                            <span className="text-xs text-text-tertiary">/mo</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full min-h-[44px] disabled:opacity-50 cursor-pointer"
            >
              {submitting
                ? "Setting up…"
                : selectedPlan === "free"
                ? "Start for free"
                : (() => {
                    const plan = ONBOARDING_PLANS.find((p) => p.id === selectedPlan);
                    return `Pay & activate · ₹${plan ? plan.monthlyPrice.toLocaleString("en-IN") : ""}/mo`;
                  })()}
            </button>

            {selectedPlan !== "free" && (
              <p className="mt-3 text-center text-xs text-text-tertiary">
                Secure payment via Razorpay. Your workspace activates instantly after payment.
              </p>
            )}
          </form>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === "complete" && (
        <div className="glass-surface rounded-2xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/15">
            <span className="text-3xl text-accent">✓</span>
          </div>
          <h2 className="mb-2 text-2xl font-bold text-text-primary">Your workspace is ready!</h2>
          <p className="mb-8 text-text-secondary">
            Welcome to RawDrive. Start adding clients, galleries, and bookings.
          </p>
          <button
            onClick={() => window.location.assign("/dashboard")}
            className="btn-primary min-h-[44px] px-8 cursor-pointer"
          >
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
