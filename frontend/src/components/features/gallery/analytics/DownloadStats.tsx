/**
 * DownloadStats Component
 *
 * Summary cards showing total downloads and bandwidth.
 */

import React from 'react';
import { Download, HardDrive } from 'lucide-react';

interface DownloadStatsProps {
  totalDownloads: number;
  totalBytes: number;
}

/**
 * Format bytes to human-readable size.
 * Uses formatFileSize pattern from @rawdrive/shared-utils.
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export const DownloadStats: React.FC<DownloadStatsProps> = ({
  totalDownloads,
  totalBytes,
}) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex items-center gap-3 p-4 bg-surface-secondary dark:bg-slate-800/50 rounded-xl">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
          <Download size={18} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <p className="text-2xl font-bold text-text-primary">{totalDownloads.toLocaleString()}</p>
          <p className="text-xs text-text-tertiary">Total Downloads</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-4 bg-surface-secondary dark:bg-slate-800/50 rounded-xl">
        <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
          <HardDrive size={18} className="text-cyan-600 dark:text-cyan-400" />
        </div>
        <div>
          <p className="text-2xl font-bold text-text-primary">{formatFileSize(totalBytes)}</p>
          <p className="text-xs text-text-tertiary">Total Bandwidth</p>
        </div>
      </div>
    </div>
  );
};
