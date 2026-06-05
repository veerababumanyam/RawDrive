"use client";

/**
 * FaceIDGate — GAL-FR-107 / 108 / 109
 *
 * Guest "Find Me" entry gate. Workflow (unencrypted galleries):
 *   1. Consent modal explaining biometric handling (GAL-FR-107).
 *   2. On consent, open the device camera and capture a self-portrait.
 *   3. POST the captured image to /api/v1/public/galleries/{slug}/photo-search.
 *      The server runs the SAME insightface buffalo_l model that indexed the
 *      gallery and returns the gallery-scoped asset IDs the guest appears in
 *      (GAL-FR-108 — cross-gallery leakage is impossible at the SQL layer).
 *   4. Always offer "Browse all photos" (GAL-FR-109) so a zero-match outcome
 *      never traps the visitor.
 *
 * Why the server, not the browser: an earlier version computed a face
 * "embedding" client-side (face-api.js, or a 512-bin pixel histogram when the
 * library was absent) and posted the vector to /face-match. Those vectors are
 * not in the same space as the server's buffalo_l index — wrong dimensions, or
 * not a face embedding at all — so matches were wrong (the histogram returned
 * colour-similar photos as "your photos") or failed outright. The accurate path
 * sends the image and lets the server embed it with the very model that built
 * the index.
 *
 * Encrypted galleries: an end-to-end-encrypted gallery has no server-side face
 * index — the server only ever sees ciphertext and cannot detect faces — so
 * face search cannot work there yet. The gate shows an honest "not available"
 * state instead of a pseudo-match. (This lifts when the client-side buffalo_l
 * indexing slice ships and the gallery has a real index.)
 *
 * Privacy stance: the selfie is sent to the server only to find matches in this
 * one gallery and is not stored. The camera stream stops as soon as the snapshot
 * is taken. The consent text states this contract truthfully.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { searchPublicFaceInGallery } from "@/lib/api/ai";

interface Props {
  slug: string;
  /**
   * The gallery is end-to-end encrypted. The server holds only ciphertext and
   * has no face index for it, so server-side face search is unavailable — the
   * gate shows an honest state instead of a misleading pseudo-match.
   */
  encrypted?: boolean;
  /**
   * Share-link access scope the visitor arrived with (`?share=`, plus `?ws=` on
   * a studio subdomain). Forwarded on the photo-search POST so a no-PIN share
   * arrival self-authorizes via tryBindShareSession instead of depending on the
   * host-only gallery_session cookie, which is absent on this path (issue #175).
   */
  shareToken?: string | null;
  ws?: string | null;
  /** Called with matched asset IDs when face match succeeds. */
  onMatched: (assetIds: string[]) => void;
  /** Called when the user clicks "Browse all photos" (GAL-FR-109). */
  onFallback: () => void;
}

type Step = "consent" | "camera" | "matching" | "error" | "unavailable";

export function FaceIDGate({
  slug,
  encrypted = false,
  shareToken,
  ws,
  onMatched,
  onFallback,
}: Props) {
  const [step, setStep] = useState<Step>("consent");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => stopStream, [stopStream]);

  const grantConsentAndOpenCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStep("camera");
    } catch {
      setError("Camera access denied. You can still browse all photos.");
      setStep("error");
    }
  };

  const captureAndMatch = async () => {
    const video = videoRef.current;
    if (!video) return;
    setStep("matching");
    try {
      // Capture the current camera frame as a JPEG and send the IMAGE to the
      // server. The server runs the same buffalo_l model that indexed the
      // gallery, so the embedding is in the correct space — unlike the old
      // client-side extraction this replaces.
      const blob = await captureFrameBlob(video);
      stopStream();

      const result = await searchPublicFaceInGallery(slug, blob, {
        shareToken,
        ws,
      });
      onMatched(result.asset_ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Face match failed");
      setStep("error");
      stopStream();
    }
  };

  // Encrypted galleries can never reach the camera/match flow — render the
  // honest "unavailable" state regardless of internal step.
  const view: Step = encrypted ? "unavailable" : step;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim-strong/80 glass-blur-medium p-4">
      <div className="w-full max-w-lg rounded-3xl bg-surface-raised border border-border-subtle p-6 shadow-2xl">
        {view === "consent" && (
          <>
            <h2 className="text-xl font-semibold text-text-primary">
              Find yourself in these photos
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              We can show you just the photos you appear in. We&rsquo;ll take a
              selfie with your camera and send it to our server to match your
              face against the people in this gallery.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-text-secondary">
              <li>• Your selfie is used only to find your photos in this gallery.</li>
              <li>• We don&rsquo;t store your selfie after matching.</li>
              <li>• You can skip this and browse all photos instead.</li>
            </ul>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={grantConsentAndOpenCamera}
                className="flex-1 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-inverse hover:opacity-90"
              >
                I agree — use camera
              </button>
              <button
                type="button"
                onClick={onFallback}
                className="flex-1 rounded-xl border border-border-subtle px-4 py-2.5 text-sm text-text-primary hover:bg-surface-sunken"
              >
                Browse all photos
              </button>
            </div>
          </>
        )}

        {view === "camera" && (
          <>
            <h2 className="text-lg font-semibold text-text-primary">
              Take a selfie
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Look at the camera, then capture. We&rsquo;ll use this selfie only
              to find your photos.
            </p>
            <div className="mt-4 overflow-hidden rounded-2xl bg-surface-scrim-strong aspect-[4/3]">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={captureAndMatch}
                className="flex-1 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-inverse hover:opacity-90"
              >
                Capture &amp; find my photos
              </button>
              <button
                type="button"
                onClick={() => {
                  stopStream();
                  onFallback();
                }}
                className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm text-text-primary hover:bg-surface-sunken"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {view === "matching" && (
          <div className="flex flex-col items-center py-8">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
            <p className="mt-4 text-sm text-text-secondary">
              Matching your face against this gallery…
            </p>
          </div>
        )}

        {view === "error" && (
          <>
            <h2 className="text-lg font-semibold text-text-primary">
              We couldn&rsquo;t match your face
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              {error ||
                "Something went wrong. You can still browse all photos in this gallery."}
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={onFallback}
                className="flex-1 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-inverse hover:opacity-90"
              >
                Browse all photos
              </button>
              <button
                type="button"
                onClick={() => setStep("consent")}
                className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm text-text-primary hover:bg-surface-sunken"
              >
                Try again
              </button>
            </div>
          </>
        )}

        {view === "unavailable" && (
          <>
            <h2 className="text-xl font-semibold text-text-primary">
              Face search isn&rsquo;t available here yet
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              This gallery is end-to-end encrypted to keep your photos private,
              so we can&rsquo;t match faces on our server. You can still browse
              all the photos in this gallery.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onFallback}
                className="flex-1 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-inverse hover:opacity-90"
              >
                Browse all photos
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * captureFrameBlob — grab the current camera frame as a JPEG Blob to send to
 * the server's /photo-search endpoint (which embeds it with buffalo_l). This
 * replaces the old client-side embedding extraction, whose vectors were not in
 * the server index's embedding space.
 */
async function captureFrameBlob(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not capture the photo. Please try again.");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not capture the photo. Please try again.")),
      "image/jpeg",
      0.9,
    );
  });
}
