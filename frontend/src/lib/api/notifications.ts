const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface Notification {
  id: string;
  user_id: string;
  workspace_id?: string;
  notification_type: string;
  title: string;
  body?: string;
  action_url?: string;
  channel: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function listNotifications(token: string, unread?: boolean): Promise<Notification[]> {
  const params = unread ? "?unread=true" : "";
  const res = await fetch(`${API_BASE}/api/v1/notifications${params}`, { headers: headers(token) });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.notifications)) return body.notifications;
  return [];
}

export async function markRead(token: string, id: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/notifications/${id}/read`, {
    method: "PUT",
    headers: headers(token),
  });
}

export async function markAllRead(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/notifications/read-all`, {
    method: "PUT",
    headers: headers(token),
  });
}
