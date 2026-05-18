"use client";

// Photo Search — webcam-driven "find me in this gallery".
//
// Flow:
//   1. User lands on /galleries/{id}/photo-search.
//   2. We request getUserMedia({ video: true }) — friendly fallback if
//      denied / unavailable (iframe, HTTP, no camera).
//   3. Live preview in a <video>. The user composes their face in
//      frame and taps "Capture".
//   4. Capture draws the current video frame into a hidden <canvas>,
//      exports it as a JPEG blob (~50-300 KB) and POSTs it to
//      /api/v1/ai/face-search?gallery_id=<id>.
//   5. Backend detects + embeds the strongest face, matches against
//      existing clusters in this workspace, and returns the matched
//      cluster + the gallery-scoped asset list. We render a grid of
//      previews and offer "Open in People view" to navigate into the
//      same /galleries/{id}/people/{clusterLabel} page the People-tab
//      tile click uses (so renames + future filters flow through one
//      surface).
//
// Camera lifecycle: we hold the MediaStream in a ref so the cleanup
// effect can call stop() on every track when the user navigates away
// — otherwise Chrome leaves the camera light on until the tab closes,
// which is alarming UX for "I just used a face for a quick search."

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { Camera, RefreshCw, Search, ChevronLeft } from "lucide-react";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
import { searchFaceInGallery, type FaceSearchResponse } from "@/lib/api/ai";
import { getAsset, type Asset } from "@/lib/api/assets";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";
import { getStoredAccessToken } from "@/lib/auth";

type Stage =
  | "idle" // before camera grant
  | "preview" // camera live, awaiting capture
  | "searching" // POST in flight
  | "result-found" // match found
  | "result-no-face" // image had no face
  | "result-no-match" // face detected but no cluster match in gallery
  | "camera-error"; // permission denied or device unavailable

