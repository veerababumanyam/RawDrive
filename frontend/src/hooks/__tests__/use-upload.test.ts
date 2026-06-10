import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("useUpload", () => {
  it("exports CHUNK_SIZE as 8MB", async () => {
    const mod = await import("../use-upload");
    expect(mod.useUpload).toBeDefined();
    expect(typeof mod.useUpload).toBe("function");
    expect(mod.CHUNK_SIZE).toBe(8 * 1024 * 1024);
  });

  it("useUpload accepts apiUrl, token, and an optional destination binding", async () => {
    const { useUpload } = await import("../use-upload");
    // S3-G4: the third param is the optional { galleryId, albumId } destination
    // so CreateSession can bind the upload to a gallery for server-side linking.
    expect(useUpload.length).toBe(3); // apiUrl, token, destination?
  });

  it("snapshots gallery upload context onto each queued file for route changes", async () => {
    const source = await readFile(
      join(process.cwd(), "src/hooks/use-upload.ts"),
      "utf8",
    );

    expect(source).toContain("type QueuedUploadItem");
    expect(source).toContain("uploadDestination?: UploadDestination");
    expect(source).toContain("uploadEncryption?: UploadEncryption | null");
    expect(source).toContain("uploadOnTermsRequired?");
    expect(source).toContain(
      "const currentDestination = destinationRef.current",
    );
    expect(source).toContain("uploadDestination: currentDestination");
    expect(source).toContain("const dest = itemDestination");
    expect(source).toContain("galleryId: itemDestination?.galleryId");
  });

  it("exposes pause controls for all and per-photo upload flow", async () => {
    const source = await readFile(
      join(process.cwd(), "src/hooks/use-upload.ts"),
      "utf8",
    );
    expect(source).toContain("pauseAll");
    expect(source).toContain("resumeAll");
    expect(source).toContain("const pause = useCallback");
    expect(source).toContain("const resume = useCallback");
  });

  it("caps active uploads to a small worker pool", async () => {
    const { MAX_CONCURRENT_UPLOADS } = await import("../use-upload");
    expect(MAX_CONCURRENT_UPLOADS).toBe(4);
  });

  it("retries transient upload failures for slow/mobile networks", async () => {
    const { MAX_CHUNK_UPLOAD_ATTEMPTS, isRetryableUploadStatus } =
      await import("../use-upload");
    expect(MAX_CHUNK_UPLOAD_ATTEMPTS).toBeGreaterThanOrEqual(6);
    expect(isRetryableUploadStatus(408)).toBe(true);
    expect(isRetryableUploadStatus(429)).toBe(true);
    expect(isRetryableUploadStatus(500)).toBe(true);
    expect(isRetryableUploadStatus(503)).toBe(true);
    expect(isRetryableUploadStatus(400)).toBe(false);
    expect(isRetryableUploadStatus(401)).toBe(false);
    expect(isRetryableUploadStatus(413)).toBe(false);
  });

  it("uses bounded exponential backoff and honors Retry-After", async () => {
    const { uploadRetryDelayMs } = await import("../use-upload");
    expect(uploadRetryDelayMs(1)).toBe(1000);
    expect(uploadRetryDelayMs(2)).toBe(2000);
    expect(uploadRetryDelayMs(10)).toBe(15000);
    expect(uploadRetryDelayMs(1, "3")).toBe(3000);
  });

  it("has an explicit face indexing phase for encrypted uploads", async () => {
    const source = await readFile(
      join(process.cwd(), "src/hooks/use-upload.ts"),
      "utf8",
    );
    expect(source).toContain("uploadAssetFaceIndexImage");
    expect(source).toContain('status: "indexing_faces"');
    expect(source).toContain("faceIndexImage");
    expect(source).toContain("FaceID indexing failed after upload completion");
  });

  it("flags a 503 face-index failure as honest 'unavailable', not a swallowed warn (3e)", async () => {
    const { classifyFaceIndexFailure } = await import("../use-upload");
    const { FaceIndexUnavailableError } = await import("@/lib/api/ai");

    // A 503/unavailable from the sidecar surfaces an honest unavailable signal
    // the caller can flag on the (still-complete) row.
    expect(
      classifyFaceIndexFailure(new FaceIndexUnavailableError()).unavailable,
    ).toBe(true);

    // A transient/size failure (e.g. 502/413) is NOT "unavailable" — it stays a
    // quiet warn and the explicit Sync-Now path handles downscale/retry.
    expect(
      classifyFaceIndexFailure(new Error("502 Bad Gateway")).unavailable,
    ).toBe(false);
    expect(
      classifyFaceIndexFailure(new Error("image file too large")).unavailable,
    ).toBe(false);
  });

  it("carries the honest faceIndexUnavailable flag onto the complete row (3e)", async () => {
    const source = await readFile(
      join(process.cwd(), "src/hooks/use-upload.ts"),
      "utf8",
    );
    // The classifier result is threaded into the final complete update so the
    // UI can show it instead of the upload silently no-indexing.
    expect(source).toContain("classifyFaceIndexFailure");
    expect(source).toContain("faceIndexUnavailable,");
  });

  it("parses server upload offsets for resumable recovery", async () => {
    const { parseUploadOffsetHeader } = await import("../use-upload");
    expect(parseUploadOffsetHeader("10485760")).toBe(10485760);
    expect(parseUploadOffsetHeader("")).toBeNull();
    expect(parseUploadOffsetHeader("-1")).toBeNull();
    expect(parseUploadOffsetHeader("abc")).toBeNull();
  });

  it("threads the filename into the screener's non-worker fallback (CD5b)", async () => {
    // CD5b: the screener disambiguates TIFF-based RAW by extension, so
    // runScreener must forward file.name as declaredName on the direct-screen
    // fallback path (the worker path sends filename metadata with the bytes).
    const source = await readFile(
      join(process.cwd(), "src/hooks/use-upload.ts"),
      "utf8",
    );
    expect(source).toContain("declaredName: file.name");
  });

  it("classifies browser file-read permission failures with reselection guidance", async () => {
    const { fileReadPermissionRecoveryMessage, isFileReadPermissionError } =
      await import("../use-upload");

    expect(
      isFileReadPermissionError(
        new DOMException(
          "The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.",
          "NotReadableError",
        ),
      ),
    ).toBe(true);
    expect(isFileReadPermissionError(new Error("decode failed"))).toBe(false);
    expect(fileReadPermissionRecoveryMessage("IMG_7634.JPG")).toContain(
      "Re-select the files or folder",
    );
  });

  it("keeps folder batches moving after one file fails", async () => {
    const source = await readFile(
      join(process.cwd(), "src/hooks/use-upload.ts"),
      "utf8",
    );

    expect(source).toContain("requiresReselect: fileReadPermissionError");
    expect(source).toContain(
      "activeUploads.current = Math.max(0, activeUploads.current - 1)",
    );
    expect(source).toContain("pumpQueue.current()");
  });

  it("releases backend upload sessions when uploads fail or are cancelled", async () => {
    const source = await readFile(
      join(process.cwd(), "src/hooks/use-upload.ts"),
      "utf8",
    );

    expect(source).toContain("cancelUploadSession");
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("uploadSessionIds.current.set");
    expect(source).toContain("uploadSessionIds.current.get(id)");
    expect(source).toContain("Array.from(uploadSessionIds.current.values())");
    expect(source).toContain("!uploadSessionFinished");
  });

  it("surfaces gallery upload gate 403s as blocked rows", async () => {
    const source = await readFile(
      join(process.cwd(), "src/hooks/use-upload.ts"),
      "utf8",
    );

    expect(source).toContain("gallery_upload_window_closed");
    expect(source).toContain("gallery_event_storage_quota_exceeded");
    expect(source).toContain("This gallery is view-only");
    expect(source).toContain(
      "This gallery has reached its configured storage quota",
    );
  });

  it("keeps backend terms-gate failures retryable after acceptance", async () => {
    const source = await readFile(
      join(process.cwd(), "src/hooks/use-upload.ts"),
      "utf8",
    );
    const termsGateStart = source.indexOf(
      'errorBody.error === "TERMS_NOT_ACCEPTED"',
    );
    const nextGateStart = source.indexOf(
      "// Event gallery upload gates",
      termsGateStart,
    );
    const termsGateSource = source.slice(termsGateStart, nextGateStart);

    expect(termsGateStart).toBeGreaterThan(-1);
    expect(nextGateStart).toBeGreaterThan(termsGateStart);
    expect(termsGateSource).toContain('status: "error"');
    expect(termsGateSource).toContain("requiresReselect: false");
    expect(termsGateSource).toContain("retry this upload");
    expect(termsGateSource).not.toContain('status: "blocked"');
  });
});
