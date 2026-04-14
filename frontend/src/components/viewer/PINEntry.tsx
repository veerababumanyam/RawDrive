"use client";

/**
 * PINEntry — story 35-1 T2.
 *
 * Public viewer PIN gate. Accepts a 4–8 digit PIN, exchanges it for a
 * short-lived viewer-session JWT pair via `/api/v1/public/streams/{id}/pin-verify`,
 * and hands the pair to the parent via `onAuthenticated`. Persistence is the
 * parent's job (so the shell can remount the state machine in the same tick).
 *
 * Security: PIN is never logged, never put in the URL, never echoed in error
 * messages. Viewer JWTs live in sessionStorage only — see `lib/viewer/session.ts`.
 */

import { useState, useId, type FormEvent } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { CheckCircle } from "@/components/icons";
import { verifyPin, ViewerApiError } from "@/lib/viewer/api";
import type { ViewerTokenPair } from "@/lib/viewer/session";

export interface PINEntryProps {
  streamId: string;
  onAuthenticated: (pair: ViewerTokenPair) => void;
}

const PIN_RE = /^\d{4,8}$/;

export function PINEntry({ streamId, onAuthenticated }: PINEntryProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputId = useId();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!PIN_RE.test(pin)) {
      setError("PIN must be 4 to 8 digits");
      return;
    }
    setSubmitting(true);
    try {
      const pair = await verifyPin(streamId, pin);
      // Clear PIN from memory immediately on success.
      setPin("");
      onAuthenticated(pair);
    } catch (err) {
      if (err instanceof ViewerApiError) {
        if (err.status === 401) setError("That PIN is invalid. Please try again.");
        else if (err.status === 429) setError("Too many attempts. Please wait and retry.");
        else setError("Could not verify PIN. Please try again.");
      } else {
        setError("Network error. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="glass-card mx-auto w-full max-w-sm rounded-2xl p-6 space-y-4"
      aria-label="Stream PIN entry"
      data-testid="pin-entry"
    >
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-text-primary">Enter stream PIN</h1>
        <p className="text-sm text-text-secondary">
          This stream is PIN-protected. Enter the code your host shared with you.
        </p>
      </div>

      <div>
        <label htmlFor={inputId} className="block text-sm font-medium text-text-primary mb-1.5">
          PIN
        </label>
        <input
          id={inputId}
          data-testid="pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          maxLength={8}
          className="w-full rounded-xl border border-border-primary bg-surface-base px-4 py-3 text-base tracking-[0.5em] text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]"
        />
        {error && (
          <p data-testid="pin-error" role="alert" className="mt-2 text-sm text-feedback-error">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <GlassIconButton
          type="submit"
          variant="accent"
          label={submitting ? "Verifying PIN" : "Submit PIN"}
          data-testid="pin-submit"
          disabled={submitting}
        >
          <CheckCircle />
        </GlassIconButton>
      </div>
    </form>
  );
}

export default PINEntry;
