"use client";

import { useEffect, useState } from "react";
import {
  getFaceClusters,
  renameCluster,
  type ClusterSummary,
} from "@/lib/api/ai";

interface FaceClusterBrowserProps {
  token: string;
  galleryId?: string;
  onSelectCluster?: (clusterLabel: string) => void;
}

export function FaceClusterBrowser({
  token,
  galleryId,
  onSelectCluster,
}: FaceClusterBrowserProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const requestKey = galleryId || "__all__";
  const [requestState, setRequestState] = useState<{
    key: string;
    clusters: ClusterSummary[];
  }>({
    key: "",
    clusters: [],
  });

  const clusters = requestState.key === requestKey ? requestState.clusters : [];
  const loading = requestState.key !== requestKey;

  useEffect(() => {
    let ignore = false;

    getFaceClusters(token, galleryId)
      .then((data) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            clusters: data,
          });
        }
      })
      .catch((error) => {
        console.error(error);
        if (!ignore) {
          setRequestState({
            key: requestKey,
            clusters: [],
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [galleryId, requestKey, token]);

  const handleRename = async (clusterLabel: string) => {
    if (!editName.trim()) return;
    await renameCluster(token, clusterLabel, editName.trim());
    setRequestState((prev) => ({
      ...prev,
      clusters: prev.clusters.map((cluster) =>
        cluster.cluster_label === clusterLabel
          ? { ...cluster, cluster_name: editName.trim() }
          : cluster,
      ),
    }));
    setEditingId(null);
    setEditName("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-accent" />
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-surface-raised p-8 text-center">
        <p className="text-text-secondary text-sm">
          No people detected yet. Upload photos to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {clusters.map((cluster) => (
        <button
          key={cluster.cluster_label}
          onClick={() => onSelectCluster?.(cluster.cluster_label)}
          className="group flex flex-col items-center gap-2 rounded-xl border border-border-default bg-surface-raised p-4 transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-accent min-h-[44px]"
        >
          <div className="h-16 w-16 rounded-full bg-surface-sunken flex items-center justify-center text-text-tertiary text-xl font-semibold">
            {(cluster.cluster_name || "?")[0]?.toUpperCase()}
          </div>

          {editingId === cluster.cluster_label ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => handleRename(cluster.cluster_label)}
              onKeyDown={(e) =>
                e.key === "Enter" && handleRename(cluster.cluster_label)
              }
              className="w-full rounded border border-border-default bg-surface-base px-2 py-1 text-sm text-text-primary text-center"
            />
          ) : (
            <span
              className="text-sm font-medium text-text-primary cursor-pointer"
              onDoubleClick={() => {
                setEditingId(cluster.cluster_label);
                setEditName(cluster.cluster_name);
              }}
            >
              {cluster.cluster_name || "Unknown"}
            </span>
          )}

          <span className="text-xs text-text-tertiary">
            {cluster.face_count} {cluster.face_count === 1 ? "photo" : "photos"}
          </span>
        </button>
      ))}
    </div>
  );
}
