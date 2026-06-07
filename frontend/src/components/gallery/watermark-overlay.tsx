"use client";
import type { CSSProperties } from "react";
import { getApiBaseUrl } from "@/lib/api/base-url";

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
import { components as designComponents } from "@/lib/tokens";

/** Serialized data-URI SVGs cannot resolve CSS variables, so the watermark
 * text color comes from the token system's concrete media-text preset. */
const WATERMARK_TEXT_COLOR = designComponents.mediaCover.presetColors.textMedia;

interface Props {
  config?: Gallery["watermark_config"];
  logoUrl?: string | null;
}

const API_BASE = getApiBaseUrl();

function absoluteApiUrl(url?: string | null) {
  if (!url) return "";
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:")
  )
    return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function clampWatermarkPercent(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function readWatermarkPlacement(
  value: unknown,
): { x: number; y: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    x: clampWatermarkPercent(raw.x, 84),
    y: clampWatermarkPercent(raw.y, 84),
  };
}

function readWatermarkRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readWatermarkLayer(
  config: Gallery["watermark_config"],
  layer: "logo" | "text",
  fallback: {
    opacity: number;
    position: string;
    placement: { x: number; y: number } | null;
    scale: number;
  },
) {
  const layers = readWatermarkRecord(config?.layers);
  const raw = readWatermarkRecord(layers[layer]);
  const position =
    typeof raw.position === "string" && raw.position
      ? raw.position
      : fallback.position;
  return {
    opacity:
      typeof raw.opacity === "number" && Number.isFinite(raw.opacity)
        ? raw.opacity
        : fallback.opacity,
    position,
    placement: readWatermarkPlacement(raw.placement) ?? fallback.placement,
    scale:
      typeof raw.scale === "number" && Number.isFinite(raw.scale)
        ? raw.scale
        : fallback.scale,
  };
}

type ResolvedWatermarkLayer = {
  kind: "logo" | "text";
  text: string;
  opacity: number;
  position: string;
  placement: { x: number; y: number } | null;
  scale: number;
  logoUrl: string;
};

export function WatermarkOverlay({ config, logoUrl: logoUrlOverride }: Props) {
  if (!config) return null;

  const mode =
    config.mode === "logo" || config.mode === "both" ? config.mode : "text";
  const rawOpacity = config.opacity ?? 30;
  const text = config.text ?? "";
  const position = config.position ?? "center";
  const logoUrl = absoluteApiUrl(logoUrlOverride || config.logo_url);
  const rawScale =
    typeof config.scale === "number" && Number.isFinite(config.scale)
      ? config.scale
      : 100;
  const placement = readWatermarkPlacement(config.placement);
  const fallback = {
    opacity: rawOpacity,
    position,
    placement,
    scale: rawScale,
  };
  const logoLayer = readWatermarkLayer(config, "logo", fallback);
  const textLayer = readWatermarkLayer(config, "text", fallback);
  const toDisplayLayer = (
    kind: "logo" | "text",
    layer: typeof logoLayer,
  ): ResolvedWatermarkLayer => {
    const layerOpacity =
      layer.opacity > 1
        ? Math.max(0, Math.min(1, layer.opacity / 100))
        : Math.max(0, Math.min(1, layer.opacity));
    return {
      kind,
      text,
      opacity: layerOpacity,
      position: layer.position,
      placement: layer.placement,
      scale: layer.scale / 100,
      logoUrl,
    };
  };
  const layers: ResolvedWatermarkLayer[] =
    mode === "both"
      ? [
          ...(logoUrl ? [toDisplayLayer("logo", logoLayer)] : []),
          ...(text.trim() ? [toDisplayLayer("text", textLayer)] : []),
        ]
      : mode === "logo"
        ? logoUrl
          ? [toDisplayLayer("logo", logoLayer)]
          : []
        : text.trim()
          ? [toDisplayLayer("text", textLayer)]
          : [];

  return layers.length > 0 ? (
    <>
      {layers.map((layer) => (
        <WatermarkLayerOverlay key={layer.kind} layer={layer} />
      ))}
    </>
  ) : null;
}

function WatermarkLayerOverlay({ layer }: { layer: ResolvedWatermarkLayer }) {
  const { kind, text, opacity, position, placement, scale, logoUrl } = layer;

  if (placement) {
    const transformParts = [
      "translate(-50%, -50%)",
      position === "diagonal" ? "rotate(-30deg)" : "",
      `scale(${scale})`,
    ].filter(Boolean);
    const style: CSSProperties = {
      left: `${placement.x}%`,
      top: `${placement.y}%`,
      opacity,
      transform: transformParts.join(" "),
      textShadow: "var(--cover-text-shadow)",
    };
    if (kind === "logo" && logoUrl) {
      return (
        <div
          aria-hidden
          className="pointer-events-none absolute select-none"
          style={style}
        >
          <img src={logoUrl} alt="" className="h-16 w-16 object-contain" />
        </div>
      );
    }
    if (!text) return null;
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute select-none whitespace-nowrap text-sm font-semibold uppercase tracking-wider text-text-media"
        style={style}
      >
        {text}
      </div>
    );
  }

  if (kind === "logo" && logoUrl) {
    const corner =
      position === "bottom-left"
        ? "bottom-4 left-4"
        : position === "top-left"
          ? "top-4 left-4"
          : position === "top-right"
            ? "top-4 right-4"
            : position === "center"
              ? "inset-0 flex items-center justify-center"
              : "bottom-4 right-4";
    return (
      <div
        aria-hidden
        className={`pointer-events-none absolute ${corner} select-none`}
        style={{
          opacity,
          transform: `scale(${scale})`,
          transformOrigin:
            position === "bottom-left"
              ? "bottom left"
              : position === "top-left"
                ? "top left"
                : position === "top-right"
                  ? "top right"
                  : "bottom right",
        }}
      >
        <img
          src={logoUrl}
          alt=""
          className="h-16 w-16 object-contain drop-shadow-lg"
        />
      </div>
    );
  }

  if (!text) return null;

  if (position === "tiled") {
    // Diagonal tiled pattern — uses a CSS repeating background of SVG text so
    // the watermark scales with the image without re-layout.
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
        <text x="50%" y="50%" font-family="system-ui, sans-serif" font-size="32"
              font-weight="700" fill="${WATERMARK_TEXT_COLOR}" fill-opacity="${opacity}"
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
          className="select-none text-6xl font-bold uppercase tracking-widest text-text-media"
          style={{
            opacity,
            transform: `rotate(-15deg) scale(${scale})`,
            textShadow: "var(--cover-text-shadow)",
          }}
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
        : position === "top-left"
          ? "top-4 left-4"
          : position === "top-right"
            ? "top-4 right-4"
            : "bottom-4 right-4";
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute ${corner} select-none`}
      style={{
        opacity,
        transform: `scale(${scale})`,
        transformOrigin:
          position === "bottom-left"
            ? "bottom left"
            : position === "top-left"
              ? "top left"
              : position === "top-right"
                ? "top right"
                : "bottom right",
      }}
    >
      <span className="text-sm font-semibold uppercase tracking-wider text-text-media">
        {text}
      </span>
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
