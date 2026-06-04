/**
 * StreamUnavailableView — story 35-1 (DEF-2).
 *
 * Calm terminal sub-view shown when the public stream snapshot could not be
 * loaded for a non-404 reason (transient backend/network error). It deliberately
 * does NOT fabricate a scheduled countdown — see DEF-2.
 */

export function StreamUnavailableView() {
  return (
    <section
      data-testid="viewer-unavailable"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-2xl glass-card p-8 text-center"
      aria-label="Stream unavailable"
    >
      <h1 className="text-2xl font-semibold text-text-primary">
        Stream unavailable
      </h1>
      <p className="text-sm text-text-secondary">
        We couldn&apos;t load this stream right now. Please refresh the page in
        a moment.
      </p>
    </section>
  );
}

export default StreamUnavailableView;
