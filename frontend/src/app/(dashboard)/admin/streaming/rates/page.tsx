"use client";

// M31 / F-014 E103-S2 — Super-admin streaming rate-card management.
//
// Lists global streaming packages, lets super-admins edit package metadata
// (capacity/TTL/active) and publish new versioned rate-card rows with
// future-effective semantics. Past purchases reference the rate-card row
// that was active at purchase time, so this page never retro-prices.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  listStreamingPackages,
  listRateCards,
  createRateCard,
  patchStreamingPackage,
  type StreamingPackage,
  type RateCard,
} from "@/lib/api/streaming";
import { BackButton } from "@/components/ui/back-button";

function formatINR(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function isFutureISO(iso: string): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > Date.now();
}

export default function SuperAdminStreamingRatesPage() {
  const [packages, setPackages] = useState<StreamingPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewRate, setShowNewRate] = useState(false);
  const [showPatch, setShowPatch] = useState(false);
  // Captured once at mount so Date.now() is not called during render
  // (react-hooks/purity). Rate-card active/scheduled status is stable
  // for the lifetime of this page view.
  const [nowMs] = useState(() => Date.now());

  const token = useMemo(() => getStoredAccessToken() || "", []);

  const refreshPackages = useCallback(async () => {
    try {
      setLoading(true);
      const pkgs = await listStreamingPackages(token);
      setPackages(pkgs);
      if (!selectedId && pkgs.length > 0) setSelectedId(pkgs[0].id);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, selectedId]);

  const refreshRates = useCallback(async () => {
    if (!selectedId) return;
    try {
      const cards = await listRateCards(token, selectedId);
      setRateCards(cards);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, selectedId]);

  useEffect(() => {
    async function initialFetch() { await refreshPackages(); }
    void initialFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    async function initialFetch() { await refreshRates(); }
    void initialFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, token]);

  const selected = packages.find((p) => p.id === selectedId) ?? null;

  if (loading && packages.length === 0) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <p className="text-text-secondary">Loading streaming packages…</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-8">
      <BackButton label="Go back" />
      <header className="space-y-2">
        <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">
          Streaming Rate Cards
        </h2>
        <p className="text-text-secondary font-body text-sm">
          F-014 package catalogue and versioned pricing. New rates take effect
          at their scheduled <em>Effective From</em> — existing purchases keep
          their original rate-card version.
        </p>
      </header>

      {error && (
        <div className="bg-feedback-error/10 border border-feedback-error/40 text-feedback-error px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Package list */}
        <section className="lg:col-span-1 space-y-3">
          <h3 className="font-headline text-lg font-bold text-on-surface">Packages</h3>
          <div className="space-y-2">
            {packages.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => setSelectedId(pkg.id)}
                className={`w-full text-left p-4 rounded-2xl border transition ${
                  selectedId === pkg.id
                    ? "border-primary bg-primary/10"
                    : "border-white/[0.03] bg-surface-container-low/40 hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-on-surface">{pkg.name}</span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-text-secondary">
                    {pkg.tier}
                  </span>
                </div>
                <div className="text-xs text-text-secondary mt-1">
                  {pkg.minutes} min · up to {pkg.max_concurrent_viewers} viewers ·
                  {" "}{pkg.replay_ttl_days}d replay
                </div>
                {!pkg.is_active && (
                  <div className="text-[10px] text-feedback-error mt-1">INACTIVE</div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Detail pane */}
        <section className="lg:col-span-2 space-y-6">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-headline text-2xl font-bold text-on-surface">
                    {selected.name}
                  </h3>
                  <p className="text-text-secondary text-sm mt-1">
                    Code: <code className="font-mono">{selected.code}</code> ·
                    Tier: {selected.tier}
                  </p>
                </div>
                <button
                  onClick={() => setShowPatch(true)}
                  className="px-4 py-2 rounded-xl bg-surface-container-low/60 border border-white/[0.05]
                    text-sm text-on-surface hover:border-primary/40"
                >
                  Edit package
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Minutes" value={String(selected.minutes)} />
                <StatCard label="Max viewers" value={String(selected.max_concurrent_viewers)} />
                <StatCard label="Replay TTL" value={`${selected.replay_ttl_days} days`} />
                <StatCard label="Active" value={selected.is_active ? "Yes" : "No"} />
              </div>

              <div className="flex items-center justify-between">
                <h4 className="font-headline text-lg font-bold text-on-surface">
                  Rate-card timeline
                </h4>
                <button
                  onClick={() => setShowNewRate(true)}
                  className="px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium
                    hover:opacity-90"
                >
                  + Publish new rate
                </button>
              </div>

              <div className="space-y-2">
                {rateCards.length === 0 && (
                  <p className="text-text-secondary text-sm">
                    No rate-card versions yet.
                  </p>
                )}
                {rateCards.map((rc) => {
                  const active = Date.parse(rc.effective_from) <= nowMs;
                  return (
                    <div
                      key={rc.id}
                      className="p-4 rounded-2xl border border-white/[0.03] bg-surface-container-low/40"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-secondary">
                          Effective {formatDateTime(rc.effective_from)}
                        </span>
                        <span
                          className={`text-[10px] uppercase tracking-[0.1em] ${
                            active ? "text-primary" : "text-feedback-warning"
                          }`}
                        >
                          {active ? "Active" : "Scheduled"}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-text-secondary text-xs">Price</span>
                          <div className="text-on-surface font-medium">
                            ₹{formatINR(rc.price_paise)}
                          </div>
                        </div>
                        <div>
                          <span className="text-text-secondary text-xs">Base rate</span>
                          <div className="text-on-surface font-medium">
                            ₹{formatINR(rc.base_rate_paise_per_min)}/min
                          </div>
                        </div>
                        <div>
                          <span className="text-text-secondary text-xs">Overage</span>
                          <div className="text-on-surface font-medium">
                            ₹{formatINR(rc.overage_rate_paise_per_min)}/min
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-text-secondary">Select a package to view rates.</p>
          )}
        </section>
      </div>

      {/* Modals */}
      {showNewRate && selected && (
        <NewRateModal
          pkg={selected}
          onClose={() => setShowNewRate(false)}
          onCreated={async () => { setShowNewRate(false); await refreshRates(); }}
          token={token}
        />
      )}
      {showPatch && selected && (
        <PatchPackageModal
          pkg={selected}
          onClose={() => setShowPatch(false)}
          onPatched={async () => { setShowPatch(false); await refreshPackages(); }}
          token={token}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-2xl border border-white/[0.03] bg-surface-container-low/40">
      <div className="text-[10px] uppercase tracking-[0.1em] text-text-secondary">
        {label}
      </div>
      <div className="font-headline text-xl font-bold text-on-surface mt-1">
        {value}
      </div>
    </div>
  );
}

function NewRateModal({
  pkg, onClose, onCreated, token,
}: {
  pkg: StreamingPackage;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  token: string;
}) {
  const [priceRupees, setPriceRupees] = useState((49900 / 100).toString());
  const [baseRupees, setBaseRupees] = useState("1.00");
  const [overageRupees, setOverageRupees] = useState("1.50");
  // Default: tomorrow at 00:00 local
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const defaultIso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);
  const [effectiveFrom, setEffectiveFrom] = useState(defaultIso);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const futureValid = isFutureISO(new Date(effectiveFrom).toISOString());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const priceP = Math.round(parseFloat(priceRupees) * 100);
    const baseP = Math.round(parseFloat(baseRupees) * 100);
    const overP = Math.round(parseFloat(overageRupees) * 100);
    if (!Number.isFinite(priceP) || priceP < 0) {
      setLocalError("Price must be ≥ 0"); return;
    }
    if (!Number.isFinite(baseP) || baseP <= 0) {
      setLocalError("Base rate must be > 0"); return;
    }
    if (!Number.isFinite(overP) || overP <= 0) {
      setLocalError("Overage rate must be > 0"); return;
    }
    if (!futureValid) {
      setLocalError("Effective From must be in the future"); return;
    }
    try {
      setSubmitting(true);
      await createRateCard(token, pkg.id, {
        price_paise: priceP,
        base_rate_paise_per_min: baseP,
        overage_rate_paise_per_min: overP,
        effective_from: new Date(effectiveFrom).toISOString(),
      });
      await onCreated();
    } catch (err) {
      setLocalError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl bg-surface-container border border-white/[0.05] p-6 space-y-4"
      >
        <h3 className="font-headline text-xl font-bold text-on-surface">
          New rate for {pkg.name}
        </h3>

        <div className="space-y-3">
          <Field label="Price (₹)">
            <input type="number" step="0.01" min={0} value={priceRupees}
              onChange={(e) => setPriceRupees(e.target.value)}
              className="input" required />
          </Field>
          <Field label="Base rate (₹/min)">
            <input type="number" step="0.01" min={0.01} value={baseRupees}
              onChange={(e) => setBaseRupees(e.target.value)}
              className="input" required />
          </Field>
          <Field label="Overage rate (₹/min)">
            <input type="number" step="0.01" min={0.01} value={overageRupees}
              onChange={(e) => setOverageRupees(e.target.value)}
              className="input" required />
          </Field>
          <Field label="Effective from (must be in the future)">
            <input type="datetime-local" value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="input" required />
            {!futureValid && (
              <span className="text-xs text-feedback-error">
                Effective From must be later than now.
              </span>
            )}
          </Field>
        </div>

        {localError && (
          <div className="text-sm text-feedback-error">{localError}</div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl border border-white/[0.05] text-sm text-on-surface">
            Cancel
          </button>
          <button type="submit" disabled={submitting || !futureValid}
            className="px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium
              disabled:opacity-50">
            {submitting ? "Publishing…" : "Publish rate"}
          </button>
        </div>

        <style>{`
          .input {
            width: 100%;
            padding: 0.5rem 0.75rem;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 0.75rem;
            color: inherit;
            font: inherit;
          }
          .input:focus { outline: 2px solid var(--color-primary); }
        `}</style>
      </form>
    </div>
  );
}

function PatchPackageModal({
  pkg, onClose, onPatched, token,
}: {
  pkg: StreamingPackage;
  onClose: () => void;
  onPatched: () => void | Promise<void>;
  token: string;
}) {
  const [name, setName] = useState(pkg.name);
  const [minutes, setMinutes] = useState(String(pkg.minutes));
  const [viewers, setViewers] = useState(String(pkg.max_concurrent_viewers));
  const [ttl, setTtl] = useState(String(pkg.replay_ttl_days));
  const [isActive, setIsActive] = useState(pkg.is_active);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const m = parseInt(minutes, 10);
    const v = parseInt(viewers, 10);
    const t = parseInt(ttl, 10);
    if (!Number.isFinite(m) || m <= 0) { setLocalError("Minutes must be > 0"); return; }
    if (!Number.isFinite(v) || v <= 0) { setLocalError("Viewers must be > 0"); return; }
    if (!Number.isFinite(t) || t <= 0) { setLocalError("TTL must be > 0"); return; }
    try {
      setSubmitting(true);
      await patchStreamingPackage(token, pkg.id, {
        name, minutes: m, max_concurrent_viewers: v, replay_ttl_days: t, is_active: isActive,
      });
      await onPatched();
    } catch (err) {
      setLocalError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl bg-surface-container border border-white/[0.05] p-6 space-y-4"
      >
        <h3 className="font-headline text-xl font-bold text-on-surface">
          Edit {pkg.name}
        </h3>

        <div className="space-y-3">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" required />
          </Field>
          <Field label="Minutes">
            <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="input" required />
          </Field>
          <Field label="Max concurrent viewers">
            <input type="number" min={1} value={viewers} onChange={(e) => setViewers(e.target.value)} className="input" required />
          </Field>
          <Field label="Replay TTL (days)">
            <input type="number" min={1} value={ttl} onChange={(e) => setTtl(e.target.value)} className="input" required />
          </Field>
          <label className="flex items-center gap-2 text-sm text-on-surface">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        </div>

        {localError && <div className="text-sm text-feedback-error">{localError}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl border border-white/[0.05] text-sm text-on-surface">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium
              disabled:opacity-50">
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>

        <style>{`
          .input {
            width: 100%;
            padding: 0.5rem 0.75rem;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 0.75rem;
            color: inherit;
            font: inherit;
          }
          .input:focus { outline: 2px solid var(--color-primary); }
        `}</style>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.1em] text-text-secondary">{label}</span>
      {children}
    </label>
  );
}
