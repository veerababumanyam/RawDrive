/**
 * Bandwidth classifier — pure, no browser deps.
 *
 * Thresholds MUST stay in sync with the Go server-side classifier in
 * `backend/internal/streaming/preflight/bandwidth.go`:
 *   - 720p30  : uplink >= 3 Mbps
 *   - 1080p30 : uplink >= 5 Mbps
 *   - 1080p60 : uplink >= 8 Mbps
 *
 * Returned recommendations are UI-facing hints; the Go verdict is
 * authoritative for persistence and rate-card decisions.
 */

export type Tier = "below-720p30" | "720p30" | "1080p30" | "1080p60";
export type Verdict = "pass" | "warn" | "poor";

export interface ClassifyResult {
  tier: Tier;
  verdict: Verdict;
  recommendedBitrateKbps: number;
  recommendations: string[];
}

export function classify(mbps: number): ClassifyResult {
  const kbps = Math.floor(mbps * 1000);
  if (mbps >= 8) {
    return {
      tier: "1080p60",
      verdict: "pass",
      recommendedBitrateKbps: cap(Math.floor(kbps * 0.7), 8000),
      recommendations: [
        "Excellent uplink — 1080p/60 at high bitrate is comfortable.",
      ],
    };
  }
  if (mbps >= 5) {
    return {
      tier: "1080p30",
      verdict: "pass",
      recommendedBitrateKbps: cap(Math.floor(kbps * 0.7), 5000),
      recommendations: [
        "Solid uplink for 1080p/30. Upgrade to 8 Mbps for 1080p/60.",
      ],
    };
  }
  if (mbps >= 3) {
    return {
      tier: "720p30",
      verdict: "warn",
      recommendedBitrateKbps: cap(Math.floor(kbps * 0.7), 3000),
      recommendations: [
        "Uplink meets 720p/30 only. Consider a wired connection for 1080p.",
      ],
    };
  }
  return {
    tier: "below-720p30",
    verdict: "poor",
    recommendedBitrateKbps: Math.max(500, Math.floor(kbps * 0.7)),
    recommendations: [
      "Uplink is below 3 Mbps — live streaming will stutter.",
      "Downgrade tier or upgrade your internet connection before going live.",
    ],
  };
}

function cap(value: number, maxKbps: number): number {
  return Math.min(value, maxKbps);
}
