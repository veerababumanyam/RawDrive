/**
 * /stream/[id] — public viewer route (story 35-1 T1).
 *
 * Async server component that:
 *   1. Resolves the route param (Next.js 15 async params).
 *   2. Fetches the initial state snapshot from the public streams endpoint.
 *   3. Hands the snapshot to the client `<StreamViewerShell/>`, which gates
 *      on PIN when access_level==="pin" and renders the appropriate sub-view.
 *
 * Feature flag (`streaming.commercial_v1`) is owned by 35-12; this page
 * gracefully no-ops on the flag check if the helper is not yet present.
 *
 * NOTE: This route is OUTSIDE the (dashboard) route group — no dashboard
 * auth, no workspace context, no studio chrome.
 */

import { notFound } from "next/navigation";
import {
  fetchStreamState,
  ViewerApiError,
  type InitialStateSnapshot,
} from "@/lib/viewer/api";
import { StreamViewerShell, type ViewerState } from "@/components/viewer/StreamViewerShell";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function loadSnapshot(id: string): Promise<InitialStateSnapshot | null> {
  try {
    return await fetchStreamState(id);
  } catch (err) {
    if (err instanceof ViewerApiError && err.status === 404) return null;
    // For other errors, render a minimal "scheduled/loading" shell rather
    // than crashing — SSE will reconcile once 35-2 lands.
    return {
      state: "scheduled",
      access_level: "link",
    };
  }
}

export default async function StreamViewerPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const snapshot = await loadSnapshot(id);
  if (!snapshot) notFound();

  const requirePin = snapshot.access_level === "pin";

  return (
    <main className="min-h-screen w-full bg-surface-canvas px-4 py-8">
      <StreamViewerShell
        streamId={id}
        initialState={snapshot.state as ViewerState}
        initialPayload={{
          access_level: snapshot.access_level,
          scheduled_at: snapshot.scheduled_at,
          brand: snapshot.brand,
          playback_url: snapshot.playback_url,
          replay_status: snapshot.replay_status,
        }}
        requirePin={requirePin}
      />
    </main>
  );
}
