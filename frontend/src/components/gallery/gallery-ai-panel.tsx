"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { triggerFaceScan, getFaceScanStatus } from "@/lib/api/galleries";
import { Sparkle } from "@/components/icons";

interface GalleryAIPanelProps {
  galleryId: string;
  token: string;
}

type ScanState =
  | { kind: "idle" }
  | {
      kind: "scanning";
      jobId: string;
      processed: number;
      total: number;
      facesFound: number;
    }
  | { kind: "complete"; processed: number; total: number; facesFound: number }
  | { kind: "error"; message: string };

export function GalleryAIPanel({ galleryId, token }: GalleryAIPanelProps) {
  const [state, setState] = useState<ScanState>({ kind: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const status = await getFaceScanStatus(token, galleryId);
        if (status.status === "complete") {
          setState({
            kind: "complete",
            processed: status.processed,
            total: status.total,
            facesFound: status.faces_found,
          });
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } else if (status.status === "failed" || status.status === "error") {
          setState({ kind: "error", message: "Face scan failed. Try again." });
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } else {
          setState((prev) =>
            prev.kind === "scanning"
              ? {
                  ...prev,
                  processed: status.processed,
                  total: status.total,
                  facesFound: status.faces_found,
                }
              : prev,
          );
        }
      } catch {
        // Transient network error — keep polling
      }
    }, 2000);
  }, [token, galleryId]);

  // Check if there's already a scan in progress on mount
  useEffect(() => {
    let cancelled = false;
    getFaceScanStatus(token, galleryId)
      .then((status) => {
        if (cancelled) return;
        if (status.status === "processing" || status.status === "pending") {
          setState({
            kind: "scanning",
            jobId: "",
            processed: status.processed,
            total: status.total,
            facesFound: status.faces_found,
          });
          startPolling();
        } else if (status.status === "complete" && status.total > 0) {
          setState({
            kind: "complete",
            processed: status.processed,
            total: status.total,
            facesFound: status.faces_found,
          });
        }
      })
      .catch(() => {
        // No existing scan — that's fine, stay idle
      });
    return () => {
      cancelled = true;
    };
  }, [galleryId, token, startPolling]);

  const handleScan = async () => {
    setState({
      kind: "scanning",
      jobId: "",
      processed: 0,
      total: 0,
      facesFound: 0,
    });
    try {
      const result = await triggerFaceScan(token, galleryId);
      setState((prev) =>
        prev.kind === "scanning" ? { ...prev, jobId: result.job_id } : prev,
      );
      startPolling();
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Failed to start face scan",
      });
    }
  };

  const progressPercent =
    state.kind === "scanning" && state.total > 0
      ? Math.round((state.processed / state.total) * 100)
      : 0;

  return (
    <div className="surface-panel space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Sparkle className="w-5 h-5 text-accent-primary" />
        <h2 className="text-lg font-semibold text-text-primary">AI</h2>
      </div>

      {state.kind === "idle" && (
        <>
          <p className="text-sm text-text-secondary">
            Scan this gallery for faces to enable FaceID matching, auto-tagging,
            and face-based filtering.
          </p>
          <button
            onClick={handleScan}
            className="btn-primary px-4 py-2.5 text-sm"
          >
            Scan for Faces
          </button>
        </>
      )}

      {state.kind === "scanning" && (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Scanning photos for faces...
          </p>
          <div className="w-full h-2 rounded-full bg-surface-sunken overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-text-tertiary">
            <span>
              {state.processed} / {state.total || "?"} photos processed
            </span>
            <span>{state.facesFound} faces found</span>
          </div>
        </div>
      )}

      {state.kind === "complete" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-surface-container-low p-3 text-center">
              <p className="text-lg font-semibold text-text-primary">
                {state.processed}
              </p>
              <p className="text-xs text-text-tertiary">Photos scanned</p>
            </div>
            <div className="rounded-xl bg-surface-container-low p-3 text-center">
              <p className="text-lg font-semibold text-text-primary">
                {state.facesFound}
              </p>
              <p className="text-xs text-text-tertiary">Faces found</p>
            </div>
            <div className="rounded-xl bg-surface-container-low p-3 text-center">
              <p className="text-lg font-semibold text-accent-primary">Done</p>
              <p className="text-xs text-text-tertiary">Status</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleScan}
              className="btn-tertiary px-4 py-2 text-sm"
            >
              Re-scan
            </button>
            <Link
              href={`/galleries/${galleryId}/ai`}
              className="text-xs text-accent-primary hover:underline"
            >
              Open AI Studio
            </Link>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="space-y-3">
          <p className="text-sm text-feedback-error">{state.message}</p>
          <button
            onClick={handleScan}
            className="btn-primary px-4 py-2.5 text-sm"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
