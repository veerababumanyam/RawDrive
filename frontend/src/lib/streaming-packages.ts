// M32 / F-014 E104-S6 — Public streaming packages: fetch from API instead of
// hardcoding in tokens.ts. Used by both the public pricing page (PricingContent)
// and the in-app recharge flow.

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface PublicStreamingPackage {
  id: string;
  code: string;
  name: string;
  tier: "basic" | "pro" | "enterprise";
  minutes: number;
  max_concurrent_viewers: number;
  replay_ttl_days: number;
  price_paise: number;
  base_rate_paise_per_min: number;
  overage_rate_paise_per_min: number;
}

export interface StreamingPackagesState {
  packages: PublicStreamingPackage[];
  loading: boolean;
  error: string | null;
}

/**
 * formatINR converts a paise amount to a localised rupee string (no fraction
 * digits unless needed). E.g. 49900 → "499", 49950 → "499.50".
 */
export function formatINR(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

/**
 * useStreamingPackages fetches the public streaming-packages catalogue.
 * Public endpoint, no auth required. Returns loading/error states alongside
 * the packages array so callers can render skeletons or fall back to a
 * cached default if the API is unavailable.
 */
export function useStreamingPackages(): StreamingPackagesState {
  const [state, setState] = useState<StreamingPackagesState>({
    packages: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/public/streaming/packages`, {
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as { packages: PublicStreamingPackage[] };
      })
      .then((data) => {
        if (cancelled) return;
        setState({
          packages: Array.isArray(data?.packages) ? data.packages : [],
          loading: false,
          error: null,
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ packages: [], loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * fetchStreamingPackages is the non-hook variant for SSR / server components
 * / one-shot loads. Falls back to an empty array on any error.
 */
export async function fetchStreamingPackages(): Promise<PublicStreamingPackage[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/streaming/packages`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { packages: PublicStreamingPackage[] };
    return Array.isArray(data?.packages) ? data.packages : [];
  } catch {
    return [];
  }
}
