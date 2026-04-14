"use client";

import { useEffect, useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { getStoredAccessToken } from "@/lib/auth";
import { formatINR, type PublicStreamingPackage } from "@/lib/streaming-packages";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export type RechargeProvider = "phonepe" | "razorpay";

export type RechargeModalProps = {
  open: boolean;
  onClose: () => void;
  /** Test hook — called with the redirect URL before window.location navigation. */
  onRedirect?: (url: string) => void;
};

export function RechargeModal({ open, onClose, onRedirect }: RechargeModalProps) {
  const [packages, setPackages] = useState<PublicStreamingPackage[] | null>(null);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packagesError, setPackagesError] = useState<string | null>(null);

  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [provider, setProvider] = useState<RechargeProvider>("phonepe");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPackages(true);
    setPackagesError(null);
    fetch(`${API_BASE}/api/v1/public/streaming/packages`, {
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { packages: PublicStreamingPackage[] };
      })
      .then((data) => {
        if (cancelled) return;
        setPackages(Array.isArray(data?.packages) ? data.packages : []);
        setLoadingPackages(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setPackagesError(err.message);
        setLoadingPackages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!selectedPackageId) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? getStoredAccessToken() : "";
      const res = await fetch(`${API_BASE}/api/v1/streaming/recharge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ package_id: selectedPackageId, provider }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirect_url?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const url = data.redirect_url || "";
      if (!url.startsWith("https:")) {
        throw new Error("Invalid redirect URL");
      }
      if (onRedirect) {
        onRedirect(url);
      } else if (typeof window !== "undefined") {
        window.location.assign(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="recharge-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Recharge streaming credits"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-surface-base/95 shadow-xl p-6 space-y-5 text-content-primary">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Recharge streaming credits</h2>
            <p className="text-sm text-content-secondary">Choose a package to top up your balance.</p>
          </div>
          <GlassIconButton
            label="Close recharge modal"
            variant="ghost"
            size="sm"
            onClick={onClose}
            data-testid="recharge-close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </GlassIconButton>
        </header>

        {loadingPackages && <div className="py-6 text-sm text-content-secondary">Loading packages…</div>}
        {packagesError && (
          <div className="rounded-lg border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm">
            Failed to load packages: {packagesError}
          </div>
        )}

        {packages && packages.length > 0 && (
          <div role="radiogroup" aria-label="Streaming packages" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {packages.map((pkg) => {
              const selected = selectedPackageId === pkg.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`package-${pkg.id}`}
                  onClick={() => setSelectedPackageId(pkg.id)}
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    selected
                      ? "border-accent-secondary bg-accent-secondary/10"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{pkg.name}</span>
                    <span className="text-sm">₹{formatINR(pkg.price_paise)}</span>
                  </div>
                  <div className="mt-1 text-xs text-content-secondary">
                    {pkg.minutes} min · up to {pkg.max_concurrent_viewers} viewers
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <fieldset className="flex items-center gap-3 text-sm">
          <legend className="sr-only">Payment provider</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="provider"
              value="phonepe"
              checked={provider === "phonepe"}
              onChange={() => setProvider("phonepe")}
              data-testid="provider-phonepe"
            />
            PhonePe
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="provider"
              value="razorpay"
              checked={provider === "razorpay"}
              onChange={() => setProvider("razorpay")}
              data-testid="provider-razorpay"
            />
            Razorpay
          </label>
        </fieldset>

        {error && (
          <div data-testid="recharge-error" className="rounded-lg border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm">
            {error}
          </div>
        )}

        <footer className="flex items-center justify-end gap-2">
          <GlassIconButton
            label="Cancel recharge"
            variant="ghost"
            onClick={onClose}
            data-testid="recharge-cancel"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </GlassIconButton>
          <GlassIconButton
            label={submitting ? "Processing recharge" : "Confirm recharge"}
            variant="accent"
            onClick={handleSubmit}
            disabled={!selectedPackageId || submitting}
            data-testid="recharge-submit"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12l5 5L20 6" />
            </svg>
          </GlassIconButton>
        </footer>
      </div>
    </div>
  );
}

export default RechargeModal;
