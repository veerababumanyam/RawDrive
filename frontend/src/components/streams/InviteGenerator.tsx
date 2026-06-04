"use client";

/**
 * InviteGenerator — M34 story 34-5 invite/shortlink UI.
 *
 * Photographer-facing tool that mints a shortlink+QR for a stream:
 *  1. Click "Generate" → POST /api/v1/streaming/streams/{id}/invites.
 *  2. Renders returned code + short_url + a QR canvas encoding qr_payload via
 *     the `qrcode` package (client-side only, per spec — no server QR endpoint).
 *  3. "Copy" button writes the short URL to the clipboard via navigator.clipboard.
 */

import { useEffect, useRef, useState } from "react";
import QRCodeLib from "qrcode";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { CheckCircle, Copy, QRCode, Sparkle } from "@/components/icons";

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
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render the QR onto the canvas whenever a fresh payload arrives. Uses the
  // `qrcode` package client-side per spec (no server QR endpoint).
  useEffect(() => {
    if (phase !== "ready" || !invite || !qrCanvasRef.current) return;
    QRCodeLib.toCanvas(qrCanvasRef.current, invite.qr_payload, {
      width: 192,
      margin: 1,
    }).catch(() => {
      /* swallow — surfaced indirectly via missing visual */
    });
  }, [phase, invite]);

  async function onGenerate() {
    setPhase("generating");
    setErrorMsg("");
    try {
      const res = await doFetch(
        `/api/v1/streaming/streams/${streamId}/invites`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        },
      );
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
      className="rounded-2xl border border-text-media/10 bg-surface-overlay/5 p-5"
    >
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-medium text-text-media/90">Stream invite</h3>
      </header>

      {phase !== "ready" && (
        <div className="flex items-center gap-3">
          <GlassIconButton
            type="button"
            variant="accent"
            label={
              phase === "generating" ? "Generating invite" : "Generate invite"
            }
            onClick={onGenerate}
            disabled={phase === "generating"}
            data-testid="generate-button"
          >
            {phase === "generating" ? <Sparkle /> : <QRCode />}
          </GlassIconButton>
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

      {phase === "ready" && invite && (
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-text-media/50">
              Code
            </div>
            <div
              data-testid="invite-code"
              className="font-mono text-sm text-text-media/90"
            >
              {invite.code}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-text-media/50">
                Short URL
              </div>
              <div
                data-testid="invite-short-url"
                className="truncate font-mono text-sm text-text-media/90"
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
              {copied ? <CheckCircle /> : <Copy />}
            </GlassIconButton>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-text-media/50">
              QR
            </div>
            <div
              data-testid="invite-qr"
              role="img"
              aria-label={`QR code for ${invite.short_url}`}
              className="mt-1 inline-flex items-center justify-center rounded-xl border border-text-media/10 bg-white p-2"
            >
              <canvas
                ref={qrCanvasRef}
                data-testid="invite-qr-canvas"
                data-qr-payload={invite.qr_payload}
                width={192}
                height={192}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
