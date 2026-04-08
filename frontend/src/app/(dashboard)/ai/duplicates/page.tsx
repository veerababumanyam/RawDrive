"use client";

import { useEffect, useState } from "react";
import { getDuplicates, type DuplicateGroup } from "@/lib/api/ai";
import { DuplicateComparison } from "@/components/ai/DuplicateComparison";
import { getStoredAccessToken } from "@/lib/auth";

export default function AIDuplicatesPage() {
  const token = getStoredAccessToken();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    getDuplicates(token, "pending")
      .then((data) => setGroups(data.groups))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-accent" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-4">Duplicate Detection</h2>
      <p className="text-sm text-text-secondary mb-6">
        AI-detected near-identical photos. Review and keep the best versions.
      </p>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-surface-raised p-8 text-center">
          <p className="text-text-secondary text-sm">No duplicate groups found. Run a scan from gallery settings.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <DuplicateComparison key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
