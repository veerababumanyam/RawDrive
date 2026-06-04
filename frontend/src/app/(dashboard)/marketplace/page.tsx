"use client";

import Link from "next/link";

export default function MarketplacePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Marketplace
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Discover freelance photographers and rent professional gear
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/marketplace/freelancers"
          className="block p-6 rounded-xl border border-border-default bg-surface-raised hover:bg-surface-sunken transition-colors min-h-[120px]"
        >
          <h2 className="text-lg font-semibold text-text-primary">
            Freelancers
          </h2>
          <p className="text-sm text-text-secondary mt-2">
            Find and hire freelance photographers by state, skill, and
            availability
          </p>
        </Link>

        <Link
          href="/marketplace/camera-rentals"
          className="block p-6 rounded-xl border border-border-default bg-surface-raised hover:bg-surface-sunken transition-colors min-h-[120px]"
        >
          <h2 className="text-lg font-semibold text-text-primary">
            Camera Rentals
          </h2>
          <p className="text-sm text-text-secondary mt-2">
            Rent cameras, lenses, lighting, and accessories from other
            photographers
          </p>
        </Link>

        <Link
          href="/marketplace/gear"
          className="block p-6 rounded-xl border border-border-default bg-surface-raised hover:bg-surface-sunken transition-colors min-h-[120px]"
        >
          <h2 className="text-lg font-semibold text-text-primary">
            Gear Marketplace
          </h2>
          <p className="text-sm text-text-secondary mt-2">
            Browse all gear listings — rentals and sales from photographers near
            you
          </p>
        </Link>
      </div>
    </div>
  );
}
