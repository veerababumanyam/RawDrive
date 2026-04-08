"use client";

import { useState } from "react";
import { FaceClusterBrowser } from "@/components/ai/FaceClusterBrowser";
import { FaceClusterDetail } from "@/components/ai/FaceClusterDetail";
import { getStoredAccessToken } from "@/lib/auth";

export default function AIFacesPage() {
  const token = getStoredAccessToken();
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-4">People</h2>
      <p className="text-sm text-text-secondary mb-6">
        AI-detected people across your galleries. Click to see all photos of a person.
      </p>

      {selectedCluster ? (
        <div>
          <button
            onClick={() => setSelectedCluster(null)}
            className="mb-4 text-sm text-accent hover:underline min-h-[44px]"
          >
            &larr; Back to all people
          </button>
          <FaceClusterDetail token={token} clusterLabel={selectedCluster} clusterName="" />
        </div>
      ) : (
        <FaceClusterBrowser token={token} onSelectCluster={setSelectedCluster} />
      )}
    </div>
  );
}
