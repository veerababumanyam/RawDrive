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

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  fetchStreamState,
  ViewerApiError,
  type InitialStateSnapshot,
} from "@/lib/viewer/api";
import { StreamViewerShell, type ViewerState } from "@/components/viewer/StreamViewerShell";
import { StreamUnavailableView } from "@/components/viewer/StreamUnavailableView";
import { createNoIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = createNoIndexMetadata(
  "RawDrive live stream",
  "Private live stream viewer for invited guests.",
);

interface PageProps {
  params: Promise<{ id: string }>;
}

type SnapshotResult =
  | { kind: "ok"; snapshot: InitialStateSnapshot }
  | { kind: "not-found" }
  | { kind: "unavailable" };

async function loadSnapshot(id: string): Promise<SnapshotResult> {
  try {
    return { kind: "ok", snapshot: await fetchStreamState(id) };
  } catch (err) {
    // 404 → the stream link is invalid or gone → branded not-found page.
    if (err instanceof ViewerApiError && err.status === 404) {
      return { kind: "not-found" };
    }
    // DEF-2: any other error must NOT fabricate a scheduled snapshot (which
    // rendered a fake 00:00:00 countdown). Surface a calm unavailable state.
    return { kind: "unavailable" };
  }
}

export default async function StreamViewerPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const result = await loadSnapshot(id);

  if (result.kind === "not-found") notFound();

  if (result.kind === "unavailable") {
    return (
      <main className="min-h-screen w-full bg-surface-canvas px-4 py-8">
        <StreamUnavailableView />
      </main>
    );
  }

  const { snapshot } = result;
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
