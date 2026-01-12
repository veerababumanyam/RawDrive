/**
 * ApprovalBadge Component
 * Displays album approval status with visual indicator
 *
 * Feature: 026-album-proofing
 */

import { useTranslation } from 'react-i18next';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';
import type { AlbumStatus } from '../../../types/album';

interface ApprovalBadgeProps {
  status: AlbumStatus;
  approvedByEmail?: string;
  approvedAt?: string;
  className?: string;
}

export function ApprovalBadge({
  status,
  approvedByEmail,
  approvedAt,
  className = '',
}: ApprovalBadgeProps) {
  const { t } = useTranslation('album');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Approved status
  if (status === 'approved' || status === 'exported') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full ${className}`}
        role="status"
        aria-label={t('status.approvedLabel')}
      >
        <CheckCircle className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm font-medium">
          {approvedByEmail && approvedAt
            ? t('status.approvedBy', {
                email: approvedByEmail,
                date: formatDate(approvedAt),
              })
            : t('status.approved')}
        </span>
      </div>
    );
  }

  // Changes requested
  if (status === 'changes_requested') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-full ${className}`}
        role="status"
        aria-label={t('status.changesRequestedLabel')}
      >
        <AlertCircle className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm font-medium">{t('status.changesRequested')}</span>
      </div>
    );
  }

  // Proof sent - pending approval
  if (status === 'proof_sent') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full ${className}`}
        role="status"
        aria-label={t('status.pendingApprovalLabel')}
      >
        <Clock className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm font-medium">{t('status.pendingApproval')}</span>
      </div>
    );
  }

  // Draft status
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full ${className}`}
      role="status"
      aria-label={t('status.draftLabel')}
    >
      <Clock className="w-4 h-4" aria-hidden="true" />
      <span className="text-sm font-medium">{t('status.draft')}</span>
    </div>
  );
}

export default ApprovalBadge;
