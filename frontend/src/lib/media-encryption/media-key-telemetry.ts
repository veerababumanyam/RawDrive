"use client";

import {
  MEDIA_KEY_IMPORT_EMPTY_MESSAGE,
  MEDIA_KEY_IMPORT_INVALID_MESSAGE,
  MEDIA_KEY_IMPORT_WRONG_GALLERY_MESSAGE,
} from "./media-key-store";

export const MEDIA_KEY_RECOVERY_TELEMETRY_EVENT =
  "rawdrive:media-key-recovery-telemetry";

export type MediaKeyRecoveryTelemetryName =
  | "key_recovery_opened"
  | "key_recovery_import_attempt"
  | "key_recovery_import_success"
  | "key_recovery_import_empty"
  | "key_recovery_import_invalid"
  | "key_recovery_import_mismatch";

export type MediaKeyRecoveryInputKind =
  | "empty"
  | "secure_url"
  | "fragment"
  | "query"
  | "raw_key";

export type MediaKeyRecoveryTelemetryDetail = {
  name: MediaKeyRecoveryTelemetryName;
  galleryId?: string;
  expectedKeyCount?: number;
  keyGroupCount?: number;
  inputKind?: MediaKeyRecoveryInputKind;
};

export function classifyMediaKeyRecoveryInput(
  input: string,
): MediaKeyRecoveryInputKind {
  const trimmed = input.trim();
  if (!trimmed) return "empty";
  try {
    const parsed = new URL(trimmed);
    if (parsed.hash.includes("rd_key=") || parsed.searchParams.has("rd_key")) {
      return "secure_url";
    }
  } catch {
    // Not a full URL; continue with fragment/query/raw classification.
  }
  if (trimmed.startsWith("#")) return "fragment";
  if (trimmed.startsWith("?") || trimmed.includes("rd_key=")) return "query";
  return "raw_key";
}

export function redactMediaKeyRecoveryInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.searchParams.has("rd_key")) {
      parsed.searchParams.set("rd_key", "[redacted]");
    }
    if (parsed.hash.includes("rd_key=")) {
      parsed.hash = redactFragmentOrQuery(parsed.hash);
    }
    return parsed.toString();
  } catch {
    if (trimmed.startsWith("#") || trimmed.startsWith("?") || trimmed.includes("rd_key=")) {
      return redactFragmentOrQuery(trimmed);
    }
    return "[raw-key-redacted]";
  }
}

export function mediaKeyRecoveryTelemetryNameForError(
  error: string,
): MediaKeyRecoveryTelemetryName {
  if (error === MEDIA_KEY_IMPORT_EMPTY_MESSAGE) {
    return "key_recovery_import_empty";
  }
  if (error === MEDIA_KEY_IMPORT_WRONG_GALLERY_MESSAGE) {
    return "key_recovery_import_mismatch";
  }
  if (error === MEDIA_KEY_IMPORT_INVALID_MESSAGE) {
    return "key_recovery_import_invalid";
  }
  return "key_recovery_import_invalid";
}

export function trackMediaKeyRecovery(
  name: MediaKeyRecoveryTelemetryName,
  detail: Omit<MediaKeyRecoveryTelemetryDetail, "name"> = {},
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<MediaKeyRecoveryTelemetryDetail>(
      MEDIA_KEY_RECOVERY_TELEMETRY_EVENT,
      {
        detail: {
          name,
          galleryId: detail.galleryId,
          expectedKeyCount: detail.expectedKeyCount,
          keyGroupCount: detail.keyGroupCount,
          inputKind: detail.inputKind,
        },
      },
    ),
  );
}

function redactFragmentOrQuery(value: string): string {
  const prefix = value.startsWith("#") ? "#" : value.startsWith("?") ? "?" : "";
  const params = new URLSearchParams(value.replace(/^[#?]/, ""));
  if (!params.has("rd_key")) return value;
  params.set("rd_key", "[redacted]");
  return `${prefix}${params.toString()}`;
}
