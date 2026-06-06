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
// useRouter import removed 2026-05-18 — the only consumer was the
// "Open in People view" button (deep-link to the now-deleted People
// page). Photo Search renders the matched cluster's photos inline so
// no client-side navigation is needed from this page.
import { use } from "react";
import { Camera, RefreshCw, Search } from "lucide-react";
import { GalleryPageShell } from "@/components/gallery/gallery-page-shell";
import { GalleryPageHeader } from "@/components/gallery/gallery-page-header";
import { searchFaceInGallery, type FaceSearchResponse } from "@/lib/api/ai";
import type { Asset } from "@/lib/api/assets";
import { listGalleryAssets } from "@/lib/api/galleries";
import { getStoredAccessToken } from "@/lib/auth";
import { GRID_VARIANTS } from "@/lib/media-encryption/asset-media";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { LockedMediaFallback } from "@/components/gallery/media-key-recovery";
import { FaceIdentityReviewPanel } from "@/components/ai/FaceIdentityReviewPanel";

type Stage =
  | "idle" // before camera grant
  | "preview" // camera live, awaiting capture
  | "searching" // POST in flight
  | "result-found" // match found
  | "result-no-face" // image had no face
  | "result-no-match" // face detected but no cluster match in gallery
  | "camera-error"; // permission denied or device unavailable

// Why a discriminated union for camera errors instead of a single
// "permission denied" string: the four failure modes have completely
// different remediation steps and lumping them together produces the
// dev-vs-prod "still not working" loop seen on 2026-05-18 — a user on
// http://192.168.x.x got the same "Camera access requires HTTPS or
// localhost" message that someone who'd blocked the prompt in Chrome
// got, even though their actual problem was the dev URL not being a
// secure context.
type CameraErrorKind =
  | "insecure-context" // not localhost AND not HTTPS — browser refuses outright
  | "no-api" // very old browser, or sandboxed iframe with no permissions
  | "permission-denied" // user blocked the prompt or system-level deny
  | "no-device" // no camera plugged in
  | "in-use" // another app holds the camera
  | "unknown";

interface CameraError {
  kind: CameraErrorKind;
  rawName?: string;
  rawMessage: string;
}

function MatchedAssetPreview({
  asset,
  token,
}: {
  asset: Asset;
  token: string | null;
}) {
  const media = useDecryptedAssetUrl(asset, GRID_VARIANTS, token);

  if (media.loading) {
    return (
      <div
        className="h-full w-full animate-pulse bg-surface-container-high"
        aria-hidden="true"
      />
    );
  }

  if (media.src) {
    return (
      <img
        src={media.src}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform group-hover:scale-105"
      />
    );
  }

  return (
    <LockedMediaFallback
      asset={asset}
      error={media.error}
      message={media.error || "No preview"}
      className="px-2"
    />
  );
}

// Classify a getUserMedia rejection so the UI can show concrete
// remediation. The DOMException.name field is the source of truth —
// .message varies between browsers (Chrome says "Permission denied",
// Safari says "The request is not allowed by the user agent or the
// platform in the current context.", same underlying NotAllowedError).
function classifyCameraError(err: unknown): CameraError {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return {
          kind: "permission-denied",
          rawName: err.name,
          rawMessage: err.message,
        };
      case "NotFoundError":
      case "OverconstrainedError":
        return {
          kind: "no-device",
          rawName: err.name,
          rawMessage: err.message,
        };
      case "NotReadableError":
      case "AbortError":
        return { kind: "in-use", rawName: err.name, rawMessage: err.message };
      default:
        return { kind: "unknown", rawName: err.name, rawMessage: err.message };
    }
  }
  if (err instanceof Error) {
    return { kind: "unknown", rawMessage: err.message };
  }
  return { kind: "unknown", rawMessage: String(err) };
}

