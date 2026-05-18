"use client";

import { useEffect, useState } from "react";

interface State {
  id: number;
  name: string;
  code: string;
  is_union_territory: boolean;
}

const TERRITORY_TYPES = [
  { value: "primary", label: "Primary dealer" },
  { value: "secondary", label: "Secondary dealer" },
  { value: "ambassador", label: "Brand ambassador" },
] as const;

interface DealerApplicationModalProps {
  open: boolean;
  onClose: () => void;
}

export default function DealerApplicationModal({ open, onClose }: DealerApplicationModalProps) {
  const [states, setStates] = useState<State[]>([]);
  const [dealerEmail, setDealerEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [state, setState] = useState("");
  const [territoryType, setTerritoryType] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [gstin, setGstin] = useState("");
  const [businessProfile, setBusinessProfile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open || states.length > 0) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
    fetch(`${apiBase}/api/v1/states`)
      .then((r) => r.json())
      .then((d) => setStates(d.states ?? []))
      .catch(() => {/* non-fatal — user can still type state name */});
  }, [open, states.length]);

  const reset = () => {
    setDealerEmail("");
    setBusinessName("");
    setState("");
    setTerritoryType("");
    setPanNumber("");
    setGstin("");
    setBusinessProfile("");
    setError(null);
    setSubmitted(false);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await fetch(`${apiBase}/api/v1/public/dealer-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealer_email: dealerEmail,
          business_name: businessName,
          state,
          territory_type: territoryType,
          pan_number: panNumber || undefined,
          gstin: gstin || undefined,
          business_profile: businessProfile || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Submission failed. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dealer-app-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-surface-container border border-border-subtle shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border-subtle">
          <h2 id="dealer-app-title" className="font-headline text-xl font-bold text-text-primary">
            Partner application
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-container-high transition-colors"
          >
            ✕
          </button>
        </div>

        {submitted ? (
          <div className="px-6 py-10 text-center space-y-3">
            <div className="text-4xl">✓</div>
            <h3 className="font-headline text-lg font-bold text-text-primary">Application received</h3>
            <p className="text-sm text-text-secondary leading-6">
              We have sent a confirmation to <strong>{dealerEmail}</strong>.
              Our partnerships team will reach out within 3–5 business days.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-4 btn-primary px-6 py-2 text-sm font-semibold"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* Email */}
            <label className="block">
              <span className="block text-sm font-medium text-text-secondary mb-1">
                Business email <span className="text-feedback-error">*</span>
              </span>
              <input
                type="email"
                required
                value={dealerEmail}
                onChange={(e) => setDealerEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </label>

            {/* Business name */}
            <label className="block">
              <span className="block text-sm font-medium text-text-secondary mb-1">
                Business name <span className="text-feedback-error">*</span>
              </span>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Sunrise Studios Pvt Ltd"
                className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </label>

            {/* State + Territory in a row */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-sm font-medium text-text-secondary mb-1">
                  State <span className="text-feedback-error">*</span>
                </span>
                <select
                  required
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <option value="">Select state</option>
                  {states.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-sm font-medium text-text-secondary mb-1">
                  Territory type <span className="text-feedback-error">*</span>
                </span>
                <select
                  required
                  value={territoryType}
                  onChange={(e) => setTerritoryType(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <option value="">Select type</option>
                  {TERRITORY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* PAN + GSTIN */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-sm font-medium text-text-secondary mb-1">PAN number</span>
                <input
                  type="text"
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 font-mono"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-text-secondary mb-1">GSTIN</span>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="27AAPFU0939F1ZV"
                  maxLength={15}
                  className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 font-mono"
                />
              </label>
            </div>

            {/* Business profile */}
            <label className="block">
              <span className="block text-sm font-medium text-text-secondary mb-1">About your business</span>
              <textarea
                value={businessProfile}
                onChange={(e) => setBusinessProfile(e.target.value)}
                placeholder="Tell us about your business, experience, and why you'd like to partner with RawDrive…"
                rows={3}
                maxLength={1000}
                className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
              />
            </label>

            {error && (
              <p role="alert" className="text-sm text-feedback-error">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                className="btn-tertiary border border-border px-5 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-primary px-5 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Submitting…" : "Submit application"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
