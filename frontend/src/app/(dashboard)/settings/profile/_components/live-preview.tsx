"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCodeLib from "qrcode";
import {
  downloadProfileVCard,
  type PhotographerProfile,
} from "@/lib/api/photographer-profile";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { Copy, Download, Eye, Photo, QrCode, Share } from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";

interface LivePreviewProps {
  profile: PhotographerProfile;
  publicUrl: string;
  onError: (message: string) => void;
}

export function LivePreview({ profile, publicUrl, onError }: LivePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const shareUrl =
    profile.is_public && profile.status === "published" ? publicUrl : "";
  const avatar = useMemo(
    () => getStorageBackedUrl(profile.avatar_cropped_url || profile.avatar_url),
    [profile.avatar_cropped_url, profile.avatar_url],
  );

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!shareUrl) {
      const ctx = canvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      return;
    }
    QRCodeLib.toCanvas(canvasRef.current, shareUrl, {
      width: 168,
      margin: 1,
      errorCorrectionLevel: "H",
    }).catch(() => onError("QR code could not be rendered"));
  }, [onError, shareUrl]);

  const copy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <aside className="profile-live-preview">
      <section className="settings-panel settings-panel--flush">
        <div className="profile-live-hero">
          {avatar ? (
            <img src={avatar} alt="" className="profile-live-background" />
          ) : null}
          <div className="profile-live-scrim" />
          <div className="profile-live-hero-content">
            <div className="profile-live-avatar">
              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  className="profile-live-avatar-image"
                />
              ) : (
                <div className="profile-live-avatar-placeholder">
                  <Photo />
                </div>
              )}
            </div>
            <div className="profile-live-copy">
              <p className="profile-live-kicker">Preview</p>
              <h2 className="profile-live-title">
                {profile.display_name || profile.last_name || "Photographer"}
              </h2>
              <p className="profile-live-tagline">
                {profile.tagline ||
                  profile.professional_title ||
                  "Private draft"}
              </p>
            </div>
          </div>
        </div>

        <div className="profile-live-body">
          <div className="profile-live-metrics">
            <Metric
              label="Views"
              value={String(profile.total_profile_views || 0)}
            />
            <Metric
              label="Unique"
              value={String(profile.unique_visitors || 0)}
            />
            <Metric
              label="Work"
              value={String(profile.featured_galleries?.length || 0)}
            />
          </div>

          <div className="profile-live-qr-card">
            <canvas
              ref={canvasRef}
              width={168}
              height={168}
              className="profile-live-qr-canvas"
            />
            <p className="profile-live-url">
              {shareUrl || "Hidden until public"}
            </p>
          </div>

          <div className="profile-live-actions">
            <GlassButton
              type="button"
              size="sm"
              variant="surface"
              icon={<Copy />}
              disabled={!shareUrl}
              onClick={copy}
            >
              {copied ? "Copied" : "Copy URL"}
            </GlassButton>
            <GlassButton
              type="button"
              size="sm"
              variant="surface"
              icon={<Download />}
              onClick={() =>
                downloadProfileVCard().catch((err) => onError(err.message))
              }
            >
              vCard
            </GlassButton>
            <a
              href={shareUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className="glass-button glass-button--sm glass-button--surface"
              aria-disabled={!shareUrl}
            >
              <span className="glass-button__icon">
                <Eye />
              </span>
              <span>Open</span>
            </a>
            <div className="glass-button glass-button--sm glass-button--quiet profile-live-status-button">
              <span className="glass-button__icon">
                {shareUrl ? <Share /> : <QrCode />}
              </span>
              <span>{shareUrl ? "Live" : "Hidden"}</span>
            </div>
          </div>
        </div>
      </section>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-live-metric">
      <p className="profile-live-metric-value">{value}</p>
      <p className="profile-live-metric-label">{label}</p>
    </div>
  );
}