// Browsers gate getUserMedia on `isSecureContext`. The only origins
// that are secure without HTTPS are `localhost`, `127.0.0.1`, and
// `[::1]` (loopback addresses). A LAN IP like 192.168.x.x served over
// plain HTTP is NOT a secure context and getUserMedia will fail —
// detect this up-front so the error message is actionable instead of
// blaming the user's permissions.
function detectInsecureDevOrigin(): {
  insecure: boolean;
  hostname: string;
  protocol: string;
} {
  if (typeof window === "undefined") {
    return { insecure: false, hostname: "", protocol: "" };
  }
  const { protocol, hostname } = window.location;
  if (window.isSecureContext) return { insecure: false, hostname, protocol };
  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1";
  return { insecure: !isLoopback, hostname, protocol };
}

export default function PhotoSearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [token] = useState(() => getStoredAccessToken());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  // videoReady — flipped on the <video>'s `loadedmetadata` event. Until
  // it fires, videoWidth/videoHeight are 0 even though play() has
  // resolved, and drawImage(video,…) writes a blank frame. We disable
  // the Capture button on !videoReady so the user can't tap before
  // dimensions exist, and we gate handleCapture defensively as well.
  const [videoReady, setVideoReady] = useState(false);
  const [searchResult, setSearchResult] = useState<FaceSearchResponse | null>(
    null,
  );
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
    setVideoReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setErrorDetail("");
    setCameraError(null);
    setSearchResult(null);
    setMatchedAssets([]);
    setVideoReady(false);

    // Up-front secure-context check. If the page is on a LAN IP over
    // HTTP, `navigator.mediaDevices` is undefined in modern Chrome —
    // we'd otherwise fall through to the "Camera API not available"
    // branch, which is technically true but misses the actionable
    // cause (the dev URL itself).
    const ctx = detectInsecureDevOrigin();
    if (ctx.insecure) {
      setCameraError({
        kind: "insecure-context",
        rawMessage: `Page is on ${ctx.protocol}//${ctx.hostname} — not a secure context.`,
      });
      setStage("camera-error");
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraError({
        kind: "no-api",
        rawMessage:
          "navigator.mediaDevices.getUserMedia is unavailable in this browser.",
      });
      setStage("camera-error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      // IMPORTANT: stash the stream BEFORE flipping the stage. The
      // <video> element is only rendered when stage ∈ {preview,
      // searching}, so videoRef.current is null at this point. The
      // attach-on-mount effect below picks the stream up once React
      // mounts the element. Previously we attempted srcObject = stream
      // here, the `if (videoRef.current)` was false, the assignment
      // was silently skipped, and the preview stayed blank with
      // videoWidth=0 → "Camera not ready yet" when the user pressed
      // Capture.
      streamRef.current = stream;
      setStage("preview");
    } catch (err) {
      setCameraError(classifyCameraError(err));
      setStage("camera-error");
    }
  }, []);

  // Attach the MediaStream to the <video> AFTER the element mounts.
  // Runs whenever stage flips into preview/searching, which is the
  // first render where videoRef.current is non-null. Also wires the
  // `loadedmetadata` listener that toggles videoReady — until that
  // fires, videoWidth/videoHeight are 0 and drawImage produces a
  // blank canvas.
  useEffect(() => {
    if (stage !== "preview" && stage !== "searching") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    const handleLoadedMetadata = () => {
      // Some browsers (Safari occasionally) need an explicit play()
      // here even when autoPlay is set on the element. Failures are
      // benign — the user can retry — so we swallow them.
      void video.play().catch(() => undefined);
      setVideoReady(video.videoWidth > 0 && video.videoHeight > 0);
    };

    // If metadata is already loaded by the time this effect runs
    // (cached element re-use, fast camera), use it immediately.
    if (video.readyState >= 1 && video.videoWidth > 0) {
      handleLoadedMetadata();
    } else {
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [stage]);

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

    // Try a short polling window for videoWidth before giving up.
    // Browsers populate videoWidth after `loadedmetadata`, but on a
    // slow machine or first-permission-grant a tap on Capture can
    // race the event by a few frames. Wait up to ~1s instead of
    // surfacing the cryptic "Camera not ready yet" on the first try.
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (!w || !h) {
      for (let i = 0; i < 20 && (!w || !h); i++) {
        await new Promise((r) => setTimeout(r, 50));
        w = video.videoWidth;
        h = video.videoHeight;
      }
    }
    if (!w || !h) {
      setErrorDetail(
        "Camera still warming up — wait a moment for the preview to fill the frame, then tap Capture again.",
      );
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
        // Terminal state — drop the camera before flipping stage. We
        // previously only stopped on result-found, which left the
        // stream + tracks live (and the OS camera light on) whenever
        // the capture detected no face or matched no cluster in the
        // gallery. The safety-net effect below also catches this, but
        // calling it explicitly here means the user sees the light
        // go out in the same animation frame the result panel mounts.
        stopCamera();
        setStage(
          result.faces_detected === 0 ? "result-no-face" : "result-no-match",
        );
        return;
      }

      // PERF-23: resolve the matched assets from ONE bulk gallery-assets fetch
      // (?include_assets=true) instead of a per-match asset lookup. The cluster
      // is gallery-scoped, so every matched asset_id belongs to this gallery and
      // resolves from its embedded-asset list. Order follows asset_ids (match
      // order); missing/soft-deleted assets are simply skipped, so one absent
      // tile never blanks the grid.
      const galleryAssets = await listGalleryAssets(token, id, {
        includeAssets: true,
      });
      const byId = new Map<string, Asset>();
      for (const entry of galleryAssets) {
        if (entry.asset) {
          byId.set(entry.asset_id, entry.asset);
        }
      }
      const ok = result.asset_ids
        .map((aid) => byId.get(aid))
        .filter((a): a is Asset => Boolean(a));
      setMatchedAssets(ok);
      stopCamera();
      setStage("result-found");
    } catch (err) {
      setErrorDetail(err instanceof Error ? err.message : "Search failed");
      setStage("preview"); // back to live preview so user can retry
    }
  }, [id, stopCamera, token]);

  // Safety-net: stop the camera whenever stage lands on a terminal
  // result state, regardless of how we got there. handleCapture also
  // calls stopCamera() inline so the light goes out instantly, but
  // routing this through an effect means any future code path that
  // sets stage to a result-* value (e.g. an error handler we add
  // later, a deep-link to a cached result) keeps the same behavior
  // without needing to remember to call stopCamera at every site.
  // stopCamera() inside the effect body calls setVideoReady — that's
  // intentional (see the public-side photo-search/page.tsx for the
  // longer comment); the effect is idempotent so the setState inside
  // is safe. The disable below is line-scoped to that single call.
  useEffect(() => {
    if (
      stage === "result-found" ||
      stage === "result-no-face" ||
      stage === "result-no-match"
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      stopCamera();
    }
  }, [stage, stopCamera]);

  const handleRetry = useCallback(() => {
    setSearchResult(null);
    setMatchedAssets([]);
    setErrorDetail("");
    void startCamera();
  }, [startCamera]);

  return (
    <GalleryPageShell galleryId={id}>
      <GalleryPageHeader
        backHref={`/galleries/${id}`}
        eyebrow="Photo Search"
        title="Find a person in this gallery"
        subtitle="Point your camera at someone's face and tap Capture. We'll match it against the people already detected in this gallery and show every photo they appear in."
      />

      <FaceIdentityReviewPanel galleryId={id} token={token} />

      {/* Camera + capture area. The preview shape is a vertical 4:3 so
          it works well for a single face — wider 16:9 makes the face
          smaller on the page than necessary. */}
      <section className="surface-panel p-4">
        {stage === "idle" && (
          <div className="text-center space-y-4 py-8">
            <Camera
              className="mx-auto h-12 w-12 text-text-tertiary"
              aria-hidden
            />
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
          <CameraErrorPanel
            error={cameraError}
            onRetry={() => void startCamera()}
          />
        )}

        {(stage === "preview" || stage === "searching") && (
          <div className="space-y-3">
            <div className="relative mx-auto aspect-4/3 max-w-xl overflow-hidden rounded-2xl border border-border-subtle bg-surface-scrim-strong">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                autoPlay
                aria-label="Camera preview"
              />
              {/* Subtle reticle so users know roughly where to put
                  their face. Purely cosmetic — backend uses the full
                  frame. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div className="h-2/3 w-2/3 rounded-full border-2 border-text-media/30" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => void handleCapture()}
                disabled={stage === "searching" || !videoReady}
                className="inline-flex items-center gap-2 rounded-full bg-accent-primary px-5 py-2.5 text-sm font-semibold text-text-inverse hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {stage === "searching" ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                    Searching…
                  </>
                ) : !videoReady ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                    Warming up camera…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" aria-hidden />
                    Capture & search
                  </>
                )}
              </button>
              {!videoReady && stage === "preview" && (
                <p className="text-2xs text-text-tertiary">
                  Waiting for the first video frame…
                </p>
              )}
            </div>
            {errorDetail && (
              <p className="text-center text-xs text-feedback-error">
                {errorDetail}
              </p>
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
          <p className="text-sm font-semibold text-text-primary">
            No face detected
          </p>
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
          <p className="text-sm font-semibold text-text-primary">
            No matching photos
          </p>
          <p className="text-xs text-text-secondary">
            We saw {searchResult?.faces_detected ?? 1}{" "}
            {(searchResult?.faces_detected ?? 1) === 1 ? "face" : "faces"} in
            your capture, but didn&apos;t find a strong match in this
            gallery&apos;s identified people.
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
              <p className="text-xs uppercase tracking-widest text-text-tertiary">
                Match
              </p>
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
              {/* "Open in People view" button removed 2026-05-18 — the
                  dashboard People page is gone (Photo Search subsumes
                  it). The matched cluster's photos already render
                  inline below this header, so the deep link wasn't
                  earning its space anyway. */}
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Search another face
              </button>
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
              {matchedAssets.map((asset) => (
                <Link
                  key={asset.id}
                  href={`/galleries/${id}?asset=${asset.id}`}
                  className="group block aspect-square overflow-hidden rounded-xl border border-border-subtle bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  role="listitem"
                  aria-label={asset.filename}
                >
                  <MatchedAssetPreview asset={asset} token={token} />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </GalleryPageShell>
  );
}

// CameraErrorPanel — actionable, error-kind-aware recovery UI.
//
// Each kind maps to a distinct recovery path:
//   - insecure-context: dev URL is on a non-loopback host over HTTP.
//     The fix is to use http://localhost:3000 (not http://192.168.x.x:3000).
//     This is the most common dev-time confusion — Chrome silently
//     denies getUserMedia without an obvious prompt.
//   - no-api: ancient browser or sandboxed iframe. Asks the user to
//     switch browser.
//   - permission-denied: the user blocked the site, OR the OS denied
//     the browser's camera access. We surface BOTH causes because
//     users typically don't think to check the OS-level setting.
//   - no-device: no camera plugged in / available. Recovery is
//     hardware-side.
//   - in-use: Zoom, Teams, FaceTime, OBS etc. is holding the camera.
//     Close the other app and retry.
//   - unknown: render the raw DOMException so we don't lie about
//     knowing what went wrong; the user can paste it into a support
//     chat if needed.
function CameraErrorPanel({
  error,
  onRetry,
}: {
  error: CameraError | null;
  onRetry: () => void;
}) {
  const kind = error?.kind ?? "unknown";

  let title = "Camera unavailable";
  let lead: React.ReactNode = null;
  let steps: React.ReactNode = null;
  let retryLabel = "Try again";

  if (kind === "insecure-context") {
    title = "Dev URL isn't a secure context";
    lead = (
      <p className="text-sm text-text-secondary">
        Browsers only allow camera access on HTTPS or on{" "}
        <code className="rounded bg-surface-container px-1.5 py-0.5 text-xs">
          localhost
        </code>
        /
        <code className="rounded bg-surface-container px-1.5 py-0.5 text-xs">
          127.0.0.1
        </code>
        . This page is on{" "}
        <code className="rounded bg-surface-container px-1.5 py-0.5 text-xs">
          {error?.rawMessage.replace(/^Page is on /, "").replace(/ —.*$/, "") ||
            (typeof window !== "undefined" ? window.location.host : "")}
        </code>
        , which Chrome and Safari treat as insecure even on the LAN.
      </p>
    );
    steps = (
      <ol className="space-y-2 text-left text-sm text-text-secondary list-decimal pl-6">
        <li>
          Open the dashboard via{" "}
          <code className="rounded bg-surface-container px-1.5 py-0.5 text-xs">
            http://localhost:3000
          </code>{" "}
          instead of the LAN IP.
        </li>
        <li>
          If you really need the LAN IP (testing from a phone), run the dev
          server over HTTPS — Chrome accepts a self-signed cert if you bypass
          the warning.
        </li>
      </ol>
    );
    retryLabel = "I switched to localhost — retry";
  } else if (kind === "no-api") {
    title = "Camera API not supported";
    lead = (
      <p className="text-sm text-text-secondary">
        This browser doesn&apos;t expose{" "}
        <code className="rounded bg-surface-container px-1.5 py-0.5 text-xs">
          navigator.mediaDevices.getUserMedia
        </code>
        . Try the latest Chrome, Edge, Safari, or Firefox.
      </p>
    );
    steps = (
      <p className="text-xs text-text-tertiary">
        If you&apos;re inside an embedded iframe, the parent page may be
        blocking camera permissions via Permissions-Policy.
      </p>
    );
  } else if (kind === "permission-denied") {
    title = "Camera access blocked";
    lead = (
      <p className="text-sm text-text-secondary">
        The browser refused camera access. Either this site is blocked in your
        browser settings, or your operating system isn&apos;t letting the
        browser see the camera at all.
      </p>
    );
    steps = (
      <div className="space-y-3 text-left text-sm text-text-secondary">
        <div>
          <p className="font-semibold text-text-primary">In the browser</p>
          <ul className="list-disc pl-5 space-y-1 mt-1 text-xs">
            <li>
              <strong>Chrome / Edge</strong>: click the lock icon (or the
              video-camera icon) in the address bar, set <em>Camera</em> to{" "}
              <em>Allow</em>, then refresh.
            </li>
            <li>
              <strong>Safari</strong>: Safari → Settings → Websites → Camera →
              set this site to <em>Allow</em>, then refresh.
            </li>
            <li>
              <strong>Firefox</strong>: click the camera icon in the address
              bar, clear the &ldquo;Blocked Temporarily&rdquo; entry, then
              refresh.
            </li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-text-primary">At the OS level</p>
          <ul className="list-disc pl-5 space-y-1 mt-1 text-xs">
            <li>
              <strong>macOS</strong>: System Settings → Privacy &amp; Security →
              Camera → enable your browser, then quit and reopen the browser.
            </li>
            <li>
              <strong>Windows</strong>: Settings → Privacy &amp; Security →
              Camera → enable &ldquo;Let apps access your camera&rdquo; and the
              browser&apos;s entry below it.
            </li>
          </ul>
        </div>
      </div>
    );
  } else if (kind === "no-device") {
    title = "No camera found";
    lead = (
      <p className="text-sm text-text-secondary">
        The browser didn&apos;t find a usable camera device. Plug one in (or
        enable the built-in one) and try again.
      </p>
    );
  } else if (kind === "in-use") {
    title = "Camera is busy";
    lead = (
      <p className="text-sm text-text-secondary">
        Another application appears to be using the camera (Zoom, Teams,
        FaceTime, OBS, another browser tab). Close it and try again.
      </p>
    );
  } else {
    title = "Camera unavailable";
    lead = (
      <p className="text-sm text-text-secondary">
        {error?.rawMessage || "Permission denied."}
      </p>
    );
  }

  return (
    <div className="space-y-4 py-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <p className="text-sm font-semibold text-feedback-error">{title}</p>
        {lead}
      </div>
      {steps && (
        <div className="rounded-xl border border-border-subtle bg-surface-container-low p-4">
          {steps}
        </div>
      )}
      {error?.rawName && (
        <p className="text-center text-2xs text-text-tertiary font-mono">
          {error.rawName}: {error.rawMessage}
        </p>
      )}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {retryLabel}
        </button>
      </div>
    </div>
  );
}
