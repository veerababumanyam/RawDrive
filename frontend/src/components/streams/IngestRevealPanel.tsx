"use client";

/**
 * IngestRevealPanel — FR-014-UX-04 T-30 ingest-key reveal UI.
 *
 * Hides RTMPS/SRT URL + stream key until 30 minutes before the scheduled
 * start time. On reveal, calls the backend and displays the credentials
 * with a copy button and the revealed-at timestamp. Super-admins see a
 * link to the audit log.
 *
 * Project rules applied:
 *  - GlassIconButton for every icon action (no raw <button> for icons)
 *  - Copy icon sourced from @/components/icons registry (adds `Copy`)
 *  - No hardcoded colors or spacing — all tokens via Tailwind utilities
 *  - Uses `fetch` with credentials; handler returns 425 for pre-T-30
 */

import { useEffect, useMemo, useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { CheckCircle, Copy, InfoCircle } from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";

const REVEAL_WINDOW_MS = 30 * 60 * 1000;

export interface IngestRevealCredentials {
  rtmps_url: string;
  stream_key: string;
  srt_url: string;
  srt_passkey: string;
  revealed_at: string;
}

export interface IngestRevealPanelProps {
  streamId: string;
  scheduledStartAt: string; // ISO 8601
  isSuperAdmin?: boolean;
  // Test hooks — override wall clock and fetcher. Never used in production.
  now?: Date;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

type Status =
  | "locked"
  | "ready"
  | "revealing"
  | "revealed"
  | "error"
  | "too-early";

export function IngestRevealPanel({
  streamId,
  scheduledStartAt,
  isSuperAdmin = false,
  now,
  fetcher,
}: IngestRevealPanelProps) {
  const doFetch = fetcher ?? ((u, i) => fetch(u, i));
  const scheduled = useMemo(
    () => new Date(scheduledStartAt),
    [scheduledStartAt],
  );

  const [currentTime, setCurrentTime] = useState<Date>(() => now ?? new Date());
  useEffect(() => {
    if (now) return; // test mode — no timer
    const t = setInterval(() => setCurrentTime(new Date()), 1_000);
    return () => clearInterval(t);
  }, [now]);

  const msUntilWindow =
    scheduled.getTime() - REVEAL_WINDOW_MS - currentTime.getTime();
  const windowOpen = msUntilWindow <= 0;

  const [revealPhase, setRevealPhase] = useState<
    "idle" | "revealing" | "revealed" | "error" | "too-early"
  >("idle");
  const [creds, setCreds] = useState<IngestRevealCredentials | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Derived status — lets react-hooks/set-state-in-effect stay quiet while
  // still reacting to the countdown ticking past T-30.
  const status: Status = (() => {
    if (revealPhase === "revealing") return "revealing";
    if (revealPhase === "revealed") return "revealed";
    if (revealPhase === "too-early") return "too-early";
    if (revealPhase === "error") return "error";
    return windowOpen ? "ready" : "locked";
  })();

  async function onReveal() {
    setRevealPhase("revealing");
    setErrorMsg("");
    try {
      const res = await doFetch(
        `/api/v1/streaming/streams/${streamId}/reveal-ingest`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (res.status === 425) {
        setRevealPhase("too-early");
        setErrorMsg(
          "Ingest credentials cannot be revealed yet — try again closer to the start time.",
        );
        return;
      }
      if (!res.ok) {
        setRevealPhase("error");
        setErrorMsg(`Reveal failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as IngestRevealCredentials;
      setCreds(data);
      setRevealPhase("revealed");
    } catch (e) {
      setRevealPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Network error");
    }
  }

  function copy(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
  }

  return (
    <section
      data-testid="ingest-reveal-panel"
      aria-label="Ingest credentials"
      className="surface-panel p-5"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-medium text-text-primary">
          Ingest credentials
        </h3>
        {isSuperAdmin && (
          <a
            href={`/admin/streaming/${streamId}/reveal-audit`}
            data-testid="audit-link"
            className="touch-target-link items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          >
            <InfoCircle />
            Audit log
          </a>
        )}
      </header>

      {status === "locked" && (
        <div data-testid="locked-state" className="text-sm text-text-secondary">
          <p>Credentials unlock 30 minutes before the scheduled start.</p>
          <p
            className="mt-2 font-mono text-xs text-text-tertiary"
            data-testid="countdown"
          >
            {formatCountdown(msUntilWindow)}
          </p>
        </div>
      )}

      {(status === "ready" ||
        status === "revealing" ||
        status === "error" ||
        status === "too-early") && (
        <div className="flex items-center gap-3">
          <GlassButton
            type="button"
            onClick={onReveal}
            disabled={status === "revealing" || !windowOpen}
            data-testid="reveal-button"
            variant="surface"
            size="md"
          >
            {status === "revealing" ? "Revealing…" : "Reveal ingest key"}
          </GlassButton>
          {errorMsg && (
            <span
              data-testid="error-message"
              className="text-sm text-feedback-error"
            >
              {errorMsg}
            </span>
          )}
        </div>
      )}

      {status === "revealed" && creds && (
        <div data-testid="revealed-state" className="space-y-3">
          <CredentialRow
            label="RTMPS URL"
            value={creds.rtmps_url}
            onCopy={copy}
          />
          <CredentialRow
            label="Stream key"
            value={creds.stream_key}
            onCopy={copy}
            sensitive
          />
          <CredentialRow label="SRT URL" value={creds.srt_url} onCopy={copy} />
          <CredentialRow
            label="SRT passkey"
            value={creds.srt_passkey}
            onCopy={copy}
            sensitive
          />
          <p
            data-testid="revealed-at"
            className="flex items-center gap-2 text-xs text-text-tertiary"
          >
            <CheckCircle />
            Revealed {new Date(creds.revealed_at).toLocaleString()}
          </p>
        </div>
      )}
    </section>
  );
}

function CredentialRow({
  label,
  value,
  onCopy,
  sensitive,
}: {
  label: string;
  value: string;
  onCopy: (v: string) => void;
  sensitive?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  // Show a transient "Copied" indicator for 1.5s after a successful click.
  // Silent clipboard writes are easy to miss; the visual confirmation prevents
  // users from hammering the button thinking it did nothing.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-caption uppercase">{label}</div>
        <div
          className="truncate font-mono text-sm text-text-primary"
          data-testid={`value-${slug(label)}`}
          data-sensitive={sensitive ? "true" : undefined}
        >
          {value}
        </div>
      </div>
      <GlassIconButton
        size="sm"
        variant={copied ? "success" : "glass"}
        label={copied ? `Copied ${label}` : `Copy ${label}`}
        onClick={() => {
          onCopy(value);
          setCopied(true);
        }}
        data-testid={`copy-${slug(label)}`}
        data-copied={copied ? "true" : undefined}
      >
        {copied ? <CheckCircle /> : <Copy />}
      </GlassIconButton>
    </div>
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Unlocking…";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m until unlock`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s until unlock`;
  return `${minutes}m ${seconds}s until unlock`;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
