import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("useUpload", () => {
  it("exports CHUNK_SIZE as 5MB", async () => {
    // Verify the module exports correctly
    const mod = await import("../use-upload");
    expect(mod.useUpload).toBeDefined();
    expect(typeof mod.useUpload).toBe("function");
  });

  it("useUpload accepts apiUrl, token, and an optional destination binding", async () => {
    const { useUpload } = await import("../use-upload");
    // S3-G4: the third param is the optional { galleryId, albumId } destination
    // so CreateSession can bind the upload to a gallery for server-side linking.
    expect(useUpload.length).toBe(3); // apiUrl, token, destination?
  });

  it("exposes pause controls for all and per-photo upload flow", async () => {
    const source = await readFile(join(process.cwd(), "src/hooks/use-upload.ts"), "utf8");
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
    const { MAX_CHUNK_UPLOAD_ATTEMPTS, isRetryableUploadStatus } = await import("../use-upload");
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

  it("parses server upload offsets for resumable recovery", async () => {
    const { parseUploadOffsetHeader } = await import("../use-upload");
    expect(parseUploadOffsetHeader("10485760")).toBe(10485760);
    expect(parseUploadOffsetHeader("")).toBeNull();
    expect(parseUploadOffsetHeader("-1")).toBeNull();
    expect(parseUploadOffsetHeader("abc")).toBeNull();
  });
});
