export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div
        className={[
          "h-12 w-12 rounded-full border-2 border-text-media/20",
          "border-t-text-media/70 animate-spin",
        ].join(" ")}
        aria-label="Loading"
        role="status"
      />
    </div>
  );
}
