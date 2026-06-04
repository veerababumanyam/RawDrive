"use client";

/**
 * LivePlayerView — story 35-1 T3 (placeholder).
 *
 * Renders a `<video>` element bound to the playback URL from the state
 * payload. Cloudflare Stream HLS / iframe wiring lands in R5.
 *
 * Server is authoritative — `playback_url` only appears once state==="live".
 */

export interface LivePlayerViewProps {
  playbackUrl?: string;
  poster?: string;
  onError?: (e: Error) => void;
}

export function LivePlayerView({
  playbackUrl,
  poster,
  onError,
}: LivePlayerViewProps) {
  return (
    <section
      data-testid="viewer-live-player"
      className="mx-auto w-full max-w-5xl rounded-2xl glass-card p-2"
      aria-label="Live video player"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-surface-base">
        {playbackUrl ? (
          <video
            data-testid="viewer-live-video"
            className="h-full w-full"
            controls
            playsInline
            autoPlay
            poster={poster}
            src={playbackUrl}
            onError={() => onError?.(new Error("playback error"))}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-text-tertiary">
            Connecting to live stream...
          </div>
        )}
      </div>
    </section>
  );
}

export default LivePlayerView;
