/**
 * DownloadTrackingPanel Component
 * Photographer-facing panel showing download history for a gallery.
 * Fetches from GET /galleries/{id}/downloads/log with pagination.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DownloadLogEntry {
  id: string;
  asset_id: string;
  visitor_token: string;
  size: string;
  file_size_bytes: number;
  created_at: string;
}

interface DownloadLogResponse {
  downloads: DownloadLogEntry[];
  total_count: number;
  total_bytes: number;
}

export interface DownloadTrackingPanelProps {
  galleryId: string;
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function maskVisitorToken(token: string): string {
  return token.substring(0, 8) + '...';
}

const PER_PAGE = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DownloadTrackingPanel: React.FC<DownloadTrackingPanelProps> = ({
  galleryId,
  workspaceId,
}) => {
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery<DownloadLogResponse>({
    queryKey: ['download-log', galleryId, page],
    queryFn: async () => {
      const resp = await fetch(
        `/api/v1/galleries/${galleryId}/downloads/log?page=${page}&per_page=${PER_PAGE}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        },
      );
      if (!resp.ok) throw new Error('Failed to load download log');
      return resp.json();
    },
    staleTime: 30_000,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total_count / PER_PAGE)) : 1;

  if (isLoading) {
    return (
      <div className="p-6 text-center text-text-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-2" />
        Loading download history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-500">
        Failed to load download history.
      </div>
    );
  }

  if (!data || data.downloads.length === 0) {
    return (
      <div className="p-8 text-center text-text-secondary">
        <Download className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No downloads yet</p>
        <p className="text-sm mt-1">Downloads will appear here when clients download photos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with totals */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-text-primary">
          {data.total_count} downloads
        </h3>
        <span className="text-sm text-text-secondary">
          Total: {formatBytes(data.total_bytes)}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-hover border-b border-border">
              <th className="text-left px-4 py-2.5 font-medium text-text-secondary">Visitor</th>
              <th className="text-left px-4 py-2.5 font-medium text-text-secondary">Photo</th>
              <th className="text-left px-4 py-2.5 font-medium text-text-secondary">Size</th>
              <th className="text-right px-4 py-2.5 font-medium text-text-secondary">File Size</th>
              <th className="text-right px-4 py-2.5 font-medium text-text-secondary">Date</th>
            </tr>
          </thead>
          <tbody>
            {data.downloads.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors"
              >
                <td className="px-4 py-2.5 text-text-primary font-mono text-xs">
                  {maskVisitorToken(entry.visitor_token)}
                </td>
                <td className="px-4 py-2.5 text-text-secondary font-mono text-xs">
                  {entry.asset_id.substring(0, 8)}...
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    entry.size === 'original'
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                      : entry.size === 'print'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                  }`}>
                    {entry.size}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-text-secondary">
                  {formatBytes(entry.file_size_bytes)}
                </td>
                <td className="px-4 py-2.5 text-right text-text-secondary">
                  {formatRelativeDate(entry.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
            Prev
          </button>
          <span className="text-sm text-text-secondary">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
