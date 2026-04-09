"use client";

import { Heart } from "lucide-react";

export default function FavoritesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
          Favorites
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Photos you have starred or favorited across your galleries.
        </p>
      </div>
      <div className="glass-card flex flex-col items-center gap-4 rounded-2xl p-12 text-center">
        <Heart className="h-12 w-12 text-text-tertiary" />
        <p className="text-sm text-text-tertiary">
          Your favorited photos will appear here.
        </p>
      </div>
    </div>
  );
}
