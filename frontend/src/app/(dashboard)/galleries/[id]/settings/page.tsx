"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { getGallery, updateGallerySettings, type Gallery } from "@/lib/api/galleries";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";

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
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <GalleryWorkspaceNav galleryId={id} />
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-surface-sunken" />
          <div className="h-64 rounded-2xl bg-surface-sunken" />
        </div>
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-16">
        <GalleryWorkspaceNav galleryId={id} />
        <div className="text-center">
          <p className="text-sm text-text-secondary">{error || "Gallery not found."}</p>
          <Link href="/galleries" className="btn-tertiary mt-4 px-3 py-2 text-sm">
            Back to galleries
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-24 overflow-y-auto">
      {/* Workspace nav first so the section dropdown is the topmost
          element on mobile (matches the cover and AI sub-pages). */}
      <GalleryWorkspaceNav galleryId={id} />
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

      {/* Proofing */}
      <section className="surface-panel space-y-4 p-5">
        <h2 className="text-lg font-semibold text-text-primary">Proofing</h2>
        <p className="text-sm text-text-secondary">
          Control how many photos clients can select for proofing.
        </p>
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-text-primary">Selection limit</p>
            <p className="text-xs text-text-secondary">Set to 0 for unlimited selections.</p>
          </div>
          <input
            type="number"
            min={0}
            value={gallery.max_selections ?? 0}
            onChange={async (e) => {
              const val = Math.max(0, parseInt(e.target.value) || 0);
              const token = getStoredAccessToken();
              if (!token || !gallery) return;
              try {
                const updated = await updateGallerySettings(token, id, { max_selections: val });
                setGallery(updated);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to update selection limit");
              }
            }}
            className="min-h-[44px] w-24 rounded-xl border border-border-default bg-surface-sunken px-3 py-2 text-center text-sm text-text-primary focus:outline-none focus:border-accent-primary"
            disabled={saving}
          />
        </div>
      </section>

      {/* Watermark */}
      <section className="surface-panel space-y-4 p-5">
        <h2 className="text-lg font-semibold text-text-primary">Watermark</h2>
        <p className="text-sm text-text-secondary">
          Add a text watermark to gallery images to protect your work.
        </p>
        <ToggleRow
          label="Enable watermark"
          description="Overlay a text watermark on images displayed in the public gallery."
          checked={((gallery.watermark_config as Record<string, unknown>)?.enabled === true)}
          disabled={saving}
          onChange={async (v) => {
            const current = (gallery.watermark_config as Record<string, unknown>) || {};
            const config = { ...current, enabled: v };
            const token = getStoredAccessToken();
            if (!token || !gallery) return;
            try {
              const updated = await updateGallerySettings(token, id, { watermark_config: config });
              setGallery(updated);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to update watermark");
            }
          }}
        />
        {((gallery.watermark_config as Record<string, unknown>)?.enabled === true) && (
          <div className="space-y-4 pl-1">
            <div className="space-y-1">
              <label className="text-sm font-medium text-text-primary">Watermark text</label>
              <input
                type="text"
                placeholder="Studio Name"
                value={String((gallery.watermark_config as Record<string, unknown>)?.text || "")}
                onBlur={async (e) => {
                  const current = (gallery.watermark_config as Record<string, unknown>) || {};
                  const config = { ...current, text: e.target.value };
                  const token = getStoredAccessToken();
                  if (!token || !gallery) return;
                  try {
                    const updated = await updateGallerySettings(token, id, { watermark_config: config });
                    setGallery(updated);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to update watermark text");
                  }
                }}
                onChange={(e) => {
                  setGallery({ ...gallery, watermark_config: { ...(gallery.watermark_config as Record<string, unknown> || {}), text: e.target.value } });
                }}
                className="w-full rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-text-primary">
                Opacity — {Number((gallery.watermark_config as Record<string, unknown>)?.opacity) || 40}%
              </label>
              <input
                type="range" min={10} max={90} step={5}
                value={Number((gallery.watermark_config as Record<string, unknown>)?.opacity) || 40}
                onChange={async (e) => {
                  const current = (gallery.watermark_config as Record<string, unknown>) || {};
                  const config = { ...current, opacity: Number(e.target.value) };
                  const token = getStoredAccessToken();
                  if (!token || !gallery) return;
                  try {
                    const updated = await updateGallerySettings(token, id, { watermark_config: config });
                    setGallery(updated);
                  } catch { /* non-critical */ }
                }}
                className="w-full accent-[var(--accent-primary)]"
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-text-primary">Position</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["center", "bottom-right", "bottom-left", "diagonal"] as const).map((pos) => (
                  <button key={pos} type="button"
                    onClick={async () => {
                      const current = (gallery.watermark_config as Record<string, unknown>) || {};
                      const config = { ...current, position: pos };
                      const token = getStoredAccessToken();
                      if (!token || !gallery) return;
                      try {
                        const updated = await updateGallerySettings(token, id, { watermark_config: config });
                        setGallery(updated);
                      } catch { /* non-critical */ }
                    }}
                    className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      (gallery.watermark_config as Record<string, unknown>)?.position === pos
                        ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                        : "border-border-default bg-surface-sunken text-text-secondary hover:bg-surface-container-low"
                    }`}
                  >
                    {pos.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
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
