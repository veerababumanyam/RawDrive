"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken, getStoredRefreshToken, persistAuthTokens } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// All 28 states + 8 union territories — codes match DB states.code (without IN- prefix)
const indianStates = [
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CT", name: "Chhattisgarh" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JH", name: "Jharkhand" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" },
  { code: "ML", name: "Meghalaya" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OR", name: "Odisha" },
  { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TG", name: "Telangana" },
  { code: "TR", name: "Tripura" },
  { code: "UT", name: "Uttarakhand" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "WB", name: "West Bengal" },
  // Union Territories
  { code: "AN", name: "Andaman & Nicobar Islands" },
  { code: "CH", name: "Chandigarh" },
  { code: "DH", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "DL", name: "Delhi" },
  { code: "JK", name: "Jammu & Kashmir" },
  { code: "LA", name: "Ladakh" },
  { code: "LD", name: "Lakshadweep" },
  { code: "PY", name: "Puducherry" },
];

type Step = "state_selection" | "profile" | "complete";

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("state_selection");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State selection
  const [selectedState, setSelectedState] = useState("");

  // Profile
  const [businessName, setBusinessName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [gstin, setGstin] = useState("");

  const token = getStoredAccessToken();

  useEffect(() => {
    fetch(`${API_BASE}/onboarding/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.current_step) setStep(data.current_step);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function handleStateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedState) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/onboarding/state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ state_id: selectedState }),
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
      if (gstin.trim()) body.gstin = gstin.trim().toUpperCase();

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

      // Refresh JWT to get updated workspace_id (no longer "pending-onboarding")
      const refreshToken = getStoredRefreshToken();
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData.access_token && refreshData.refresh_token) {
              persistAuthTokens(refreshData.access_token, refreshData.refresh_token);
            }
          }
        } catch {
          // Token refresh failed — user can still see completion step
          // and will get fresh tokens on next login
        }
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
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="input-base mb-6 w-full min-h-[44px]"
              required
            >
              <option value="">Select your state...</option>
              {indianStates.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!selectedState || loading}
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
