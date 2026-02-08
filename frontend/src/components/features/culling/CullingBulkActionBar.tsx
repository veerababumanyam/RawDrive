/**
 * CullingBulkActionBar Component
 * Bulk actions for selecting/rejecting photos in culling workflow
 */

import React, { useState, useCallback } from 'react';
import {
  Star,
  X,
  RotateCcw,
  CheckCircle,
  XCircle,
  Sparkles,
  Eye,
  ListChecks,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { ConfirmDialog } from '../../ui/Modal';
import type { CullingPhoto } from '../../../services/cullingWorkflowService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CullingBulkActionBarProps {
  /** Selected asset IDs */
  selectedIds: Set<string>;
  /** All photos (for context) */
  photos: CullingPhoto[];
  /** Quality tier breakdown of selected photos */
  selectionBreakdown?: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  /** Callback to clear selection */
  onClearSelection: () => void;
  /** Callback to select all visible photos */
  onSelectAll: () => void;
  /** Callback to select by quality tier */
  onSelectByQuality: (tier: 'excellent' | 'good' | 'fair' | 'all') => void;
  /** Callback to mark selected as best shots */
  onBulkSelect: () => Promise<void>;
  /** Callback to reject selected photos */
  onBulkReject: (reason?: string) => Promise<void>;
  /** Callback to reset selection status */
  onBulkReset: () => Promise<void>;
  /** Callback to preview selected photos */
  onPreviewSelection?: () => void;
  /** Whether actions are loading */
  isLoading?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Rejection Reason Selector
// ---------------------------------------------------------------------------

const REJECTION_REASONS = [
  { id: 'blur', label: 'Blurry / Out of Focus' },
  { id: 'exposure', label: 'Bad Exposure' },
  { id: 'duplicate', label: 'Duplicate / Similar' },
  { id: 'composition', label: 'Poor Composition' },
  { id: 'eyes_closed', label: 'Eyes Closed' },
  { id: 'unflattering', label: 'Unflattering Expression' },
  { id: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const CullingBulkActionBar: React.FC<CullingBulkActionBarProps> = ({
  selectedIds,
  photos,
  onClearSelection,
  onSelectAll,
  onSelectByQuality,
  onBulkSelect,
  onBulkReject,
  onBulkReset,
  onPreviewSelection,
  isLoading = false,
  className = '',
}) => {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [showQualitySelector, setShowQualitySelector] = useState(false);

  const selectedCount = selectedIds.size;

  // Calculate selection breakdown
  const selectionBreakdown = React.useMemo(() => {
    const breakdown = { excellent: 0, good: 0, fair: 0, poor: 0 };
    photos.forEach((photo) => {
      if (selectedIds.has(photo.asset_id)) {
        breakdown[photo.quality_tier as keyof typeof breakdown]++;
      }
    });
    return breakdown;
  }, [photos, selectedIds]);

  const handleBulkSelect = useCallback(async () => {
    await onBulkSelect();
  }, [onBulkSelect]);

  const handleBulkReject = useCallback(async () => {
    await onBulkReject(selectedReason || undefined);
    setShowRejectDialog(false);
    setSelectedReason('');
  }, [onBulkReject, selectedReason]);

  const handleBulkReset = useCallback(async () => {
    await onBulkReset();
    setShowResetDialog(false);
  }, [onBulkReset]);

  if (selectedCount === 0) return null;

  return (
    <>
      <AppCard
        padding="md"
        className={`
          sticky bottom-4 z-20
          bg-surface border-2 border-primary
          shadow-xl backdrop-blur-sm
          mx-4 rounded-xl
          ${className}
        `}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left: Selection Info */}
          <div className="flex items-center gap-4">
            {/* Selection count badge */}
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <span className="text-white font-bold">{selectedCount}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">
                  {selectedCount === 1 ? 'photo' : 'photos'} selected
                </span>
                {selectedCount > 0 && (
                  <span className="text-xs text-text-tertiary">
                    {selectionBreakdown.excellent > 0 && (
                      <span className="text-green-500">{selectionBreakdown.excellent} excellent</span>
                    )}
                    {selectionBreakdown.good > 0 && (
                      <span className="text-blue-500 ml-1">{selectionBreakdown.good} good</span>
                    )}
                    {selectionBreakdown.fair > 0 && (
                      <span className="text-yellow-500 ml-1">{selectionBreakdown.fair} fair</span>
                    )}
                    {selectionBreakdown.poor > 0 && (
                      <span className="text-red-500 ml-1">{selectionBreakdown.poor} poor</span>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Quick selection actions */}
            <div className="flex items-center gap-1 border-l border-border pl-4">
              <div className="relative">
                <AppButton
                  variant="ghost"
                  size="sm"
                  leftIcon={<ListChecks size={16} />}
                  onClick={() => setShowQualitySelector(!showQualitySelector)}
                >
                  Quick Select
                </AppButton>

                {showQualitySelector && (
                  <div className="absolute bottom-full mb-2 left-0 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[160px] z-30">
                    <button
                      onClick={() => {
                        onSelectAll();
                        setShowQualitySelector(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary"
                    >
                      Select All Visible
                    </button>
                    <button
                      onClick={() => {
                        onSelectByQuality('excellent');
                        setShowQualitySelector(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary text-green-500"
                    >
                      <Sparkles size={14} className="inline mr-2" />
                      Excellent Only
                    </button>
                    <button
                      onClick={() => {
                        onSelectByQuality('good');
                        setShowQualitySelector(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary text-blue-500"
                    >
                      Good & Above
                    </button>
                    <button
                      onClick={() => {
                        onSelectByQuality('fair');
                        setShowQualitySelector(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary text-yellow-500"
                    >
                      Fair & Above
                    </button>
                    <hr className="my-1 border-border" />
                    <button
                      onClick={() => {
                        onClearSelection();
                        setShowQualitySelector(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary text-text-tertiary"
                    >
                      Clear Selection
                    </button>
                  </div>
                )}
              </div>

              <AppButton
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                className="text-text-tertiary hover:text-text-primary"
              >
                <X size={16} className="mr-1" />
                Clear
              </AppButton>
            </div>
          </div>

          {/* Right: Bulk Actions */}
          <div className="flex items-center gap-2">
            {/* Preview */}
            {onPreviewSelection && (
              <AppButton
                variant="ghost"
                size="sm"
                leftIcon={<Eye size={16} />}
                onClick={onPreviewSelection}
                disabled={isLoading}
              >
                Preview
              </AppButton>
            )}

            {/* Reset */}
            <AppButton
              variant="outline"
              size="sm"
              leftIcon={<RotateCcw size={16} />}
              onClick={() => setShowResetDialog(true)}
              disabled={isLoading}
              className="text-text-secondary"
            >
              Reset
            </AppButton>

            {/* Reject */}
            <AppButton
              variant="outline"
              size="sm"
              leftIcon={<XCircle size={16} />}
              onClick={() => setShowRejectDialog(true)}
              disabled={isLoading}
              className="text-red-500 border-red-500/30 hover:bg-red-500/10"
            >
              Reject
            </AppButton>

            {/* Select as Best */}
            <AppButton
              variant="primary"
              size="sm"
              leftIcon={<Star size={16} />}
              onClick={handleBulkSelect}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              Mark as Best
            </AppButton>
          </div>
        </div>
      </AppCard>

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowRejectDialog(false)}
        >
          <AppCard
            padding="lg"
            className="max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">
                    Reject {selectedCount} {selectedCount === 1 ? 'Photo' : 'Photos'}
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Select a reason (optional)
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {REJECTION_REASONS.map((reason) => (
                  <button
                    key={reason.id}
                    onClick={() =>
                      setSelectedReason(selectedReason === reason.id ? '' : reason.id)
                    }
                    className={`
                      w-full px-4 py-3 text-left rounded-lg border transition-colors
                      ${selectedReason === reason.id
                        ? 'border-red-500 bg-red-500/10 text-red-600'
                        : 'border-border hover:bg-surface-secondary text-text-primary'
                      }
                    `}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                <AppButton
                  variant="outline"
                  onClick={() => {
                    setShowRejectDialog(false);
                    setSelectedReason('');
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </AppButton>
                <AppButton
                  variant="destructive"
                  onClick={handleBulkReject}
                  disabled={isLoading}
                  leftIcon={<XCircle size={16} />}
                >
                  Reject {selectedCount} {selectedCount === 1 ? 'Photo' : 'Photos'}
                </AppButton>
              </div>
            </div>
          </AppCard>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        onConfirm={handleBulkReset}
        title="Reset Selection Status?"
        message={`This will reset the selection/rejection status for ${selectedCount} ${selectedCount === 1 ? 'photo' : 'photos'} back to pending.`}
        confirmText="Reset"
        cancelText="Cancel"
        isLoading={isLoading}
      />
    </>
  );
};

export default CullingBulkActionBar;
