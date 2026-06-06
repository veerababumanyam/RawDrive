import { beforeEach, describe, expect, it } from "vitest";
import {
  classifyMediaKeyRecoveryInput,
  MEDIA_KEY_RECOVERY_TELEMETRY_EVENT,
  mediaKeyRecoveryTelemetryNameForError,
  redactMediaKeyRecoveryInput,
  trackMediaKeyRecovery,
} from "../media-key-telemetry";
import {
  MEDIA_KEY_IMPORT_EMPTY_MESSAGE,
  MEDIA_KEY_IMPORT_INVALID_MESSAGE,
  MEDIA_KEY_IMPORT_WRONG_GALLERY_MESSAGE,
} from "../media-key-store";

describe("media key recovery telemetry", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/g/wedding");
  });

  it("classifies recovery inputs without retaining the value", () => {
    expect(classifyMediaKeyRecoveryInput("")).toBe("empty");
    expect(classifyMediaKeyRecoveryInput("#rd_key=secret")).toBe("fragment");
    expect(classifyMediaKeyRecoveryInput("?rd_key=secret")).toBe("query");
    expect(classifyMediaKeyRecoveryInput("rd_key=secret")).toBe("query");
    expect(
      classifyMediaKeyRecoveryInput(
        "https://app.rawdrive.test/g/wedding#rd_key=secret",
      ),
    ).toBe("secure_url");
    expect(classifyMediaKeyRecoveryInput("raw-secret")).toBe("raw_key");
  });

  it("redacts recovery inputs before any diagnostic use", () => {
    expect(
      redactMediaKeyRecoveryInput(
        "https://app.rawdrive.test/g/wedding?rd_key=query-secret#rd_key=hash-secret",
      ),
    ).not.toContain("secret");
    expect(redactMediaKeyRecoveryInput("#rd_key=hash-secret")).not.toContain(
      "hash-secret",
    );
    expect(redactMediaKeyRecoveryInput("raw-secret")).toBe(
      "[raw-key-redacted]",
    );
  });

  it("maps import errors to coarse outcome names", () => {
    expect(mediaKeyRecoveryTelemetryNameForError(MEDIA_KEY_IMPORT_EMPTY_MESSAGE)).toBe(
      "key_recovery_import_empty",
    );
    expect(
      mediaKeyRecoveryTelemetryNameForError(MEDIA_KEY_IMPORT_INVALID_MESSAGE),
    ).toBe("key_recovery_import_invalid");
    expect(
      mediaKeyRecoveryTelemetryNameForError(
        MEDIA_KEY_IMPORT_WRONG_GALLERY_MESSAGE,
      ),
    ).toBe("key_recovery_import_mismatch");
  });

  it("emits no pasted URL, fragment, or raw key material", () => {
    const events: unknown[] = [];
    window.addEventListener(MEDIA_KEY_RECOVERY_TELEMETRY_EVENT, (event) => {
      events.push(event instanceof CustomEvent ? event.detail : null);
    });

    trackMediaKeyRecovery("key_recovery_import_attempt", {
      galleryId: "gallery-1",
      expectedKeyCount: 2,
      keyGroupCount: 2,
      inputKind: classifyMediaKeyRecoveryInput(
        "https://app.rawdrive.test/g/wedding#rd_key=secret-value",
      ),
    });

    expect(JSON.stringify(events)).not.toContain("secret-value");
    expect(events).toEqual([
      {
        name: "key_recovery_import_attempt",
        galleryId: "gallery-1",
        expectedKeyCount: 2,
        keyGroupCount: 2,
        inputKind: "secure_url",
      },
    ]);
  });
});
