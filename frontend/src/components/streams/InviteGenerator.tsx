"use client";

/**
 * InviteGenerator — M34 story 34-5 invite/shortlink UI.
 *
 * Photographer-facing tool that mints a shortlink+QR for a stream:
 *  1. Click "Generate" → POST /api/v1/streaming/streams/{id}/invites.
 *  2. Renders returned code + short_url + a QR placeholder encoding qr_payload.
 *  3. "Copy" button writes the short URL to the clipboard via navigator.clipboard.
 *
 * NOTE: The `qrcode` npm package is NOT installed in this workspace and adding
 * a new dependency is out of scope for this story. Rather than faking QR output
 * with a server round-trip (which the spec explicitly forbids: "CLIENT-SIDE
 * rendering only, no server QR endpoint"), we render a visible placeholder that
 * surfaces the exact payload consumers must encode. When `qrcode` ships as a
 * workspace dep, swap the placeholder for `<canvas>` + `QRCode.toCanvas(...)`.
 * Tracked as follow-up frontend tech-debt on story 34-5.
 */

import { useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { CheckCircle, QRCode, Sparkle } from "@/components/icons";

export interface InviteResponse {
  code: string;
  short_url: string;
  qr_payload: string;
}

export interface InviteGeneratorProps {
  streamId: string;
  // Test hook — overrides global fetch. Never used in production.
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

type Phase = "idle" | "generating" | "ready" | "error";

export function InviteGenerator({ streamId, fetcher }: InviteGeneratorProps) {
  const doFetch = fetcher ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const [phase, setPhase] = useState<Phase>("idle");
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [copied, setCopied] = useState(false);

  async function onGenerate() {
    setPhase("generating");
    setErrorMsg("");
    try {
      const res = await doFetch(`/api/v1/streaming/streams/${streamId}/invites`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setPhase("error");
        setErrorMsg(`Generate failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as InviteResponse;
      setInvite(data);
      setPhase("ready");
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Network error");
    }
  }

  async function onCopy() {
    if (!invite) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(invite.short_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <section
      data-testid="invite-generator"
      aria-label="Stream invite generator"
      className="rounded-2xl border border-white/10 bg-white/5 p-5"
    >
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-medium text-white/90">Stream invite</h3>
      </header>

      {phase !== "ready" && (
        <div className="flex items-center gap-3">
          <GlassIconButton
            type="button"
            variant="accent"
            label={phase === "generating" ? "Generating invite" : "Generate invite"}
            onClick={onGenerate}
            disabled={phase === "generating"}
            data-testid="generate-button"
          >
            {phase === "generating" ? <Sparkle /> : <QRCode />}
          </GlassIconButton>
          {errorMsg && (
            <span data-testid="error-message" className="text-sm text-feedback-error">
              {errorMsg}
            </span>
          )}
        </div>
      )}

      {phase === "ready" && invite && (
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/50">Code</div>
            <div
              data-testid="invite-code"
              className="font-mono text-sm text-white/90"
            >
              {invite.code}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-white/50">
                Short URL
              </div>
              <div
                data-testid="invite-short-url"
                className="truncate font-mono text-sm text-white/90"
              >
                {invite.short_url}
              </div>
            </div>
            <GlassIconButton
              size="sm"
              variant={copied ? "success" : "accent"}
              label={copied ? "Copied short URL" : "Copy short URL"}
              onClick={onCopy}
              data-testid="copy-button"
              data-copied={copied ? "true" : undefined}
            >
              {copied ? <CheckCircle /> : <CopyIcon />}
            </GlassIconButton>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-white/50">QR</div>
            {/*
              Placeholder QR surface. The `qrcode` npm package is not installed
              in this workspace; rather than introduce a new dependency or
              silently stub it, we render the payload in a visible container
              annotated as a QR target. Swap for <canvas> + QRCode.toCanvas
              when the dep lands. data-qr-payload lets tests assert the value
              without needing a real QR renderer.
            */}
            <div
              data-testid="invite-qr"
              data-qr-payload={invite.qr_payload}
              role="img"
              aria-label={`QR code for ${invite.short_url}`}
              className="mt-1 inline-flex h-40 w-40 items-center justify-center rounded-xl border border-white/10 bg-white/10 p-2 text-center font-mono text-[10px] text-white/70"
            >
              {invite.qr_payload}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
