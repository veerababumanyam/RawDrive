"use client";

/**
 * MapView — GAL-FR-099
 *
 * Map view for geotagged assets. Shows a pin cluster for every asset with
 * non-null exif_data.gps_latitude / gps_longitude. Clicking a pin opens the
 * corresponding photo in the lightbox.
 *
 * Why no Leaflet / Mapbox / Google Maps dependency: this view is a public
 * gallery feature and every extra JS bundle KB hurts LCP on slow mobile
 * connections (most wedding gallery visitors open links on 4G during the
 * function). Instead we render a static OSM tile background via a single
 * `<img>` from the OpenStreetMap static-map service (or any tile service
 * the studio configures via NEXT_PUBLIC_MAP_TILE_URL) with absolutely
 * positioned pins computed from a Mercator projection. Good enough for
 * "where were these photos taken" — not a navigation map.
 *
 * If a richer map is required in a later milestone, swap this component
 * for react-leaflet with the same props API.
 */

import { useMemo } from "react";
import type { Asset } from "@/lib/api/assets";

interface Props {
  assets: Asset[];
  onSelect: (assetId: string) => void;
}

interface GeoAsset {
  id: string;
  lat: number;
  lon: number;
  filename: string;
  thumbUrl: string;
}

function extractGeoAssets(assets: Asset[]): GeoAsset[] {
  const result: GeoAsset[] = [];
  for (const a of assets) {
    const lat = typeof a.gps_latitude === "number" ? a.gps_latitude : extractExifGps(a.exif_data, "gps_latitude");
    const lon = typeof a.gps_longitude === "number" ? a.gps_longitude : extractExifGps(a.exif_data, "gps_longitude");
    if (lat == null || lon == null) continue;
    result.push({
      id: a.id,
      lat,
      lon,
      filename: a.filename,
      // WebP-first with JPG fallback for legacy assets. After the
      // worker switched to WebP-only emission, new uploads no longer
      // carry the `thumb_sm` JPG key — without this chain, every map
      // pin for a fresh upload would render with no thumbnail.
      thumbUrl:
        a.thumbnail_urls?.thumb_sm_webp ||
        a.thumbnail_urls?.thumb_md_webp ||
        a.thumbnail_urls?.thumb_sm ||
        a.thumbnail_urls?.sm ||
        "",
    });
  }
  return result;
}

function extractExifGps(exif: Record<string, unknown> | undefined, key: string): number | null {
  if (!exif) return null;
  const raw = exif[key];
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Simple Web Mercator projection for a single (lat, lon) into a 0..1 square
// bounded by (minLat, maxLat, minLon, maxLon). Adequate for a single-city
// event gallery; not accurate near the poles.
function project(
  lat: number,
  lon: number,
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
): { x: number; y: number } {
  const x = (lon - bounds.minLon) / (bounds.maxLon - bounds.minLon || 1);
  const y = 1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1);
  return { x, y };
}

export function MapView({ assets, onSelect }: Props) {
  const geo = useMemo(() => extractGeoAssets(assets), [assets]);

  if (geo.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-text-secondary">
        <span className="text-lg font-medium">No geotagged photos</span>
        <span className="text-sm text-text-tertiary">
          None of the photos in this gallery contain GPS metadata.
        </span>
      </div>
    );
  }

  // Compute bounds with 5% padding so pins don't hug the edges.
  const lats = geo.map((g) => g.lat);
  const lons = geo.map((g) => g.lon);
  const padLat = (Math.max(...lats) - Math.min(...lats)) * 0.05 || 0.001;
  const padLon = (Math.max(...lons) - Math.min(...lons)) * 0.05 || 0.001;
  const bounds = {
    minLat: Math.min(...lats) - padLat,
    maxLat: Math.max(...lats) + padLat,
    minLon: Math.min(...lons) - padLon,
    maxLon: Math.max(...lons) + padLon,
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-surface-sunken">
      {/* Tile background — a subtle gradient stand-in. Replace with a real
          map tile source by setting NEXT_PUBLIC_MAP_TILE_URL at build time. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(var(--surface-raised)) 0%, hsl(var(--surface-sunken)) 100%)",
          backgroundImage:
            process.env.NEXT_PUBLIC_MAP_TILE_URL &&
            `url(${process.env.NEXT_PUBLIC_MAP_TILE_URL})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Pins */}
      {geo.map((g) => {
        const { x, y } = project(g.lat, g.lon, bounds);
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect(g.id)}
            aria-label={`View ${g.filename}`}
            className="absolute -translate-x-1/2 -translate-y-full group"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          >
            {/* Pin head */}
            <div className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-white shadow-lg transition-transform group-hover:scale-110">
              {g.thumbUrl ? (
                <img src={g.thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-accent-primary" />
              )}
            </div>
            {/* Pin tail */}
            <div
              aria-hidden
              className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 rotate-45 bg-white"
              style={{ marginTop: "-4px" }}
            />
          </button>
        );
      })}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 text-xs text-white/90">
        {geo.length} geotagged photo{geo.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
