"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

type CallbackState = "checking" | "success" | "pending" | "failed";

interface BillingVerifyResponse {
  status: string;
  provider_state?: string;
  provider_error_code?: string;
  order_type?: string;
  target_type?: string;
  target_id?: string;
}

function BillingPaymentCallbackContent() {
  const router = useRouter();
  const params = useSearchParams() ?? new URLSearchParams();
  const orderID = params.get("order_id") ?? "";
  const provider = params.get("provider") ?? "phonepe";
  const [state, setState] = useState<CallbackState>("checking");
  const [message, setMessage] = useState("Confirming your payment...");

  const returnHref = useMemo(() => {
    if (message.includes("storage")) return "/settings/storage";
    return "/settings/plans";
  }, [message]);

  useEffect(() => {
    let active = true;
    async function verify() {
      const token = getStoredAccessToken();
      if (!token || !orderID) {
        setState("failed");
        setMessage("Missing payment session. Please start again.");
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/workspace/billing/orders/verify`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              provider,
              merchant_order_id: orderID,
            }),
          },
        );
        const body = (await res
          .json()
          .catch(() => ({}))) as BillingVerifyResponse & { error?: string };
        if (!active) return;
        if (res.status === 202 || body.status === "pending") {
          setState("pending");
          setMessage("Payment is still pending. We will update this order shortly.");
          return;
        }
        if (!res.ok || body.status === "failed") {
          setState("failed");
          setMessage(body.error || "Payment could not be confirmed.");
          return;
        }
        setState("success");
        if (body.order_type === "storage_booster") {
          setMessage("Storage booster activated.");
          router.replace("/settings/storage?success=storage_booster");
          return;
        }
        if (body.target_type === "gallery" && body.target_id) {
          setMessage("Gallery add-on activated.");
          router.replace(
            `/galleries/${encodeURIComponent(body.target_id)}?success=billing`,
          );
          return;
        }
        setMessage("Billing add-on activated.");
        router.replace("/settings/plans?success=billing");
      } catch (err) {
        if (!active) return;
        setState("failed");
        setMessage(
          err instanceof Error ? err.message : "Payment confirmation failed.",
        );
      }
    }
    verify();
    return () => {
      active = false;
    };
  }, [orderID, provider, router]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <section className="surface-panel p-6">
        <p className="text-xs font-semibold uppercase text-text-tertiary">
          Payment
        </p>
        <h1 className="mt-2 font-headline text-2xl font-extrabold text-text-primary">
          {state === "checking"
            ? "Confirming payment"
            : state === "success"
              ? "Payment confirmed"
              : state === "pending"
                ? "Payment pending"
                : "Payment needs attention"}
        </h1>
        <p className="mt-3 text-sm text-text-secondary">{message}</p>
        {state !== "checking" && (
          <Link
            href={returnHref}
            className="mt-5 inline-flex touch-min items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-text-inverse"
          >
            Continue
          </Link>
        )}
      </section>
    </div>
  );
}

export default function BillingPaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl p-8 text-sm text-text-secondary">
          Confirming payment...
        </div>
      }
    >
      <BillingPaymentCallbackContent />
    </Suspense>
  );
}
