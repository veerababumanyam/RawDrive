const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// TermsCurrent is the active Terms-of-Service / Privacy version returned by
// GET /api/v1/legal/terms/current. The `text` is the exact operative text the
// modal must display — it is the same text the backend hashes, so what the user
// reads matches the recorded acceptance proof (IT Act §10A evidence).
export interface TermsCurrent {
  version: string;
  effective_at: string;
  document_types: string[];
  text: string;
  hash: string;
}

// TermsStatus mirrors the per-user acceptance state from
// GET /api/v1/legal/terms/status (and the `terms` object embedded in /auth/me).
export interface TermsStatus {
  needs_acceptance: boolean;
  accepted_version?: string;
  accepted_at?: string | null;
  current_version: string;
}

/**
 * Fetch the active terms version + operative text for the acceptance modal.
 * Throws on failure so the modal can show a retry state.
 */
export async function getCurrentTerms(token: string): Promise<TermsCurrent> {
  const res = await fetch(`${API_BASE}/api/v1/legal/terms/current`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to load terms: ${res.status}`);
  }
  return (await res.json()) as TermsCurrent;
}

/**
 * Fetch the caller's terms acceptance status. Returns null on any failure so
 * the upload pre-check degrades gracefully to "unknown" — the backend upload
 * gate still enforces, so a failed status read never lets an unaccepted user
 * slip through.
 */
export async function getTermsStatus(token: string | null): Promise<TermsStatus | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/legal/terms/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as TermsStatus;
  } catch {
    return null;
  }
}

/**
 * Record the caller's acceptance of the active terms version. The optional
 * `version` is sent so the server can reject a stale acceptance (409) if the
 * terms were republished after the modal loaded. Throws with the backend
 * message on failure.
 */
export async function acceptTerms(token: string, version?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/legal/terms/accept`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(version ? { version } : {}),
  });
  if (res.ok) return;
  let msg = `Failed to record acceptance: ${res.status}`;
  try {
    const b = await res.json();
    if (b?.message) msg = String(b.message);
    else if (b?.error) msg = String(b.error);
  } catch {
    /* ignore non-JSON body */
  }
  throw new Error(msg);
}
