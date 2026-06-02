"use client";

// PhonePe redirect-back landing page for the subscription upgrade flow.
//
// PhonePe v2 Standard Checkout doesn't push a signature into the redirect
// URL — only the merchantOrderId is echoed (we pass it as `order_id` in
// the redirectUrl we build server-side). The authoritative source of
// payment state is PhonePe's Order Status API, which the backend's
// /verify?provider=phonepe endpoint calls on our behalf. So this page is
// a thin shim: it pulls the order_id from the URL, POSTs verify, and
// shows COMPLETED / PENDING / FAILED.
//
// Razorpay uses the in-page modal so this page is PhonePe-only.

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const PENDING_VERIFY_DELAYS_MS = [0, 5000, 10000, 20000, 30000, 30000];

type Status = "verifying" | "ok" | "pending" | "failed" | "error";

function PhonePePaymentCallbackContent() {
  const router = useRouter();
  const search = useSearchParams() ?? new URLSearchParams();
  const orderID = search.get("order_id") ?? "";
  const tier = search.get("tier") ?? "";
  const interval = search.get("interval") === "annual" ? "annual" : "monthly";
  const retryHref = tier
    ? `/settings/plans/choose-payment?tier=${encodeURIComponent(tier)}&interval=${interval}`
    : "/settings/plans";
  // Compute initial state synchronously so the validation branches
  // don't trigger `react-hooks/set-state-in-effect`. The effect only
  // sets state from the async fetch result.
  const initialState: { status: Status; errorMsg: string } = (() => {
    if (!orderID) {
      return {
        status: "error",
        errorMsg: "Missing order id — return to the plans page and try again.",
      };
    }
    if (typeof window === "undefined") {
      // SSR — keep verifying; the effect will fail-fast on the client.
      return { status: "verifying", errorMsg: "" };
    }
    if (!getStoredAccessToken()) {
      return {
        status: "error",
        errorMsg: "Session expired — please log in again.",
      };
    }
    return { status: "verifying", errorMsg: "" };
  })();
  const [status, setStatus] = useState<Status>(initialState.status);
  const [planTier, setPlanTier] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>(initialState.errorMsg);
  const [providerState, setProviderState] = useState<string>("");
  const [providerErrorCode, setProviderErrorCode] = useState<string>("");
  const [verifyAttempt, setVerifyAttempt] = useState(0);
  // Surfaced to the success notice so the user sees the plan name they
  // bought, not just the slug. Stashed by the plans page right before
  // window.location.assign.
  const planName = (() => {
    if (typeof window === "undefined") return "";
    try {
      return window.sessionStorage.getItem("rawdrive-pending-plan-name") || "";
    } catch {
      return "";
    }
  })();

  useEffect(() => {
    // Skip the network call if we already classified the state
    // synchronously above (missing order_id, no auth token).
    if (status !== "verifying" && status !== "pending") return;
    if (
      status === "pending" &&
      verifyAttempt >= PENDING_VERIFY_DELAYS_MS.length
    )
      return;
    const token = getStoredAccessToken();
    if (!token) return;

    let active = true;
    const delay =
      PENDING_VERIFY_DELAYS_MS[
        Math.min(verifyAttempt, PENDING_VERIFY_DELAYS_MS.length - 1)
      ];
    const timer = window.setTimeout(() => {
      fetch(`${API_BASE}/api/v1/workspace/subscription/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: "phonepe",
          merchant_order_id: orderID,
        }),
      })
        .then(async (r) => {
          const j = (await r.json().catch(() => ({}))) as {
            status?: string;
            plan_tier?: string;
            provider_state?: string;
            provider_error_code?: string;
            error?: string;
          };
          if (!active) return;
          setProviderState(j.provider_state || "");
          setProviderErrorCode(j.provider_error_code || "");
          if (r.status === 202 || j.status === "pending") {
            setStatus("pending");
            setVerifyAttempt((attempt) => attempt + 1);
            return;
          }
          if (!r.ok) {
            setStatus("error");
            setErrorMsg(j.error || `Verification failed (HTTP ${r.status})`);
            return;
          }
          if (j.status === "ok") {
            setStatus("ok");
            setPlanTier(j.plan_tier || "");
            // Tell the dashboard shell to refresh the sidebar plan chip.
            // Same pattern the Razorpay handler uses.
            try {
              window.dispatchEvent(
                new CustomEvent("rawdrive:plan-changed", {
                  detail: { plan_tier: j.plan_tier },
                }),
              );
            } catch {
              /* ignore */
            }
            // Clean up the sessionStorage hint.
            try {
              window.sessionStorage.removeItem("rawdrive-pending-plan-name");
            } catch {
              /* ignore */
            }
            return;
          }
          setStatus("failed");
        })
        .catch((err) => {
          if (!active) return;
          setStatus("error");
          setErrorMsg(err instanceof Error ? err.message : "Unknown error");
        });
    }, delay);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [orderID, status, verifyAttempt]);

  return (
    <div className="mx-auto max-w-xl space-y-6 p-8">
      <h1 className="font-headline text-2xl font-extrabold tracking-tight text-text-primary">
        PhonePe Payment
      </h1>

      {status === "verifying" && (
        <div className="surface-panel space-y-2 p-6">
          <p className="text-sm text-text-secondary">
            Confirming your payment with PhonePe…
          </p>
        </div>
      )}

      {status === "ok" && (
        <div className="surface-panel space-y-3 p-6">
          <p className="text-sm font-semibold text-feedback-success">
            Payment successful — your plan has been upgraded
            {planName ? ` to ${planName}` : planTier ? ` to ${planTier}` : ""}.
          </p>
          <p className="text-sm text-text-secondary">
            You can return to the dashboard and start using your new plan
            immediately.
          </p>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="btn-primary px-4 py-2 text-sm"
            >
              Go to dashboard
            </button>
            <Link
              href="/settings/plans"
              className="rounded-xl border border-border-default px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
            >
              Back to plans
            </Link>
          </div>
        </div>
      )}

      {status === "pending" && (
        <div className="surface-panel space-y-3 p-6">
          <p className="text-sm font-medium text-feedback-warning">
            Payment still processing
          </p>
          <p className="text-sm text-text-secondary">
            PhonePe hasn&apos;t confirmed the payment yet. We&apos;ll keep
            checking for a short while. You can also re-check manually or
            restart checkout for the same plan.
          </p>
          {(providerState || providerErrorCode) && (
            <p className="rounded-xl bg-surface-container-low px-3 py-2 text-xs text-text-tertiary">
              PhonePe status:{" "}
              {[providerState, providerErrorCode].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setStatus("verifying");
                setVerifyAttempt(0);
              }}
              className="rounded-xl border border-border-default px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
            >
              Re-check
            </button>
            <Link
              href={retryHref}
              className="rounded-xl border border-border-default px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
            >
              Restart checkout
            </Link>
          </div>
        </div>
      )}

      {status === "failed" && (
        <div className="surface-panel space-y-3 p-6">
          <p className="text-sm font-semibold text-feedback-error">
            Payment did not complete.
          </p>
          <p className="text-sm text-text-secondary">
            PhonePe reported this checkout attempt as unsuccessful. RawDrive has
            not applied a plan change for this order.
          </p>
          {(providerState || providerErrorCode) && (
            <p className="rounded-xl bg-surface-container-low px-3 py-2 text-xs text-text-tertiary">
              PhonePe status:{" "}
              {[providerState, providerErrorCode].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link href={retryHref} className="btn-primary px-4 py-2 text-sm">
              Try again
            </Link>
            <Link
              href="/settings/plans"
              className="rounded-xl border border-border-default px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
            >
              Back to plans
            </Link>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="surface-panel space-y-3 p-6">
          <p className="text-sm font-semibold text-feedback-error">
            Could not verify payment.
          </p>
          <p className="text-sm text-text-secondary">{errorMsg}</p>
          <Link
            href="/settings/plans"
            className="inline-block rounded-xl border border-border-default px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            Back to plans
          </Link>
        </div>
      )}
    </div>
  );
}

export default function PhonePePaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-xl space-y-6 p-8">
          <div className="surface-panel p-6 text-sm text-text-secondary">
            Loading payment status…
          </div>
        </div>
      }
    >
      <PhonePePaymentCallbackContent />
    </Suspense>
  );
}
