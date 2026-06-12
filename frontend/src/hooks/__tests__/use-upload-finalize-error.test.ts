import { describe, expect, it } from "vitest";

import {
  ChunkUploadError,
  finalizeErrorRequiresReselect,
  isNonRetryableFinalizeCode,
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
    const msg = uploadFinalizeErrorMessage(422, { error: "SCAN_HASH_MISMATCH" });
    expect(msg).toMatch(/failed the security-scan integrity check/i);
    expect(msg).toMatch(/re-select the file/i);
    // Never leak the opaque status-only fallback for a known code.
    expect(msg).not.toMatch(/^Chunk upload failed/i);
  });

  it.each([
    ["ENCRYPTED_MEDIA_HASH_MISMATCH", /integrity check/i],
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
    expect(uploadFinalizeErrorMessage(500, {})).toBe("Chunk upload failed: 500");
  });
});

describe("finalize code classifiers", () => {
  it("treats all content/scan rejections as non-retryable", () => {
    for (const code of [
      "SCAN_HASH_MISMATCH",
      "ENCRYPTED_MEDIA_HASH_MISMATCH",
      "SCAN_MANIFEST_INVALID",
      "SCAN_MANIFEST_REQUIRED",
      "VIDEO_NOT_ALLOWED",
      "UNSUPPORTED_UPLOAD_TYPE",
    ]) {
      expect(isNonRetryableFinalizeCode(code)).toBe(true);
    }
  });

  it("does not treat unknown / transient codes as non-retryable", () => {
    expect(isNonRetryableFinalizeCode(undefined)).toBe(false);
    expect(isNonRetryableFinalizeCode("RATE_LIMITED")).toBe(false);
  });

  it("flags hash/manifest failures for re-selection but not type rejections", () => {
    expect(finalizeErrorRequiresReselect("SCAN_HASH_MISMATCH")).toBe(true);
    expect(finalizeErrorRequiresReselect("ENCRYPTED_MEDIA_HASH_MISMATCH")).toBe(
      true,
    );
    expect(finalizeErrorRequiresReselect("SCAN_MANIFEST_INVALID")).toBe(true);
    // A disallowed type is permanent — re-selecting the same file won't help.
    expect(finalizeErrorRequiresReselect("VIDEO_NOT_ALLOWED")).toBe(false);
    expect(finalizeErrorRequiresReselect("UNSUPPORTED_UPLOAD_TYPE")).toBe(false);
    expect(finalizeErrorRequiresReselect(undefined)).toBe(false);
  });
});

describe("ChunkUploadError", () => {
  it("carries the status + code and renders the mapped message", () => {
    const err = new ChunkUploadError(422, { error: "SCAN_HASH_MISMATCH" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ChunkUploadError");
    expect(err.status).toBe(422);
    expect(err.code).toBe("SCAN_HASH_MISMATCH");
    expect(err.message).toMatch(/security-scan integrity check/i);
  });

  it("degrades to the bare status for an empty body (transport failure)", () => {
    const err = new ChunkUploadError(503, {});
    expect(err.code).toBeUndefined();
    expect(err.message).toBe("Chunk upload failed: 503");
  });
});
