"use client";

import { useEffect, useState } from "react";
import { getDuplicates, type DuplicateGroup } from "@/lib/api/ai";
import { DuplicateComparison } from "@/components/ai/DuplicateComparison";
import { getStoredAccessToken } from "@/lib/auth";

export default function AIDuplicatesPage() {
  const token = getStoredAccessToken();
  const requestKey = token ? "duplicates" : "unauthenticated";
  const [requestState, setRequestState] = useState<{
    key: string;
    groups: DuplicateGroup[];
  }>({
    key: "",
    groups: [],
  });

  const groups = requestState.key === requestKey ? requestState.groups : [];
  const loading = Boolean(token) && requestState.key !== requestKey;

  useEffect(() => {
    if (!token) {
      return;
    }

    let ignore = false;

    getDuplicates(token, "pending")
      .then((data) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            groups: data.groups,
          });
        }
      })
      .catch((error) => {
        console.error(error);
        if (!ignore) {
          setRequestState({
            key: requestKey,
            groups: [],
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [requestKey, token]);

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
