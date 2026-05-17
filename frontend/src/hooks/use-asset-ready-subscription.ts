"use client";

import { useEffect, useRef } from "react";

/**
 * Subject + event-type contract owned by the backend:
 *   - The thumbnail worker publishes events on subject "asset.ready"
 *     (worker/events.go → PublishAssetReady, line 62).
 *   - The SSE handler at /api/v1/events/stream strips the last "." segment
 *     of the subject when emitting `event:` lines — designed for
 *     "chat.message.{id}"-style hierarchical subjects (events_handler.go
 *     line 90-94). For our 2-segment subject "asset.ready" this means
 *     the dispatched event-type is "asset", not "asset.ready". We
 *     listen on "asset" to match the existing handler contract; fixing
 *     the handler to emit the full subject would break other consumers.
 */
const SSE_CHANNEL = "asset.ready";
const SSE_EVENT_TYPE = "asset";

interface AssetReadyPayload {
  asset_id: string;
  workspace_id: string;
}

interface Params {
  apiBase: string;
  token: string | null | undefined;
  /** Asset IDs we want to be notified about. When empty, no connection is opened. */
  pendingAssetIds: string[];
  /** Called with the asset_id of any ready event whose ID is in pendingAssetIds. */
  onAssetReady: (assetId: string) => void;
}

/**
 * Opens an SSE connection to /api/v1/events/stream for as long as
 * pendingAssetIds is non-empty, and invokes onAssetReady when the
 * backend publishes a matching asset.ready event.
 *
 * Lifecycle:
 *   - Opens when pendingAssetIds transitions from empty → non-empty (or
 *     token becomes available).
 *   - Closes when pendingAssetIds becomes empty.
 *   - Closes on unmount.
 *   - Filters incoming events by ID — events for assets we are not
 *     watching (e.g. another tab uploading in parallel) are ignored.
 *   - Failures are swallowed silently. The fallback path is the existing
 *     manual page refresh; SSE is an enhancement, not a hard dependency.
 *
 * This hook intentionally takes a snapshot of pendingAssetIds via a ref
 * so the EventSource is NOT re-opened every time the set changes — only
 * the in-memory filter is updated. That keeps reconnection churn off the
 * happy path when an upload batch trickles in over a few seconds.
 */
export function useAssetReadySubscription({
  apiBase,
  token,
  pendingAssetIds,
  onAssetReady,
}: Params): void {
  // Latest set of pending IDs and callback held in refs so the effect
  // below does not need them in its dep array — opening/closing the
  // EventSource on every set change would create reconnection storms
  // during a batch upload.
  const pendingRef = useRef<Set<string>>(new Set());
  const onAssetReadyRef = useRef(onAssetReady);

  useEffect(() => {
    pendingRef.current = new Set(pendingAssetIds);
  }, [pendingAssetIds]);

  useEffect(() => {
    onAssetReadyRef.current = onAssetReady;
  }, [onAssetReady]);

  const hasPending = pendingAssetIds.length > 0;

  useEffect(() => {
    if (!hasPending || !token) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    const url = `${apiBase}/api/v1/events/stream?token=${encodeURIComponent(
      token,
    )}&channels=${encodeURIComponent(SSE_CHANNEL)}`;

    const es = new EventSource(url);

    const handler = (event: MessageEvent) => {
      let payload: AssetReadyPayload | null = null;
      try {
        payload = JSON.parse(event.data) as AssetReadyPayload;
      } catch {
        return;
      }
      if (!payload?.asset_id) return;
      if (!pendingRef.current.has(payload.asset_id)) return;
      onAssetReadyRef.current(payload.asset_id);
    };

    es.addEventListener(SSE_EVENT_TYPE, handler as EventListener);

    // EventSource auto-reconnects on transient drops, but a 4xx from
    // /events/stream (expired token, bad query) closes permanently. We
    // intentionally do not surface this to the user — the visible
    // skeleton tile + manual refresh remain a working fallback.
    es.onerror = () => {
      // no-op — see comment above.
    };

    return () => {
      es.removeEventListener(SSE_EVENT_TYPE, handler as EventListener);
      es.close();
    };
  }, [apiBase, token, hasPending]);
}
