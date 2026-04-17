const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  channel_type: string;
  created_by: string;
  created_at: string;
}

export interface Message {
  id: string;
  workspace_id: string;
  channel_id: string;
  sender_id: string;
  message_type: string;
  body: string;
  attachment_url?: string;
  parent_message_id?: string;
  is_read: boolean;
  edited_at?: string;
  deleted_at?: string;
  inserted_at: string;
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function listChannels(token: string): Promise<Channel[]> {
  const res = await fetch(`${API_BASE}/api/v1/messages/channels`, {
    headers: headers(token),
  });
  const json = await res.json();
  return json.data || [];
}

export async function createChannel(token: string, data: {
  name: string;
  channel_type?: string;
}): Promise<Channel> {
  const res = await fetch(`${API_BASE}/api/v1/messages/channels`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  return json.data;
}

export async function getMessages(token: string, channelId: string, limit?: number): Promise<Message[]> {
  const query = limit ? `?limit=${limit}` : "";
  const res = await fetch(`${API_BASE}/api/v1/messages/channels/${channelId}/messages${query}`, {
    headers: headers(token),
  });
  const json = await res.json();
  return json.data || [];
}

export async function sendMessage(token: string, channelId: string, data: {
  body: string;
  message_type?: string;
  attachment_url?: string;
  parent_message_id?: string;
}): Promise<Message> {
  const res = await fetch(`${API_BASE}/api/v1/messages/channels/${channelId}/messages`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  return json.data;
}

export async function searchMessages(token: string, query: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/api/v1/messages/search?q=${encodeURIComponent(query)}`, {
    headers: headers(token),
  });
  const json = await res.json();
  return json.data || [];
}

// ── Auto-authenticated version ──────────────────────────────────────
import { authFetch } from "./authFetch";

export async function createChannelAuth(data: { name: string; channel_type?: string }): Promise<Channel> {
  const res = await authFetch("/api/v1/messages/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create channel");
  }
  const json = await res.json();
  return json.data || json;
}
