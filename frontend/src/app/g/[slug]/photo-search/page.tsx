"use client";

// Public Photo Search — webcam-driven "find me in this gallery" for
// anonymous guests viewing a shared gallery.
//
// Mirrors the dashboard /galleries/{id}/photo-search page but resolves
// data by slug (no JWT) and is gated server-side on both
// workspaces.face_recognition_enabled and galleries.face_detection_enabled,
// same gates as the public /people page.
//
// Security note: every search is GALLERY-SCOPED on the backend
// (FindSimilarFacesInGalleryScored + ListClusterAssetIDsInGallery).
// A guest viewing one shared gallery cannot enumerate other galleries'
// faces just by hitting this endpoint — see
// public_gallery_handler.PhotoSearch.

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ChevronLeft, RefreshCw, Search } from "lucide-react";
import {
  searchPublicFaceInGallery,
  type PublicFaceSearchResponse,
} from "@/lib/api/ai";
import { DecryptedThumb } from "@/components/gallery/decrypted-thumb";

type Stage =
  | "idle"
  | "preview"
  | "searching"
  | "result-found"
  | "result-no-face"
  | "result-no-match"
  | "camera-error";

// Same DOMException-name classifier the dashboard page uses, copied
// here verbatim so the public page doesn't import dashboard code (the
// route groups are siblings and we keep an import wall between them).
type CameraErrorKind =
  | "insecure-context"
  | "no-api"
  | "permission-denied"
  | "no-device"
  | "in-use"
  | "unknown";

interface CameraError {
  kind: CameraErrorKind;
  rawName?: string;
  rawMessage: string;
}

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
  if (err instanceof Error) return { kind: "unknown", rawMessage: err.message };
  return { kind: "unknown", rawMessage: String(err) };
}

function detectInsecureDevOrigin(): {
  insecure: boolean;
  hostname: string;
  protocol: string;
} {
  if (typeof window === "undefined")
    return { insecure: false, hostname: "", protocol: "" };
  const { protocol, hostname } = window.location;
  if (window.isSecureContext) return { insecure: false, hostname, protocol };
  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1";
  return { insecure: !isLoopback, hostname, protocol };
}

