"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface PresenceEntry {
  user_id: string;
  user_name: string;
  avatar_url?: string;
  section: string;
}

interface SectionLock {
  section_id: string;
  locked_by: string;
  user_name: string;
  expires_at: string;
}

interface DesignUpdate {
  gallery_id: string;
  user_id: string;
  section: string;
  changes: Record<string, unknown>;
  timestamp: string;
}

interface CollabState {
  connected: boolean;
  viewers: number;
  presence: PresenceEntry[];
  locks: SectionLock[];
}

function getAuthHeaders(): Record<string, string> {
  const token = getStoredAccessToken();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export function useDesignCollab(galleryId: string, onRemoteUpdate?: (update: DesignUpdate) => void) {
  const [state, setState] = useState<CollabState>({ connected: false, viewers: 0, presence: [], locks: [] });
  const eventSourceRef = useRef<EventSource | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Join session on mount
  useEffect(() => {
    const join = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/collab/join`, {
          method: "POST", headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setState({ connected: true, viewers: data.viewers || 0, presence: data.presence || [], locks: data.locks || [] });
        }
      } catch { /* ignore */ }
    };
    join();

    // Connect SSE stream
    const token = getStoredAccessToken();
    const url = `${API_BASE}/api/v1/galleries/${galleryId}/collab/stream${token ? `?token=${token}` : ""}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "init") {
          setState((s) => ({ ...s, connected: true, viewers: data.viewers || 0, presence: data.presence || [], locks: data.locks || [] }));
        } else if (data.type === "update" && data.update) {
          onRemoteUpdate?.(data.update);
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      setState((s) => ({ ...s, connected: false }));
    };

    // Heartbeat every 15s
    heartbeatRef.current = setInterval(async () => {
      try {
        await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/collab/heartbeat`, {
          method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ section: "" }),
        });
      } catch { /* ignore */ }
    }, 15000);

    return () => {
      es.close();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      // Leave session
      fetch(`${API_BASE}/api/v1/galleries/${galleryId}/collab/leave`, {
        method: "POST", headers: getAuthHeaders(),
      }).catch(() => {});
    };
  }, [galleryId, onRemoteUpdate]);

  const acquireLock = useCallback(async (sectionId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/collab/lock`, {
        method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ section_id: sectionId }),
      });
      return res.ok;
    } catch { return false; }
  }, [galleryId]);

  const releaseLock = useCallback(async (sectionId: string) => {
    try {
      await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/collab/lock/${sectionId}`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
    } catch { /* ignore */ }
  }, [galleryId]);

  const isLocked = useCallback((sectionId: string, myUserId: string): boolean => {
    const lock = state.locks.find((l) => l.section_id === sectionId);
    return lock != null && lock.locked_by !== myUserId && new Date(lock.expires_at) > new Date();
  }, [state.locks]);

  const getLockHolder = useCallback((sectionId: string): string | null => {
    const lock = state.locks.find((l) => l.section_id === sectionId);
    return lock && new Date(lock.expires_at) > new Date() ? lock.user_name : null;
  }, [state.locks]);

  return {
    ...state,
    acquireLock,
    releaseLock,
    isLocked,
    getLockHolder,
  };
}
