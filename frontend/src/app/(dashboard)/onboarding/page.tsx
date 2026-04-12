"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getStoredAccessToken, refreshAuthSession } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Matches the public shape returned by GET /api/v1/states. Keep in
// lockstep with backend/internal/handler/states.go State struct and
// the identical type in RegisterForm.tsx.
type IndianState = {
  id: number;
  name: string;
  code: string;
  is_union_territory: boolean;
};

type Step = "state_selection" | "profile" | "complete";

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("state_selection");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State selection
  const [selectedStateID, setSelectedStateID] = useState<number | null>(null);
  const [states, setStates] = useState<IndianState[]>([]);
  const [statesLoading, setStatesLoading] = useState(true);

  // Plan carried from registration (sessionStorage or query param)
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  // Profile
  const [businessName, setBusinessName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");

  const token = getStoredAccessToken();

  useEffect(() => {
    fetch(`${API_BASE}/onboarding/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.current_step) setStep(data.current_step);
        // If the server already has a state_id (user picked it earlier
        // in this session, or the status was persisted via migration
        // 067), preselect it so the dropdown isn't empty on resume.
        if (data.state_id) {
          const n = Number(data.state_id);
          if (!Number.isNaN(n) && n > 0) setSelectedStateID(n);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  // Fetch the full states list from the API (replaces the prior
  // hardcoded 36-entry list, which was drifting from the DB and from
  // the register form's own copy). Heavily cached server-side.
  useEffect(() => {
    let cancelled = false;
    setStatesLoading(true);
    fetch(`${API_BASE}/api/v1/states`)
      .then((res) => res.json())
      .then((body: { states?: IndianState[] }) => {
        if (cancelled) return;
        setStates(Array.isArray(body.states) ? body.states : []);
      })
      .catch(() => {
        // Non-fatal — the select will show "Loading states…" until
        // the user retries. We deliberately do NOT block the rest of
        // the form.
      })
      .finally(() => {
        if (!cancelled) setStatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-fill from sessionStorage if the user picked a state on /register
  // before being redirected here. The RegisterForm stashes the id under
  // `rawdrive_pending_state_id` before starting OAuth / submitting the
  // password form, which closes the loop end-to-end: user picks once,
  // onboarding remembers. We clear the key after reading so a later
  // /register visit doesn't show a stale value.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("rawdrive_pending_state_id");
      if (raw) {
        const n = Number(raw);
        if (!Number.isNaN(n) && n > 0) {
          setSelectedStateID((prev) => prev ?? n);
        }
        window.sessionStorage.removeItem("rawdrive_pending_state_id");
      }
    } catch {
      // SessionStorage unavailable (private mode, etc.) — nothing to restore.
    }
  }, []);

  // Carry the selected plan from registration into onboarding.
  // RegisterForm stashes it in sessionStorage as `rawdrive_pending_plan`
  // (OAuth flow). For local registration the plan arrives as a URL query
  // param (/activate?plan=...  → /onboarding?plan=...). sessionStorage
  // takes priority; the query param is the fallback.
  useEffect(() => {
    let plan: string | null = null;
    try {
      plan = window.sessionStorage.getItem("rawdrive_pending_plan");
    } catch {
      // SessionStorage unavailable — fall through to query param.
    }
    if (!plan) {
      plan = searchParams.get("plan");
    }
    if (plan) {
      setPendingPlan(plan);
    }
  }, [searchParams]);

  async function handleStateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedStateID == null) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/onboarding/state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // state_id is sent as a number — the backend handler accepts
        // both number and string since v0.0.48 (see
        // backend/internal/onboarding/handler.go StateSelectionRequest).
        body: JSON.stringify({ state_id: selectedStateID }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save state");
      }
      setStep("profile");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim() || !displayName.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, string> = {
        business_name: businessName.trim(),
        display_name: displayName.trim(),
      };
      if (phone.trim()) body.phone = phone.trim();
      if (gstin.trim()) body.gstin = gstin.trim().toUpperCase();
      if (pendingPlan) body.plan = pendingPlan;

      const res = await fetch(`${API_BASE}/onboarding/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save profile");
      }

      // Clear registration carry-over keys now that the workspace exists.
      try {
        window.sessionStorage.removeItem("rawdrive_pending_plan");
        window.sessionStorage.removeItem("rawdrive_pending_state_id");
      } catch {
        // Non-critical — keys may already be absent or storage unavailable.
      }

      // Refresh JWT to get updated workspace_id (no longer "pending-onboarding")
      try {
        await refreshAuthSession(API_BASE);
      } catch {
        // The dashboard layout will request a fresh session on next visit.
      }
      setStep("complete");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (loading && step === "state_selection") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-text-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-text-primary">Welcome to RawDrive</h1>
        <p className="mt-2 text-text-secondary">Set up your photography workspace in two steps.</p>
      </div>

      {/* Step indicators */}
      <div className="mb-8 flex items-center justify-center gap-4">
        {(["state_selection", "profile", "complete"] as const).map((s, i) => {
          const stepNum = i + 1;
          const isCurrent = s === step;
          const isDone =
            (s === "state_selection" && (step === "profile" || step === "complete")) ||
            (s === "profile" && step === "complete");
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  isDone
                    ? "bg-accent text-white"
                    : isCurrent
                    ? "bg-accent text-white ring-2 ring-accent/30"
                    : "bg-surface-elevated text-text-tertiary"
                }`}
              >
                {isDone ? "\u2713" : stepNum}
              </div>
              {i < 2 && <div className={`h-px w-8 ${isDone ? "bg-accent" : "bg-border"}`} />}
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
              }}
              className="input-base mb-6 w-full min-h-[44px]"
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
            <button
              type="submit"
              disabled={selectedStateID == null || loading || statesLoading}
              className="btn-primary w-full min-h-[44px] disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Saving..." : "Continue"}
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
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label htmlFor="business-name" className="mb-1 block text-sm font-medium text-text-secondary">
                Business Name *
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
                Display Name *
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
                GSTIN (optional)
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
              disabled={!businessName.trim() || !displayName.trim() || loading}
              className="btn-primary w-full min-h-[44px] disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Creating workspace..." : "Create My Workspace"}
            </button>
          </form>
        </div>
      )}

      {/* Step 3: Complete */}
      {step === "complete" && (
        <div className="glass-surface rounded-2xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/15">
            <span className="text-3xl text-accent">{"\u2713"}</span>
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
