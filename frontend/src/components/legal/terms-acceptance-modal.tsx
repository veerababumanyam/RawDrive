"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { acceptTerms, getCurrentTerms, type TermsCurrent } from "@/lib/api/legal";
import { XMark } from "@/components/icons";
import { GlassIconButton } from "@/components/ui/glass-icon-button";

interface TermsAcceptanceModalProps {
  open: boolean;
  token: string | null;
  /** Called after the user successfully records acceptance. */
  onAccepted: () => void;
  /** Called when the user dismisses without accepting (uploads stay blocked). */
  onCancel: () => void;
}

/**
 * TermsAcceptanceModal — one-time gate shown when a photographer must accept the
 * Terms of Service (copyright/IP, rights-warranty, indemnification clauses)
 * before uploading. The exact operative text is fetched from the server so what
 * the user reads matches the SHA-256 the backend records as acceptance proof
 * (IT Act §10A clickwrap evidence). Accept is disabled until the box is ticked.
 *
 * Token-surface styling mirrors RechargeModal so it renders correctly across
 * liquid-glass / liquid-glass-dark / midnight without theme-specific overrides.
 */
export function TermsAcceptanceModal({ open, token, onAccepted, onCancel }: TermsAcceptanceModalProps) {
  const [terms, setTerms] = useState<TermsCurrent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Dismiss on Escape — complements the visible Cancel button so the dialog is
  // cancelable (WCAG + HIG). Listener attached only while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  // Load the active terms text when the modal opens. Reset transient state on
  // each open so a previous error/check does not leak into a new session.
  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setChecked(false);
    setSubmitError(null);
    setLoadError(null);
    setTerms(null);
    getCurrentTerms(token)
      .then((t) => {
        if (!cancelled) setTerms(t);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  const handleAccept = useCallback(async () => {
    if (!token || !checked || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await acceptTerms(token, terms?.version);
      onAccepted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [token, checked, submitting, terms?.version, onAccepted]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-accept-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-surface-base/95 text-content-primary shadow-xl"
      >
        <header className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <h2 id="terms-accept-title" className="text-lg font-semibold">
              Accept the Terms of Service
            </h2>
            <p className="mt-1 text-sm text-content-secondary">
              Before you upload, please review and accept how content and copyright are handled on RawDrive.
            </p>
          </div>
          <GlassIconButton
            type="button"
            label="Close terms modal"
            size="sm"
            variant="ghost"
            onClick={onCancel}
            className="shrink-0 bg-surface-container-high text-text-secondary hover:bg-surface-container-highest hover:text-text-primary"
          >
            <XMark />
          </GlassIconButton>
        </header>

        {/* Operative terms text — scrollable so the user can read the full
            document the acceptance is recorded against. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          {loadError ? (
            <p className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
              Could not load the terms ({loadError}). Please close and try again.
            </p>
          ) : terms ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-content-secondary">
              {terms.text}
            </pre>
          ) : (
            <p className="text-sm text-content-secondary">Loading the latest terms…</p>
          )}
        </div>

        <footer className="space-y-4 p-6 pt-4">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={!terms}
              className="mt-0.5 h-5 w-5 rounded accent-accent"
            />
            <span className="text-sm text-content-primary">
              I accept the{" "}
              <Link href="/terms" target="_blank" className="font-semibold text-accent underline underline-offset-2">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="font-semibold text-accent underline underline-offset-2">
                Privacy Policy
              </Link>
              , and I confirm I own or am licensed to use all content I upload.
            </span>
          </label>

          {submitError && (
            <p className="text-sm text-error" role="alert">
              {submitError}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleAccept}
              disabled={!checked || submitting || !terms}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-accent px-5 py-3 font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {submitting ? "Recording…" : "Accept & Continue"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-surface-container-high px-5 py-3 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              Cancel
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
