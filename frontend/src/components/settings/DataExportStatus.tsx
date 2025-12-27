import React from 'react';
import { Download, Loader2, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { AppButton } from '../ui/AppButton';
import type { DataExportStatus as ExportStatus } from '../../types/userSettings';

/* =============================================================================
   DataExportStatus Component

   Displays the status of data export request and provides actions.
   States: pending, processing, completed (with download), failed, expired
   ============================================================================= */

interface DataExportStatusProps {
  /** Export request status */
  status: ExportStatus | null;
  /** Requested at timestamp */
  requestedAt?: string;
  /** Completed at timestamp */
  completedAt?: string;
  /** Download URL (when completed) */
  downloadUrl?: string;
  /** Expiry timestamp */
  expiresAt?: string;
  /** Whether a request is in progress */
  isRequesting: boolean;
  /** Request export handler */
  onRequestExport: () => void;
  /** Retry after seconds (when rate limited) */
  retryAfter?: number;
}

const StatusIcon: React.FC<{ status: ExportStatus | null }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <Clock className="w-5 h-5 text-warning" />;
    case 'processing':
      return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
    case 'completed':
      return <CheckCircle className="w-5 h-5 text-success" />;
    case 'failed':
    case 'expired':
      return <XCircle className="w-5 h-5 text-error" />;
    default:
      return <Download className="w-5 h-5 text-text-tertiary" />;
  }
};

const StatusText: React.FC<{ status: ExportStatus | null }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <span className="text-warning">Export queued</span>;
    case 'processing':
      return <span className="text-primary">Generating export...</span>;
    case 'completed':
      return <span className="text-success">Export ready</span>;
    case 'failed':
      return <span className="text-error">Export failed</span>;
    case 'expired':
      return <span className="text-error">Export expired</span>;
    default:
      return <span className="text-text-secondary">No active export</span>;
  }
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTimeRemaining = (expiresAt: string): string => {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} remaining`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} remaining`;
  }
  return 'Expires soon';
};

export const DataExportStatus: React.FC<DataExportStatusProps> = ({
  status,
  requestedAt,
  completedAt,
  downloadUrl,
  expiresAt,
  isRequesting,
  onRequestExport,
  retryAfter,
}) => {
  const canRequestExport = !status || status === 'failed' || status === 'expired';
  const isRateLimited = Boolean(retryAfter && retryAfter > 0);

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface-hover/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-medium text-text-primary">Export Your Data</h3>
            <p className="text-sm text-text-secondary">
              Download a copy of all your data (GDPR compliant)
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Status display */}
        {status && (
          <div className="flex items-center gap-3 p-3 bg-surface-hover rounded-lg">
            <StatusIcon status={status} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                <StatusText status={status} />
              </div>
              {requestedAt && (
                <p className="text-xs text-text-tertiary">
                  Requested: {formatDate(requestedAt)}
                </p>
              )}
              {completedAt && status === 'completed' && (
                <p className="text-xs text-text-tertiary">
                  Completed: {formatDate(completedAt)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Download button when completed */}
        {status === 'completed' && downloadUrl && (
          <div className="space-y-2">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <AppButton
                variant="primary"
                className="w-full"
                leftIcon={<Download className="w-4 h-4" />}
              >
                Download Your Data
              </AppButton>
            </a>
            {expiresAt && (
              <p className="text-xs text-text-tertiary text-center">
                {formatTimeRemaining(expiresAt)}
              </p>
            )}
          </div>
        )}

        {/* Request export button */}
        {canRequestExport && (
          <div className="space-y-2">
            <AppButton
              variant={status ? 'outline' : 'primary'}
              className="w-full"
              onClick={onRequestExport}
              isLoading={isRequesting}
              loadingText="Requesting..."
              disabled={isRateLimited}
              leftIcon={
                status ? (
                  <RefreshCw className="w-4 h-4" />
                ) : (
                  <Download className="w-4 h-4" />
                )
              }
            >
              {status ? 'Request New Export' : 'Request Data Export'}
            </AppButton>
            {isRateLimited && retryAfter && (
              <p className="text-xs text-warning text-center">
                You can request a new export in{' '}
                {Math.ceil(retryAfter / 3600)} hours
              </p>
            )}
          </div>
        )}

        {/* Processing state */}
        {(status === 'pending' || status === 'processing') && (
          <p className="text-sm text-text-secondary text-center">
            We&apos;re preparing your data. This may take a few minutes.
            You&apos;ll receive an email when it&apos;s ready.
          </p>
        )}

        {/* Info text */}
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-text-tertiary">
            Your export includes your profile, galleries, photos metadata, and activity.
            Exports are available for 7 days after generation.
            You can request one export per 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DataExportStatus;
