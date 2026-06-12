import { describe, expect, it } from "vitest";

import {
  ChunkUploadError,
  finalizeErrorRequiresReselect,
  finalizeHashRetryDisposition,
  finalizeRetryExhaustedMessage,
  isNonRetryableFinalizeCode,
  isRetryableHashMismatchCode,
  MAX_FINALIZE_HASH_RETRIES,
  uploadFinalizeErrorMessage,
} from "../use-upload";

describe("uploadFinalizeErrorMessage", () => {
  it("prefers a server-supplied message verbatim", () => {
    expect(
      uploadFinalizeErrorMessage(422, {
        error: "SCAN_HASH_MISMATCH",
        message: "Custom server sentence.",
      }),
    ).toBe("Custom server sentence.");
  });

  it("translates the Tier-D hash-mismatch code into an actionable sentence", () => {
    const msg = uploadFinalizeErrorMessage(422, {
      error: "SCAN_HASH_MISMATCH",
    });
    expect(msg).toMatch(/could not verify this upload/i);
    expect(msg).toMatch(/retry will rescan/i);
    // Never leak the opaque status-only fallback for a known code.
    expect(msg).not.toMatch(/^Chunk upload failed/i);
  });

  it("frames a stale encrypted hash-mismatch code as retryable, not re-select", () => {
    const msg = uploadFinalizeErrorMessage(422, {
      error: "ENCRYPTED_MEDIA_HASH_MISMATCH",
    });
    expect(msg).toMatch(/could not verify this upload/i);
    expect(msg).toMatch(/retry will rescan/i);
    expect(msg).not.toMatch(/encrypted upload/i);
    expect(msg).not.toMatch(/re-encrypt/i);
    // Legacy/stale in-flight encrypted sessions can still return this code.
    // It remains retryable so a user is not forced to re-select immediately.
    expect(msg).not.toMatch(/re-select/i);
  });

  it.each([
    ["SCAN_MANIFEST_INVALID", /could not verify this file's security scan/i],
    ["SCAN_MANIFEST_REQUIRED", /could not verify this file's security scan/i],
    ["VIDEO_NOT_ALLOWED", /video files are not supported/i],
    ["UNSUPPORTED_UPLOAD_TYPE", /still-image uploads only/i],
  ])("maps %s to a readable reason", (code, pattern) => {
    expect(uploadFinalizeErrorMessage(422, { error: code })).toMatch(pattern);
  });

  it("falls back to the raw code for an unknown error", () => {
    expect(uploadFinalizeErrorMessage(422, { error: "SOMETHING_NEW" })).toBe(
      "Upload failed validation: SOMETHING_NEW",
    );
  });

  it("falls back to the bare status when no body is present", () => {
    expect(uploadFinalizeErrorMessage(500, {})).toBe(
      "Chunk upload failed: 500",
    );
  });
});

describe("finalize code classifiers", () => {
  it("treats permanent content/scan rejections as non-retryable", () => {
    for (const code of [
      "SCAN_MANIFEST_INVALID",
      "SCAN_MANIFEST_REQUIRED",
      "VIDEO_NOT_ALLOWED",
      "UNSUPPORTED_UPLOAD_TYPE",
    ]) {
      expect(isNonRetryableFinalizeCode(code)).toBe(true);
    }
  });

  it("does not treat hash mismatches or transient codes as non-retryable", () => {
    expect(isNonRetryableFinalizeCode(undefined)).toBe(false);
    expect(isNonRetryableFinalizeCode("RATE_LIMITED")).toBe(false);
    expect(isNonRetryableFinalizeCode("SCAN_HASH_MISMATCH")).toBe(false);
    // Both hash-mismatch codes recover on retry (re-screen / re-read), so
    // neither is a hard non-retryable rejection.
    expect(isNonRetryableFinalizeCode("ENCRYPTED_MEDIA_HASH_MISMATCH")).toBe(
      false,
    );
  });

  it("only flags unrecoverable manifest failures for re-selection", () => {
    expect(finalizeErrorRequiresReselect("SCAN_HASH_MISMATCH")).toBe(false);
    // Encrypted hash mismatch is now retryable up to the cap — its first
    // failures must not force an immediate re-select.
    expect(finalizeErrorRequiresReselect("ENCRYPTED_MEDIA_HASH_MISMATCH")).toBe(
      false,
    );
    expect(finalizeErrorRequiresReselect("SCAN_MANIFEST_INVALID")).toBe(true);
    // A disallowed type is permanent — re-selecting the same file won't help.
    expect(finalizeErrorRequiresReselect("VIDEO_NOT_ALLOWED")).toBe(false);
    expect(finalizeErrorRequiresReselect("UNSUPPORTED_UPLOAD_TYPE")).toBe(
      false,
    );
    expect(finalizeErrorRequiresReselect(undefined)).toBe(false);
  });
});

describe("retryable hash-mismatch handling", () => {
  it("recognizes both hash-mismatch codes as retryable, nothing else", () => {
    expect(isRetryableHashMismatchCode("SCAN_HASH_MISMATCH")).toBe(true);
    expect(isRetryableHashMismatchCode("ENCRYPTED_MEDIA_HASH_MISMATCH")).toBe(
      true,
    );
    expect(isRetryableHashMismatchCode("SCAN_MANIFEST_INVALID")).toBe(false);
    expect(isRetryableHashMismatchCode("VIDEO_NOT_ALLOWED")).toBe(false);
    expect(isRetryableHashMismatchCode("RATE_LIMITED")).toBe(false);
    expect(isRetryableHashMismatchCode(undefined)).toBe(false);
  });

  it("exposes a sane attempt cap (at least two tries before forcing re-select)", () => {
    expect(MAX_FINALIZE_HASH_RETRIES).toBeGreaterThanOrEqual(2);
  });

  it.each(["SCAN_HASH_MISMATCH", "ENCRYPTED_MEDIA_HASH_MISMATCH"])(
    "keeps %s retryable until the attempt cap, then forces re-select",
    (code) => {
      // Under the cap: offer Retry, never force re-select.
      for (let prior = 0; prior < MAX_FINALIZE_HASH_RETRIES - 1; prior += 1) {
        expect(finalizeHashRetryDisposition(code, prior)).toEqual({
          retryable: true,
          requiresReselect: false,
        });
      }
      // The attempt that reaches the cap flips to a terminal re-select.
      expect(
        finalizeHashRetryDisposition(code, MAX_FINALIZE_HASH_RETRIES - 1),
      ).toEqual({ retryable: false, requiresReselect: true });
      // Anything beyond the cap stays terminal.
      expect(
        finalizeHashRetryDisposition(code, MAX_FINALIZE_HASH_RETRIES + 3),
      ).toEqual({ retryable: false, requiresReselect: true });
    },
  );

  it("never treats a non-hash code as a retryable hash mismatch", () => {
    expect(finalizeHashRetryDisposition("RATE_LIMITED", 0)).toEqual({
      retryable: false,
      requiresReselect: false,
    });
    expect(finalizeHashRetryDisposition(undefined, 5)).toEqual({
      retryable: false,
      requiresReselect: false,
    });
  });

  it("produces a re-select sentence that names the file once retries are exhausted", () => {
    const msg = finalizeRetryExhaustedMessage("Wedding (42).jpg");
    expect(msg).toContain("Wedding (42).jpg");
    expect(msg).toMatch(/re-select/i);
    expect(msg).toMatch(/after several attempts/i);
  });
});

describe("ChunkUploadError", () => {
  it("carries the status + code and renders the mapped message", () => {
    const err = new ChunkUploadError(422, { error: "SCAN_HASH_MISMATCH" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ChunkUploadError");
    expect(err.status).toBe(422);
    expect(err.code).toBe("SCAN_HASH_MISMATCH");
    expect(err.message).toMatch(/retry will rescan/i);
  });

  it("degrades to the bare status for an empty body (transport failure)", () => {
    const err = new ChunkUploadError(503, {});
    expect(err.code).toBeUndefined();
    expect(err.message).toBe("Chunk upload failed: 503");
  });
});
