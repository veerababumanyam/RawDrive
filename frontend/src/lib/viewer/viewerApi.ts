/**
 * Public viewer-scope API client (M35 / E107-S4).
 *
 * Backs ViewerCount + ReplayPlayer. Both endpoints require a viewer JWT
 * bound to the shortlink in the path. The server is authoritative for
 * replay expiry — clients must NOT compute it locally.
 */

export type ViewerCount = {
  current: number;
  as_of: string;
};

export type ReplayAvailable = {
  state: "available";
  playback_url: string;
  expires_at: string;
  banner_flag: boolean;
};

export type ReplayProcessing = { state: "processing" };
export type ReplayExpired = { state: "expired"; expires_at: string };
export type ReplayMissing = { state: "missing" };

export type ReplayResponse =
  | ReplayAvailable
  | ReplayProcessing
  | ReplayExpired
  | ReplayMissing;

export class ViewerApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function fetchViewerCount(
  shortlink: string,
  token: string,
  init?: RequestInit
): Promise<ViewerCount> {
  const res = await fetch(
    `/api/v1/public/streams/${encodeURIComponent(shortlink)}/viewer-count`,
    { ...init, headers: { ...authHeaders(token), ...(init?.headers ?? {}) } }
  );
  if (!res.ok) {
    throw new ViewerApiError(res.status, `viewer_count_${res.status}`);
  }
  return (await res.json()) as ViewerCount;
}

export async function fetchReplay(
  shortlink: string,
  token: string,
  init?: RequestInit
): Promise<ReplayResponse> {
  const res = await fetch(
    `/api/v1/public/streams/${encodeURIComponent(shortlink)}/replay`,
    { ...init, headers: { ...authHeaders(token), ...(init?.headers ?? {}) } }
  );
  if (res.ok) {
    const body = (await res.json()) as {
      playback_url: string;
      expires_at: string;
      banner_flag: boolean;
    };
    return {
      state: "available",
      playback_url: body.playback_url,
      expires_at: body.expires_at,
      banner_flag: body.banner_flag,
    };
  }
  if (res.status === 410) {
    const body = (await res.json().catch(() => ({}))) as {
      expires_at?: string;
    };
    return { state: "expired", expires_at: body.expires_at ?? "" };
  }
  if (res.status === 409) {
    return { state: "processing" };
  }
  if (res.status === 404) {
    return { state: "missing" };
  }
  throw new ViewerApiError(res.status, `replay_${res.status}`);
}
