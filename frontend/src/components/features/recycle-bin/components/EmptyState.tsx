/**
 * EmptyState Component
 * Displays message when recycle bin is empty or no filtered results
 */

import React from 'react';
import { Trash2 } from 'lucide-react';
import { RECYCLE_BIN_CONSTANTS } from '../constants';

type FilterType = 'all' | 'gallery' | 'photo';

interface EmptyStateProps {
    filter: FilterType;
}

const getMessage = (filter: FilterType): string => {
    switch (filter) {
        case 'gallery':
            return 'No deleted galleries';
        case 'photo':
            return 'No deleted photos';
        default:
            return 'Recycle bin is empty';
    }
};

export const EmptyState: React.FC<EmptyStateProps> = ({ filter }) => {
    return (
        <div className="glass-card rounded-2xl p-8 sm:p-12">
            <div className="flex flex-col items-center justify-center text-center">
                <div className="empty-state-icon mb-6">
                    <Trash2 size={32} />
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                    {getMessage(filter)}
                </h3>
                <p className="text-sm text-text-secondary max-w-sm">
                    Deleted items will appear here for {RECYCLE_BIN_CONSTANTS.DEFAULT_RETENTION_DAYS} days before being permanently removed.
                </p>
            </div>
        </div>
    );
};

export default EmptyState;
