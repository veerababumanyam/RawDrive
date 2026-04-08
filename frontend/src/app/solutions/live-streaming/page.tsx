import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Streaming | RawDrive",
  description: "Offer premium, branded live-streaming options for remote guests straight from the RawDrive platform.",
};

export default function LiveStreamingPage() {
  return (
    <section className="bg-surface px-4 py-20 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          Live Streaming Events
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Broadcast your clients' most important moments directly to a beautifully branded lobby via our high-performance Cloudflare stream integration.
        </p>
      </div>
    </section>
  );
}
