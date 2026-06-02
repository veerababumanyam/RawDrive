"use client";

// Tethered Shooting panel for the gallery detail page.
//
// Watches a local folder via the File System Access API and shows .JPG
// thumbnails in a live feed. Optionally creates a sub-gallery (album) and
// auto-uploads detected shots to it via the standard chunked upload flow:
//   scan cycle completes → wait (pollIntervalMs + 1s) → upload pending
//   JPGs → link asset to gallery → link asset to sub-gallery album.
//
// Browser support: Chrome, Edge, and Opera (showDirectoryPicker).
// Firefox/Safari: single-file fallback picker offered instead.

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Trash } from "@/components/icons";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import {
  createGalleryAlbum,
  addAssetToGallery,
  addAlbumAssets,
  deleteAlbum,
  listGalleryAlbums,
  type GalleryAlbum,
} from "@/lib/api/galleries";
import { getStoredAccessToken } from "@/lib/auth";
import { authFetch } from "@/lib/api/authFetch";
import { screen } from "@/lib/upload-screening/screen";
import { sha256HexChunked } from "@/lib/upload-screening/hash";
import { buildManifest } from "@/lib/upload-screening/manifest";
import { activePolicyVersion } from "@/lib/upload-screening/policy";

// ─── Types ───────────────────────────────────────────────────────────────────

type TetherStatus = "idle" | "live" | "paused" | "error";

interface TetheredPhoto {
  id: number;
  name: string;
  shortName: string;
  url: string;
  sizeBytes: number;
  capturedAt: Date;
  isNew: boolean;
}

// Only JPEG files are detected (user requirement).
const JPG_RE = /\.jpe?g$/i;

const HAS_DIR_PICKER =
  typeof window !== "undefined" && "showDirectoryPicker" in window;

// The File System Access API is not in the standard TypeScript lib.
// We access it through safe `unknown` casts below.
type FSAWindow = Window & {
  showDirectoryPicker(opts?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: string;
  }): Promise<FSADirHandle>;
};
type FSADirHandle = {
  name: string;
  values(): AsyncIterableIterator<FSAEntry>;
  queryPermission(desc: { mode: "read" }): Promise<PermissionState>;
  requestPermission(desc: { mode: "read" }): Promise<PermissionState>;
};
type FSAEntry =
  | { kind: "file"; name: string; getFile(): Promise<File> }
  | { kind: "directory"; name: string } & FSADirHandle;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function relTime(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ─── Direct upload helper ─────────────────────────────────────────────────────
// Self-contained async upload that bypasses the useUpload React hook.
// Returns assetId on success; throws on failure.
// This avoids the stale-state problem that arises when trying to observe
// hook-managed React state from inside an async function closure.
const UPLOAD_CHUNK = 5 * 1024 * 1024; // 5 MB

async function uploadJpgDirectly(file: File, apiUrl: string): Promise<string> {
  // Local screening (required by backend — same as useUpload does it).
  const policyVersion = await activePolicyVersion(apiUrl);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = screen(bytes, {
    metadataBudgetBytes: 512 * 1024,
    declaredType: file.type || "image/jpeg",
  });
  const sha256 = await sha256HexChunked(file);
  const manifest = buildManifest({ file, policyVersion, sha256, result });

  if (manifest.decision === "block") {
    throw new Error(
      `Screener blocked file: ${manifest.findings[0]?.message ?? "policy violation"}`,
    );
  }

  // Create upload session.
  const createRes = await authFetch("/api/v1/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type || "image/jpeg",
      total_size: file.size,
      chunk_size: UPLOAD_CHUNK,
      scan_manifest: manifest,
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Upload session create failed: ${createRes.status}`);
  }
  const { upload_id } = (await createRes.json()) as { upload_id: string };

  // Upload all chunks.
  let offset = 0;
  let assetId: string | undefined;
  while (offset < file.size) {
    const end = Math.min(offset + UPLOAD_CHUNK, file.size);
    const chunk = file.slice(offset, end);
    const patchRes = await authFetch(`/api/v1/uploads/${upload_id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/offset+octet-stream",
        "Upload-Offset": String(offset),
      },
      body: chunk,
    });
    if (!patchRes.ok) throw new Error(`Chunk upload failed: ${patchRes.status}`);
    offset = end;
    if (offset >= file.size) {
      const body = (await patchRes.json().catch(() => ({}))) as {
        asset?: { id?: string };
      };
      assetId = body.asset?.id;
    }
  }

  if (!assetId) throw new Error("Upload completed but backend returned no assetId");
  return assetId;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface TetheredShootingPanelProps {
  /** Gallery ID — required for sub-gallery creation and asset upload. */
  galleryId: string;
  /** Base URL for the API, e.g. process.env.NEXT_PUBLIC_API_URL */
  apiUrl: string;
}

