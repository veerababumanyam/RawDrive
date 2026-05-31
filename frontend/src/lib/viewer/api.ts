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

type PublicStreamResponse = {
  status?: string;
  scheduled_at?: string;
  pin_required?: boolean;
  cf_playback_url?: string;
};

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
  const res = await fetch(`${API_BASE}/api/v1/public/streams/${encodeURIComponent(streamId)}/verify-pin`, {
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
    throw new ViewerApiError(res.status, code === "invalid_pin" ? "Invalid PIN" : `verify-pin failed: ${res.status}`, code);
  }
  const body = (await res.json()) as Partial<ViewerTokenPair> & { valid?: boolean };
  if (!body.access_token || !body.refresh_token || !body.expires_in || body.token_type !== "Bearer") {
    throw new ViewerApiError(503, "viewer session unavailable", "viewer_session_unavailable");
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: body.expires_in,
    token_type: body.token_type,
  };
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
  return normalizePublicStream(await res.json());
}

function normalizePublicStream(body: PublicStreamResponse): InitialStateSnapshot {
  return {
    state: normalizeStreamState(body.status),
    access_level: body.pin_required ? "pin" : "link",
    scheduled_at: body.scheduled_at,
    playback_url: body.cf_playback_url,
  };
}

function normalizeStreamState(status?: string): InitialStateSnapshot["state"] {
  switch (status) {
    case "waiting":
    case "waiting_room":
      return "waiting_room";
    case "live":
      return "live";
    case "replay":
    case "vod_ready":
      return "replay";
    case "ended":
      return "ended";
    case "scheduled":
    default:
      return "scheduled";
  }
}
