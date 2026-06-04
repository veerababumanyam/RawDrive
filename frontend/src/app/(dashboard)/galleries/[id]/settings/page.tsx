"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  getGallery,
  updateGallerySettings,
  uploadMusicTrack,
  selectGalleryMusic,
  type Gallery,
} from "@/lib/api/galleries";
import { MusicLibraryManager } from "@/components/gallery/music-library-manager";
import { getTermsStatus } from "@/lib/api/legal";
import {
  getWorkspaceProfile,
  updateWorkspaceProfile,
  uploadWorkspaceLogo,
  type WorkspaceProfile,
} from "@/lib/api/workspace-profile";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { TermsAcceptanceModal } from "@/components/legal/terms-acceptance-modal";
import { GalleryPageShell } from "@/components/gallery/gallery-page-shell";
import { GalleryPageHeader } from "@/components/gallery/gallery-page-header";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

const ACCESS_WINDOW_PRESETS = [30, 60, 90] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
type DownloadQuality = "webp" | "thumbnail" | "original";

const DOWNLOAD_QUALITY_OPTIONS: Array<{
  value: DownloadQuality;
  label: string;
  description: string;
}> = [
  {
    value: "webp",
    label: "WebP display",
    description: "Optimized gallery files for normal client downloads.",
  },
  {
    value: "thumbnail",
    label: "WebP thumbnail",
    description: "Lightweight preview files for quick sharing.",
  },
  {
    value: "original",
    label: "Original source",
    description: "Full uploaded source files for client delivery.",
  },
];

function formatExpiryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function expiryDaysLeft(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / DAY_MS);
}

function toDateInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function presetButtonClass(active: boolean): string {
  return `touch-min rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    active
      ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
      : "border-border-default bg-surface-sunken text-text-secondary hover:bg-surface-container-low"
  }`;
}

function normalizedDownloadQuality(
  value: string | null | undefined,
): DownloadQuality {
  if (value === "original") return "original";
  return value === "thumbnail" ? "thumbnail" : "webp";
}

function galleryHasPassword(gallery: Gallery): boolean {
  return Boolean(
    gallery.has_password ||
    (gallery.settings as Record<string, unknown> | undefined)?.has_password ||
    (gallery.settings as Record<string, unknown> | undefined)
      ?.password_protected,
  );
}

function withPasswordState(gallery: Gallery, hasPassword: boolean): Gallery {
  return {
    ...gallery,
    has_password: hasPassword,
    settings: {
      ...(gallery.settings ?? {}),
      has_password: hasPassword,
      password_protected: hasPassword,
    },
  };
}

function isTermsUploadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("TERMS_NOT_ACCEPTED") ||
    msg.toLowerCase().includes("terms of service")
  );
}

function studioBrandName(
  profile: WorkspaceProfile | null,
  fallback: string,
): string {
  return (
    profile?.brand_name?.trim() ||
    profile?.name?.trim() ||
    fallback.trim() ||
    "Studio"
  );
}

function workspaceSubdomain(profile: WorkspaceProfile | null): string {
  const slug = profile?.business_profile_slug?.trim();
  const code = profile?.business_unique_code?.trim();
  return slug && code ? `${slug}-${code}` : "";
}

function logoWatermarkURL(
  gallery: Gallery,
  profile: WorkspaceProfile | null,
): string {
  const base = `/api/v1/public/galleries/${encodeURIComponent(gallery.slug)}/branding/logo`;
  const ws = workspaceSubdomain(profile);
  return ws ? `${base}?ws=${encodeURIComponent(ws)}` : base;
}

function logoPreviewURL(
  profile: WorkspaceProfile | null,
  token: string | null,
): string {
  const source = profile?.logo_url || profile?.logo_metadata?.storage_key || "";
  return source ? getStorageBackedUrl(source, token) : "";
}

