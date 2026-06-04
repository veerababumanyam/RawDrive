"use client";

/**
 * IngestHealthCard — Live ingest stats (bitrate, fps, codec, status).
 * Shell widget: consumes data from useIngestHealth (or passed via prop in tests).
 * TODO: real-time — wire SSE health.degraded events for instant status changes.
 */

export interface IngestHealthData {
  connected: boolean;
  bitrate_kbps: number;
  fps: number;
  video_codec: string;
  audio_codec: string;
  last_pushed_at: string;
  status: "idle" | "connected" | "degraded" | "disconnected" | string;
}

export interface IngestHealthCardProps {
  data: IngestHealthData | null;
}

export function IngestHealthCard({ data }: IngestHealthCardProps) {
  if (!data) {
    return (
      <section
        data-testid="ingest-health-card"
        aria-label="Ingest health"
        className="stream-panel p-5 text-text-media/70"
      >
        Loading ingest health...
      </section>
    );
  }

  const statusTone =
    data.status === "connected"
      ? "text-feedback-success"
      : data.status === "degraded"
        ? "text-feedback-warning"
        : "text-feedback-error";

  return (
    <section
      data-testid="ingest-health-card"
      aria-label="Ingest health"
      className="stream-panel p-5"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-medium text-text-media">Ingest health</h3>
        <span
          data-testid="ingest-status"
          className={`text-xs uppercase tracking-wider ${statusTone}`}
        >
          {data.status}
        </span>
      </header>
      <dl className="grid grid-cols-2 gap-3 text-sm text-text-media/80">
        <div>
          <dt className="text-xs uppercase text-text-media/50">Bitrate</dt>
          <dd data-testid="ingest-bitrate">{data.bitrate_kbps} kbps</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-text-media/50">FPS</dt>
          <dd data-testid="ingest-fps">{data.fps}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-text-media/50">Video</dt>
          <dd>{data.video_codec || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-text-media/50">Audio</dt>
          <dd>{data.audio_codec || "—"}</dd>
        </div>
      </dl>
    </section>
  );
}
