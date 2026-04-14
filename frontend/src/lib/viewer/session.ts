/**
 * Viewer session storage helpers — story 35-1 T2.
 *
 * Stores short-lived viewer JWT pairs in sessionStorage (NEVER localStorage,
 * NEVER cookies) keyed by stream id. Tabs are isolated; tab close clears the
 * session per the security invariant in the impl spec.
 */

export type ViewerTokenPair = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer";
};

const KEY_PREFIX = "rd:viewer:";

function key(streamId: string): string {
  return `${KEY_PREFIX}${streamId}`;
}

export function saveViewerSession(streamId: string, pair: ViewerTokenPair): void {
  if (typeof window === "undefined") return;
  try {
    const stored = { ...pair, saved_at: Date.now() };
    window.sessionStorage.setItem(key(streamId), JSON.stringify(stored));
  } catch {
    // sessionStorage may be unavailable (private mode); silently ignore.
  }
}

export function loadViewerSession(streamId: string): ViewerTokenPair | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key(streamId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewerTokenPair & { saved_at?: number };
    if (parsed.saved_at && parsed.expires_in) {
      const expiresAt = parsed.saved_at + parsed.expires_in * 1000;
      if (Date.now() >= expiresAt) {
        clearViewerSession(streamId);
        return null;
      }
    }
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_in: parsed.expires_in,
      token_type: parsed.token_type,
    };
  } catch {
    return null;
  }
}

export function clearViewerSession(streamId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key(streamId));
  } catch {
    /* no-op */
  }
}

export function viewerAuthHeader(streamId: string): Record<string, string> {
  const pair = loadViewerSession(streamId);
  return pair ? { Authorization: `Bearer ${pair.access_token}` } : {};
}
