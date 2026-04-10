"use client";

/**
 * WatermarkOverlay — GAL-FR-088
 *
 * Absolutely-positioned CSS overlay that sits on top of the viewer image.
 * Reads the gallery's `watermark_config` and renders a non-interactive text
 * layer (pointer-events: none) so clicks and pinch-zoom pass through to the
 * underlying image. This is a display-time watermark — the original files on
 * R2 are untouched. The server-side watermark_service burns the mark into
 * download derivatives when `download_allowed` is gated.
 *
 * Positions:
 *   - "center"       — large diagonal text across the middle
 *   - "tiled"        — repeating diagonal grid covering the image
 *   - "bottom-right" — small text anchored to bottom-right corner
 *   - "bottom-left"  — small text anchored to bottom-left corner
 */

import type { Gallery } from "@/lib/api/galleries";

interface Props {
  config?: Gallery["watermark_config"];
}

export function WatermarkOverlay({ config }: Props) {
  if (!config || !config.text) return null;

  const opacity = Math.max(0, Math.min(1, config.opacity ?? 0.3));
  const text = config.text;
  const position = config.position ?? "center";

  if (position === "tiled") {
    // Diagonal tiled pattern — uses a CSS repeating background of SVG text so
    // the watermark scales with the image without re-layout.
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
        <text x="50%" y="50%" font-family="system-ui, sans-serif" font-size="32"
              font-weight="700" fill="white" fill-opacity="${opacity}"
              text-anchor="middle" dominant-baseline="middle"
              transform="rotate(-30 150 100)">${escapeXml(text)}</text>
      </svg>`.trim();
    const encoded = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `url("${encoded}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "300px 200px",
          mixBlendMode: "overlay",
        }}
      />
    );
  }

  if (position === "center") {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <span
          className="select-none text-6xl font-bold uppercase tracking-widest text-white"
          style={{ opacity, transform: "rotate(-15deg)", textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
        >
          {text}
        </span>
      </div>
    );
  }

  // Corner variants
  const corner =
    position === "bottom-right"
      ? "bottom-4 right-4"
      : position === "bottom-left"
        ? "bottom-4 left-4"
        : "bottom-4 right-4";
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute ${corner} select-none`}
      style={{ opacity }}
    >
      <span className="text-sm font-semibold uppercase tracking-wider text-white">{text}</span>
    </div>
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
