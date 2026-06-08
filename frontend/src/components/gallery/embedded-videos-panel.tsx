"use client";

// Embedded-video manager for the gallery detail page. Photographers
// paste YouTube / Vimeo / Instagram URLs; the panel parses them, persists the
// array via PUT /api/v1/galleries/{id}/embedded-videos, and renders
// the live embed grid below. Each tile has a delete affordance.
//
// The public viewer (frontend/src/app/g/[slug]/...) reads the same
// settings.embedded_videos field and renders the iframe grid via the
// `read-only` mode of this same component, so guests see exactly
// what the photographer added — same providers, same embed URLs,
// same fallback links.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildEmbeddedVideo,
  embedUrlFor,
  parseVideoUrl,
  updateEmbeddedVideos,
  watchUrlFor,
  type EmbeddedVideo,
  type EmbeddedVideoProvider,
  type InstagramEmbedDisplayMode,
} from "@/lib/embedded-videos";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  InstagramMark,
  RefreshCw,
  Trash,
  Video,
  YouTubeMark,
} from "@/components/icons";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    instgrm?: {
      Embeds?: {
        process?: () => void;
      };
    };
  }
}

const INSTAGRAM_EMBED_SCRIPT_ID = "rawdrive-instagram-embed-script";
const INSTAGRAM_EMBED_SCRIPT_SRC = "https://www.instagram.com/embed.js";
const INSTAGRAM_DISPLAY_MODES: InstagramEmbedDisplayMode[] = [
  "compact",
  "full",
];
const PROVIDER_HINTS: EmbeddedVideoProvider[] = [
  "youtube",
  "vimeo",
  "instagram",
];

let instagramScriptLoadPromise: Promise<void> | null = null;

function providerLabel(provider: EmbeddedVideoProvider): string {
  switch (provider) {
    case "youtube":
      return "YouTube";
    case "vimeo":
      return "Vimeo";
    case "instagram":
      return "Instagram";
  }
}

function providerIcon(provider: EmbeddedVideoProvider, className = "h-4 w-4") {
  switch (provider) {
    case "youtube":
      return <YouTubeMark className={className} />;
    case "vimeo":
      return <Video className={className} />;
    case "instagram":
      return <InstagramMark className={className} />;
  }
}

function instagramDisplayMode(video: EmbeddedVideo): InstagramEmbedDisplayMode {
  return video.instagram_display_mode === "full" ? "full" : "compact";
}

function loadInstagramEmbedScript(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve();
  }
  if (window.instgrm?.Embeds?.process) {
    return Promise.resolve();
  }

  const existing = document.getElementById(INSTAGRAM_EMBED_SCRIPT_ID);
  if (instagramScriptLoadPromise && existing) {
    return instagramScriptLoadPromise;
  }

  instagramScriptLoadPromise = new Promise<void>((resolve, reject) => {
    const script =
      existing instanceof HTMLScriptElement
        ? existing
        : document.createElement("script");
    script.id = INSTAGRAM_EMBED_SCRIPT_ID;
    script.src = INSTAGRAM_EMBED_SCRIPT_SRC;
    script.async = true;

    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Instagram embed script failed to load"));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      document.head.appendChild(script);
    }
  });

  return instagramScriptLoadPromise;
}

interface EmbeddedVideosPanelProps {
  galleryId: string;
  initialVideos: EmbeddedVideo[];
  className?: string;
  // When true, only the iframe grid renders — no add form, no delete
  // affordance. This is the public-viewer mode. Defaults to false
  // (full editor mode) for the dashboard usage.
  readOnly?: boolean;
  // Optional callback fired after persistence succeeds. The dashboard
  // page uses this to keep its local gallery state in sync so the
  // gallery.settings dropdown elsewhere reflects the change without
  // a full reload.
  onChange?: (next: EmbeddedVideo[]) => void;
}

