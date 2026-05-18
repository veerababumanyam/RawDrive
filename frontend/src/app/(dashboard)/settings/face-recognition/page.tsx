"use client";

// Settings → Face Recognition. PR-3c.
//
// Workspace-level opt-in toggle for the face-recognition pipeline.
// Off by default (DPDP / GDPR posture for biometric data). Flipping
// to ON enables FaceService.DetectAndStore for new uploads in this
// workspace; the per-gallery face_detection_enabled flag (default
// TRUE) remains the second-tier per-gallery opt-out.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, UserRound } from "lucide-react";
import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

async function fetchEnabled(token: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/v1/workspaces/current/face-recognition`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load face-recognition state (HTTP ${res.status})`);
  const body = (await res.json()) as { enabled: boolean };
  return Boolean(body.enabled);
}

async function patchEnabled(token: string, enabled: boolean): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/v1/workspaces/current/face-recognition`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`Failed to update face-recognition state (HTTP ${res.status})`);
  const body = (await res.json()) as { enabled: boolean };
  return Boolean(body.enabled);
}

export default function FaceRecognitionSettingsPage() {
  // Compute initial state synchronously to avoid React 19's
  // react-hooks/set-state-in-effect lint — we don't know the server
  // state yet so default to "loading" via null.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [token] = useState(() => getStoredAccessToken());

  useEffect(() => {
    if (!token) {
      setError("Your session expired. Please log in again.");
      return;
    }
    let cancelled = false;
    fetchEnabled(token)
      .then((v) => {
        if (!cancelled) setEnabled(v);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onToggle = async (next: boolean) => {
    if (!token) return;
    setError("");
    setNotice("");
    setPending(true);
    // Optimistic update — flip immediately; revert if the server says no.
    const prev = enabled;
    setEnabled(next);
    try {
      const confirmed = await patchEnabled(token, next);
      setEnabled(confirmed);
      setNotice(
        confirmed
          ? "Face recognition is now ON for this workspace. New uploads will be scanned for faces."
          : "Face recognition is now OFF. No new face data will be collected. Existing person tiles remain visible until you delete them.",
      );
    } catch (err) {
      setEnabled(prev);
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 p-8">
      <header className="flex items-center gap-3">
        <Link
          href="/settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-accent"
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight text-text-primary">
            Face Recognition
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            Decide whether photos uploaded to this workspace are scanned for faces and grouped by person.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </div>
      )}

      {/* The toggle card */}
      <section className="surface-panel p-6">
        <div className="flex items-start gap-4">
          <span
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"
            aria-hidden
          >
            <UserRound className="h-6 w-6" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-text-primary">Enable face recognition</h2>
            <p className="mt-1 text-sm text-text-secondary">
              When ON, RawDrive scans each uploaded image for faces and groups them by the same
              person across the gallery. Studio staff and gallery viewers can browse photos by
              person from a dedicated People tab.
            </p>
            <p className="mt-2 text-xs text-text-tertiary">
              You can disable face detection for individual galleries from each gallery&apos;s
              Settings even when this workspace-level toggle is ON.
            </p>
          </div>
          <div className="shrink-0">
            <Toggle
              checked={enabled === true}
              disabled={enabled === null || pending}
              onChange={onToggle}
              label="Face recognition for this workspace"
            />
          </div>
        </div>
      </section>

      {/* Privacy / DPDP copy */}
      <section className="surface-panel p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-text-tertiary" aria-hidden />
          <div className="space-y-2 text-sm text-text-secondary">
            <h3 className="text-sm font-semibold text-text-primary">What we store</h3>
            <p>
              Face data is a mathematical embedding (a 512-number vector) derived from each face.
              We do not store extra copies of the photo for this purpose — the existing image you
              uploaded is the only source. Embeddings are stored in your workspace&apos;s database
              and never shared outside it.
            </p>
            <h3 className="text-sm font-semibold text-text-primary pt-2">Indian DPDP &amp; EU GDPR</h3>
            <p>
              Face embeddings are biometric data under the Indian Digital Personal Data Protection
              Act and the EU GDPR. Treating this as opt-in (off by default) is our default posture.
              If you turn this ON, you confirm that you have, or will obtain, the consent of the
              people who appear in your photos before processing them.
            </p>
            <h3 className="text-sm font-semibold text-text-primary pt-2">Turning it off</h3>
            <p>
              Turning the toggle OFF stops new face scans immediately. Existing face data isn&apos;t
              deleted automatically — contact support if you need a workspace-wide purge.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// Toggle — a tiny accessible switch component sized to the design system
// 44px touch target floor. Local to this page since the rest of the
// dashboard uses bespoke toggles per-context; a shared component is a
// future extraction once we have 3+ similar sites.
function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-12 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2",
        checked ? "border-accent bg-accent" : "border-border-default bg-surface-container-high",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}
