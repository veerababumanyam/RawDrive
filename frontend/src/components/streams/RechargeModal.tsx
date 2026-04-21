"use client";

import { useEffect, useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { getStoredAccessToken } from "@/lib/auth";
import { formatINR, type PublicStreamingPackage } from "@/lib/streaming-packages";
import { useUploadPackages, type UploadPackage } from "@/lib/upload-packages";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export type RechargeProvider = "phonepe" | "razorpay";

// M41 FR-UCRT-10: the modal now supports two product surfaces. "streaming"
// is the legacy default (streaming minute packs) — behaviour unchanged.
// "uploads" fetches the M41 upload-credit catalogue and displays the three
// credit tiers. Submit from the uploads tab is intentionally disabled
// until the order-initiation endpoint lands (separate backend PR): the
// PhonePe/Razorpay webhooks from PR #42 already exist, but the POST
// endpoint that returns a gateway redirect URL for an upload purchase is
// not yet wired. Showing the catalogue now unblocks product QA and lets
// the pricing UX ship ahead of the full checkout flow.
export type RechargeSurface = "streaming" | "uploads";

export type RechargeModalProps = {
  open: boolean;
  onClose: () => void;
  /** Test hook — called with the redirect URL before window.location navigation. */
  onRedirect?: (url: string) => void;
  /** Which tab to open initially. Defaults to "streaming" to preserve prior behaviour. */
  initialSurface?: RechargeSurface;
};

export function RechargeModal({ open, onClose, onRedirect, initialSurface = "streaming" }: RechargeModalProps) {
  const [surface, setSurface] = useState<RechargeSurface>(initialSurface);
  // Reset to the caller-supplied tab whenever the modal re-opens. Prevents
  // a close-from-uploads-tab + re-open-from-streaming-context from showing
  // the wrong pane.
  useEffect(() => {
    if (open) setSurface(initialSurface);
  }, [open, initialSurface]);

  const uploadPackagesState = useUploadPackages(open && surface === "uploads");
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
            <h2 className="text-lg font-semibold">
              {surface === "streaming" ? "Recharge streaming credits" : "Buy upload credits"}
            </h2>
            <p className="text-sm text-content-secondary">
              {surface === "streaming"
                ? "Choose a package to top up your balance."
                : "Pick a credit pack to keep uploads flowing."}
            </p>
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

        {/* M41 FR-UCRT-10: tab switcher between streaming minutes and upload
            credits. Uses role=tablist for keyboard-nav semantics so it
            meets the design system's A11Y baseline without GlassIconButton
            (which is icon-only). */}
        <div role="tablist" aria-label="Recharge product" className="flex gap-2 border-b border-white/10">
          <button
            role="tab"
            id="recharge-tab-streaming"
            aria-selected={surface === "streaming"}
            aria-controls="recharge-panel-streaming"
            data-testid="recharge-tab-streaming"
            type="button"
            onClick={() => setSurface("streaming")}
            className={`-mb-px px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              surface === "streaming"
                ? "border-accent-secondary text-content-primary"
                : "border-transparent text-content-secondary hover:text-content-primary"
            }`}
          >
            Streaming minutes
          </button>
          <button
            role="tab"
            id="recharge-tab-uploads"
            aria-selected={surface === "uploads"}
            aria-controls="recharge-panel-uploads"
            data-testid="recharge-tab-uploads"
            type="button"
            onClick={() => setSurface("uploads")}
            className={`-mb-px px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              surface === "uploads"
                ? "border-accent-secondary text-content-primary"
                : "border-transparent text-content-secondary hover:text-content-primary"
            }`}
          >
            Upload credits
          </button>
        </div>

        {surface === "uploads" && (
          <div
            id="recharge-panel-uploads"
            role="tabpanel"
            aria-labelledby="recharge-tab-uploads"
            data-testid="recharge-panel-uploads"
            className="space-y-4"
          >
            {uploadPackagesState.loading && (
              <div className="py-6 text-sm text-content-secondary">Loading upload packages…</div>
            )}
            {uploadPackagesState.error && (
              <div className="rounded-lg border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm">
                Failed to load upload packages: {uploadPackagesState.error}
              </div>
            )}
            {!uploadPackagesState.loading && !uploadPackagesState.error && uploadPackagesState.packages.length > 0 && (
              <div role="list" aria-label="Upload credit packages" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {uploadPackagesState.packages.map((pkg: UploadPackage) => (
                  <div
                    key={pkg.code}
                    role="listitem"
                    data-testid={`upload-package-${pkg.code}`}
                    className="rounded-xl border border-white/10 p-4"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-semibold">{pkg.display_name}</span>
                      <span className="text-sm">₹{formatINR(pkg.price_paise)}</span>
                    </div>
                    <div className="mt-1 text-xs text-content-secondary">
                      {pkg.credits.toLocaleString("en-IN")} credits
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Order-initiation endpoint pending — see RechargeSurface doc
                above. Explicit notice keeps expectations honest until the
                backend slice ships. */}
            <div
              data-testid="upload-order-init-unavailable"
              className="rounded-lg border border-white/10 bg-surface-muted p-3 text-xs text-content-secondary"
            >
              Upload credit checkout is coming soon. Admin-initiated grants are available today via
              Settings → Admin → Upload credits.
            </div>
          </div>
        )}

        {surface === "streaming" && loadingPackages && (
          <div className="py-6 text-sm text-content-secondary">Loading packages…</div>
        )}
        {surface === "streaming" && packagesError && (
          <div className="rounded-lg border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm">
            Failed to load packages: {packagesError}
          </div>
        )}

        {surface === "streaming" && packages && packages.length > 0 && (
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

        {surface === "streaming" && (
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
        )}

        {error && surface === "streaming" && (
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
          {surface === "streaming" && (
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
          )}
        </footer>
      </div>
    </div>
  );
}

export default RechargeModal;
