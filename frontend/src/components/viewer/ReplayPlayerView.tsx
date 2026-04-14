"use client";

/**
 * ReplayPlayerView — story 35-1 T3.
 *
 * Renders the on-demand replay video with the signed playback URL surfaced
 * by the state payload (signing happens server-side, story 35-4 wires the
 * dedicated replay endpoint).
 */

export interface ReplayPlayerViewProps {
  playbackUrl?: string;
  poster?: string;
  onError?: (e: Error) => void;
}

export function ReplayPlayerView({ playbackUrl, poster, onError }: ReplayPlayerViewProps) {
  return (
    <section
      data-testid="viewer-replay-player"
      className="mx-auto w-full max-w-5xl rounded-2xl glass-card p-2"
      aria-label="Replay player"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-surface-base">
        {playbackUrl ? (
          <video
            data-testid="viewer-replay-video"
            className="h-full w-full"
            controls
            playsInline
            poster={poster}
            src={playbackUrl}
            onError={() => onError?.(new Error("replay error"))}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-text-tertiary">
            Loading replay...
          </div>
        )}
      </div>
    </section>
  );
}

export default ReplayPlayerView;