export default function GallerySettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Password state
  const [password, setPassword] = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);

  // Slideshow music state — workspace music library + per-gallery selection.
  const [musicUploading, setMusicUploading] = useState(false);
  const [musicUploadStatus, setMusicUploadStatus] = useState("");
  const [musicError, setMusicError] = useState("");
  const [musicSelecting, setMusicSelecting] = useState(false);
  // Bumped after each upload/library mutation to make the library list reload.
  const [musicReloadKey, setMusicReloadKey] = useState(0);
  const [termsNeedsAcceptance, setTermsNeedsAcceptance] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [pendingMusicFiles, setPendingMusicFiles] = useState<File[] | null>(
    null,
  );

  // Studio logo / watermark state
  const [workspaceProfile, setWorkspaceProfile] =
    useState<WorkspaceProfile | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Resolve auth + fetch through a single async chain so no setState runs
    // synchronously in the effect body. The missing-token case settles via
    // Promise.reject into the same .catch as a failed fetch.
    Promise.resolve()
      .then(() => {
        const token = getStoredAccessToken();
        if (!token) {
          throw new Error("Your session expired. Please log in again.");
        }
        return getGallery(token, id);
      })
      .then((g) => {
        if (!cancelled) {
          setGallery(g);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load gallery.",
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    let cancelled = false;
    void getTermsStatus(token).then((status) => {
      if (!cancelled && status)
        setTermsNeedsAcceptance(status.needs_acceptance);
    });
    void getWorkspaceProfile(token)
      .then((profile) => {
        if (!cancelled) setWorkspaceProfile(profile);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async (field: string, value: boolean) => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;

    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateGallerySettings(token, id, {
        [field]: value,
      });
      setGallery(updated);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadQuality = async (value: DownloadQuality) => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;

    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateGallerySettings(token, id, {
        download_quality: value,
      });
      setGallery(updated);
      setSaveMsg("Download option saved");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save download option",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExpiry = async (expiresAt: string | null) => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;

    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateGallerySettings(token, id, {
        expires_at: expiresAt,
      });
      setGallery(updated);
      setSaveMsg(expiresAt ? "Access window set" : "Access window cleared");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update access window",
      );
    } finally {
      setSaving(false);
    }
  };

  // Upload one or more audio files into the workspace music library. The first
  // upload is gated on terms acceptance (precheck + post-error recovery), and
  // the whole batch replays after the photographer accepts.
  const handleMusicUpload = async (
    files: File[],
    options?: { skipTermsPrecheck?: boolean },
  ) => {
    const token = getStoredAccessToken();
    if (!token || !gallery || files.length === 0) return;
    if (termsNeedsAcceptance && !options?.skipTermsPrecheck) {
      setPendingMusicFiles(files);
      setMusicError("");
      setTermsModalOpen(true);
      return;
    }
    setMusicUploading(true);
    setMusicError("");
    let uploaded = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        setMusicUploadStatus(
          `Uploading ${i + 1} of ${files.length}: ${files[i].name}`,
        );
        await uploadMusicTrack(token, files[i]);
        uploaded += 1;
      }
      setMusicUploadStatus("");
      // Refresh the library list to show the new tracks.
      setMusicReloadKey((k) => k + 1);
      setSaveMsg(
        files.length === 1 ? "Track uploaded" : `${files.length} tracks uploaded`,
      );
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setMusicUploadStatus("");
      // Always reflect whatever made it into the library before the failure.
      if (uploaded > 0) setMusicReloadKey((k) => k + 1);
      if (isTermsUploadError(err)) {
        // Replay the remaining (unuploaded) files after terms acceptance.
        setPendingMusicFiles(files.slice(uploaded));
        setTermsNeedsAcceptance(true);
        setTermsModalOpen(true);
        return;
      }
      setMusicError(
        err instanceof Error ? err.message : "Failed to upload music",
      );
    } finally {
      setMusicUploading(false);
    }
  };

  const handleTermsAccepted = () => {
    setTermsNeedsAcceptance(false);
    setTermsModalOpen(false);
    const files = pendingMusicFiles;
    setPendingMusicFiles(null);
    if (files && files.length > 0)
      void handleMusicUpload(files, { skipTermsPrecheck: true });
  };

  // Select (or clear, with null) the per-gallery slideshow track.
  const handleMusicSelect = async (assetId: string | null) => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;
    setMusicSelecting(true);
    setMusicError("");
    try {
      const updated = await selectGalleryMusic(token, id, assetId);
      setGallery(updated);
      setSaveMsg(assetId ? "Gallery music set" : "Gallery music cleared");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setMusicError(
        err instanceof Error ? err.message : "Failed to update gallery music",
      );
    } finally {
      setMusicSelecting(false);
    }
  };

  const applyLogoWatermark = async (
    logoAssetId: string,
    profile: WorkspaceProfile | null,
  ) => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;

    const current = (gallery.watermark_config as Record<string, unknown>) || {};
    const config = {
      ...current,
      enabled: true,
      mode: "logo",
      logo_asset_id: logoAssetId,
      logo_url: logoWatermarkURL(gallery, profile),
      text: studioBrandName(profile, gallery.title),
      position:
        typeof current.position === "string"
          ? current.position
          : "bottom-right",
      opacity: typeof current.opacity === "number" ? current.opacity : 40,
    };

    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateGallerySettings(token, id, {
        watermark_config: config,
      });
      setGallery(updated);
      setSaveMsg("Studio logo watermark enabled");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update watermark logo",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;
    setLogoUploading(true);
    setError("");
    setSaveMsg("");
    try {
      const asset = await uploadWorkspaceLogo(token, file);
      await updateWorkspaceProfile(token, { logo_asset_id: asset.id });
      const profile = await getWorkspaceProfile(token);
      setWorkspaceProfile(profile);
      await applyLogoWatermark(asset.id, profile);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to upload studio logo",
      );
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleUseStudioLogo = () => {
    const logoAssetId = workspaceProfile?.logo_asset_id;
    if (!logoAssetId) {
      setError("Upload a studio logo before using it as a watermark.");
      return;
    }
    void applyLogoWatermark(logoAssetId, workspaceProfile);
  };

  const handleSetPassword = async (overridePassword?: string | null) => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;

    const nextPassword =
      overridePassword === undefined ? password || null : overridePassword;
    const nextHasPassword = Boolean(nextPassword);

    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateGallerySettings(token, id, {
        password: nextPassword,
      });
      setGallery(withPasswordState(updated, nextHasPassword));
      setPassword("");
      setShowPasswordField(false);
      setSaveMsg(nextHasPassword ? "Password set" : "Password removed");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update password",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <GalleryPageShell galleryId={id}>
        <div className="max-w-3xl animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-surface-sunken" />
          <div className="h-64 rounded-2xl bg-surface-sunken" />
        </div>
      </GalleryPageShell>
    );
  }

  if (!gallery) {
    return (
      <GalleryPageShell galleryId={id}>
        <div className="text-center">
          <p className="text-sm text-text-secondary">
            {error || "Gallery not found."}
          </p>
          <Link
            href="/galleries"
            className="btn-tertiary mt-4 px-3 py-2 text-sm"
          >
            Back to galleries
          </Link>
        </div>
      </GalleryPageShell>
    );
  }

  const hasGalleryPassword = galleryHasPassword(gallery);
  const selectedDownloadQuality = normalizedDownloadQuality(
    gallery.download_quality,
  );
  const studioLogoPreviewUrl = logoPreviewURL(
    workspaceProfile,
    getStoredAccessToken(),
  );
  const studioLogoName =
    workspaceProfile?.logo_metadata?.filename ||
    (workspaceProfile?.logo_asset_id ? "Uploaded logo" : "");
  const currentWatermark =
    (gallery.watermark_config as Record<string, unknown>) || {};

  return (
    <GalleryPageShell galleryId={id} className="pb-24 overflow-y-auto">
      <GalleryPageHeader
        backHref={`/galleries/${id}`}
        eyebrow="Settings"
        title="Gallery Settings"
        subtitle={gallery.title}
      />

      {/* Settings forms read better in a narrow column; the column is
          constrained INSIDE the shared shell so the nav/header width
          still matches every other gallery page. */}
      <div className="max-w-3xl space-y-6">
      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {saveMsg && <InlineAlert variant="success">{saveMsg}</InlineAlert>}

      {/* Downloads */}
      <section className="surface-panel space-y-4 p-5">
        <h2 className="text-lg font-semibold text-text-primary">Downloads</h2>
        <p className="text-sm text-text-secondary">
          Clients can download optimized WebP gallery files or original source
          files when you allow them.
        </p>
        <ToggleRow
          label="Enable downloads"
          description="Clients can download individual photos and bulk export from the public gallery."
          checked={gallery.download_enabled ?? true}
          disabled={saving}
          onChange={(v) => handleToggle("download_enabled", v)}
        />
        {(gallery.download_enabled ?? true) && (
          <div className="rounded-xl border border-border-default bg-surface-sunken px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">
              Allowed file format
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Choose the exact format clients can download from this public
              gallery.
            </p>
            <div
              className="mt-3 grid gap-2 sm:grid-cols-3"
              role="group"
              aria-label="Allowed download file format"
            >
              {DOWNLOAD_QUALITY_OPTIONS.map((option) => {
                const active = selectedDownloadQuality === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={saving}
                    aria-pressed={active}
                    onClick={() => void handleDownloadQuality(option.value)}
                    className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                        : "border-border-default bg-surface-container text-text-secondary hover:bg-surface-container-low"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs text-text-secondary">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Access window / expiry */}
      <section className="surface-panel space-y-4 p-5">
        <h2 className="text-lg font-semibold text-text-primary">
          Access window
        </h2>
        <p className="text-sm text-text-secondary">
          Choose when this gallery stops being accessible to clients. After
          expiry the public link shows a friendly &ldquo;gallery has
          expired&rdquo; notice and protects your storage.
        </p>
        {gallery.expires_at ? (
          <p className="text-sm text-text-primary">
            Expires on{" "}
            <span className="font-semibold">
              {formatExpiryDate(gallery.expires_at)}
            </span>
            {(() => {
              const left = expiryDaysLeft(gallery.expires_at);
              if (left === null) return null;
              return (
                <span className="text-text-secondary">
                  {" "}
                  ·{" "}
                  {left > 0
                    ? `${left} day${left === 1 ? "" : "s"} left`
                    : "expired"}
                </span>
              );
            })()}
          </p>
        ) : (
          <p className="text-sm text-text-secondary">
            No expiry — clients keep access indefinitely.
          </p>
        )}
        <div
          className="grid gap-2 sm:grid-cols-4"
          role="group"
          aria-label="Access window presets"
        >
          <button
            type="button"
            disabled={saving}
            aria-pressed={!gallery.expires_at}
            onClick={() => void handleExpiry(null)}
            className={presetButtonClass(!gallery.expires_at)}
          >
            No expiry
          </button>
          {ACCESS_WINDOW_PRESETS.map((days) => (
            <button
              key={days}
              type="button"
              disabled={saving}
              onClick={() =>
                void handleExpiry(
                  new Date(Date.now() + days * DAY_MS).toISOString(),
                )
              }
              className={presetButtonClass(false)}
            >
              {days} days
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <label
            htmlFor="expiry-custom"
            className="text-sm font-medium text-text-primary"
          >
            Custom date
          </label>
          <input
            id="expiry-custom"
            type="date"
            disabled={saving}
            value={toDateInputValue(gallery.expires_at)}
            min={toDateInputValue(new Date().toISOString())}
            onChange={(e) => {
              if (!e.target.value) {
                void handleExpiry(null);
                return;
              }
              // End of the chosen day so the gallery stays live through that date.
              void handleExpiry(
                new Date(`${e.target.value}T23:59:59`).toISOString(),
              );
            }}
            className="touch-min w-full rounded-xl border border-border-default bg-surface-sunken px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary sm:w-60"
          />
        </div>
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
          // 2026-05-18: face_detection_enabled is a top-level column on
          // galleries (mig 046, default true). The previous version of
          // this toggle nested the value under `settings` JSONB — the
          // PUT handler ignored that key entirely so the toggle silently
          // no-op'd. Now reads/writes the top-level field.
          checked={gallery.face_detection_enabled ?? true}
          disabled={saving}
          onChange={(v) => handleToggle("face_detection_enabled", v)}
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
            <p className="text-sm font-medium text-text-primary">
              Selection limit
            </p>
            <p className="text-xs text-text-secondary">
              Set to 0 for unlimited selections.
            </p>
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
                const updated = await updateGallerySettings(token, id, {
                  max_selections: val,
                });
                setGallery(updated);
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Failed to update selection limit",
                );
              }
            }}
            className="touch-min w-24 rounded-xl border border-border-default bg-surface-sunken px-3 py-2 text-center text-sm text-text-primary focus:outline-none focus:border-accent-primary"
            disabled={saving}
          />
        </div>
      </section>

      {/* Watermark */}
      <section className="surface-panel space-y-4 p-5">
        <h2 className="text-lg font-semibold text-text-primary">Watermark</h2>
        <p className="text-sm text-text-secondary">
          Use your Business Profile logo or text watermark on client-facing
          gallery images.
        </p>
        <ToggleRow
          label="Enable watermark"
          description="Overlay your Business Profile logo or watermark text on public gallery images."
          checked={currentWatermark.enabled === true}
          disabled={saving}
          onChange={async (v) => {
            const config = { ...currentWatermark, enabled: v };
            const token = getStoredAccessToken();
            if (!token || !gallery) return;
            try {
              const updated = await updateGallerySettings(token, id, {
                watermark_config: config,
              });
              setGallery(updated);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Failed to update watermark",
              );
            }
          }}
        />
        <div className="rounded-xl border border-border-default bg-surface-sunken px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-default bg-surface-raised">
                {studioLogoPreviewUrl ? (
                  <img
                    src={studioLogoPreviewUrl}
                    alt={`${studioBrandName(workspaceProfile, gallery.title)} logo preview`}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span
                    className="text-xl font-semibold text-text-tertiary"
                    aria-hidden="true"
                  >
                    {studioBrandName(workspaceProfile, gallery.title)
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  Business Profile logo watermark
                </p>
                <p className="truncate text-xs text-text-secondary">
                  {studioLogoName
                    ? `${studioLogoName} · linked from Business Profile`
                    : "No Business Profile logo uploaded for this workspace."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {workspaceProfile?.logo_asset_id && (
                <button
                  type="button"
                  disabled={logoUploading || saving}
                  onClick={handleUseStudioLogo}
                  className="btn-tertiary px-4 py-2 text-sm"
                >
                  Use Business Profile logo
                </button>
              )}
              <label className="btn-tertiary cursor-pointer px-4 py-2 text-sm">
                {logoUploading
                  ? "Uploading..."
                  : workspaceProfile?.logo_asset_id
                    ? "Replace logo"
                    : "Upload Business Profile logo"}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={logoUploading || saving}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleLogoUpload(file);
                  }}
                  className="sr-only"
                  aria-label="Upload studio logo for watermark"
                />
              </label>
              <Link
                href="/settings/business"
                className="btn-tertiary px-4 py-2 text-sm"
              >
                Edit Business Profile
              </Link>
            </div>
          </div>
        </div>
        {currentWatermark.enabled === true && (
          <div className="space-y-4 pl-1">
            <div className="space-y-1">
              <label className="text-sm font-medium text-text-primary">
                Watermark text
              </label>
              <input
                type="text"
                placeholder="Studio Name"
                value={String(currentWatermark.text || "")}
                onBlur={async (e) => {
                  const config = { ...currentWatermark, text: e.target.value };
                  const token = getStoredAccessToken();
                  if (!token || !gallery) return;
                  try {
                    const updated = await updateGallerySettings(token, id, {
                      watermark_config: config,
                    });
                    setGallery(updated);
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Failed to update watermark text",
                    );
                  }
                }}
                onChange={(e) => {
                  setGallery({
                    ...gallery,
                    watermark_config: {
                      ...currentWatermark,
                      text: e.target.value,
                    },
                  });
                }}
                className="w-full rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-text-primary">
                Opacity — {Number(currentWatermark.opacity) || 40}%
              </label>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={Number(currentWatermark.opacity) || 40}
                onChange={async (e) => {
                  const config = {
                    ...currentWatermark,
                    opacity: Number(e.target.value),
                  };
                  const token = getStoredAccessToken();
                  if (!token || !gallery) return;
                  try {
                    const updated = await updateGallerySettings(token, id, {
                      watermark_config: config,
                    });
                    setGallery(updated);
                  } catch {
                    /* non-critical */
                  }
                }}
                className="w-full accent-[var(--accent-primary)]"
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-text-primary">
                Position
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  ["center", "bottom-right", "bottom-left", "diagonal"] as const
                ).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={async () => {
                      const config = { ...currentWatermark, position: pos };
                      const token = getStoredAccessToken();
                      if (!token || !gallery) return;
                      try {
                        const updated = await updateGallerySettings(token, id, {
                          watermark_config: config,
                        });
                        setGallery(updated);
                      } catch {
                        /* non-critical */
                      }
                    }}
                    className={`touch-min rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      currentWatermark.position === pos
                        ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                        : "border-border-default bg-surface-sunken text-text-secondary hover:bg-surface-container-low"
                    }`}
                  >
                    {pos
                      .replace("-", " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Client emails */}
      <section className="surface-panel space-y-4 p-5">
        <h2 className="text-lg font-semibold text-text-primary">
          Client emails
        </h2>
        <p className="text-sm text-text-secondary">
          Automatically send your client a branded &ldquo;gallery ready&rdquo;
          email when this gallery is published, a reminder a week later, and a
          &ldquo;last chance&rdquo; warning before it expires.
        </p>
        <ToggleRow
          label="Automated client emails"
          description="Turn off to stop all automated emails for this gallery."
          checked={gallery.email_automation_enabled ?? true}
          disabled={saving}
          onChange={(v) => handleToggle("email_automation_enabled", v)}
        />
      </section>

      {/* Slideshow music */}
      <section className="surface-panel space-y-4 p-5">
        <h2 className="text-lg font-semibold text-text-primary">
          Slideshow music
        </h2>
        <p className="text-sm text-text-secondary">
          Build a music library for your studio, preview tracks, and pick one
          for this gallery&rsquo;s full-screen slideshow. Audio is stored in
          your workspace storage and counts toward your plan&rsquo;s allocated
          space.
        </p>

        <div className="space-y-1">
          <label
            htmlFor="music-upload"
            className="text-sm font-medium text-text-primary"
          >
            Upload track
          </label>
          <input
            id="music-upload"
            type="file"
            multiple
            accept="audio/mpeg,audio/mp4,audio/aac,audio/x-m4a,audio/*"
            disabled={musicUploading || saving}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) void handleMusicUpload(files);
              e.target.value = "";
            }}
            className="block w-full text-sm text-text-secondary file:mr-4 file:rounded-lg file:border-0 file:bg-accent-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-primary disabled:opacity-50"
          />
          {musicUploading && (
            <p className="text-xs text-text-secondary" aria-live="polite">
              {musicUploadStatus || "Uploading…"}
            </p>
          )}
          {musicError && (
            <p className="text-xs text-feedback-error">{musicError}</p>
          )}
        </div>

        <MusicLibraryManager
          token={getStoredAccessToken() ?? ""}
          selectedAssetId={gallery.music_asset_id ?? null}
          reloadKey={musicReloadKey}
          onSelect={handleMusicSelect}
          selecting={musicSelecting}
        />
      </section>

      {/* Password Protection */}
      <section className="surface-panel space-y-4 p-5">
        <h2 className="text-lg font-semibold text-text-primary">
          Password Protection
        </h2>
        <p className="text-sm text-text-secondary">
          Require a password to access this gallery. Leave empty to remove
          protection.
        </p>

        {showPasswordField ? (
          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter gallery password"
              className="input-base w-full"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleSetPassword()}
                disabled={saving || (!password && !hasGalleryPassword)}
                className="btn-primary px-4 py-2 text-sm"
              >
                {saving
                  ? "Saving..."
                  : password
                    ? "Set Password"
                    : "Remove Password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordField(false);
                  setPassword("");
                }}
                className="btn-tertiary px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {hasGalleryPassword ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleSetPassword(null)}
                  disabled={saving}
                  className="btn-tertiary px-4 py-2.5 text-sm"
                >
                  Remove Password
                </button>
                <button
                  type="button"
                  onClick={() => setShowPasswordField(true)}
                  disabled={saving}
                  className="btn-tertiary px-4 py-2.5 text-sm"
                >
                  Change Password
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowPasswordField(true)}
                disabled={saving}
                className="btn-tertiary px-4 py-2.5 text-sm"
              >
                Set Password
              </button>
            )}
          </div>
        )}
      </section>
      <TermsAcceptanceModal
        open={termsModalOpen}
        token={getStoredAccessToken()}
        onAccepted={handleTermsAccepted}
        onCancel={() => setTermsModalOpen(false)}
      />
      </div>
    </GalleryPageShell>
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
      <ToggleSwitch
        checked={checked}
        label={label}
        checkedLabel="On"
        uncheckedLabel="Off"
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}
