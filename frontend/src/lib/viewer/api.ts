/**
 * Viewer-public fetch wrappers — story 35-1 T2.
 *
 * Same-origin fetches against the public streams endpoints. No dashboard
 * auth — only the viewer-session JWT (when present) is attached.
 */

import type { ViewerTokenPair } from "./session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface InitialStateSnapshot {
  state: "scheduled" | "waiting_room" | "live" | "replay" | "ended";
  access_level: "link" | "pin" | "sso";
  scheduled_at?: string;
  brand?: { display_name?: string; logo_url?: string };
  playback_url?: string;
  replay_status?: "pending" | "ready" | "expired";
}

export class ViewerApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function verifyPin(streamId: string, pin: string): Promise<ViewerTokenPair> {
  const res = await fetch(`${API_BASE}/api/v1/public/streams/${encodeURIComponent(streamId)}/pin-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string };
      code = body?.error;
    } catch {
      /* ignore */
    }
    throw new ViewerApiError(res.status, code === "invalid_pin" ? "Invalid PIN" : `pin-verify failed: ${res.status}`, code);
  }
  return (await res.json()) as ViewerTokenPair;
}

export async function refreshViewerSession(streamId: string, refreshToken: string): Promise<ViewerTokenPair> {
  const res = await fetch(
    `${API_BASE}/api/v1/public/streams/${encodeURIComponent(streamId)}/session/refresh`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );
  if (!res.ok) {
    throw new ViewerApiError(res.status, `refresh failed: ${res.status}`);
  }
  return (await res.json()) as ViewerTokenPair;
}

export async function fetchStreamState(
  streamId: string,
  accessToken?: string,
): Promise<InitialStateSnapshot> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}/api/v1/public/streams/${encodeURIComponent(streamId)}`, {
    method: "GET",
    headers,
  });
  if (!res.ok) {
    throw new ViewerApiError(res.status, `state fetch failed: ${res.status}`);
  }
  return (await res.json()) as InitialStateSnapshot;
}