export default function PhotoSearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [token] = useState(() => getStoredAccessToken());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [searchResult, setSearchResult] = useState<FaceSearchResponse | null>(null);
  const [matchedAssets, setMatchedAssets] = useState<Asset[]>([]);

  const stopCamera = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setErrorDetail("");
    setSearchResult(null);
    setMatchedAssets([]);
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        // Older browsers + insecure-context (HTTP) hit this branch.
        // getUserMedia requires HTTPS or localhost.
        throw new Error("Camera API not available. Use Chrome/Edge/Safari over HTTPS or localhost.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStage("preview");
    } catch (err) {
      setErrorDetail(err instanceof Error ? err.message : String(err));
      setStage("camera-error");
    }
  }, []);

  // Auto-stop camera on unmount so the OS camera light goes out the
  // moment the user navigates away — even if they used the back button
  // mid-search rather than a "Done" affordance.
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !token) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setErrorDetail("Camera not ready yet — try again in a moment.");
      return;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setErrorDetail("Could not access canvas context.");
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
    });
    if (!blob) {
      setErrorDetail("Could not encode capture as JPEG.");
      return;
    }

    setStage("searching");
    setErrorDetail("");
    setSearchResult(null);
    setMatchedAssets([]);

    try {
      const result = await searchFaceInGallery(token, id, blob);
      setSearchResult(result);

      if (!result.found) {
        setStage(result.faces_detected === 0 ? "result-no-face" : "result-no-match");
        return;
      }

      // Fetch preview metadata for each matched asset. Per-tile
      // failure is tolerated so one missing/deleted asset doesn't
      // blank the grid.
      const settled = await Promise.allSettled(
        result.asset_ids.map((aid) => getAsset(token, aid)),
      );
      const ok = settled
        .filter((r): r is PromiseFulfilledResult<Asset> => r.status === "fulfilled")
        .map((r) => r.value);
      setMatchedAssets(ok);
      setStage("result-found");

      // Camera is no longer needed once we have a result. The user
      // can hit "Try another face" to re-acquire it. Keeping it on
      // here would surprise users ("why is my camera light still on
      // while I'm looking at photos?").
      stopCamera();
    } catch (err) {
      setErrorDetail(err instanceof Error ? err.message : "Search failed");
      setStage("preview"); // back to live preview so user can retry
    }
  }, [id, stopCamera, token]);

  const handleRetry = useCallback(() => {
    setSearchResult(null);
    setMatchedAssets([]);
    setErrorDetail("");
    void startCamera();
  }, [startCamera]);

  return (
    <div className="space-y-6">
      <GalleryWorkspaceNav galleryId={id} />

      <Link
        href={`/galleries/${id}`}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to gallery
      </Link>

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Photo Search</p>
        <h1 className="text-2xl font-semibold text-text-primary">Find a person in this gallery</h1>
        <p className="text-sm text-text-secondary">
          Point your camera at someone&apos;s face and tap Capture. We&apos;ll
          match it against the people already detected in this gallery
          and show every photo they appear in.
        </p>
      </header>

      {/* Camera + capture area. The preview shape is a vertical 4:3 so
          it works well for a single face — wider 16:9 makes the face
          smaller on the page than necessary. */}
      <section className="surface-panel p-4">
        {stage === "idle" && (
          <div className="text-center space-y-4 py-8">
            <Camera className="mx-auto h-12 w-12 text-text-tertiary" aria-hidden />
            <p className="text-sm text-text-secondary">
              We&apos;ll ask for camera permission once. Nothing is recorded —
              only the still frame you capture is sent to the server.
            </p>
            <button
              type="button"
              onClick={() => void startCamera()}
              className="inline-flex items-center gap-2 rounded-full bg-accent-primary px-5 py-2.5 text-sm font-semibold text-text-inverse hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
            >
              <Camera className="h-4 w-4" aria-hidden />
              Start camera
            </button>
          </div>
        )}

        {stage === "camera-error" && (
          <div className="space-y-3 text-center py-6">
            <p className="text-sm font-semibold text-feedback-error">Camera unavailable</p>
            <p className="text-xs text-text-secondary">{errorDetail || "Permission denied."}</p>
            <p className="text-xs text-text-tertiary">
              Check that the site has camera permission in your browser settings,
              then try again. Camera access requires HTTPS or localhost.
            </p>
            <button
              type="button"
              onClick={() => void startCamera()}
              className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try again
            </button>
          </div>
        )}

        {(stage === "preview" || stage === "searching") && (
          <div className="space-y-3">
            <div className="relative mx-auto aspect-[4/3] max-w-xl overflow-hidden rounded-2xl border border-border-subtle bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                aria-label="Camera preview"
              />
              {/* Subtle reticle so users know roughly where to put
                  their face. Purely cosmetic — backend uses the full
                  frame. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div className="h-2/3 w-2/3 rounded-full border-2 border-white/30" />
              </div>
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void handleCapture()}
                disabled={stage === "searching"}
                className="inline-flex items-center gap-2 rounded-full bg-accent-primary px-5 py-2.5 text-sm font-semibold text-text-inverse hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {stage === "searching" ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                    Searching…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" aria-hidden />
                    Capture & search
                  </>
                )}
              </button>
            </div>
            {errorDetail && (
              <p className="text-center text-xs text-feedback-error">{errorDetail}</p>
            )}
          </div>
        )}

        {/* Hidden canvas — used as the off-screen drawing buffer for
            video→JPEG conversion. Never displayed. */}
        <canvas ref={canvasRef} className="hidden" aria-hidden />
      </section>

      {/* Result section */}
      {stage === "result-no-face" && (
        <section className="surface-panel p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-text-primary">No face detected</p>
          <p className="text-xs text-text-secondary">
            Make sure your face is centered and well lit, then try again.
          </p>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try again
            </button>
          </div>
        </section>
      )}

      {stage === "result-no-match" && (
        <section className="surface-panel p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-text-primary">No matching photos</p>
          <p className="text-xs text-text-secondary">
            We saw {searchResult?.faces_detected ?? 1}{" "}
            {(searchResult?.faces_detected ?? 1) === 1 ? "face" : "faces"} in your
            capture, but didn&apos;t find a strong match in this gallery&apos;s
            identified people.
          </p>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try another face
            </button>
          </div>
        </section>
      )}

      {stage === "result-found" && searchResult?.found && (
        <section className="space-y-4">
          <div className="surface-panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Match</p>
              <p className="text-sm font-semibold text-text-primary">
                {searchResult.cluster_name?.trim() || "Unnamed person"}
              </p>
              <p className="text-xs text-text-secondary">
                {searchResult.count}{" "}
                {searchResult.count === 1 ? "photo" : "photos"} in this gallery
                {typeof searchResult.similarity === "number"
                  ? ` · ${(searchResult.similarity * 100).toFixed(0)}% confidence`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Search another face
              </button>
              {searchResult.cluster_label && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/galleries/${id}/people/${searchResult.cluster_label}`)
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-accent-primary px-4 py-2 text-sm font-semibold text-text-inverse hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
                >
                  Open in People view
                </button>
              )}
            </div>
          </div>

          {matchedAssets.length === 0 ? (
            <div className="surface-panel p-6 text-center text-sm text-text-secondary">
              Match found but no photo previews could be loaded.
            </div>
          ) : (
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
              role="list"
              aria-label="Photos matching this face"
            >
              {matchedAssets.map((asset) => {
                const url = getAssetPreviewUrl(asset, token);
                return (
                  <Link
                    key={asset.id}
                    href={`/galleries/${id}?asset=${asset.id}`}
                    className="group block aspect-square overflow-hidden rounded-xl border border-border-subtle bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-accent-primary"
                    role="listitem"
                    aria-label={asset.filename}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-text-tertiary">
                        No preview
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
