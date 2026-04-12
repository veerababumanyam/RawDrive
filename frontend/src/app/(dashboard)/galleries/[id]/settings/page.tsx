"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { getGallery, updateGallerySettings, type Gallery } from "@/lib/api/galleries";

export default function GallerySettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Password state
  const [password, setPassword] = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Your session expired. Please log in again.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    getGallery(token, id)
      .then((g) => {
        if (!cancelled) {
          setGallery(g);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load gallery.");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [id]);

  const handleToggle = async (field: string, value: boolean) => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;

    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateGallerySettings(token, id, { [field]: value });
      setGallery(updated);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleSetPassword = async () => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;

    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateGallerySettings(token, id, { password: password || null });
      setGallery(updated);
      setPassword("");
      setShowPasswordField(false);
      setSaveMsg(password ? "Password set" : "Password removed");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-surface-sunken" />
          <div className="h-64 rounded-2xl bg-surface-sunken" />
        </div>
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-text-secondary">{error || "Gallery not found."}</p>
        <Link href="/galleries" className="btn-tertiary mt-4 px-3 py-2 text-sm">
          Back to galleries
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-24 overflow-y-auto">
      <div className="space-y-2">
        <Link href={`/galleries/${id}`} className="btn-tertiary px-0 py-0 text-sm">
          Back to gallery
        </Link>
        <h1 className="text-2xl font-semibold text-text-primary">Gallery Settings</h1>
        <p className="text-sm text-text-secondary">{gallery.title}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {saveMsg && (
        <div className="rounded-xl border border-feedback-success/30 bg-feedback-success/10 px-4 py-3 text-sm text-feedback-success">
          {saveMsg}
        </div>
      )}

      {/* Downloads */}
      <section className="surface-panel space-y-4 p-5">
        <h2 className="text-lg font-semibold text-text-primary">Downloads</h2>
        <p className="text-sm text-text-secondary">
          Allow clients to download original resolution photos from this gallery.
        </p>
        <ToggleRow
          label="Enable downloads"
          description="Clients can download individual photos and bulk export from the public gallery."
          checked={gallery.download_enabled ?? true}
          disabled={saving}
          onChange={(v) => handleToggle("download_enabled", v)}
        />
      </section>

      {/* AI & FaceID */}
      <section className="surface-panel space-y-4 p-5">
        <h2 className="text-lg font-semibold text-text-primary">AI & FaceID</h2>
        <p className="text-sm text-text-secondary">
          Configure AI-powered features for this gallery.
        </p>
        <ToggleRow
          label="FaceID entry"
          description="Allow clients to use their selfie to find their photos in this gallery."
          checked={gallery.faceid_enabled ?? false}
          disabled={saving}
          onChange={(v) => handleToggle("faceid_enabled", v)}
        />
        <ToggleRow
          label="Face detection"
          description="Automatically detect and cluster faces in uploaded photos for internal use."
          checked={(gallery.settings as Record<string, unknown>)?.face_detection_enabled === true}
          disabled={saving}
          onChange={(v) =>
            handleToggle("settings", { ...((gallery.settings as Record<string, unknown>) || {}), face_detection_enabled: v } as unknown as boolean)
          }
        />
      </section>

      {/* Password Protection */}
      <section className="surface-panel space-y-4 p-5">
        <h2 className="text-lg font-semibold text-text-primary">Password Protection</h2>
        <p className="text-sm text-text-secondary">
          Require a password to access this gallery. Leave empty to remove protection.
        </p>

        {showPasswordField ? (
          <div className="space-y-3">
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter gallery password"
              className="input-base w-full"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleSetPassword}
                disabled={saving}
                className="btn-primary px-4 py-2 text-sm"
              >
                {saving ? "Saving..." : password ? "Set Password" : "Remove Password"}
              </button>
              <button
                onClick={() => { setShowPasswordField(false); setPassword(""); }}
                className="btn-tertiary px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowPasswordField(true)}
            className="btn-tertiary px-4 py-2.5 text-sm"
          >
            {gallery.settings && (gallery.settings as Record<string, unknown>).password_protected
              ? "Change / Remove Password"
              : "Set Password"}
          </button>
        )}
      </section>
    </div>
  );
}

// ── Toggle Row Component ──────────────────────────────────────────
function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-secondary">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          checked ? "bg-accent-primary" : "bg-surface-sunken"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
