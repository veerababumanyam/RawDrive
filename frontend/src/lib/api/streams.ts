const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface Stream {
  id: string;
  workspace_id: string;
  gallery_id?: string;
  created_by: string;
  title: string;
  description?: string;
  status: string;
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  cf_stream_uid?: string;
  cf_rtmps_url?: string;
  cf_rtmps_key?: string;
  cf_playback_url?: string;
  cf_vod_uid?: string;
  pin_code?: string;
  max_quality: string;
  chat_enabled: boolean;
  chat_slow_mode_seconds: number;
  peak_viewers: number;
  total_views: number;
  duration_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface StreamChat {
  id: string;
  stream_id: string;
  user_name: string;
  user_id?: string;
  message: string;
  message_type: string;
  is_muted: boolean;
  created_at: string;
}

export async function listStreams(token: string, params?: { status?: string; limit?: number; offset?: number }): Promise<Stream[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const res = await fetch(`${API_BASE}/api/v1/streams?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list streams: ${res.status}`);
  return res.json();
}

export async function getStream(token: string, id: string): Promise<Stream> {
  const res = await fetch(`${API_BASE}/api/v1/streams/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get stream: ${res.status}`);
  return res.json();
}

export async function createStream(token: string, data: {
  title: string;
  description?: string;
  gallery_id?: string;
  scheduled_at?: string;
  pin_code?: string;
  max_quality?: string;
  chat_enabled?: boolean;
}): Promise<Stream> {
  const res = await fetch(`${API_BASE}/api/v1/streams`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create stream: ${res.status}`);
  return res.json();
}

export async function startStream(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/streams/${id}/start`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to start stream: ${res.status}`);
}

export async function endStream(token: string, id: string, durationSeconds?: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/streams/${id}/end`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ duration_seconds: durationSeconds || 0 }),
  });
  if (!res.ok) throw new Error(`Failed to end stream: ${res.status}`);
}

export async function deleteStream(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/streams/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to delete stream: ${res.status}`);
}

export async function getChatHistory(token: string, streamId: string, limit?: number): Promise<StreamChat[]> {
  const query = limit ? `?limit=${limit}` : "";
  const res = await fetch(`${API_BASE}/api/v1/streams/${streamId}/chat${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get chat: ${res.status}`);
  return res.json();
}

export async function sendChatMessage(streamId: string, data: { user_name: string; message: string }, token?: string): Promise<StreamChat> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/v1/public/streams/${streamId}/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
  return res.json();
}

export async function getPublicStream(id: string): Promise<Stream> {
  const res = await fetch(`${API_BASE}/api/v1/public/streams/${id}`);
  if (!res.ok) throw new Error(`Stream not found: ${res.status}`);
  return res.json();
}

export async function verifyStreamPin(id: string, pin: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/v1/public/streams/${id}/verify-pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.valid;
}
