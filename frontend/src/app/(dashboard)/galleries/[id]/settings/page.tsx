"use client";

import Link from "next/link";
import {
  use,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  createGalleryAccountShare,
  getGallery,
  listGalleryAccountShares,
  listGalleryAssets,
  revokeGalleryAccountShare,
  updateGallerySettings,
  uploadMusicTrack,
  selectGalleryMusic,
  type Gallery,
  type GalleryAccountShare,
} from "@/lib/api/galleries";
import type { Asset } from "@/lib/api/assets";
import { MusicLibraryManager } from "@/components/gallery/music-library-manager";
import { getTermsStatus } from "@/lib/api/legal";
import {
  getWorkspaceProfile,
  type WorkspaceProfile,
} from "@/lib/api/workspace-profile";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import {
  readGallerySlideshowIntervalMs,
  SLIDESHOW_INTERVAL_DEFAULT_MS,
  SLIDESHOW_INTERVAL_MAX_MS,
  SLIDESHOW_INTERVAL_MIN_MS,
} from "@/lib/gallery-design-config";
import { TermsAcceptanceModal } from "@/components/legal/terms-acceptance-modal";
import { GalleryPageShell } from "@/components/gallery/gallery-page-shell";
import { GalleryPageHeader } from "@/components/gallery/gallery-page-header";
import { ResizableWorkspaceSplit } from "@/components/gallery/resizable-workspace-split";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Dialog } from "@/components/ui/dialog";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ChevronLeft, ChevronRight, Photo } from "@/components/icons";
import { LockedMediaFallback } from "@/components/gallery/media-key-recovery";

const ACCESS_WINDOW_PRESETS = [30, 60, 90] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const WATERMARK_PREVIEW_VARIANTS = [
  "display_webp",
  "thumb_lg_webp",
  "thumb_md_webp",
  "thumb_sm_webp",
] as const;
const WATERMARK_SCALE_DEFAULT = 100;
const WATERMARK_POSITION_PRESETS = [
  { id: "center", label: "Center", x: 50, y: 50 },
  { id: "top-right", label: "Top right", x: 84, y: 16 },
  { id: "top-left", label: "Top left", x: 16, y: 16 },
  { id: "bottom-right", label: "Bottom right", x: 84, y: 84 },
  { id: "bottom-left", label: "Bottom left", x: 16, y: 84 },
  { id: "diagonal", label: "Diagonal", x: 50, y: 50 },
  { id: "custom", label: "Free form", x: 50, y: 50 },
] as const;
type DownloadQuality = "webp" | "thumbnail" | "original";
type WatermarkPlacement = { x: number; y: number };
type WatermarkLayerKind = "logo" | "text";
type WatermarkMode = "text" | "logo" | "both";
type WatermarkPosition = (typeof WATERMARK_POSITION_PRESETS)[number]["id"];
type WatermarkLayerDraft = {
  opacity: number;
  scale: number;
  position: WatermarkPosition;
  placement: WatermarkPlacement;
};
type WatermarkDraft = {
  enabled: boolean;
  mode: WatermarkMode;
  text: string;
  logoUrl: string;
  activeLayer: WatermarkLayerKind;
  logoLayer: WatermarkLayerDraft;
  textLayer: WatermarkLayerDraft;
};

const BUSINESS_PROFILE_LOGO_SOURCE = "business_profile";

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

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
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

function hasBusinessProfileLogo(profile: WorkspaceProfile | null): boolean {
  return Boolean(profile?.logo_asset_id || profile?.logo_url);
}

