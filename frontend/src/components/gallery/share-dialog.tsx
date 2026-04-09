"use client";

import { useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { XMark } from "@/components/icons";

interface ShareDialogProps {
  galleryUrl: string;
  galleryTitle: string;
  onClose: () => void;
}

export function ShareDialog({ galleryUrl, galleryTitle, onClose }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(galleryUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Check out "${galleryTitle}": ${galleryUrl}`)}`;
  const emailSubject = encodeURIComponent(`Gallery: ${galleryTitle}`);
  const emailBody = encodeURIComponent(`View the gallery here: ${galleryUrl}`);
  const emailUrl = `mailto:?subject=${emailSubject}&body=${emailBody}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md p-6 glass-card rounded-2xl shadow-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-primary">Share Gallery</h3>
          <GlassIconButton label="Close" size="sm" variant="ghost" onClick={onClose}>
            <XMark />
          </GlassIconButton>
        </div>

        {/* Copy link */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={galleryUrl}
            readOnly
            className="flex-1 px-3 py-2 rounded-lg glass-surface border border-glass-border text-sm text-primary truncate"
          />
          <button
            onClick={handleCopy}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium whitespace-nowrap"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {/* Share options */}
        <div className="grid grid-cols-2 gap-3">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-xl glass-surface border border-glass-border hover:bg-accent/10 transition-colors"
          >
            <span className="text-xl">💬</span>
            <span className="text-sm text-primary">WhatsApp</span>
          </a>

          <a
            href={emailUrl}
            className="flex items-center gap-3 px-4 py-3 rounded-xl glass-surface border border-glass-border hover:bg-accent/10 transition-colors"
          >
            <span className="text-xl">✉️</span>
            <span className="text-sm text-primary">Email</span>
          </a>

          <button
            onClick={() => {/* QR modal */}}
            className="flex items-center gap-3 px-4 py-3 rounded-xl glass-surface border border-glass-border hover:bg-accent/10 transition-colors text-left"
          >
            <span className="text-xl">📱</span>
            <span className="text-sm text-primary">QR Code</span>
          </button>

          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: galleryTitle, url: galleryUrl });
              }
            }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl glass-surface border border-glass-border hover:bg-accent/10 transition-colors text-left"
          >
            <span className="text-xl">🔗</span>
            <span className="text-sm text-primary">More...</span>
          </button>
        </div>
      </div>
    </div>
  );
}
