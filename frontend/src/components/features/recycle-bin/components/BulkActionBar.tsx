/**
 * BulkActionBar Component
 * Floating action bar for bulk operations in recycle bin
 */

import React from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';

interface BulkActionBarProps {
    selectedCount: number;
    onRestore: () => void;
    onPermanentDelete: () => void;
    onClearSelection: () => void;
    isRestoring: boolean;
    isDeleting: boolean;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
    selectedCount,
    onRestore,
    onPermanentDelete,
    onClearSelection,
    isRestoring,
    isDeleting,
}) => {
    if (selectedCount === 0) return null;

    return (
        <div
            className="
        fixed bottom-6 left-1/2 -translate-x-1/2
        flex items-center gap-4
        px-6 py-3
        bg-surface/95 backdrop-blur-md
        border border-border
        rounded-full shadow-lg
        animate-slide-in-bottom
        z-50
      "
            role="toolbar"
            aria-label="Bulk actions"
        >
            <span className="text-sm font-medium text-text-primary">
                {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
            </span>

            <div className="h-6 w-px bg-border" />

            <AppButton
                variant="secondary"
                size="sm"
                leftIcon={<RotateCcw size={16} />}
                onClick={onRestore}
                isLoading={isRestoring}
                disabled={isDeleting}
            >
                Restore
            </AppButton>

            <AppButton
                variant="destructive"
                size="sm"
                leftIcon={<Trash2 size={16} />}
                onClick={onPermanentDelete}
                isLoading={isDeleting}
                disabled={isRestoring}
                className="bg-red-600 hover:bg-red-700 text-white border-red-600"
            >
                Delete Forever
            </AppButton>

            <div className="h-6 w-px bg-border" />

            <AppButton
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                disabled={isRestoring || isDeleting}
            >
                Clear
            </AppButton>
        </div>
    );
};

export default React.memo(BulkActionBar);