function clampPercent(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function normalizeWatermarkPosition(value: unknown): WatermarkPosition {
  if (
    typeof value === "string" &&
    WATERMARK_POSITION_PRESETS.some((p) => p.id === value)
  ) {
    return value as WatermarkPosition;
  }
  return "bottom-right";
}

function placementFromPosition(
  position: string,
  fallback: WatermarkPlacement = { x: 84, y: 84 },
): WatermarkPlacement {
  const preset = WATERMARK_POSITION_PRESETS.find((p) => p.id === position);
  if (preset) return { x: preset.x, y: preset.y };
  return fallback;
}

function readWatermarkPlacement(
  watermark: Record<string, unknown>,
  fallbackPosition: string,
): WatermarkPlacement {
  const raw = watermark.placement;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return placementFromPosition(fallbackPosition);
  }
  const placement = raw as Record<string, unknown>;
  return {
    x: clampPercent(placement.x, 84),
    y: clampPercent(placement.y, 84),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function defaultWatermarkLayer(
  position: WatermarkPosition,
): WatermarkLayerDraft {
  return {
    opacity: 40,
    scale: WATERMARK_SCALE_DEFAULT,
    position,
    placement: placementFromPosition(position),
  };
}

function legacyWatermarkLayer(
  watermark: Record<string, unknown>,
  fallbackPosition: WatermarkPosition,
): WatermarkLayerDraft {
  const position = normalizeWatermarkPosition(
    typeof watermark.position === "string" && watermark.position
      ? watermark.position
      : fallbackPosition,
  );
  return {
    opacity: clampPercent(watermark.opacity, 40),
    scale:
      clampPercent(watermark.scale, WATERMARK_SCALE_DEFAULT) ||
      WATERMARK_SCALE_DEFAULT,
    position,
    placement: readWatermarkPlacement(watermark, position),
  };
}

function readWatermarkLayer(
  watermark: Record<string, unknown>,
  layer: WatermarkLayerKind,
  fallback: WatermarkLayerDraft,
): WatermarkLayerDraft {
  const layers = readRecord(watermark.layers);
  const raw = readRecord(layers[layer]);
  const position = normalizeWatermarkPosition(
    typeof raw.position === "string" && raw.position
      ? raw.position
      : fallback.position,
  );
  return {
    opacity: clampPercent(raw.opacity, fallback.opacity),
    scale: clampPercent(raw.scale, fallback.scale) || WATERMARK_SCALE_DEFAULT,
    position,
    placement: readWatermarkPlacement(raw, position),
  };
}

function visibleWatermarkLayer(mode: WatermarkMode): WatermarkLayerKind {
  return mode === "text" ? "text" : "logo";
}

function watermarkLayer(
  draft: WatermarkDraft,
  layer: WatermarkLayerKind,
): WatermarkLayerDraft {
  return layer === "logo" ? draft.logoLayer : draft.textLayer;
}

function withWatermarkLayer(
  draft: WatermarkDraft,
  layer: WatermarkLayerKind,
  patch: Partial<WatermarkLayerDraft>,
): WatermarkDraft {
  if (layer === "logo") {
    return { ...draft, logoLayer: { ...draft.logoLayer, ...patch } };
  }
  return { ...draft, textLayer: { ...draft.textLayer, ...patch } };
}

function readWatermarkDraft(
  watermark: Record<string, unknown>,
  gallery: Gallery,
  profile: WorkspaceProfile | null,
  businessLogoPreviewUrl: string,
): WatermarkDraft {
  const mode =
    watermark.mode === "both"
      ? "both"
      : watermark.mode === "logo" ||
          (!watermark.mode && hasBusinessProfileLogo(profile))
        ? "logo"
        : "text";
  const legacyPosition = normalizeWatermarkPosition(
    typeof watermark.position === "string" && watermark.position
      ? watermark.position
      : "bottom-right",
  );
  const legacyLayer = legacyWatermarkLayer(watermark, legacyPosition);
  const logoFallback =
    mode === "logo" || mode === "both"
      ? legacyLayer
      : defaultWatermarkLayer("bottom-right");
  const textFallback =
    mode === "text"
      ? legacyLayer
      : defaultWatermarkLayer(mode === "both" ? "top-left" : "bottom-right");
  const text =
    typeof watermark.text === "string" && watermark.text.trim()
      ? watermark.text
      : studioBrandName(profile, gallery.title);
  const legacyLogoUrl =
    mode === "logo" && typeof watermark.logo_url === "string"
      ? watermark.logo_url
      : "";
  return {
    enabled: watermark.enabled === true,
    mode,
    text,
    logoUrl:
      businessLogoPreviewUrl ||
      legacyLogoUrl ||
      logoWatermarkURL(gallery, profile),
    activeLayer: visibleWatermarkLayer(mode),
    logoLayer: readWatermarkLayer(watermark, "logo", logoFallback),
    textLayer: readWatermarkLayer(watermark, "text", textFallback),
  };
}

function watermarkDraftToConfig(
  draft: WatermarkDraft,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const primaryLayer = watermarkLayer(draft, visibleWatermarkLayer(draft.mode));
  const config: Record<string, unknown> = {
    ...current,
    enabled: draft.enabled,
    mode: draft.mode,
    text: draft.text,
    opacity: primaryLayer.opacity,
    scale: primaryLayer.scale,
    position: primaryLayer.position,
    placement: primaryLayer.placement,
    layers: {
      ...readRecord(current.layers),
      logo: draft.logoLayer,
      text: draft.textLayer,
    },
  };
  delete config.logo_url;
  delete config.logo_asset_id;
  if (draft.mode === "logo" || draft.mode === "both") {
    config.logo_source = BUSINESS_PROFILE_LOGO_SOURCE;
  } else {
    delete config.logo_source;
  }
  return config;
}

function previewableAsset(asset: Asset | null | undefined): asset is Asset {
  return Boolean(
    asset &&
    asset.content_type?.startsWith("image/") &&
    asset.thumbnail_urls &&
    Object.keys(asset.thumbnail_urls).length > 0,
  );
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
  const [slideshowIntervalDraftMs, setSlideshowIntervalDraftMs] = useState<
    number | null
  >(null);
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
  const [watermarkPreviewOpen, setWatermarkPreviewOpen] = useState(false);
  const [watermarkPreviewAssets, setWatermarkPreviewAssets] = useState<Asset[]>(
    [],
  );
  const [watermarkPreviewIndex, setWatermarkPreviewIndex] = useState(0);
  const [watermarkPreviewLoading, setWatermarkPreviewLoading] = useState(false);
  const [watermarkPreviewError, setWatermarkPreviewError] = useState("");
  const [watermarkDraft, setWatermarkDraft] = useState<WatermarkDraft | null>(
    null,
  );
  const [watermarkPanelLayer, setWatermarkPanelLayer] =
    useState<WatermarkLayerKind>("logo");
  const [accountShares, setAccountShares] = useState<GalleryAccountShare[]>([]);
  const [shareEmail, setShareEmail] = useState("");
  const [shareBilling, setShareBilling] = useState<"owner" | "shared">(
    "shared",
  );
  const [shareMigrateUsage, setShareMigrateUsage] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareError, setShareError] = useState("");

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

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token || !gallery || gallery.access_role === "shared") return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setShareLoading(true);
        return listGalleryAccountShares(token, id);
      })
      .then((shares) => {
        if (!cancelled) setAccountShares(shares);
      })
      .catch(() => {
        if (!cancelled) setAccountShares([]);
      })
      .finally(() => {
        if (!cancelled) setShareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gallery, id]);

  useEffect(() => {
    if (!watermarkPreviewOpen || !gallery) return;
    const token = getStoredAccessToken();
    if (!token) return;
    let cancelled = false;
    void listGalleryAssets(token, id, { includeAssets: true })
      .then((rows) => {
        if (cancelled) return;
        const assets = rows
          .map((row) => row.asset ?? null)
          .filter(previewableAsset);
        const coverIndex = gallery.cover_asset_id
          ? assets.findIndex((asset) => asset.id === gallery.cover_asset_id)
          : -1;
        setWatermarkPreviewAssets(assets);
        setWatermarkPreviewIndex(coverIndex >= 0 ? coverIndex : 0);
      })
      .catch((err) => {
        if (!cancelled) {
          setWatermarkPreviewError(
            err instanceof Error
              ? err.message
              : "Failed to load gallery preview photos.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setWatermarkPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gallery, id, watermarkPreviewOpen]);

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
        files.length === 1
          ? "Track uploaded"
          : `${files.length} tracks uploaded`,
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

  const handleSlideshowIntervalSave = async () => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;
    setSaving(true);
    setSaveMsg("");
    setMusicError("");
    try {
      const updated = await updateGallerySettings(token, id, {
        slideshow_interval_ms: slideshowIntervalMs,
      });
      setGallery(updated);
      setSlideshowIntervalDraftMs(null);
      setSaveMsg("Slideshow speed saved");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setMusicError(
        err instanceof Error ? err.message : "Failed to save slideshow speed",
      );
    } finally {
      setSaving(false);
    }
  };

  const openWatermarkPreview = () => {
    if (!gallery) return;
    const token = getStoredAccessToken();
    if (!token) {
      setError("Your session expired. Please log in again.");
      return;
    }
    const current = (gallery.watermark_config as Record<string, unknown>) || {};
    setWatermarkPreviewAssets([]);
    setWatermarkPreviewIndex(0);
    setWatermarkPreviewError("");
    setWatermarkPreviewLoading(true);
    setWatermarkDraft(
      readWatermarkDraft(
        { ...current, enabled: true },
        gallery,
        workspaceProfile,
        logoPreviewURL(workspaceProfile, token),
      ),
    );
    setWatermarkPreviewOpen(true);
  };

  const saveWatermarkDraft = async () => {
    const token = getStoredAccessToken();
    if (!token || !gallery || !watermarkDraft) return;
    const current = (gallery.watermark_config as Record<string, unknown>) || {};

    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateGallerySettings(token, id, {
        watermark_config: watermarkDraftToConfig(watermarkDraft, current),
      });
      setGallery(updated);
      setWatermarkPreviewOpen(false);
      setSaveMsg("Album watermark preview saved");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save watermark preview",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveWatermarkMode = async (mode: WatermarkMode) => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;
    if (
      (mode === "logo" || mode === "both") &&
      !hasBusinessProfileLogo(workspaceProfile)
    ) {
      setError(
        "Upload a Business Profile logo before using logo watermarking.",
      );
      return;
    }

    const current = (gallery.watermark_config as Record<string, unknown>) || {};
    const currentDraft = readWatermarkDraft(
      { ...current, enabled: true },
      gallery,
      workspaceProfile,
      logoPreviewURL(workspaceProfile, token),
    );
    const nextActiveLayer = visibleWatermarkLayer(mode);
    const currentLayers = readRecord(current.layers);
    const hasSavedTextLayer =
      Object.keys(readRecord(currentLayers.text)).length > 0;
    const hasSavedLogoLayer =
      Object.keys(readRecord(currentLayers.logo)).length > 0;
    const nextDraft: WatermarkDraft = {
      ...currentDraft,
      enabled: true,
      mode,
      activeLayer: nextActiveLayer,
      textLayer:
        mode === "both" && currentDraft.mode === "logo" && !hasSavedTextLayer
          ? defaultWatermarkLayer("top-left")
          : currentDraft.textLayer,
      logoLayer:
        mode === "both" && currentDraft.mode === "text" && !hasSavedLogoLayer
          ? defaultWatermarkLayer("bottom-right")
          : currentDraft.logoLayer,
    };
    const config = watermarkDraftToConfig(nextDraft, current);

    setSaving(true);
    setError("");
    setSaveMsg("");
    try {
      const updated = await updateGallerySettings(token, id, {
        watermark_config: config,
      });
      setGallery(updated);
      setSaveMsg(
        mode === "logo"
          ? "Business Profile logo watermark enabled"
          : mode === "both"
            ? "Logo and text watermark enabled"
            : "Text watermark enabled",
      );
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update watermark type",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveWatermarkText = async (text: string) => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;
    const current = (gallery.watermark_config as Record<string, unknown>) || {};
    const draft = readWatermarkDraft(
      current,
      gallery,
      workspaceProfile,
      logoPreviewURL(workspaceProfile, token),
    );
    const config = watermarkDraftToConfig({ ...draft, text }, current);
    try {
      const updated = await updateGallerySettings(token, id, {
        watermark_config: config,
      });
      setGallery(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update watermark text",
      );
    }
  };

  const saveWatermarkLayerPatch = async (
    layer: WatermarkLayerKind,
    patch: Partial<WatermarkLayerDraft>,
  ) => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;
    const current = (gallery.watermark_config as Record<string, unknown>) || {};
    const draft = readWatermarkDraft(
      current,
      gallery,
      workspaceProfile,
      logoPreviewURL(workspaceProfile, token),
    );
    const nextDraft = withWatermarkLayer(draft, layer, patch);
    try {
      const updated = await updateGallerySettings(token, id, {
        watermark_config: watermarkDraftToConfig(nextDraft, current),
      });
      setGallery(updated);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update watermark placement",
      );
    }
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

  const handleShareAccount = async () => {
    const token = getStoredAccessToken();
    if (!token || !gallery) return;
    setShareSaving(true);
    setShareError("");
    setSaveMsg("");
    try {
      const share = await createGalleryAccountShare(token, id, {
        email: shareEmail,
        storage_billed_to: shareBilling,
        migrate_storage_usage: shareMigrateUsage,
      });
      setAccountShares((current) => [
        share,
        ...current.filter((item) => item.id !== share.id),
      ]);
      setShareEmail("");
      setShareMigrateUsage(false);
      setSaveMsg(
        share.status === "pending_invite"
          ? "Pending gallery invite saved"
          : "Shared account saved",
      );
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Failed to share gallery",
      );
    } finally {
      setShareSaving(false);
    }
  };

  const handleRevokeAccountShare = async (shareId: string) => {
    const token = getStoredAccessToken();
    if (!token) return;
    setShareSaving(true);
    setShareError("");
    try {
      await revokeGalleryAccountShare(token, id, shareId);
      setAccountShares((current) =>
        current.filter((share) => share.id !== shareId),
      );
      setSaveMsg("Shared account removed");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Failed to remove shared account",
      );
    } finally {
      setShareSaving(false);
    }
  };

  if (loading) {
    return (
      <GalleryPageShell galleryId={id} width="full">
        <div className="max-w-3xl animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-surface-sunken" />
          <div className="h-64 rounded-2xl bg-surface-sunken" />
        </div>
      </GalleryPageShell>
    );
  }

  if (!gallery) {
    return (
      <GalleryPageShell galleryId={id} width="full">
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
  const accessToken = getStoredAccessToken();
  const studioLogoPreviewUrl = logoPreviewURL(workspaceProfile, accessToken);
  const savedSlideshowIntervalMs = readGallerySlideshowIntervalMs(
    gallery.settings,
  );
  const slideshowIntervalMs =
    slideshowIntervalDraftMs ?? savedSlideshowIntervalMs;
  const slideshowSpeedDirty =
    slideshowIntervalDraftMs !== null &&
    slideshowIntervalMs !== savedSlideshowIntervalMs;
  const studioLogoName =
    workspaceProfile?.logo_metadata?.filename ||
    (workspaceProfile?.logo_asset_id ? "Uploaded logo" : "");
  const businessProfileLogoAvailable = hasBusinessProfileLogo(workspaceProfile);
  const currentWatermark =
    (gallery.watermark_config as Record<string, unknown>) || {};
  const currentWatermarkDraft = readWatermarkDraft(
    currentWatermark,
    gallery,
    workspaceProfile,
    studioLogoPreviewUrl,
  );
  const activeWatermarkLayer =
    currentWatermarkDraft.mode === "both"
      ? watermarkPanelLayer
      : visibleWatermarkLayer(currentWatermarkDraft.mode);
  const activeWatermarkLayerDraft = watermarkLayer(
    currentWatermarkDraft,
    activeWatermarkLayer,
  );
  const watermarkTypeOptions: Array<{
    mode: WatermarkMode;
    label: string;
    requiresLogo: boolean;
  }> = [
    { mode: "logo", label: "Logo", requiresLogo: true },
    { mode: "text", label: "Text", requiresLogo: false },
    { mode: "both", label: "Logo + text", requiresLogo: true },
  ];
  const settingsSections = [
    { id: "gallery-settings-downloads", label: "Downloads" },
    { id: "gallery-settings-upload", label: "Uploads" },
    { id: "gallery-settings-access", label: "Access" },
    { id: "gallery-settings-sharing", label: "Sharing" },
    { id: "gallery-settings-faceid", label: "AI & FaceID" },
    { id: "gallery-settings-proofing", label: "Proofing" },
    { id: "gallery-settings-watermark", label: "Watermark" },
    { id: "gallery-settings-emails", label: "Emails" },
    { id: "gallery-settings-music", label: "Music" },
    { id: "gallery-settings-password", label: "Password" },
  ] as const;

  return (
    <GalleryPageShell galleryId={id} width="full" className="pb-24">
      <GalleryPageHeader
        backHref={`/galleries/${id}`}
        eyebrow="Settings"
        title="Gallery Settings"
        subtitle={gallery.title}
      />

      <ResizableWorkspaceSplit
        className="gallery-settings-workbench"
        storageKey="rawdrive:gallery-workspace:settings:split:v1"
        label="Resize settings categories and panels"
        secondarySide="start"
        defaultSecondaryPercent={23}
        minSecondaryPercent={16}
        maxSecondaryPercent={32}
        minSecondaryPx={200}
        maxSecondaryPx={320}
      >
        <aside
          className="gallery-settings-rail"
          aria-label="Settings categories"
        >
          {settingsSections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.label}
            </a>
          ))}
        </aside>

        <div className="gallery-settings-panels">
          {error && <InlineAlert variant="error">{error}</InlineAlert>}

          {saveMsg && <InlineAlert variant="success">{saveMsg}</InlineAlert>}

          {/* Downloads */}
          <section
            id="gallery-settings-downloads"
            className="surface-panel space-y-4 p-5"
          >
            <h2 className="text-lg font-semibold text-text-primary">
              Downloads
            </h2>
            <p className="text-sm text-text-secondary">
              Clients can download optimized WebP gallery files or original
              source files when you allow them.
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
          <section
            id="gallery-settings-access"
            className="surface-panel space-y-4 p-5"
          >
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

          {/* Shared accounts */}
          <section
            id="gallery-settings-sharing"
            className="surface-panel space-y-4 p-5"
          >
            <h2 className="text-lg font-semibold text-text-primary">
              Shared accounts
            </h2>
            <p className="text-sm text-text-secondary">
              Give another RawDrive account access to this gallery and choose
              which workspace carries its storage. If the email is not
              registered yet, RawDrive saves a pending gallery invite.
            </p>
            {gallery.access_role === "shared" ? (
              <InlineAlert variant="info">
                This gallery is shared from{" "}
                {gallery.owner_workspace_name || "another workspace"}.
              </InlineAlert>
            ) : (
              <>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.8fr)]">
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-text-primary">
                      Account email
                    </span>
                    <input
                      type="email"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="input-base w-full"
                      disabled={shareSaving}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-text-primary">
                      Storage billed to
                    </span>
                    <select
                      value={shareBilling}
                      onChange={(e) => {
                        const next = e.target.value as "owner" | "shared";
                        setShareBilling(next);
                        if (next === "owner") setShareMigrateUsage(false);
                      }}
                      className="input-base w-full"
                      disabled={shareSaving}
                    >
                      <option value="owner">Owner account</option>
                      <option value="shared">Shared account</option>
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-3 rounded-xl border border-border-default bg-surface-sunken px-4 py-3 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={shareMigrateUsage}
                    disabled={shareSaving || shareBilling !== "shared"}
                    onChange={(e) => setShareMigrateUsage(e.target.checked)}
                    className="h-4 w-4 accent-accent-primary"
                  />
                  <span>Migrate current gallery usage to shared account</span>
                </label>
                {shareError && (
                  <InlineAlert variant="error">{shareError}</InlineAlert>
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => void handleShareAccount()}
                    disabled={shareSaving || shareEmail.trim().length === 0}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    {shareSaving ? "Saving..." : "Share gallery"}
                  </button>
                </div>
                <div className="space-y-2">
                  {shareLoading ? (
                    <p className="text-sm text-text-secondary">
                      Loading shared accounts...
                    </p>
                  ) : accountShares.length > 0 ? (
                    accountShares.map((share) => {
                      const isPendingInvite = share.status === "pending_invite";
                      const migratedBytes =
                        share.migrated_original_bytes +
                        share.migrated_derivative_bytes;
                      const displayEmail =
                        share.pending_email ||
                        share.shared_user_email ||
                        share.shared_workspace_name;
                      return (
                        <div
                          key={share.id}
                          className="rounded-xl border border-border-default bg-surface-sunken px-4 py-3"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <p className="truncate text-sm font-semibold text-text-primary">
                                {displayEmail}
                              </p>
                              <p className="text-xs text-text-secondary">
                                {isPendingInvite
                                  ? `Pending invite · storage: ${
                                      share.storage_billed_to === "shared"
                                        ? "shared account after signup"
                                        : "owner account"
                                    }`
                                  : `${share.shared_workspace_name} · storage: ${
                                      share.storage_billed_to === "shared"
                                        ? "shared account"
                                        : "owner account"
                                    }`}
                                {!isPendingInvite && migratedBytes > 0
                                  ? ` · migrated ${formatBytes(migratedBytes)}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {isPendingInvite && share.share_link_token ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const inviteUrl = `${window.location.origin}/g/${gallery.slug}?share=${encodeURIComponent(
                                      share.share_link_token || "",
                                    )}`;
                                    void navigator.clipboard
                                      ?.writeText(inviteUrl)
                                      .then(() => {
                                        setSaveMsg("Invite link copied");
                                        setTimeout(() => setSaveMsg(""), 2000);
                                      });
                                  }}
                                  className="btn-tertiary px-3 py-2 text-sm"
                                >
                                  Copy link
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() =>
                                  void handleRevokeAccountShare(share.id)
                                }
                                disabled={shareSaving}
                                className="btn-tertiary px-3 py-2 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-text-secondary">
                      No shared accounts yet.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          {/* AI & FaceID */}
          <section
            id="gallery-settings-faceid"
            className="surface-panel space-y-4 p-5"
          >
            <h2 className="text-lg font-semibold text-text-primary">
              AI & FaceID
            </h2>
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
          <section
            id="gallery-settings-proofing"
            className="surface-panel space-y-4 p-5"
          >
            <h2 className="text-lg font-semibold text-text-primary">
              Proofing
            </h2>
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
          <section
            id="gallery-settings-watermark"
            className="surface-panel space-y-4 p-5"
          >
            <h2 className="text-lg font-semibold text-text-primary">
              Watermark
            </h2>
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
                const token = getStoredAccessToken();
                if (!token || !gallery) return;
                const preferredMode =
                  currentWatermarkDraft.mode === "both"
                    ? "both"
                    : currentWatermarkDraft.mode === "text"
                      ? "text"
                      : hasBusinessProfileLogo(workspaceProfile)
                        ? "logo"
                        : "text";
                const config = watermarkDraftToConfig(
                  {
                    ...currentWatermarkDraft,
                    enabled: v,
                    mode: preferredMode,
                    activeLayer: visibleWatermarkLayer(preferredMode),
                  },
                  currentWatermark,
                );
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
                        ? `${studioLogoName} · automatically linked from Business Profile`
                        : "No Business Profile logo uploaded yet."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/settings/business"
                    className="btn-tertiary px-4 py-2 text-sm"
                  >
                    {studioLogoName
                      ? "Manage Business Profile logo"
                      : "Upload logo in Business Profile"}
                  </Link>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={openWatermarkPreview}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    Preview &amp; adjust
                  </button>
                </div>
              </div>
            </div>
            {currentWatermark.enabled === true && (
              <div className="space-y-4 pl-1">
                <div className="space-y-1">
                  <span className="text-sm font-medium text-text-primary">
                    Watermark type
                  </span>
                  <div className="grid grid-cols-1 gap-2 sm:max-w-2xl sm:grid-cols-3">
                    {watermarkTypeOptions.map((option) => (
                      <button
                        key={option.mode}
                        type="button"
                        disabled={
                          saving ||
                          (option.requiresLogo && !businessProfileLogoAvailable)
                        }
                        onClick={() => void saveWatermarkMode(option.mode)}
                        className={presetButtonClass(
                          currentWatermarkDraft.mode === option.mode,
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {!businessProfileLogoAvailable && (
                    <p className="text-xs text-text-secondary">
                      Upload a Business Profile logo to use logo watermarking or
                      Logo + Text.
                    </p>
                  )}
                </div>
                {currentWatermarkDraft.mode === "both" && (
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-text-primary">
                      Adjust layer
                    </span>
                    <div
                      className="grid grid-cols-2 gap-2 sm:max-w-md"
                      role="group"
                      aria-label="Watermark layer"
                    >
                      {(["logo", "text"] as const).map((layer) => (
                        <button
                          key={layer}
                          type="button"
                          disabled={saving}
                          onClick={() => setWatermarkPanelLayer(layer)}
                          className={presetButtonClass(
                            activeWatermarkLayer === layer,
                          )}
                        >
                          {layer === "logo" ? "Logo" : "Text"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-text-primary">
                    {currentWatermarkDraft.mode === "logo"
                      ? "Fallback watermark text"
                      : "Watermark text"}
                  </label>
                  <input
                    type="text"
                    placeholder="Studio Name"
                    value={currentWatermarkDraft.text}
                    onBlur={(e) => void saveWatermarkText(e.target.value)}
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
                    Opacity — {activeWatermarkLayerDraft.opacity}%
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={5}
                    value={activeWatermarkLayerDraft.opacity}
                    onChange={(e) =>
                      void saveWatermarkLayerPatch(activeWatermarkLayer, {
                        opacity: Number(e.target.value),
                      })
                    }
                    className="w-full accent-accent-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-text-primary">
                    {activeWatermarkLayer === "logo"
                      ? "Logo size"
                      : "Text size"}{" "}
                    — {activeWatermarkLayerDraft.scale}%
                  </label>
                  <input
                    type="range"
                    min={60}
                    max={180}
                    step={5}
                    value={activeWatermarkLayerDraft.scale}
                    onChange={(e) =>
                      void saveWatermarkLayerPatch(activeWatermarkLayer, {
                        scale: Number(e.target.value),
                      })
                    }
                    className="w-full accent-accent-primary"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-medium text-text-primary">
                    Position
                  </span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {WATERMARK_POSITION_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          void saveWatermarkLayerPatch(activeWatermarkLayer, {
                            position: preset.id,
                            placement:
                              preset.id === "custom"
                                ? activeWatermarkLayerDraft.placement
                                : { x: preset.x, y: preset.y },
                          })
                        }
                        className={`touch-min rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          activeWatermarkLayerDraft.position === preset.id
                            ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                            : "border-border-default bg-surface-sunken text-text-secondary hover:bg-surface-container-low"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                {activeWatermarkLayerDraft.position === "custom" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm font-medium text-text-primary">
                      <span>
                        Horizontal —{" "}
                        {Math.round(activeWatermarkLayerDraft.placement.x)}%
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={activeWatermarkLayerDraft.placement.x}
                        onChange={(e) =>
                          void saveWatermarkLayerPatch(activeWatermarkLayer, {
                            position: "custom",
                            placement: {
                              ...activeWatermarkLayerDraft.placement,
                              x: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-accent-primary"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-text-primary">
                      <span>
                        Vertical —{" "}
                        {Math.round(activeWatermarkLayerDraft.placement.y)}%
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={activeWatermarkLayerDraft.placement.y}
                        onChange={(e) =>
                          void saveWatermarkLayerPatch(activeWatermarkLayer, {
                            position: "custom",
                            placement: {
                              ...activeWatermarkLayerDraft.placement,
                              y: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-accent-primary"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Client emails */}
          <section
            id="gallery-settings-emails"
            className="surface-panel space-y-4 p-5"
          >
            <h2 className="text-lg font-semibold text-text-primary">
              Client emails
            </h2>
            <p className="text-sm text-text-secondary">
              Automatically send your client a branded &ldquo;gallery
              ready&rdquo; email when this gallery is published, a reminder a
              week later, and a &ldquo;last chance&rdquo; warning before it
              expires.
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
          <section
            id="gallery-settings-music"
            className="surface-panel space-y-4 p-5"
          >
            <h2 className="text-lg font-semibold text-text-primary">
              Slideshow music
            </h2>
            <p className="text-sm text-text-secondary">
              Build a music library for your studio, preview tracks, and pick
              one for this gallery&rsquo;s full-screen slideshow. Audio is
              stored in your workspace storage and counts toward your
              plan&rsquo;s allocated space.
            </p>

            <div className="rounded-xl border border-border-subtle bg-surface-sunken/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <label
                    htmlFor="slideshow-speed"
                    className="text-sm font-medium text-text-primary"
                  >
                    Slide speed
                  </label>
                  <p className="mt-1 text-xs text-text-secondary">
                    {Math.round(slideshowIntervalMs / 1000)} seconds per photo
                    for the cover and full-screen slideshow.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSlideshowIntervalSave()}
                  disabled={saving || !slideshowSpeedDirty}
                  className="btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && slideshowSpeedDirty ? "Saving..." : "Save speed"}
                </button>
              </div>
              <input
                id="slideshow-speed"
                type="range"
                min={SLIDESHOW_INTERVAL_MIN_MS / 1000}
                max={SLIDESHOW_INTERVAL_MAX_MS / 1000}
                step={1}
                value={Math.round(slideshowIntervalMs / 1000)}
                disabled={saving}
                onChange={(event) =>
                  setSlideshowIntervalDraftMs(Number(event.target.value) * 1000)
                }
                className="mt-4 w-full accent-accent-primary disabled:opacity-50"
              />
              <div className="mt-2 flex justify-between text-xs text-text-tertiary">
                <span>{SLIDESHOW_INTERVAL_MIN_MS / 1000}s</span>
                <span>{SLIDESHOW_INTERVAL_DEFAULT_MS / 1000}s default</span>
                <span>{SLIDESHOW_INTERVAL_MAX_MS / 1000}s</span>
              </div>
            </div>

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
              token={accessToken ?? ""}
              selectedAssetId={gallery.music_asset_id ?? null}
              reloadKey={musicReloadKey}
              onSelect={handleMusicSelect}
              selecting={musicSelecting}
            />
          </section>

          {/* Password Protection */}
          <section
            id="gallery-settings-password"
            className="surface-panel space-y-4 p-5"
          >
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
        </div>
      </ResizableWorkspaceSplit>
      <WatermarkPreviewModal
        open={watermarkPreviewOpen}
        onClose={() => setWatermarkPreviewOpen(false)}
        draft={watermarkDraft}
        onDraftChange={setWatermarkDraft}
        assets={watermarkPreviewAssets}
        activeIndex={watermarkPreviewIndex}
        onActiveIndexChange={setWatermarkPreviewIndex}
        loading={watermarkPreviewLoading}
        error={watermarkPreviewError}
        token={accessToken}
        saving={saving}
        onSave={() => void saveWatermarkDraft()}
      />
      <TermsAcceptanceModal
        open={termsModalOpen}
        token={accessToken}
        onAccepted={handleTermsAccepted}
        onCancel={() => setTermsModalOpen(false)}
      />
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

function WatermarkPreviewModal({
  open,
  onClose,
  draft,
  onDraftChange,
  assets,
  activeIndex,
  onActiveIndexChange,
  loading,
  error,
  token,
  saving,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  draft: WatermarkDraft | null;
  onDraftChange: Dispatch<SetStateAction<WatermarkDraft | null>>;
  assets: Asset[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  loading: boolean;
  error: string;
  token: string | null;
  saving: boolean;
  onSave: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const activeAsset = assets[activeIndex] ?? null;
  const canCycle = assets.length > 1;
  const previewLayer: WatermarkLayerKind | null = draft
    ? draft.mode === "both"
      ? draft.activeLayer
      : visibleWatermarkLayer(draft.mode)
    : null;
  const previewLayerDraft =
    draft && previewLayer ? watermarkLayer(draft, previewLayer) : null;

  const updatePlacementFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (
      !draft ||
      !previewLayer ||
      !previewLayerDraft ||
      !rect ||
      rect.width <= 0 ||
      rect.height <= 0
    )
      return;
    const x = clampPercent(
      ((event.clientX - rect.left) / rect.width) * 100,
      previewLayerDraft.placement.x,
    );
    const y = clampPercent(
      ((event.clientY - rect.top) / rect.height) * 100,
      previewLayerDraft.placement.y,
    );
    onDraftChange((current) =>
      current
        ? withWatermarkLayer(
            { ...current, activeLayer: previewLayer },
            previewLayer,
            {
              position: "custom",
              placement: { x, y },
            },
          )
        : current,
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Watermark preview"
      description="Album-specific watermark placement"
      className="max-w-5xl"
      footer={
        <>
          <button
            type="button"
            className="btn-tertiary px-4 py-2 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary px-4 py-2 text-sm"
            disabled={!draft || loading || saving}
            onClick={onSave}
          >
            {saving ? "Saving..." : "Save album watermark"}
          </button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div
            ref={frameRef}
            className="relative flex aspect-video min-h-72 items-center justify-center overflow-hidden rounded-xl border border-border-default bg-surface-scrim-strong cursor-crosshair"
            onPointerDown={(event) => {
              if (!draft || !activeAsset) return;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setDragging(true);
              updatePlacementFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (dragging) updatePlacementFromPointer(event);
            }}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture?.(event.pointerId);
              setDragging(false);
            }}
            onPointerLeave={() => setDragging(false)}
          >
            {loading ? (
              <div className="text-sm text-text-media">Loading preview...</div>
            ) : error ? (
              <div className="px-6 text-center text-sm text-feedback-error">
                {error}
              </div>
            ) : activeAsset ? (
              <>
                <WatermarkPreviewPhoto asset={activeAsset} token={token} />
                {draft ? <WatermarkPreviewOverlay draft={draft} /> : null}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 text-center text-text-tertiary">
                <Photo className="h-8 w-8" />
                <p className="text-sm">
                  No gallery photos are ready for watermark preview.
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs text-text-secondary">
              {activeAsset
                ? activeAsset.filename
                : `${assets.length} preview photos`}
            </p>
            <div className="flex items-center gap-2">
              <GlassIconButton
                size="sm"
                variant="ghost"
                label="Previous preview photo"
                disabled={!canCycle}
                onClick={() =>
                  onActiveIndexChange(
                    (activeIndex - 1 + assets.length) % assets.length,
                  )
                }
              >
                <ChevronLeft />
              </GlassIconButton>
              <span className="min-w-12 text-center text-xs text-text-secondary">
                {assets.length ? activeIndex + 1 : 0}/{assets.length}
              </span>
              <GlassIconButton
                size="sm"
                variant="ghost"
                label="Next preview photo"
                disabled={!canCycle}
                onClick={() =>
                  onActiveIndexChange((activeIndex + 1) % assets.length)
                }
              >
                <ChevronRight />
              </GlassIconButton>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-border-default bg-surface-sunken p-4">
          {draft?.mode === "both" && (
            <div className="space-y-2">
              <span className="text-sm font-semibold text-text-primary">
                Adjust layer
              </span>
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label="Preview watermark layer"
              >
                {(["logo", "text"] as const).map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    disabled={!draft}
                    onClick={() =>
                      onDraftChange((current) =>
                        current ? { ...current, activeLayer: layer } : current,
                      )
                    }
                    className={presetButtonClass(draft.activeLayer === layer)}
                  >
                    {layer === "logo" ? "Logo" : "Text"}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <span className="text-sm font-semibold text-text-primary">
              Position
            </span>
            <div className="grid grid-cols-2 gap-2">
              {WATERMARK_POSITION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!draft}
                  onClick={() =>
                    onDraftChange((current) =>
                      current && previewLayer && previewLayerDraft
                        ? withWatermarkLayer(current, previewLayer, {
                            position: preset.id,
                            placement:
                              preset.id === "custom"
                                ? previewLayerDraft.placement
                                : { x: preset.x, y: preset.y },
                          })
                        : current,
                    )
                  }
                  className={`touch-min rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    previewLayerDraft?.position === preset.id
                      ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                      : "border-border-default bg-surface-container text-text-secondary hover:bg-surface-container-low"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          {previewLayerDraft?.position === "custom" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-semibold text-text-primary">
                <span>
                  Horizontal — {Math.round(previewLayerDraft.placement.x)}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={previewLayerDraft.placement.x}
                  disabled={!draft || !previewLayer}
                  onChange={(event) =>
                    onDraftChange((current) =>
                      current && previewLayer && previewLayerDraft
                        ? withWatermarkLayer(current, previewLayer, {
                            position: "custom",
                            placement: {
                              ...previewLayerDraft.placement,
                              x: Number(event.target.value),
                            },
                          })
                        : current,
                    )
                  }
                  className="w-full accent-accent-primary disabled:opacity-50"
                />
              </label>
              <label className="space-y-1 text-sm font-semibold text-text-primary">
                <span>
                  Vertical — {Math.round(previewLayerDraft.placement.y)}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={previewLayerDraft.placement.y}
                  disabled={!draft || !previewLayer}
                  onChange={(event) =>
                    onDraftChange((current) =>
                      current && previewLayer && previewLayerDraft
                        ? withWatermarkLayer(current, previewLayer, {
                            position: "custom",
                            placement: {
                              ...previewLayerDraft.placement,
                              y: Number(event.target.value),
                            },
                          })
                        : current,
                    )
                  }
                  className="w-full accent-accent-primary disabled:opacity-50"
                />
              </label>
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="watermark-preview-opacity"
              className="text-sm font-semibold text-text-primary"
            >
              Opacity — {previewLayerDraft?.opacity ?? 40}%
            </label>
            <input
              id="watermark-preview-opacity"
              type="range"
              min={10}
              max={90}
              step={5}
              value={previewLayerDraft?.opacity ?? 40}
              disabled={!draft}
              onChange={(event) =>
                onDraftChange((current) =>
                  current && previewLayer
                    ? withWatermarkLayer(current, previewLayer, {
                        opacity: Number(event.target.value),
                      })
                    : current,
                )
              }
              className="w-full accent-accent-primary disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="watermark-preview-scale"
              className="text-sm font-semibold text-text-primary"
            >
              {previewLayer === "logo" ? "Logo size" : "Text size"} —{" "}
              {previewLayerDraft?.scale ?? WATERMARK_SCALE_DEFAULT}%
            </label>
            <input
              id="watermark-preview-scale"
              type="range"
              min={60}
              max={180}
              step={5}
              value={previewLayerDraft?.scale ?? WATERMARK_SCALE_DEFAULT}
              disabled={!draft}
              onChange={(event) =>
                onDraftChange((current) =>
                  current && previewLayer
                    ? withWatermarkLayer(current, previewLayer, {
                        scale: Number(event.target.value),
                      })
                    : current,
                )
              }
              className="w-full accent-accent-primary disabled:opacity-50"
            />
          </div>

          {draft?.mode === "text" || draft?.mode === "both" ? (
            <div className="space-y-2">
              <label
                htmlFor="watermark-preview-text"
                className="text-sm font-semibold text-text-primary"
              >
                Watermark text
              </label>
              <input
                id="watermark-preview-text"
                type="text"
                value={draft.text}
                onChange={(event) =>
                  onDraftChange((current) =>
                    current
                      ? { ...current, text: event.target.value }
                      : current,
                  )
                }
                className="input-base w-full"
              />
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

function WatermarkPreviewPhoto({
  asset,
  token,
}: {
  asset: Asset;
  token: string | null;
}) {
  const media = useDecryptedAssetUrl(asset, WATERMARK_PREVIEW_VARIANTS, token);
  if (media.loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-text-media">
        Loading photo...
      </div>
    );
  }
  if (!media.src) {
    return (
      <LockedMediaFallback
        asset={asset}
        error={media.error}
        message={media.error || "Preview unavailable"}
        mode="viewer"
        className="absolute inset-0 px-6"
      />
    );
  }
  return (
    <img
      src={media.src}
      alt={asset.filename || "Gallery photo preview"}
      className="absolute inset-0 h-full w-full object-contain"
      decoding="async"
    />
  );
}

function WatermarkPreviewOverlay({ draft }: { draft: WatermarkDraft }) {
  const layers: Array<{
    kind: WatermarkLayerKind;
    layer: WatermarkLayerDraft;
  }> =
    draft.mode === "both"
      ? [
          { kind: "logo", layer: draft.logoLayer },
          { kind: "text", layer: draft.textLayer },
        ]
      : [
          {
            kind: visibleWatermarkLayer(draft.mode),
            layer: watermarkLayer(draft, visibleWatermarkLayer(draft.mode)),
          },
        ];

  return (
    <>
      {layers.map(({ kind, layer }) => (
        <WatermarkPreviewLayer
          key={kind}
          kind={kind}
          layer={layer}
          text={draft.text}
          logoUrl={draft.logoUrl}
        />
      ))}
    </>
  );
}

function WatermarkPreviewLayer({
  kind,
  layer,
  text,
  logoUrl,
}: {
  kind: WatermarkLayerKind;
  layer: WatermarkLayerDraft;
  text: string;
  logoUrl: string;
}) {
  if (kind === "logo" && !logoUrl) return null;
  if (kind === "text" && !text.trim()) return null;
  const opacity = Math.max(0.1, Math.min(0.9, layer.opacity / 100));
  const transformParts = [
    "translate(-50%, -50%)",
    layer.position === "diagonal" ? "rotate(-30deg)" : "",
    `scale(${layer.scale / 100})`,
  ].filter(Boolean);
  const style: CSSProperties = {
    left: `${layer.placement.x}%`,
    top: `${layer.placement.y}%`,
    opacity,
    transform: transformParts.join(" "),
    textShadow: "var(--cover-text-shadow)",
  };

  if (kind === "logo") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute select-none"
        style={style}
      >
        <img
          src={logoUrl}
          alt=""
          className="h-16 w-16 object-contain sm:h-20 sm:w-20"
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute select-none whitespace-nowrap text-base font-semibold uppercase tracking-widest text-text-media sm:text-lg"
      style={style}
    >
      {text}
    </div>
  );
}
