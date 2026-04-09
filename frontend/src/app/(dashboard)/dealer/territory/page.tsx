"use client";

import { MapPin } from "lucide-react";

export default function DealerTerritoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
          My Territory
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Your assigned geographic region and coverage area.
        </p>
      </div>
      <div className="glass-card flex flex-col items-center gap-4 rounded-2xl p-12 text-center">
        <MapPin className="h-12 w-12 text-text-tertiary" />
        <p className="text-sm text-text-tertiary">
          Territory map and coverage details will be available here.
        </p>
      </div>
    </div>
  );
}
