const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
