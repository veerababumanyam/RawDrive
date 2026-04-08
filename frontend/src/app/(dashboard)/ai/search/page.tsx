"use client";

import { AISearchBar } from "@/components/ai/AISearchBar";
import { getStoredAccessToken } from "@/lib/auth";

export default function AISearchPage() {
  const token = getStoredAccessToken();

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-4">Semantic Search</h2>
      <p className="text-sm text-text-secondary mb-6">
        Search your photos using natural language. Try &ldquo;bride laughing outdoors&rdquo; or &ldquo;golden hour portraits&rdquo;.
      </p>
      <AISearchBar token={token} />
    </div>
  );
}
