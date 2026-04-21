// M41 / Upload Credit Top-up — FR-UCRT-10
//
// Fetch the upload credit catalogue from `GET /api/v1/uploads/packages`.
// The backend (commit ec5542c) returns a sorted-by-credits-ascending list
// of active packages with the wire shape declared here. Unlike the public
// streaming catalogue (`/api/v1/public/streaming/packages`) this endpoint
// is authenticated — callers must pass the access token.
//
// formatINR is shared from `streaming-packages.ts` and intentionally not
// re-exported here; downstream components that need formatting import it
// once from the original module.

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// Shape returned by the backend handler in
// backend/internal/upload/handlers/package_catalogue_handler.go.
// `next_cursor` is reserved for future pagination and is always ""
// today — keeping it in the type so a later cursor rollout doesn't
// require a breaking change here.
export interface UploadPackage {
  code: string;
  credits: number;
  price_paise: number;
  currency: string;
  display_name: string;
}

export interface UploadPackageCatalogueResponse {
  packages: UploadPackage[];
  next_cursor: string;
}

export interface UploadPackagesState {
  packages: UploadPackage[];
  loading: boolean;
  error: string | null;
}

/**
 * useUploadPackages fetches the authenticated upload-credit catalogue.
 * Returns loading + error alongside the packages array so callers can
 * render skeletons or a retry prompt without extra bookkeeping.
 *
 * `open` is the caller-side gate — only fetch when the recharge modal is
 * actually visible. Avoids re-fetching the catalogue on every parent
 * re-render and keeps the network silent when the tab is closed.
 */
export function useUploadPackages(open: boolean): UploadPackagesState {
  const [state, setState] = useState<UploadPackagesState>({
    packages: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ packages: [], loading: true, error: null });

    const token = typeof window !== "undefined" ? getStoredAccessToken() : "";

    fetch(`${API_BASE}/api/v1/uploads/packages`, {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as UploadPackageCatalogueResponse;
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
  }, [open]);

  return state;
}
