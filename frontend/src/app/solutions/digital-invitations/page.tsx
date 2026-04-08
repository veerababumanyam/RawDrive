import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Digital Invitations & DVC | RawDrive",
  description: "Create incredible digital invitations and manage your Digital Visiting Card as a modern creative.",
};

export default function DigitalInvitationsPage() {
  return (
    <section className="bg-surface px-4 py-20 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          Digital Invitations & Digital Visiting Cards
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Equip yourself with high-conversion marketing tools matching your brand, and offer your clients custom RSVP digital invitations for their events.
        </p>
      </div>
    </section>
  );
}
