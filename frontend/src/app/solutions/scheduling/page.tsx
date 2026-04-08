import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Calendar & Scheduling | RawDrive",
  description: "Integrate seamlessly with your business schedule for smooth bookings and project planning.",
};

export default function SchedulingPage() {
  return (
    <section className="bg-surface px-4 py-20 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          Professional Calendar & Bookings
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Enjoy bi-directional calendar sync. Turn inquiries directly into scheduled events and maintain control of your availability.
        </p>
      </div>
    </section>
  );
}
