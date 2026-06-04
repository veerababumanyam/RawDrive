"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteMusicTrack,
  fetchMusicTrackBlobUrl,
  listMusicLibrary,
  type MusicTrack,
} from "@/lib/api/galleries";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Pause, Play, Trash } from "@/components/icons";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface MusicLibraryManagerProps {
  /** Auth token (passed through to the API helpers, which read storage too). */
  token: string;
  /** The asset id currently selected for THIS gallery (or null/undefined). */
  selectedAssetId: string | null;
  /** Refresh signal — change this value to force the library list to reload. */
  reloadKey?: number;
  /** Select a track for this gallery (or null to clear). */
  onSelect: (assetId: string | null) => void | Promise<void>;
  /** True while a select/clear is in flight (disables the radios). */
  selecting?: boolean;
}

/**
 * Workspace music library manager for the gallery settings page. Lists the
 * workspace's audio tracks, previews each (authed bytes → Blob URL, only one
 * preview plays at a time), lets the photographer pick one for THIS gallery,
 * and deletes tracks from the library. Multi-upload is owned by the parent so
 * it can integrate with the terms-acceptance flow; this component renders the
 * list, preview, selection, and delete affordances and reloads on demand.
 */
export function MusicLibraryManager({
  token,
  selectedAssetId,
  reloadKey = 0,
  onSelect,
  selecting = false,
}: MusicLibraryManagerProps) {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState("");

  // The single shared preview element + its current object URL. Only one
  // track previews at a time; switching tracks stops the previous one and
  // revokes its URL.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stopPreview = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load?.();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewId(null);
  }, []);

  const reload = useCallback(async () => {
    setListError("");
    try {
      const list = await listMusicLibrary(token);
      setTracks(list);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : "Failed to load music library.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Load (and reload) the library. The fetch is kicked off through a resolved
  // microtask so no setState runs synchronously in the effect body (avoids the
  // React-Compiler cascading-render lint), matching the settings page pattern.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void reload();
    });
    return () => {
      cancelled = true;
    };
  }, [reload, reloadKey]);

  // Revoke any outstanding object URL on unmount.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const handlePreview = useCallback(
    async (track: MusicTrack) => {
      // Toggle: clicking the playing track stops it.
      if (previewId === track.id) {
        stopPreview();
        return;
      }
      // Stop any other preview first (revokes its URL).
      stopPreview();
      setRowError("");
      try {
        const url = await fetchMusicTrackBlobUrl(token, track.id);
        objectUrlRef.current = url;
        const audio = audioRef.current;
        if (audio) {
          audio.src = url;
          const p = audio.play?.();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
        setPreviewId(track.id);
      } catch (err) {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        setRowError(
          err instanceof Error ? err.message : "Failed to preview track.",
        );
      }
    },
    [previewId, stopPreview, token],
  );

  const handleDelete = useCallback(
    async (track: MusicTrack) => {
      setRowError("");
      setDeletingId(track.id);
      if (previewId === track.id) stopPreview();
      try {
        await deleteMusicTrack(token, track.id);
        // If the deleted track was selected for this gallery, clear it.
        if (selectedAssetId === track.id) {
          await onSelect(null);
        }
        await reload();
      } catch (err) {
        setRowError(
          err instanceof Error ? err.message : "Failed to delete track.",
        );
      } finally {
        setDeletingId(null);
      }
    },
    [onSelect, previewId, reload, selectedAssetId, stopPreview, token],
  );

  return (
    <div className="space-y-3">
      {/* Shared, hidden preview element (one at a time). */}
      <audio ref={audioRef} data-testid="music-preview-audio" />

      {loading ? (
        <p className="text-sm text-text-secondary">Loading music library…</p>
      ) : listError ? (
        <p className="text-sm text-feedback-error">{listError}</p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="sr-only">Choose a track for this gallery</legend>

          {/* "No music" option — clears the per-gallery selection. */}
          <label className="flex items-center gap-3 rounded-xl border border-border-default bg-surface-sunken px-4 py-3">
            <input
              type="radio"
              name="gallery-music"
              className="h-4 w-4 accent-accent-primary"
              checked={!selectedAssetId}
              disabled={selecting}
              onChange={() => void onSelect(null)}
            />
            <span className="text-sm font-medium text-text-primary">
              No music (None)
            </span>
          </label>

          {tracks.length === 0 ? (
            <p className="px-1 text-sm text-text-secondary">
              Your music library is empty. Upload a track to get started.
            </p>
          ) : (
            tracks.map((track) => {
              const isSelected = selectedAssetId === track.id;
              const isPreviewing = previewId === track.id;
              return (
                <div
                  key={track.id}
                  className={[
                    "flex items-center gap-3 rounded-xl border px-4 py-3",
                    isSelected
                      ? "border-accent-primary bg-accent-primary/10"
                      : "border-border-default bg-surface-sunken",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="gallery-music"
                    className="h-4 w-4 accent-accent-primary"
                    checked={isSelected}
                    disabled={selecting || deletingId === track.id}
                    onChange={() => void onSelect(track.id)}
                    aria-label={`Use ${track.filename} for this gallery`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {track.filename}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {formatBytes(track.size_bytes)}
                      {isSelected ? " · Selected for this gallery" : ""}
                    </p>
                  </div>
                  <GlassIconButton
                    label={
                      isPreviewing
                        ? `Pause preview of ${track.filename}`
                        : `Play preview of ${track.filename}`
                    }
                    onClick={() => void handlePreview(track)}
                    size="sm"
                    variant="glass"
                    active={isPreviewing}
                  >
                    {isPreviewing ? <Pause /> : <Play />}
                  </GlassIconButton>
                  <GlassIconButton
                    label={`Delete ${track.filename}`}
                    onClick={() => void handleDelete(track)}
                    size="sm"
                    variant="danger"
                    disabled={deletingId === track.id}
                  >
                    <Trash />
                  </GlassIconButton>
                </div>
              );
            })
          )}
        </fieldset>
      )}

      {rowError && <p className="text-xs text-feedback-error">{rowError}</p>}
    </div>
  );
}
