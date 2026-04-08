import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Camera Rentals | RawDrive",
  description: "Camera and gear rentals from verified partners in your region.",
};

export default function RentalsMarketplacePage() {
  return (
    <section className="bg-surface px-4 py-20 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          Camera & Gear Rentals
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Find and reserve top-quality equipment quickly directly from trusted agencies near you.
        </p>
      </div>
    </section>
  );
}
