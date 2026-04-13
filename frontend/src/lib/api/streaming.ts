// M31 / F-014 E103 — Super-admin streaming rate-card API client.
//
// Mirrors backend/internal/streaming/rate/handler.go exactly. Keep field
// names in sync; the Go handler serialises with json tags that match 1:1.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface StreamingPackage {
  id: string;
  workspace_id?: string | null;
  code: string;
  name: string;
  tier: "basic" | "pro" | "enterprise";
  minutes: number;
  max_concurrent_viewers: number;
  replay_ttl_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RateCard {
  id: string;
  package_id: string;
  price_paise: number;
  base_rate_paise_per_min: number;
  overage_rate_paise_per_min: number;
  effective_from: string;
  created_by?: string | null;
  created_at: string;
}

export interface CreateRateCardInput {
  price_paise: number;
  base_rate_paise_per_min: number;
  overage_rate_paise_per_min: number;
  effective_from: string; // ISO-8601, MUST be > now()
}

export interface PatchPackageInput {
  name?: string;
  minutes?: number;
  max_concurrent_viewers?: number;
  replay_ttl_days?: number;
  is_active?: boolean;
}

function headers(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function handleRes<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body?.message) msg = body.message;
      else if (body?.error) msg = body.error;
    } catch {
      // body not JSON — keep status message
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export async function listStreamingPackages(token: string): Promise<StreamingPackage[]> {
  const res = await fetch(`${API_BASE}/api/v1/admin/streaming/packages`, {
    headers: headers(token),
  });
  const body = await handleRes<{ packages: StreamingPackage[] }>(res);
  return body.packages;
}

export async function getStreamingPackage(token: string, id: string): Promise<StreamingPackage> {
  const res = await fetch(`${API_BASE}/api/v1/admin/streaming/packages/${id}`, {
    headers: headers(token),
  });
  return handleRes<StreamingPackage>(res);
}

export async function patchStreamingPackage(
  token: string,
  id: string,
  input: PatchPackageInput,
): Promise<StreamingPackage> {
  const res = await fetch(`${API_BASE}/api/v1/admin/streaming/packages/${id}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify(input),
  });
  return handleRes<StreamingPackage>(res);
}

export async function listRateCards(token: string, packageId: string): Promise<RateCard[]> {
  const res = await fetch(`${API_BASE}/api/v1/admin/streaming/packages/${packageId}/rates`, {
    headers: headers(token),
  });
  const body = await handleRes<{ rate_cards: RateCard[] }>(res);
  return body.rate_cards;
}

export async function createRateCard(
  token: string,
  packageId: string,
  input: CreateRateCardInput,
): Promise<RateCard> {
  const res = await fetch(`${API_BASE}/api/v1/admin/streaming/packages/${packageId}/rate`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(input),
  });
  return handleRes<RateCard>(res);
}