export default function PublicPhotoSearchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [searchResult, setSearchResult] =
    useState<PublicFaceSearchResponse | null>(null);
  // featureDisabled — true when the backend returns 403 (gallery has
  // face detection turned off) or 503 (deployment has no face-svc
  // client). Renders a friendlier panel than the generic error.
  const [featureDisabled, setFeatureDisabled] = useState<{
    reason: "disabled" | "unavailable";
    detail: string;
  } | null>(null);

  const stopCamera = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setVideoReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setErrorDetail("");
    setCameraError(null);
    setFeatureDisabled(null);
    setSearchResult(null);
    setVideoReady(false);

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
      streamRef.current = stream;
      setStage("preview");
    } catch (err) {
      setCameraError(classifyCameraError(err));
      setStage("camera-error");
    }
  }, []);

  // Attach the stream AFTER the <video> element mounts. Same race
  // condition we hit on the dashboard page — startCamera fires while
  // stage is still "idle" so videoRef.current is null at the assign
  // site. See /galleries/[id]/photo-search/page.tsx for the longer
  // comment block on this.
  useEffect(() => {
    if (stage !== "preview" && stage !== "searching") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) video.srcObject = stream;

    const handleLoadedMetadata = () => {
      void video.play().catch(() => undefined);
      setVideoReady(video.videoWidth > 0 && video.videoHeight > 0);
    };

    if (video.readyState >= 1 && video.videoWidth > 0) {
      handleLoadedMetadata();
    } else {
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
    }
    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [stage]);

  // Safety net: tear down the camera on any terminal result state OR
  // unmount. Result-* states never own a live stream.
  //
  // ESLint flags stopCamera() here because it calls setVideoReady —
  // that's intentional: when stage flips to a result-*, the video
  // element unmounts and videoReady must reset for the next round.
  // The effect is idempotent (stopCamera is a no-op when streamRef
  // is already nil) so the setState inside is safe.
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

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

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

    try {
      const result = await searchPublicFaceInGallery(slug, blob);
      setSearchResult(result);
      if (!result.found) {
        stopCamera();
        setStage(
          result.faces_detected === 0 ? "result-no-face" : "result-no-match",
        );
        return;
      }
      stopCamera();
      setStage("result-found");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Backend sends specific status codes for the two
      // "feature not available right now" cases. Detect those from
      // the error body and route to a friendlier panel instead of a
      // raw error toast.
      if (/photo search disabled/i.test(msg)) {
        stopCamera();
        setFeatureDisabled({
          reason: "disabled",
          detail: "The studio hasn't enabled photo search for this gallery.",
        });
        setStage("camera-error");
        return;
      }
      if (/photo search not available/i.test(msg)) {
        stopCamera();
        setFeatureDisabled({
          reason: "unavailable",
          detail: "Photo search is temporarily unavailable. Try again later.",
        });
        setStage("camera-error");
        return;
      }
      setErrorDetail(msg);
      setStage("preview");
    }
  }, [slug, stopCamera]);

  const handleRetry = useCallback(() => {
    setSearchResult(null);
    setErrorDetail("");
    void startCamera();
  }, [startCamera]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Link
        href={`/g/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to gallery
      </Link>

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">
          Photo Search
        </p>
        <h1 className="text-2xl font-semibold text-text-primary">
          Find yourself in this gallery
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          Point your camera at your face and tap Capture. We&apos;ll find every
          photo in this gallery you appear in. Nothing about your camera frame
          is stored — only the still you capture is sent for matching, and we
          forget it as soon as the search is done.
        </p>
      </header>

      <section className="surface-panel p-4">
        {stage === "idle" && (
          <div className="text-center space-y-4 py-8">
            <Camera
              className="mx-auto h-12 w-12 text-text-tertiary"
              aria-hidden
            />
            <p className="text-sm text-text-secondary">
              We&apos;ll ask for camera permission once.
            </p>
            <button
              type="button"
              onClick={() => void startCamera()}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-text-inverse hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            >
              <Camera className="h-4 w-4" aria-hidden />
              Start camera
            </button>
          </div>
        )}

        {stage === "camera-error" && featureDisabled && (
          <div className="space-y-3 py-6 text-center max-w-xl mx-auto">
            <p className="text-sm font-semibold text-text-primary">
              {featureDisabled.reason === "disabled"
                ? "Photo search isn't enabled here"
                : "Photo search isn't available right now"}
            </p>
            <p className="text-xs text-text-secondary">
              {featureDisabled.detail}
            </p>
            <Link
              href={`/g/${slug}/people`}
              className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            >
              Browse people in this gallery
            </Link>
          </div>
        )}

        {stage === "camera-error" && !featureDisabled && cameraError && (
          <CameraErrorPanel
            error={cameraError}
            onRetry={() => void startCamera()}
          />
        )}

        {(stage === "preview" || stage === "searching") && (
          <div className="space-y-3">
            <div className="relative mx-auto aspect-[4/3] max-w-xl overflow-hidden rounded-2xl border border-border-subtle bg-surface-scrim-strong">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                autoPlay
                aria-label="Camera preview"
              />
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
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-text-inverse hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
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
                <p className="text-[11px] text-text-tertiary">
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

        <canvas ref={canvasRef} className="hidden" aria-hidden />
      </section>

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
              className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
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
          <div className="flex justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try again
            </button>
            <Link
              href={`/g/${slug}/people`}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-text-inverse hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            >
              Browse all people
            </Link>
          </div>
        </section>
      )}

      {stage === "result-found" && searchResult?.found && (
        <section className="space-y-4">
          <div className="surface-panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                Match
              </p>
              <p className="text-sm font-semibold text-text-primary">
                {searchResult.cluster_name?.trim() || "Found you"}
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
                className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Search another face
              </button>
              {searchResult.cluster_label && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/g/${slug}/people/${searchResult.cluster_label}`,
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-text-inverse hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                >
                  Open person page
                </button>
              )}
            </div>
          </div>

          {searchResult.asset_ids.length === 0 ? (
            <div className="surface-panel p-6 text-center text-sm text-text-secondary">
              Match found but no photo previews could be loaded.
            </div>
          ) : (
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
              role="list"
              aria-label="Photos matching this face"
            >
              {(searchResult.assets ?? []).map((asset) => (
                <Link
                  key={asset.id}
                  href={`/g/${slug}/photo/${asset.id}`}
                  className="group block aspect-square overflow-hidden rounded-xl border border-border-subtle bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-accent"
                  role="listitem"
                  aria-label={`Photo ${asset.id}`}
                >
                  <DecryptedThumb
                    asset={asset}
                    alt=""
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                  />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// Same UI as the dashboard CameraErrorPanel but local-copied — see the
// header comment for the import-wall rationale.
function CameraErrorPanel({
  error,
  onRetry,
}: {
  error: CameraError;
  onRetry: () => void;
}) {
  let title = "Camera unavailable";
  let lead: React.ReactNode = null;
  let steps: React.ReactNode = null;
  let retryLabel = "Try again";

  if (error.kind === "insecure-context") {
    title = "Camera requires HTTPS";
    lead = (
      <p className="text-sm text-text-secondary">
        Browsers only allow camera access on HTTPS pages. Open this gallery link
        over HTTPS and try again.
      </p>
    );
    retryLabel = "I'm on HTTPS now — retry";
  } else if (error.kind === "no-api") {
    title = "Camera not supported";
    lead = (
      <p className="text-sm text-text-secondary">
        This browser doesn&apos;t expose a camera API. Try the latest Chrome,
        Safari, Edge, or Firefox.
      </p>
    );
  } else if (error.kind === "permission-denied") {
    title = "Camera access blocked";
    lead = (
      <p className="text-sm text-text-secondary">
        The browser refused camera access. Either this site is blocked in your
        browser settings, or your operating system isn&apos;t letting the
        browser use the camera.
      </p>
    );
    steps = (
      <ul className="list-disc pl-5 space-y-1 mt-1 text-xs text-text-secondary">
        <li>
          Click the lock or camera icon in your address bar → set Camera to{" "}
          <em>Allow</em>, then reload.
        </li>
        <li>
          On macOS: System Settings → Privacy &amp; Security → Camera → enable
          your browser, then reopen the browser.
        </li>
        <li>
          On Windows: Settings → Privacy &amp; Security → Camera → enable
          &ldquo;Let apps access your camera.&rdquo;
        </li>
      </ul>
    );
  } else if (error.kind === "no-device") {
    title = "No camera found";
    lead = (
      <p className="text-sm text-text-secondary">
        The browser didn&apos;t find a usable camera. Plug one in (or enable the
        built-in one) and try again.
      </p>
    );
  } else if (error.kind === "in-use") {
    title = "Camera is busy";
    lead = (
      <p className="text-sm text-text-secondary">
        Another application appears to be using the camera (Zoom, Teams,
        FaceTime, OBS, another browser tab). Close it and try again.
      </p>
    );
  } else {
    lead = (
      <p className="text-sm text-text-secondary">
        {error.rawMessage || "Permission denied."}
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
      {error.rawName && (
        <p className="text-center text-[11px] text-text-tertiary font-mono">
          {error.rawName}: {error.rawMessage}
        </p>
      )}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {retryLabel}
        </button>
      </div>
    </div>
  );
}
