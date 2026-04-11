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

// PublicStream is the sanitized version returned by /api/v1/public/streams/{id}
// Does NOT include cf_rtmps_key, cf_rtmps_url, or pin_code
export interface PublicStream {
  id: string;
  title: string;
  description?: string;
  status: string;
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  cf_playback_url?: string;
  max_quality: string;
  chat_enabled: boolean;
  chat_slow_mode_seconds: number;
  peak_viewers: number;
  total_views: number;
  duration_seconds: number;
  pin_required: boolean;
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
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.streams)) return body.streams;
  return [];
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
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.streamchats)) return body.streamchats;
  return [];
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

export async function getPublicStream(id: string): Promise<PublicStream> {
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

// Public chat history (no auth required — for stream viewer page)
export async function getPublicChatHistory(streamId: string, limit?: number): Promise<StreamChat[]> {
  const query = limit ? `?limit=${limit}` : "";
  const res = await fetch(`${API_BASE}/api/v1/public/streams/${streamId}/chat${query}`);
  if (!res.ok) throw new Error(`Failed to get chat: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.streamchats)) return body.streamchats;
  return [];
}

// ─── Chat Moderation (authenticated) ───

export async function muteUser(token: string, streamId: string, userName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/streams/${streamId}/chat/mute`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_name: userName }),
  });
  if (!res.ok) throw new Error(`Failed to mute user: ${res.status}`);
}

export async function deleteChatMessage(token: string, streamId: string, messageId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/streams/${streamId}/chat/${messageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to delete message: ${res.status}`);
}

export async function updateChatSettings(token: string, streamId: string, enabled: boolean, slowModeSecs: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/streams/${streamId}/chat/settings`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, slow_mode_seconds: slowModeSecs }),
  });
  if (!res.ok) throw new Error(`Failed to update chat settings: ${res.status}`);
}

// ─── Video Assets ───

export interface VideoAsset {
  id: string;
  asset_id: string;
  workspace_id: string;
  status: string;
  duration_seconds?: number;
  codec?: string;
  resolution?: string;
  file_size_bytes?: number;
  qualities: string;
  thumbnail_urls: string;
  cf_video_uid?: string;
  cf_playback_url?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export async function createVideoAsset(token: string, data: { asset_id: string; file_size_bytes?: number; codec?: string; resolution?: string }): Promise<VideoAsset> {
  const res = await fetch(`${API_BASE}/api/v1/videos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create video: ${res.status}`);
  return res.json();
}

export async function getVideoAsset(token: string, id: string): Promise<VideoAsset> {
  const res = await fetch(`${API_BASE}/api/v1/videos/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Video not found: ${res.status}`);
  return res.json();
}

export async function getVideoByAssetId(token: string, assetId: string): Promise<VideoAsset> {
  const res = await fetch(`${API_BASE}/api/v1/videos/by-asset/${assetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Video not found for asset: ${res.status}`);
  return res.json();
}

export async function getVideoTranscodingStatus(token: string, id: string): Promise<{ id: string; status: string; qualities: string; error?: string }> {
  const res = await fetch(`${API_BASE}/api/v1/videos/${id}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Video not found: ${res.status}`);
  return res.json();
}

// ─── Desktop Sessions ───

export interface DesktopSession {
  id: string;
  user_id: string;
  workspace_id: string;
  device_name: string;
  os: string;
  app_version: string;
  last_seen_at: string;
  is_active: boolean;
  upload_stats: string;
  created_at: string;
}

export async function registerDesktopSession(token: string, data: { device_name: string; os: string; app_version: string }): Promise<DesktopSession> {
  const res = await fetch(`${API_BASE}/api/v1/desktop/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to register session: ${res.status}`);
  return res.json();
}

export async function listDesktopSessions(token: string): Promise<DesktopSession[]> {
  const res = await fetch(`${API_BASE}/api/v1/desktop/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.desktopsessions)) return body.desktopsessions;
  return [];
}

export async function desktopHeartbeat(token: string, sessionId: string, appVersion: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/desktop/sessions/${sessionId}/heartbeat`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ app_version: appVersion }),
  });
  if (!res.ok) throw new Error(`Failed to heartbeat: ${res.status}`);
}

export async function deactivateDesktopSession(token: string, sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/desktop/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to deactivate session: ${res.status}`);
}

export async function getDesktopDownloadInfo(): Promise<{ app_name: string; platforms: Record<string, { url: string; version: string; min_os: string }> }> {
  const res = await fetch(`${API_BASE}/api/v1/desktop/download`);
  if (!res.ok) throw new Error(`Failed to get download info: ${res.status}`);
  return res.json();
}
