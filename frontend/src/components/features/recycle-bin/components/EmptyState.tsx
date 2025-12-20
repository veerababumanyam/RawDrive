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
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-background-alt flex items-center justify-center mb-4">
                <Trash2 size={32} className="text-text-tertiary" />
            </div>
            <h3 className="text-lg font-medium text-text-primary mb-2">
                {getMessage(filter)}
            </h3>
            <p className="text-sm text-text-secondary max-w-sm">
                Deleted items will appear here for {RECYCLE_BIN_CONSTANTS.DEFAULT_RETENTION_DAYS} days before being permanently removed.
            </p>
        </div>
    );
};

export default EmptyState;
