"use client";

/**
 * WaitingRoomPreview — owner-side mirror of the public pre-live viewer page.
 * TODO: real-time — render actual waiting-room iframe or snapshot once story 34-5 ships.
 */

export interface WaitingRoomData {
  title: string;
  scheduled_at: string;
  brand_color?: string;
  poster_url?: string;
}

export interface WaitingRoomPreviewProps {
  data: WaitingRoomData | null;
}

export function WaitingRoomPreview({ data }: WaitingRoomPreviewProps) {
  return (
    <section
      data-testid="waiting-room-preview"
      aria-label="Waiting room preview"
      className="rounded-2xl border border-white/10 bg-white/5 p-5"
    >
      <h3 className="mb-3 text-base font-medium text-white/90">Waiting room preview</h3>
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
        {data?.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.poster_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            data-testid="waiting-room-placeholder"
            className="flex h-full w-full items-center justify-center text-sm text-white/50"
          >
            Preview placeholder
          </div>
        )}
      </div>
      {data && (
        <div className="mt-3">
          <div className="text-sm font-medium text-white/90">{data.title}</div>
          <div className="text-xs text-white/60">
            Scheduled: {data.scheduled_at || "—"}
          </div>
        </div>
      )}
    </section>
  );
}
