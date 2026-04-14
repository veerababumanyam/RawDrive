"use client";

/**
 * WaitingRoomView — story 35-1 T3.
 *
 * Shown when the stream is `waiting_room`. The chat preview slot is
 * intentionally a placeholder; 35-3 wires real chat.
 */

export interface WaitingRoomViewProps {
  streamId: string;
  brandName?: string;
  scheduledAt?: string;
}

export function WaitingRoomView({ brandName, scheduledAt }: WaitingRoomViewProps) {
  return (
    <section
      data-testid="viewer-waiting-room"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-2xl glass-card p-8 text-center"
      aria-label="Waiting room"
    >
      {brandName && <p className="text-sm font-medium text-text-secondary">{brandName}</p>}
      <h1 className="text-2xl font-semibold text-text-primary">Starting soon</h1>
      <p className="text-sm text-text-secondary">
        Your host is getting things ready. The stream will begin automatically as soon as it goes live.
      </p>
      {scheduledAt && (
        <p className="text-xs text-text-tertiary">
          Scheduled for {new Date(scheduledAt).toLocaleString()}
        </p>
      )}
      <div
        data-testid="viewer-waiting-chat-slot"
        className="mt-4 w-full rounded-xl border border-dashed border-border-primary bg-surface-base px-4 py-6 text-xs text-text-tertiary"
      >
        Chat preview will appear here once the stream is live.
      </div>
    </section>
  );
}

export default WaitingRoomView;