export function EmbeddedVideosPanel({
  galleryId,
  initialVideos,
  className,
  readOnly = false,
  onChange,
}: EmbeddedVideosPanelProps) {
  const [videos, setVideos] = useState<EmbeddedVideo[]>(initialVideos);
  // Keep our internal state aligned when the parent feeds new data
  // (e.g. after a hard refresh of the gallery). We track the array
  // identity not the content so legitimate updates flow through.
  // Done via the adjust-state-during-render pattern (comparing the last
  // prop value held in state) instead of an effect, so the realignment
  // lands in the same render the new prop arrives — no extra commit, no
  // flash, and React re-runs immediately without painting the stale value.
  const [lastInitialVideos, setLastInitialVideos] = useState(initialVideos);
  if (lastInitialVideos !== initialVideos) {
    setLastInitialVideos(initialVideos);
    setVideos(initialVideos);
  }

  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failedEmbeds, setFailedEmbeds] = useState<Set<string>>(
    () => new Set(),
  );

  // Live parse so the user sees provider feedback as they type. Empty
  // input is treated as "not yet" rather than "invalid".
  const preview = useMemo(() => parseVideoUrl(urlInput), [urlInput]);
  const previewLabel =
    urlInput.trim() === ""
      ? null
      : preview
        ? `${providerLabel(preview.provider)} · ${preview.videoId}`
        : "Unrecognized URL — paste a YouTube, Vimeo, or Instagram link";

  useEffect(() => {
    if (!videos.some((v) => v.provider === "instagram")) return;
    let cancelled = false;
    void loadInstagramEmbedScript()
      .then(() => {
        if (!cancelled) {
          window.instgrm?.Embeds?.process?.();
        }
      })
      .catch(() => {
        // The direct Instagram link remains visible on every tile, so a blocked
        // provider script still leaves the gallery navigable.
      });
    return () => {
      cancelled = true;
    };
  }, [videos]);

  const markEmbedFailed = useCallback((id: string) => {
    setFailedEmbeds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const clearEmbedFailure = useCallback((id: string) => {
    setFailedEmbeds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const persist = useCallback(
    async (next: EmbeddedVideo[]) => {
      // Optimistic local update + backend persist. On failure we
      // revert and surface the error; the inputs stay populated so
      // the user can retry without re-pasting.
      const snapshot = videos;
      setVideos(next);
      setSaving(true);
      setError(null);
      try {
        await updateEmbeddedVideos(galleryId, next);
        onChange?.(next);
      } catch (err) {
        setVideos(snapshot);
        setError(err instanceof Error ? err.message : "Failed to save videos");
      } finally {
        setSaving(false);
      }
    },
    [galleryId, onChange, videos],
  );

  const handleAdd = useCallback(async () => {
    const parsed = parseVideoUrl(urlInput);
    if (!parsed) {
      setError("Paste a YouTube, Vimeo, or Instagram link.");
      return;
    }
    // Prevent dupes by (provider, video_id). Pasting the same URL
    // twice should be a no-op + a hint, not a silent second card.
    const duplicate = videos.some(
      (v) =>
        v.provider === parsed.provider &&
        v.video_id === parsed.videoId &&
        (parsed.provider !== "instagram" ||
          v.instagram_kind === parsed.instagramKind),
    );
    if (duplicate) {
      setError("That video is already in this gallery.");
      return;
    }
    const next = [...videos, buildEmbeddedVideo(parsed, { title: titleInput })];
    setUrlInput("");
    setTitleInput("");
    await persist(next);
  }, [urlInput, titleInput, videos, persist]);

  const handleDelete = useCallback(
    async (id: string) => {
      const next = videos.filter((v) => v.id !== id);
      await persist(next);
    },
    [videos, persist],
  );

  const handleMove = useCallback(
    async (id: string, direction: -1 | 1) => {
      const index = videos.findIndex((v) => v.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= videos.length) return;
      const next = [...videos];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      await persist(next);
    },
    [videos, persist],
  );

  const handleInstagramDisplayMode = useCallback(
    async (id: string, mode: InstagramEmbedDisplayMode) => {
      const next = videos.map((v) =>
        v.id === id && v.provider === "instagram"
          ? { ...v, instagram_display_mode: mode }
          : v,
      );
      await persist(next);
    },
    [videos, persist],
  );

  // Empty + read-only = nothing to show on the public viewer. The
  // dashboard always renders so the photographer can add the first one.
  if (readOnly && videos.length === 0) return null;

  return (
    <section
      className={cn(
        "embedded-videos-panel surface-panel space-y-5 p-5",
        className,
      )}
      aria-label="Embedded videos"
    >
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text-primary">
            Videos & Reels
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            {readOnly
              ? videos.length === 1
                ? "1 item"
                : `${videos.length} items`
              : "Embed YouTube, Vimeo, or Instagram links. Guests on the share link can play them."}
          </p>
        </div>
        {!readOnly && videos.length > 0 && (
          <a
            href={`/galleries/${galleryId}/preview`}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent-primary hover:underline"
          >
            Preview as client
            <ArrowRight className="h-4 w-4" />
          </a>
        )}
      </header>

      {/* Add form — dashboard only. */}
      {!readOnly && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAdd();
          }}
          className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-sunken p-4"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1 min-w-0">
              <label
                htmlFor="video-url-input"
                className="block text-xs font-medium text-text-secondary"
              >
                Video URL
              </label>
              <input
                id="video-url-input"
                type="url"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="https://youtube.com/watch?v=… or https://instagram.com/reel/…"
                className="mt-1 w-full rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent-primary focus:outline-none touch-min"
                autoComplete="off"
                spellCheck={false}
              />
              {previewLabel && (
                <p
                  className={`mt-1 text-xs ${
                    preview ? "text-feedback-success" : "text-text-tertiary"
                  }`}
                >
                  {previewLabel}
                </p>
              )}
              <ul
                className="mt-2 flex flex-wrap gap-2"
                aria-label="Supported video providers"
              >
                {PROVIDER_HINTS.map((provider) => (
                  <li
                    key={provider}
                    className="inline-flex items-center gap-1 rounded-full border border-border-default bg-surface-raised px-2 py-1 text-xs text-text-secondary"
                  >
                    {providerIcon(provider)}
                    {provider === "instagram"
                      ? "Instagram Reels"
                      : providerLabel(provider)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="sm:w-56">
              <label
                htmlFor="video-title-input"
                className="block text-xs font-medium text-text-secondary"
              >
                Title <span className="text-text-tertiary">(optional)</span>
              </label>
              <input
                id="video-title-input"
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Highlights reel"
                className="mt-1 w-full rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent-primary focus:outline-none touch-min"
                maxLength={80}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-tertiary">
              {saving ? "Saving…" : "Press Enter or click Add to embed."}
            </span>
            <button
              type="submit"
              disabled={!preview || saving}
              className="shrink-0 rounded-xl bg-accent-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50 touch-min"
            >
              Add video
            </button>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-feedback-error/20 bg-feedback-error/10 px-3 py-2 text-xs text-feedback-error"
            >
              {error}
            </p>
          )}
        </form>
      )}

      {/* Embed grid. The 16:9 frame is used for YouTube/Vimeo standard
          players; Instagram uses its official responsive blockquote. Tile width tracks the
          available column; on mobile we stack 1-up, tablet 2-up,
          desktop 3-up. */}
      {videos.length === 0 ? (
        readOnly ? null : (
          <p className="rounded-xl border border-dashed border-border-default bg-surface-sunken px-4 py-8 text-center text-sm text-text-tertiary">
            No videos or reels yet. Paste a link above to embed one.
          </p>
        )
      ) : (
        <ul className="embedded-videos-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {videos.map((v, index) => {
            const embedFailed = failedEmbeds.has(v.id);
            return (
              <li
                key={v.id}
                className="overflow-hidden rounded-xl border border-border-default bg-surface-raised"
              >
              {v.provider === "instagram" ? (
                <div className="w-full bg-surface-scrim-strong p-3">
                  <blockquote
                    className="instagram-media bg-surface-raised"
                    {...(instagramDisplayMode(v) === "full"
                      ? { "data-instgrm-captioned": "" }
                      : {})}
                    data-instgrm-permalink={watchUrlFor(v)}
                    data-instgrm-version="14"
                  >
                    <a
                      href={watchUrlFor(v)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent-primary hover:underline"
                    >
                      View this post on Instagram
                    </a>
                  </blockquote>
                </div>
              ) : (
                <div className="relative aspect-video w-full bg-surface-scrim-strong">
                  {embedFailed ? (
                    <div
                      role="alert"
                      className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"
                    >
                      <p className="text-sm font-semibold text-text-primary">
                        Video player unavailable
                      </p>
                      <p className="max-w-xs text-xs text-text-secondary">
                        The provider blocked or failed this embedded player.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => clearEmbedFailure(v.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-sunken"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Retry player
                        </button>
                        <a
                          href={watchUrlFor(v)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-xs font-medium text-accent-primary hover:bg-surface-sunken"
                        >
                          Open on {providerLabel(v.provider)}
                          <ArrowRight className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Loading shimmer behind the iframe — visible until the
                          provider paints its player, then covered by it. */}
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 animate-pulse bg-surface-sunken"
                      />
                      <iframe
                        src={embedUrlFor(v)}
                        title={
                          v.title ||
                          `Embedded ${v.provider} video ${v.video_id}`
                        }
                        loading="lazy"
                        // YouTube/Vimeo require these specific allow tokens to
                        // play. Without `encrypted-media` Chromium throws on
                        // first play for DRM-detected content; without
                        // `picture-in-picture` the YouTube PiP control is grey.
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        // referrerPolicy=strict-origin-when-cross-origin keeps
                        // YouTube's "Watch on YouTube" link working while not
                        // leaking the gallery URL path to provider analytics.
                        referrerPolicy="strict-origin-when-cross-origin"
                        onErrorCapture={() => markEmbedFailed(v.id)}
                        onLoad={() => clearEmbedFailure(v.id)}
                        className="absolute inset-0 h-full w-full"
                      />
                    </>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border-default bg-surface-sunken px-2 py-1 text-xs text-text-secondary">
                      {providerIcon(v.provider)}
                      {providerLabel(v.provider)}
                    </span>
                    <p className="truncate text-sm font-medium text-text-primary">
                      {v.title || `${providerLabel(v.provider)} video`}
                    </p>
                  </div>
                  {v.provider === "instagram" && !readOnly && (
                    <div
                      className="mt-2 inline-flex rounded-xl border border-border-default bg-surface-sunken p-1"
                      aria-label={`Instagram display mode for ${v.title || "this reel"}`}
                    >
                      {INSTAGRAM_DISPLAY_MODES.map((mode) => {
                        const active = instagramDisplayMode(v) === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            aria-pressed={active}
                            disabled={saving || active}
                            onClick={() =>
                              void handleInstagramDisplayMode(v.id, mode)
                            }
                            className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                              active
                                ? "bg-accent-primary text-text-inverse"
                                : "text-text-secondary hover:bg-surface-raised"
                            } disabled:cursor-not-allowed disabled:opacity-80`}
                          >
                            {mode === "compact" ? "Compact" : "Full post"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {v.provider === "instagram" && (
                    <p className="mt-1 text-xs text-text-tertiary">
                      Private or restricted Instagram posts may only open on
                      Instagram.
                    </p>
                  )}
                  {/* Always-present click-through link. Cross-origin
                      iframe failure (uploader-disabled embedding, region
                      restriction, third-party-cookie block, browser
                      extension interference) cannot be reliably detected
                      from a parent page, so the only robust UX is to
                      give the user a direct path to the host site
                      regardless of whether the embed actually played.
                      target=_blank + rel="noopener noreferrer" so the
                      gallery tab stays put and the provider can't
                      window.opener us. */}
                  <a
                    href={watchUrlFor(v)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent-primary hover:underline"
                  >
                    Open on {providerLabel(v.provider)}
                    <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 items-center gap-2">
                    <GlassIconButton
                      type="button"
                      label={`Move ${v.title || providerLabel(v.provider)} up`}
                      onClick={() => void handleMove(v.id, -1)}
                      disabled={saving || index === 0}
                      variant="ghost"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </GlassIconButton>
                    <GlassIconButton
                      type="button"
                      label={`Move ${v.title || providerLabel(v.provider)} down`}
                      onClick={() => void handleMove(v.id, 1)}
                      disabled={saving || index === videos.length - 1}
                      variant="ghost"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </GlassIconButton>
                    <GlassIconButton
                      type="button"
                      label={`Remove ${v.title || "this video"}`}
                      onClick={() => void handleDelete(v.id)}
                      disabled={saving}
                      variant="danger"
                    >
                      <Trash className="h-4 w-4" />
                    </GlassIconButton>
                  </div>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
