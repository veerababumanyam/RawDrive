"use client";

/**
 * StreamViewerShell — story 35-1 T3.
 *
 * Switches viewer sub-views based on the current stream state. Until 35-2
 * lands the SSE-driven `<StateMachine/>`, this shell renders directly off
 * the initial state snapshot fetched server-side. Once 35-2 merges, this
 * shell will own the SSE subscription and pass updates down.
 */

import { useState } from "react";
import { CountdownView } from "./CountdownView";
import { WaitingRoomView } from "./WaitingRoomView";
import { LivePlayerView } from "./LivePlayerView";
import { ReplayPlayerView } from "./ReplayPlayerView";
import { EndedView } from "./EndedView";
import { PINEntry } from "./PINEntry";
import { saveViewerSession, type ViewerTokenPair } from "@/lib/viewer/session";

export type ViewerState =
  | "scheduled"
  | "waiting_room"
  | "live"
  | "replay"
  | "ended";

export interface ViewerInitialPayload {
  access_level?: "link" | "pin" | "sso";
  scheduled_at?: string;
  brand?: { display_name?: string; logo_url?: string };
  playback_url?: string;
  replay_status?: "pending" | "ready" | "expired";
}

export interface StreamViewerShellProps {
  streamId: string;
  initialState: ViewerState;
  initialPayload: ViewerInitialPayload;
  /** When true, render PIN gate first regardless of state. */
  requirePin?: boolean;
}

export function StreamViewerShell({
  streamId,
  initialState,
  initialPayload,
  requirePin = false,
}: StreamViewerShellProps) {
  const [authenticated, setAuthenticated] = useState<boolean>(!requirePin);

  if (!authenticated) {
    return (
      <PINEntry
        streamId={streamId}
        onAuthenticated={(pair: ViewerTokenPair) => {
          saveViewerSession(streamId, pair);
          setAuthenticated(true);
        }}
      />
    );
  }

  const brandName = initialPayload.brand?.display_name;

  switch (initialState) {
    case "scheduled":
      // DEF-2: never fabricate a timestamp. When scheduled_at is missing,
      // CountdownView's invalid-date guard shows the calm "Starting soon"
      // pending state instead of a 00:00:00 countdown.
      return (
        <CountdownView
          scheduledAt={initialPayload.scheduled_at ?? ""}
          brandName={brandName}
        />
      );
    case "waiting_room":
      return (
        <WaitingRoomView
          streamId={streamId}
          brandName={brandName}
          scheduledAt={initialPayload.scheduled_at}
        />
      );
    case "live":
      return <LivePlayerView playbackUrl={initialPayload.playback_url} />;
    case "replay":
      return <ReplayPlayerView playbackUrl={initialPayload.playback_url} />;
    case "ended":
    default:
      return <EndedView replayStatus={initialPayload.replay_status} />;
  }
}

export default StreamViewerShell;
