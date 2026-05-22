"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { getDistrictsForState } from "@/lib/data/india-districts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface IndianState {
  id: number;
  name: string;
  code: string;
}

interface UserProfile {
  display_name: string;
  email: string;
  phone: string;
  avatar_url: string;
  state_id: number | null;
  district: string;
}

const EMPTY_PROFILE: UserProfile = {
  display_name: "",
  email: "",
  phone: "",
  avatar_url: "",
  state_id: null,
  district: "",
};

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [states, setStates] = useState<IndianState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/states`)
      .then((r) => r.json())
      .then((body: { states?: IndianState[] }) =>
        setStates(Array.isArray(body.states) ? body.states : []),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/api/v1/users/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : EMPTY_PROFILE))
      .then((data) =>
        setProfile({
          display_name: data.display_name ?? "",
          email: data.email ?? "",
          phone: data.phone ?? "",
          avatar_url: data.avatar_url ?? "",
          state_id: data.state_id ?? null,
          district: data.district ?? "",
        }),
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const token = getStoredAccessToken();
      const res = await fetch(`${API_BASE}/api/v1/users/profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          display_name: profile.display_name,
          phone: profile.phone,
          avatar_url: profile.avatar_url,
          state_id: profile.state_id,
          district: profile.district || null,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      setSavedNotice("Profile updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse h-64 bg-surface-sunken rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {savedNotice && (
        <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          {savedNotice}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Profile Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage your personal account details.
        </p>
      </div>

      <section className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Account Information</h2>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label
              htmlFor="profile-display-name"
              className="mb-1 block text-sm font-medium text-text-secondary"
            >
              Display Name
            </label>
            <input
              id="profile-display-name"
              type="text"
              value={profile.display_name}
              onChange={(e) =>
                setProfile((p) => ({ ...p, display_name: e.target.value }))
              }
              placeholder="e.g. Rahul Sharma"
              className="input-base w-full min-h-[44px]"
            />
          </div>

          <div>
            <label
              htmlFor="profile-email"
              className="mb-1 block text-sm font-medium text-text-secondary"
            >
              Email
            </label>
            <input
              id="profile-email"
              type="email"
              value={profile.email}
              readOnly
              className="input-base w-full min-h-[44px] opacity-60 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              Email cannot be changed. Contact support if you need to update it.
            </p>
          </div>

          <div>
            <label
              htmlFor="profile-phone"
              className="mb-1 block text-sm font-medium text-text-secondary"
            >
              Phone number
            </label>
            <input
              id="profile-phone"
              type="tel"
              value={profile.phone}
              onChange={(e) =>
                setProfile((p) => ({ ...p, phone: e.target.value }))
              }
              placeholder="98765 43210"
              className="input-base w-full min-h-[44px]"
            />
          </div>

          <div>
            <label
              htmlFor="profile-avatar-url"
              className="mb-1 block text-sm font-medium text-text-secondary"
            >
              Avatar URL
            </label>
            <input
              id="profile-avatar-url"
              type="text"
              value={profile.avatar_url}
              onChange={(e) =>
                setProfile((p) => ({ ...p, avatar_url: e.target.value }))
              }
              placeholder="https://example.com/photo.jpg"
              className="input-base w-full min-h-[44px]"
            />
          </div>

          <div>
            <label
              htmlFor="profile-state"
              className="mb-1 block text-sm font-medium text-text-secondary"
            >
              State
            </label>
            <select
              id="profile-state"
              value={profile.state_id ?? ""}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  state_id: e.target.value ? Number(e.target.value) : null,
                  district: "",
                }))
              }
              className="input-base w-full min-h-[44px]"
            >
              <option value="">Select state…</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="profile-district"
              className="mb-1 block text-sm font-medium text-text-secondary"
            >
              District
            </label>
            {(() => {
              const selectedStateName = states.find((s) => s.id === profile.state_id)?.name ?? "";
              const districts = getDistrictsForState(selectedStateName);
              return (
                <select
                  id="profile-district"
                  value={profile.district}
                  onChange={(e) => setProfile((p) => ({ ...p, district: e.target.value }))}
                  disabled={districts.length === 0}
                  className="input-base w-full min-h-[44px] disabled:opacity-50"
                >
                  <option value="">{districts.length === 0 ? "Select state first" : "Select district…"}</option>
                  {districts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              );
            })()}
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary min-h-[44px] px-6 disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>
    </div>
  );
}