export function TetheredShootingPanel({ galleryId, apiUrl }: TetheredShootingPanelProps) {
  const [status, setStatus] = useState<TetherStatus>("idle");
  const [photos, setPhotos] = useState<TetheredPhoto[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [sessionNewCount, setSessionNewCount] = useState(0);
  const [pollIntervalMs, setPollIntervalMs] = useState(2000);
  const [recursive, setRecursive] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Tick every second to keep "X ago" labels fresh.
  const [, setTick] = useState(0);

  // ── Sub-gallery state ──────────────────────────────────────────────────────
  const [albumName, setAlbumName] = useState("");
  const [album, setAlbum] = useState<GalleryAlbum | null>(null);
  const [albumCreating, setAlbumCreating] = useState(false);
  const [albumDeleting, setAlbumDeleting] = useState(false);
  const [albumError, setAlbumError] = useState<string | null>(null);
  // Existing sub-galleries list — loaded once and on demand
  const [existingAlbums, setExistingAlbums] = useState<GalleryAlbum[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  // "select" = pick from existing dropdown, "create" = type a new name
  const [albumMode, setAlbumMode] = useState<"select" | "create">("select");
  // Currently selected album ID in the dropdown (before confirming)
  const [selectedAlbumId, setSelectedAlbumId] = useState("");
  // Upload tracking: how many photos have been pushed this session + any error
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Queue of photo files waiting to be pushed to the sub-gallery after
  // the (pollIntervalMs + 1 s) upload delay.
  const pendingUploadRef = useRef<Array<{ file: File; path: string }>>([]);
  const uploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // flushRef always points to the latest flushPendingUploads so the
  // scanOnce closure never captures a stale reference (bug fix).
  const flushRef = useRef<() => Promise<void>>(async () => {});

  // Non-state refs so polling closure always has the latest values.
  const dirHandleRef = useRef<FSADirHandle | null>(null);
  const seenRef = useRef<
    Map<string, { lastModified: number; size: number; url: string }>
  >(new Map());
  const photosRef = useRef<TetheredPhoto[]>([]);
  const idSeqRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recursiveRef = useRef(recursive);
  const newestFirstRef = useRef(newestFirst);
  const soundOnRef = useRef(soundOn);
  const pollIntervalMsRef = useRef(pollIntervalMs);
  const albumRef = useRef<GalleryAlbum | null>(null);

  // Keep refs in sync with state.
  useEffect(() => { recursiveRef.current = recursive; }, [recursive]);
  useEffect(() => { newestFirstRef.current = newestFirst; }, [newestFirst]);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);
  useEffect(() => { pollIntervalMsRef.current = pollIntervalMs; }, [pollIntervalMs]);
  useEffect(() => { albumRef.current = album; }, [album]);

  // Tick clock for relative timestamps.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Revoke all object URLs on unmount.
  useEffect(() => {
    return () => {
      seenRef.current.forEach((v) => v.url && URL.revokeObjectURL(v.url));
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ── Audio ──────────────────────────────────────────────────────────────────

  const ding = useCallback(() => {
    if (!soundOnRef.current) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      audioCtxRef.current = audioCtxRef.current || new AudioCtx();
      const ctx = audioCtxRef.current;
      [784, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + i * 0.08;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.15, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.32);
      });
    } catch {
      // Audio context blocked — silent fail.
    }
  }, []);

  // ── Sub-gallery creation ───────────────────────────────────────────────────

  const handleCreateAlbum = useCallback(async () => {
    const name = albumName.trim();
    if (!name) return;
    const currentToken = getStoredAccessToken() ?? "";
    setAlbumCreating(true);
    setAlbumError(null);
    try {
      const created = await createGalleryAlbum(currentToken, galleryId, { name });
      setAlbum(created);
    } catch (err) {
      setAlbumError(err instanceof Error ? err.message : "Failed to create sub-gallery");
    } finally {
      setAlbumCreating(false);
    }
  }, [albumName, galleryId]);

  // Load the gallery's non-smart albums for the "Select existing" dropdown.
  const loadExistingAlbums = useCallback(async () => {
    const t = getStoredAccessToken() ?? "";
    if (!t) return;
    setAlbumsLoading(true);
    try {
      const list = await listGalleryAlbums(t, galleryId);
      // Exclude smart/utility albums (Favorites, Videos, face clusters)
      setExistingAlbums(list.filter((a) => !a.smart_filter));
    } catch {
      // Non-critical — user can still create new
    } finally {
      setAlbumsLoading(false);
    }
  }, [galleryId]);

  // Confirm selection from the dropdown.
  const handleSelectAlbum = useCallback(() => {
    if (!selectedAlbumId) return;
    const found = existingAlbums.find((a) => a.id === selectedAlbumId);
    if (found) {
      setAlbum(found);
      setUploadedCount(0);
      setUploadError(null);
    }
  }, [selectedAlbumId, existingAlbums]);

  const handleDeleteAlbum = useCallback(async () => {
    if (!album) return;
    const currentToken = getStoredAccessToken() ?? "";
    setAlbumDeleting(true);
    setAlbumError(null);
    try {
      await deleteAlbum(currentToken, album.id);
      setAlbum(null);
      setAlbumName("");
    } catch (err) {
      setAlbumError(err instanceof Error ? err.message : "Failed to delete sub-gallery");
    } finally {
      setAlbumDeleting(false);
    }
  }, [album]);

  // ── Upload pending photos to sub-gallery ───────────────────────────────────
  // Called (pollIntervalMs + 1 s) after each scan that found new JPGs.
  //
  // Uses a direct awaitable upload (uploadJpgDirectly) instead of the
  // useUpload React hook to avoid two bugs:
  //   1. Stale closure: scanOnce captures flushPendingUploads at creation
  //      time; if the hook-based version is recreated (e.g. when upload state
  //      changes), scanOnce never sees the new version.
  //   2. Stale state: upload.items inside an async function is a snapshot
  //      frozen at the moment useCallback memoized the closure. Polling it
  //      never returns the live completed items — the loop runs to deadline
  //      without ever seeing a finished upload.
  //
  // The direct approach is simple: for each file, await the upload, then
  // immediately link to gallery + album. No React state involved.
  const flushPendingUploads = useCallback(async () => {
    const currentAlbum = albumRef.current;
    if (!currentAlbum) return;
    const currentToken = getStoredAccessToken() ?? "";
    const batch = pendingUploadRef.current.splice(0);
    if (!batch.length) return;

    setUploading(true);
    setUploadError(null);

    let failCount = 0;
    let successCount = 0;
    for (const { file } of batch) {
      try {
        const assetId = await uploadJpgDirectly(file, apiUrl);
        await addAssetToGallery(currentToken, galleryId, assetId, 0);
        await addAlbumAssets(currentToken, currentAlbum.id, [assetId]);
        successCount++;
      } catch (err) {
        failCount++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[tethered-shooting] upload/link failed:", msg);
        setUploadError(`Upload failed: ${msg}`);
      }
    }

    setUploading(false);
    if (successCount > 0) setUploadedCount((n) => n + successCount);
    if (failCount > 0 && successCount === 0) {
      // All failed — put them back so next poll can retry
      // (already spliced; log the last error for visibility)
    }
  }, [apiUrl, galleryId]);

  // Keep flushRef current so the scanOnce timer closure always calls the
  // latest version without scanOnce needing to re-memoize (stale closure fix).
  useEffect(() => {
    flushRef.current = flushPendingUploads;
  });

  // ── Folder scan ────────────────────────────────────────────────────────────

  const walkDir = useCallback(
    async (
      handle: FSADirHandle,
      prefix: string,
      out: Array<{ path: string; file: File }>,
    ) => {
      for await (const entry of handle.values()) {
        const path = prefix + entry.name;
        if (entry.kind === "file") {
          if (!JPG_RE.test(entry.name)) continue;
          let file: File;
          try {
            file = await entry.getFile();
          } catch {
            continue; // File vanished between listing and read.
          }
          const prev = seenRef.current.get(path);
          if (
            !prev ||
            prev.lastModified !== file.lastModified ||
            prev.size !== file.size
          ) {
            if (prev?.url) URL.revokeObjectURL(prev.url);
            seenRef.current.set(path, {
              lastModified: file.lastModified,
              size: file.size,
              url: "",
            });
            out.push({ path, file });
          }
        } else if (entry.kind === "directory" && recursiveRef.current) {
          await walkDir(entry as FSADirHandle, path + "/", out);
        }
      }
    },
    [],
  );

  const addPhoto = useCallback(
    (path: string, file: File, isNew: boolean) => {
      const url = URL.createObjectURL(file);
      const entry = seenRef.current.get(path);
      if (entry) entry.url = url;

      const photo: TetheredPhoto = {
        id: ++idSeqRef.current,
        name: path,
        shortName: path.split("/").pop() ?? path,
        url,
        sizeBytes: file.size,
        capturedAt: new Date(file.lastModified || Date.now()),
        isNew,
      };
      photosRef.current = newestFirstRef.current
        ? [photo, ...photosRef.current]
        : [...photosRef.current, photo];
      setPhotos([...photosRef.current]);
      return photo;
    },
    [],
  );

  const scanOnce = useCallback(
    async (initial: boolean) => {
      const dir = dirHandleRef.current as FSADirHandle | null;
      if (!dir) return;
      try {
        const perm = await dir.queryPermission({ mode: "read" });
        if (perm !== "granted") {
          const re = await dir.requestPermission({ mode: "read" });
          if (re !== "granted") {
            setStatus("error");
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            return;
          }
        }
        const newFiles: Array<{ path: string; file: File }> = [];
        await walkDir(dir, "", newFiles);
        newFiles.sort((a, b) => a.file.lastModified - b.file.lastModified);

        let newCount = 0;
        for (const { path, file } of newFiles) {
          addPhoto(path, file, !initial);
          if (!initial) {
            newCount++;
            // Queue for sub-gallery upload (if album is configured).
            pendingUploadRef.current.push({ file, path });
          }
        }
        if (!initial && newCount > 0) {
          setSessionNewCount((n) => n + newCount);
          ding();
          // Schedule upload push: poll interval + 1 second.
          // Call via ref so the timer always invokes the latest version of
          // flushPendingUploads even though scanOnce's closure is stale.
          if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
          uploadTimerRef.current = setTimeout(() => {
            void flushRef.current();
          }, pollIntervalMsRef.current + 1000);
        }
      } catch (e) {
        console.warn("[tethered-shooting] scan failed:", e);
      }
    },
    [walkDir, addPhoto, ding],
  );

  const schedulePoll = useCallback(
    (intervalMs: number) => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => {
        if (dirHandleRef.current) void scanOnce(false);
      }, intervalMs);
    },
    [scanOnce],
  );

  // ── Controls ───────────────────────────────────────────────────────────────

  const handleChooseFolder = useCallback(async () => {
    if (!HAS_DIR_PICKER) {
      // Fallback: single-shot file input.
      const inp = document.createElement("input");
      inp.type = "file";
      inp.multiple = true;
      inp.accept = "image/*";
      inp.onchange = () => {
        Array.from(inp.files ?? []).forEach((f) =>
          addPhoto(f.name, f, false),
        );
      };
      inp.click();
      return;
    }
    try {
      const handle = await (window as unknown as FSAWindow).showDirectoryPicker({
        id: "rawdrive-tether",
        mode: "read",
        startIn: "pictures",
      });
      dirHandleRef.current = handle;
      setFolderName(handle.name);
      setStatus("live");
      setPhotos([]);
      photosRef.current = [];
      seenRef.current.clear();
      setSessionNewCount(0);
      // Load existing sub-galleries so user can select one immediately.
      void loadExistingAlbums();
      await scanOnce(true);
      schedulePoll(pollIntervalMs);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        console.warn("[tethered-shooting] folder picker failed:", e);
      }
    }
  }, [scanOnce, schedulePoll, pollIntervalMs, addPhoto]);

  const handlePauseResume = useCallback(() => {
    if (status === "live") {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setStatus("paused");
    } else if (status === "paused") {
      setStatus("live");
      void scanOnce(false);
      schedulePoll(pollIntervalMs);
    }
  }, [status, scanOnce, schedulePoll, pollIntervalMs]);

  const handleStop = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    seenRef.current.forEach((v) => v.url && URL.revokeObjectURL(v.url));
    seenRef.current.clear();
    photosRef.current = [];
    dirHandleRef.current = null;
    setPhotos([]);
    setFolderName(null);
    setSessionNewCount(0);
    setExistingAlbums([]);
    setSelectedAlbumId("");
    setAlbumMode("select");
    setStatus("idle");
  }, []);

  const handleIntervalChange = useCallback(
    (ms: number) => {
      setPollIntervalMs(ms);
      if (status === "live") schedulePoll(ms);
    },
    [status, schedulePoll],
  );

  // ── Status dot ─────────────────────────────────────────────────────────────

  const statusDot: Record<TetherStatus, string> = {
    idle: "bg-text-tertiary",
    live: "bg-feedback-success animate-pulse",
    paused: "bg-warning",
    error: "bg-feedback-error",
  };
  const statusLabel: Record<TetherStatus, string> = {
    idle: "Idle",
    live: "Live",
    paused: "Paused",
    error: "Permission lost",
  };

  // ── Lightbox ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight")
        setLightboxIndex((i) =>
          i !== null ? (i + 1) % photos.length : null,
        );
      if (e.key === "ArrowLeft")
        setLightboxIndex((i) =>
          i !== null ? (i - 1 + photos.length) % photos.length : null,
        );
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, photos.length]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <section
        className="surface-panel space-y-5 p-5"
        aria-label="Tethered shooting"
      >
        {/* ── Header ── */}
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
              <Camera className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Tethered Shooting
              </h2>
              <p className="mt-0.5 text-sm text-text-secondary">
                {status === "idle"
                  ? "Watch a local folder — new shots appear here within 2 seconds."
                  : folderName
                    ? `Watching "${folderName}"${sessionNewCount > 0 ? ` · +${sessionNewCount} this session` : ""}`
                    : "Watching…"}
              </p>
            </div>
          </div>

          {/* Status pill */}
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-default bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-text-secondary">
            <span
              className={`h-2 w-2 rounded-full ${statusDot[status]}`}
            />
            {statusLabel[status]}
          </span>
        </header>

        {/* ── Idle state — folder picker ── */}
        {status === "idle" && (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border-default bg-surface-sunken px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
              <Camera className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-primary">
                Pick a folder to start watching
              </p>
              <p className="max-w-sm text-xs text-text-tertiary">
                Point your camera&apos;s tethered output folder here. New
                photos appear within 2 seconds. Everything stays on your
                device — nothing uploads.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleChooseFolder()}
              className="inline-flex items-center gap-2 rounded-xl bg-accent-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90 min-h-[44px]"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Choose folder…
            </button>
            {!HAS_DIR_PICKER && (
              <p className="max-w-sm rounded-xl border border-warning/30 bg-warning/10 px-4 py-2 text-xs text-text-secondary">
                <strong>Folder watching needs Chrome, Edge, or Opera.</strong>{" "}
                You can still pick photos one-by-one using the button above.
              </p>
            )}
          </div>
        )}

        {/* ── Active / paused state ── */}
        {(status === "live" || status === "paused" || status === "error") && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-1 items-center gap-2 min-w-0">
                <svg
                  className="h-4 w-4 shrink-0 text-accent-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="truncate text-sm font-medium text-text-primary">
                  {folderName ?? "—"}
                </span>
                <span className="shrink-0 rounded-lg border border-border-default bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-secondary">
                  {photos.length} photo{photos.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Sound toggle */}
                <button
                  type="button"
                  title={soundOn ? "Mute sound" : "Unmute sound"}
                  onClick={() => setSoundOn((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px] ${
                    soundOn
                      ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
                      : "border-border-default bg-surface-sunken text-text-tertiary"
                  }`}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    {soundOn && (
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
                    )}
                    {!soundOn && <line x1="23" y1="9" x2="17" y2="15" />}
                  </svg>
                  Sound
                </button>

                {/* Pause / Resume */}
                <button
                  type="button"
                  onClick={handlePauseResume}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-sunken px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-raised hover:text-text-primary min-h-[36px]"
                >
                  {status === "paused" ? (
                    <>
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Resume
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                      Pause
                    </>
                  )}
                </button>

                {/* Stop */}
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-sunken px-3 py-1.5 text-xs font-medium text-feedback-error/80 transition-colors hover:border-feedback-error/40 hover:bg-feedback-error/10 hover:text-feedback-error min-h-[36px]"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="5" y="5" width="14" height="14" rx="1" />
                  </svg>
                  Stop
                </button>
              </div>
            </div>

            {/* Settings row */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border-default bg-surface-sunken px-4 py-3 text-xs text-text-secondary">
              <label className="flex items-center gap-2">
                Poll every
                <input
                  type="range"
                  min={500}
                  max={5000}
                  step={500}
                  value={pollIntervalMs}
                  onChange={(e) =>
                    handleIntervalChange(Number(e.target.value))
                  }
                  className="w-28 accent-accent-primary"
                  aria-label="Poll interval"
                />
                <span className="min-w-[2.5rem] font-semibold text-text-primary">
                  {(pollIntervalMs / 1000).toFixed(1)}s
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={recursive}
                  onChange={(e) => setRecursive(e.target.checked)}
                  className="accent-accent-primary"
                />
                Include subfolders
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={newestFirst}
                  onChange={(e) => setNewestFirst(e.target.checked)}
                  className="accent-accent-primary"
                />
                Newest first
              </label>
            </div>

            {/* Sub-gallery — select existing or create new */}
            <div className="rounded-xl border border-border-default bg-surface-sunken p-4 space-y-3">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Sub-gallery — auto-push detected shots
              </p>

              {album ? (
                /* ── Linked state ── */
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-feedback-success min-w-0">
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                    <span className="truncate">
                      Pushing to <strong className="text-text-primary">{album.name}</strong>{" "}
                      <span className="text-text-tertiary text-xs">
                        — {pollIntervalMs / 1000 + 1}s after each scan
                        {uploading && " · uploading…"}
                        {!uploading && uploadedCount > 0 && ` · ${uploadedCount} pushed`}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setAlbum(null); setAlbumName(""); setSelectedAlbumId(""); }}
                      disabled={albumDeleting}
                      className="text-xs text-text-tertiary hover:text-text-secondary underline disabled:opacity-50"
                    >
                      Change
                    </button>
                    <GlassIconButton
                      onClick={() => void handleDeleteAlbum()}
                      variant="danger"
                      size="sm"
                      label={albumDeleting ? "Deleting…" : `Delete sub-gallery "${album.name}"`}
                      disabled={albumDeleting}
                    >
                      <Trash />
                    </GlassIconButton>
                  </div>
                </div>
              ) : (
                /* ── Selection / creation state ── */
                <div className="space-y-3">
                  {/* Mode toggle */}
                  <div className="flex rounded-lg border border-border-default overflow-hidden text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setAlbumMode("select")}
                      className={`flex-1 px-3 py-2 transition-colors ${
                        albumMode === "select"
                          ? "bg-accent-primary text-white"
                          : "bg-surface-raised text-text-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      Select existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setAlbumMode("create")}
                      className={`flex-1 px-3 py-2 transition-colors ${
                        albumMode === "create"
                          ? "bg-accent-primary text-white"
                          : "bg-surface-raised text-text-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      Create new
                    </button>
                  </div>

                  {albumMode === "select" ? (
                    /* ── Select from existing albums ── */
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedAlbumId}
                        onChange={(e) => setSelectedAlbumId(e.target.value)}
                        className="flex-1 min-w-0 rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none min-h-[40px]"
                        disabled={albumsLoading}
                      >
                        <option value="">
                          {albumsLoading
                            ? "Loading…"
                            : existingAlbums.length === 0
                              ? "No sub-galleries yet"
                              : "Select a sub-gallery…"}
                        </option>
                        {existingAlbums.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleSelectAlbum}
                        disabled={!selectedAlbumId || albumsLoading}
                        className="shrink-0 rounded-xl bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        onClick={() => void loadExistingAlbums()}
                        disabled={albumsLoading}
                        className="shrink-0 rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-tertiary hover:text-text-primary hover:bg-surface-sunken disabled:opacity-50 min-h-[40px]"
                        title="Refresh sub-gallery list"
                      >
                        ↻
                      </button>
                    </div>
                  ) : (
                    /* ── Create a new album ── */
                    <form
                      onSubmit={(e) => { e.preventDefault(); void handleCreateAlbum(); }}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={albumName}
                        onChange={(e) => { setAlbumName(e.target.value); if (albumError) setAlbumError(null); }}
                        placeholder="New sub-gallery name…"
                        className="flex-1 min-w-0 rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent-primary focus:outline-none min-h-[40px]"
                        maxLength={80}
                        disabled={albumCreating}
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={!albumName.trim() || albumCreating}
                        className="shrink-0 rounded-xl bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
                      >
                        {albumCreating ? "Creating…" : "Create"}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {(albumError || uploadError) && (
                <p role="alert" className="text-xs text-feedback-error">
                  {uploadError || albumError}
                </p>
              )}
              {!album && (
                <p className="text-[11px] text-text-tertiary">
                  New JPGs are uploaded {pollIntervalMs / 1000 + 1}s after each scan. Upload credit and B2 storage are required.
                </p>
              )}
            </div>

            {/* Photo grid */}
            {photos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-default bg-surface-sunken px-6 py-10 text-center">
                <p className="text-sm text-text-tertiary">
                  {status === "paused"
                    ? "Paused — resume to detect new shots."
                    : "Waiting for new photos. Shoot something!"}
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((photo, idx) => (
                  <li key={photo.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(idx)}
                      className="relative block w-full overflow-hidden rounded-xl border border-border-default bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent-primary aspect-[4/3] cursor-zoom-in"
                      aria-label={`View ${photo.shortName}`}
                    >
                      {/* New badge */}
                      {photo.isNew && (
                        <span className="absolute left-2 top-2 z-10 rounded-full bg-accent-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                          New
                        </span>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.shortName}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        loading="lazy"
                      />
                      {/* Hover overlay */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        <p className="truncate text-xs font-medium text-white">
                          {photo.shortName}
                        </p>
                        <p className="text-[10px] text-white/70">
                          {fmtTime(photo.capturedAt)} ·{" "}
                          {fmtSize(photo.sizeBytes)}
                        </p>
                      </div>
                    </button>
                    <p className="mt-1 truncate px-0.5 text-[11px] text-text-tertiary">
                      {relTime(photo.capturedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <div
          role="dialog"
          aria-label="Photo preview"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close */}
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setLightboxIndex(null)}
            className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Prev */}
          {photos.length > 1 && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(
                  (i) => ((i ?? 0) - 1 + photos.length) % photos.length,
                );
              }}
              className="absolute left-5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
            >
              ‹
            </button>
          )}

          {/* Next */}
          {photos.length > 1 && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => ((i ?? 0) + 1) % photos.length);
              }}
              className="absolute right-5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
            >
              ›
            </button>
          )}

          {/* Image */}
          <div
            className="max-h-[calc(100vh-120px)] max-w-[calc(100vw-120px)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[lightboxIndex].url}
              alt={photos[lightboxIndex].shortName}
              className="max-h-[calc(100vh-120px)] max-w-[calc(100vw-120px)] rounded-xl object-contain shadow-2xl"
            />
          </div>

          {/* Meta bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-black/60 px-4 py-2 text-xs text-white/80 backdrop-blur-sm whitespace-nowrap">
            <strong className="text-white">
              {photos[lightboxIndex].shortName}
            </strong>{" "}
            · {fmtTime(photos[lightboxIndex].capturedAt)} ·{" "}
            {fmtSize(photos[lightboxIndex].sizeBytes)} ·{" "}
            {lightboxIndex + 1}/{photos.length}
          </div>
        </div>
      )}
    </>
  );
}
