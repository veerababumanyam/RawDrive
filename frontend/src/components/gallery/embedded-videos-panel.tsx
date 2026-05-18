"use client";

// Embedded-video manager for the gallery detail page. Photographers
// paste YouTube / Vimeo URLs; the panel parses them, persists the
// array via PUT /api/v1/galleries/{id}/embedded-videos, and renders
// the live iframe grid below. Each tile has a delete affordance.
//
// The public viewer (frontend/src/app/g/[slug]/...) reads the same
// settings.embedded_videos field and renders the iframe grid via the
// `read-only` mode of this same component, so guests see exactly
// what the photographer added — same providers, same embed URLs,
// same aspect ratio.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildEmbeddedVideo,
  embedUrlFor,
  parseVideoUrl,
  updateEmbeddedVideos,
  type EmbeddedVideo,
} from "@/lib/embedded-videos";
import { Trash } from "@/components/icons";

interface EmbeddedVideosPanelProps {
  galleryId: string;
  initialVideos: EmbeddedVideo[];
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
  readOnly = false,
  onChange,
}: EmbeddedVideosPanelProps) {
  const [videos, setVideos] = useState<EmbeddedVideo[]>(initialVideos);
  // Keep our internal state aligned when the parent feeds new data
  // (e.g. after a hard refresh of the gallery). We track the array
  // identity not the content so legitimate updates flow through.
  useEffect(() => {
    setVideos(initialVideos);
  }, [initialVideos]);

  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Live parse so the user sees provider feedback as they type. Empty
  // input is treated as "not yet" rather than "invalid".
  const preview = useMemo(() => parseVideoUrl(urlInput), [urlInput]);
  const previewLabel =
    urlInput.trim() === ""
      ? null
      : preview
        ? `${preview.provider === "youtube" ? "YouTube" : "Vimeo"} · ${preview.videoId}`
        : "Unrecognized URL — paste a YouTube or Vimeo link";

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
      setError("Paste a YouTube or Vimeo link.");
      return;
    }
    // Prevent dupes by (provider, video_id). Pasting the same URL
    // twice should be a no-op + a hint, not a silent second card.
    const duplicate = videos.some(
      (v) => v.provider === parsed.provider && v.video_id === parsed.videoId,
    );
    if (duplicate) {
      setError("That video is already in this gallery.");
      return;
    }
    const next = [
      ...videos,
      buildEmbeddedVideo(parsed, { title: titleInput }),
    ];
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

  // Empty + read-only = nothing to show on the public viewer. The
  // dashboard always renders so the photographer can add the first one.
  if (readOnly && videos.length === 0) return null;

  return (
    <section
      className="surface-panel space-y-5 p-5"
      aria-label="Embedded videos"
    >
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text-primary">Videos</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            {readOnly
              ? videos.length === 1
                ? "1 video"
                : `${videos.length} videos`
              : "Embed YouTube or Vimeo links. Guests on the share link can play them."}
          </p>
        </div>
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
                placeholder="https://youtube.com/watch?v=… or https://vimeo.com/…"
                className="mt-1 w-full rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent-primary focus:outline-none min-h-[44px]"
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
                className="mt-1 w-full rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent-primary focus:outline-none min-h-[44px]"
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
              className="shrink-0 rounded-xl bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50 min-h-[40px]"
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

      {/* Iframe grid. The aspect-video utility (16:9) is fine for both
          YouTube and Vimeo standard players. Tile width tracks the
          available column; on mobile we stack 1-up, tablet 2-up,
          desktop 3-up. */}
      {videos.length === 0 ? (
        readOnly ? null : (
          <p className="rounded-xl border border-dashed border-border-default bg-surface-sunken px-4 py-8 text-center text-sm text-text-tertiary">
            No videos yet. Paste a link above to embed one.
          </p>
        )
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {videos.map((v) => (
            <li
              key={v.id}
              className="overflow-hidden rounded-xl border border-border-default bg-surface-raised"
            >
              <div className="relative aspect-video w-full bg-black">
                <iframe
                  src={embedUrlFor(v)}
                  title={v.title || `Embedded ${v.provider} video ${v.video_id}`}
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
                  className="absolute inset-0 h-full w-full"
                />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {v.title || (v.provider === "youtube" ? "YouTube video" : "Vimeo video")}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {v.provider === "youtube" ? "YouTube" : "Vimeo"} · {v.video_id}
                  </p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`Remove ${v.title || "this video"}`}
                    title="Remove video"
                    onClick={() => void handleDelete(v.id)}
                    disabled={saving}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-feedback-error/10 text-feedback-error transition-colors hover:bg-feedback-error/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
