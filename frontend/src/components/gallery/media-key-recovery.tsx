"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  assetUsesClientMediaEncryption,
  mediaKeyIdsForAsset,
  type EncryptedAssetLike,
} from "@/lib/media-encryption/asset-media";
import {
  galleryIdFromMediaKeyId,
  getStoredExportedMediaKey,
  importGalleryMediaKeyFromInput,
  isMediaKeyRecoveryError,
  subscribeMediaKeyStoreChanges,
} from "@/lib/media-encryption/media-key-store";
import {
  classifyMediaKeyRecoveryInput,
  mediaKeyRecoveryTelemetryNameForError,
  trackMediaKeyRecovery,
} from "@/lib/media-encryption/media-key-telemetry";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Key, Lock, XMark } from "@/components/icons";

type LockedMediaMode = "tile" | "compact" | "viewer" | "banner";

export type LockedMediaRecoverySummary = {
  galleryId: string;
  lockedAssetCount: number;
  expectedKeyIds: string[];
  keyGroupCount: number;
};

export function MediaKeyRecoveryDialog({
  open,
  onClose,
  galleryId,
  expectedKeyIds,
}: {
  open: boolean;
  onClose: () => void;
  galleryId: string;
  expectedKeyIds?: readonly string[];
}) {
  const formId = useId();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const openedTrackedRef = useRef(false);
  const expectedKeyCount = expectedKeyIds?.length ?? 0;
  const keyGroupCount = countKeyGroups(expectedKeyIds ?? []);

  useEffect(() => {
    if (!open) {
      openedTrackedRef.current = false;
      return;
    }
    if (openedTrackedRef.current) return;
    openedTrackedRef.current = true;
    trackMediaKeyRecovery("key_recovery_opened", {
      galleryId,
      expectedKeyCount,
      keyGroupCount,
    });
  }, [expectedKeyCount, galleryId, keyGroupCount, open]);

  function reset() {
    setInput("");
    setError("");
    setSubmitting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const inputKind = classifyMediaKeyRecoveryInput(input);
    trackMediaKeyRecovery("key_recovery_import_attempt", {
      galleryId,
      expectedKeyCount,
      keyGroupCount,
      inputKind,
    });
    try {
      await importGalleryMediaKeyFromInput({
        galleryId,
        input,
        expectedKeyIds,
      });
      trackMediaKeyRecovery("key_recovery_import_success", {
        galleryId,
        expectedKeyCount,
        keyGroupCount,
        inputKind,
      });
      handleClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gallery key import failed.";
      setError(message);
      trackMediaKeyRecovery(mediaKeyRecoveryTelemetryNameForError(message), {
        galleryId,
        expectedKeyCount,
        keyGroupCount,
        inputKind,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Restore gallery key"
      description={
        keyGroupCount > 1
          ? "Use a secure gallery link or gallery key. One key unlocks its matching photo group."
          : "Use a secure gallery link or gallery key from this collection."
      }
      footer={
        <>
          <GlassButton type="button" variant="quiet" onClick={handleClose}>
            Cancel
          </GlassButton>
          <GlassButton
            type="submit"
            form={formId}
            variant="primary"
            disabled={submitting}
            icon={<Key />}
          >
            {submitting ? "Restoring" : "Restore previews"}
          </GlassButton>
        </>
      }
    >
      <form id={formId} className="space-y-3" onSubmit={handleSubmit}>
        <label
          htmlFor={`${formId}-key`}
          className="block text-xs font-medium text-text-secondary"
        >
          Secure gallery link or key
        </label>
        <div className="relative">
          <textarea
            id={`${formId}-key`}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              if (error) setError("");
            }}
            className="min-h-28 w-full resize-y rounded-xl border border-border-default bg-surface-raised px-3 py-2 pr-12 text-sm text-text-primary placeholder-text-tertiary focus:border-accent-primary focus:outline-none"
            placeholder="https://rawdrive.in/g/gallery#rd_key=..."
            autoComplete="off"
            spellCheck={false}
          />
          {input ? (
            <GlassIconButton
              type="button"
              label="Clear gallery key"
              size="sm"
              variant="ghost"
              className="absolute right-2 top-2"
              onClick={() => {
                setInput("");
                setError("");
              }}
            >
              <XMark />
            </GlassIconButton>
          ) : null}
        </div>
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-feedback-error/20 bg-feedback-error/10 px-3 py-2 text-xs text-feedback-error"
          >
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

export function LockedMediaFallback({
  asset,
  galleryId,
  error,
  message,
  className,
  style,
  mode = "tile",
  allowRecovery = true,
}: {
  asset?: EncryptedAssetLike | null;
  galleryId?: string | null;
  error?: string | null;
  message?: string | null;
  className?: string;
  style?: CSSProperties;
  mode?: LockedMediaMode;
  allowRecovery?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const expectedKeyIds = useMemo(() => mediaKeyIdsForAsset(asset), [asset]);
  const keyGroupCount = countKeyGroups(expectedKeyIds);
  const resolvedGalleryId =
    galleryId ||
    expectedKeyIds
      .map((keyId) => galleryIdFromMediaKeyId(keyId))
      .find((id): id is string => Boolean(id)) ||
    null;
  const recoverable =
    allowRecovery && Boolean(resolvedGalleryId) && isMediaKeyRecoveryError(error);
  const label = recoverable
    ? keyGroupCount > 1
      ? "Encrypted photo needs one of several gallery keys"
      : "Encrypted photo locked"
    : message || error || "Preview unavailable";
  const compactLabel = message || (recoverable ? "Key needed" : label);

  return (
    <>
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-sunken px-3 text-center text-xs text-text-tertiary",
          mode === "compact" && "gap-1 px-1",
          mode === "viewer" && "bg-transparent text-sm text-text-media/70",
          mode === "banner" &&
            "rounded-xl border border-border-default bg-surface-container-low p-4 text-sm text-text-secondary",
          className,
        )}
        title={label}
        style={style}
      >
        {recoverable ? (
          <Key
            className={cn(
              "h-6 w-6 shrink-0 text-text-tertiary",
              mode === "viewer" && "text-text-media/70",
              mode === "compact" && "h-5 w-5",
            )}
            aria-hidden
          />
        ) : (
          <Lock
            className={cn(
              "h-6 w-6 shrink-0 text-text-tertiary",
              mode === "viewer" && "text-text-media/70",
              mode === "compact" && "h-5 w-5",
            )}
            aria-hidden
          />
        )}
        <span>{mode === "compact" ? compactLabel : label}</span>
        {recoverable && keyGroupCount > 1 && mode !== "compact" ? (
          <span className="max-w-xs text-2xs text-text-tertiary">
            Restore one matching key now; other key groups may stay locked.
          </span>
        ) : null}
        {recoverable && mode !== "compact" ? (
          <GlassButton
            type="button"
            size="sm"
            variant={mode === "viewer" ? "quiet" : "surface"}
            onClick={(event) => {
              event.stopPropagation();
              setOpen(true);
            }}
          >
            Restore key
          </GlassButton>
        ) : null}
      </div>
      {recoverable && resolvedGalleryId ? (
        <MediaKeyRecoveryDialog
          open={open}
          onClose={() => setOpen(false)}
          galleryId={resolvedGalleryId}
          expectedKeyIds={expectedKeyIds}
        />
      ) : null}
    </>
  );
}

export function useLockedMediaRecoverySummary(
  assets: readonly (EncryptedAssetLike | null | undefined)[],
  galleryId?: string | null,
): LockedMediaRecoverySummary | null {
  const [keyStoreVersion, setKeyStoreVersion] = useState(0);

  useEffect(() => {
    if (!galleryId) return () => undefined;
    return subscribeMediaKeyStoreChanges((detail) => {
      if (detail.reason === "storage" || detail.galleryId === galleryId) {
        setKeyStoreVersion((version) => version + 1);
      }
    });
  }, [galleryId]);

  return useMemo(() => {
    void keyStoreVersion;
    if (!galleryId) return null;
    const expectedKeyIds = new Set<string>();
    let lockedAssetCount = 0;

    for (const asset of assets) {
      if (!assetUsesClientMediaEncryption(asset)) continue;
      const assetKeyIds = mediaKeyIdsForAsset(asset).filter(
        (keyId) => galleryIdFromMediaKeyId(keyId) === galleryId,
      );
      if (assetKeyIds.length === 0) continue;
      const hasLocalKey = assetKeyIds.some((keyId) =>
        Boolean(getStoredExportedMediaKey(keyId)),
      );
      if (hasLocalKey) continue;
      lockedAssetCount += 1;
      for (const keyId of assetKeyIds) expectedKeyIds.add(keyId);
    }

    if (lockedAssetCount === 0) return null;
    const keyIds = Array.from(expectedKeyIds);
    return {
      galleryId,
      lockedAssetCount,
      expectedKeyIds: keyIds,
      keyGroupCount: countKeyGroups(keyIds),
    };
  }, [assets, galleryId, keyStoreVersion]);
}

export function MediaKeyRecoveryBanner({
  summary,
  className,
}: {
  summary: LockedMediaRecoverySummary | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!summary) return null;

  const photoLabel = `${summary.lockedAssetCount} encrypted photo${
    summary.lockedAssetCount === 1 ? "" : "s"
  }`;
  const title =
    summary.keyGroupCount > 1
      ? `${photoLabel} need ${summary.keyGroupCount} gallery keys`
      : `${photoLabel} ${summary.lockedAssetCount === 1 ? "needs" : "need"} the gallery key`;
  const body =
    summary.keyGroupCount > 1
      ? "Restore one secure link or key to unlock its matching group. Remaining groups can be restored with their own key."
      : "Paste the secure gallery link or key to restore previews without refreshing this page.";

  return (
    <>
      <aside
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-border-default bg-surface-container-low p-4 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between",
          className,
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <Key className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-text-primary">{title}</p>
            <p className="mt-1 text-xs text-text-tertiary">{body}</p>
          </div>
        </div>
        <GlassButton
          type="button"
          size="sm"
          variant="surface"
          onClick={() => setOpen(true)}
        >
          Restore key
        </GlassButton>
      </aside>
      <MediaKeyRecoveryDialog
        open={open}
        onClose={() => setOpen(false)}
        galleryId={summary.galleryId}
        expectedKeyIds={summary.expectedKeyIds}
      />
    </>
  );
}

function countKeyGroups(keyIds: readonly string[]): number {
  return new Set(keyIds).size;
}
