import { getApiBaseUrl } from "@/lib/api/base-url";
const API_BASE = getApiBaseUrl();

// CurrentUser is the minimal display profile returned by
// GET /api/v1/auth/me. It is used by the dashboard greeting banner and
// by any component that needs to show the logged-in user's name,
// avatar, or workspace binding without decoding the JWT client-side.
export interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string;
  workspace_id: string;
  role: string;
  platform_role: string;
  state_id: string;
  must_change_password?: boolean;
}

/**
 * Fetch the logged-in user's profile. Returns null on any failure so
 * callers can degrade gracefully to a neutral greeting rather than
 * blocking the dashboard on a 401/500.
 */
export async function getCurrentUser(token: string | null): Promise<CurrentUser | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as CurrentUser;
  } catch {
    return null;
  }
}

// ── M39 E6-S2: password reset helpers ──

/**
 * Request a password reset OTP. Always resolves (even for unregistered
 * emails — the backend returns 202 in both cases to defeat enumeration).
 * Throws on 429 rate limit so the caller can render a retry-later toast.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/auth/request-password-reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (res.status === 429) {
    throw new Error("Too many requests. Try again later.");
  }
  if (!res.ok && res.status !== 202) {
    // 400 from malformed email is surfaced; any other failure is silent
    // so the UI shows "if this email is registered..." copy uniformly.
    let msg = `Request failed: ${res.status}`;
    try {
      const b = await res.json();
      if (b?.error) msg = String(b.error);
    } catch {}
    throw new Error(msg);
  }
}

/**
 * Consume an OTP + new password. Returns on 204; throws with backend
 * error detail on 400/429 so the UI can render the right banner.
 */
export async function resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, otp, new_password: newPassword }),
  });
  if (res.status === 204) return;
  let msg = `Reset failed: ${res.status}`;
  try {
    const b = await res.json();
    if (b?.error) msg = String(b.error);
  } catch {}
  throw new Error(msg);
}

/**
 * Change the authenticated user's password. Requires the current password
 * for verification. Clears the must_change_password flag on success.
 */
export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/auth/change-password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (res.ok) return;
  let msg = `Password change failed: ${res.status}`;
  try {
    const b = await res.json();
    if (b?.error) msg = String(b.error);
  } catch {}
  throw new Error(msg);
}
