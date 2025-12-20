/**
 * RecycleBinItemCard Component
 * Individual item card for deleted galleries and photos in the recycle bin
 */

import React from 'react';
import {
    RotateCcw,
    Clock,
    Image as ImageIcon,
    FolderOpen,
    AlertTriangle,
    Trash2,
    CheckSquare,
    Square,
} from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';
import { AppCard } from '../../../ui/AppCard';
import type { RecycleBinItem } from '../../../../types/recycleBin';
import { buildAssetUrl, formatDaysRemaining, getWarningLevel } from '../utils';

interface RecycleBinItemCardProps {
    item: RecycleBinItem;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onRestore: (item: RecycleBinItem) => void;
    onPermanentDelete: (item: RecycleBinItem) => void;
    onImageClick?: (item: RecycleBinItem) => void;
    isRestoring: boolean;
    isDeleting: boolean;
}

const RecycleBinItemCardComponent: React.FC<RecycleBinItemCardProps> = ({
    item,
    isSelected,
    onSelect,
    onRestore,
    onPermanentDelete,
    onImageClick,
    isRestoring,
    isDeleting,
}) => {
    const warningLevel = getWarningLevel(item.daysUntilPermanentDelete, item.deleteStatus);
    const hasFailed = item.deleteStatus === 'delete_failed';
    const daysLabel = formatDaysRemaining(item.daysUntilPermanentDelete);
    const imageUrl = buildAssetUrl(item.thumbnailUrl);

    return (
        <AppCard
            className={`
        relative overflow-hidden transition-all
        ${isSelected ? 'ring-2 ring-primary' : ''}
        ${hasFailed ? 'ring-2 ring-error/50 bg-error/5' : ''}
      `}
            hoverable
        >
            {/* Selection checkbox */}
            <button
                onClick={() => onSelect(item.id)}
                className="
          absolute top-3 left-3 z-10
          p-1 rounded
          bg-surface/80 backdrop-blur-sm
          hover:bg-surface
          transition-colors
        "
                aria-label={isSelected ? 'Deselect item' : 'Select item'}
            >
                {isSelected ? (
                    <CheckSquare size={20} className="text-primary" />
                ) : (
                    <Square size={20} className="text-text-tertiary" />
                )}
            </button>

            {/* Thumbnail / Icon - clickable for photos */}
            <div
                className={`
          aspect-[4/3] bg-background-alt
          flex items-center justify-center
          border-b border-border
          ${item.type === 'photo' && item.thumbnailUrl ? 'cursor-pointer hover:opacity-70 transition-opacity' : ''}
        `}
                onClick={() => {
                    if (item.type === 'photo' && item.thumbnailUrl && onImageClick) {
                        onImageClick(item);
                    }
                }}
                role={item.type === 'photo' && item.thumbnailUrl ? 'button' : undefined}
                tabIndex={item.type === 'photo' && item.thumbnailUrl ? 0 : undefined}
                aria-label={item.type === 'photo' && item.thumbnailUrl ? `View ${item.name}` : undefined}
                onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && item.type === 'photo' && item.thumbnailUrl && onImageClick) {
                        e.preventDefault();
                        onImageClick(item);
                    }
                }}
            >
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                    />
                ) : item.type === 'gallery' ? (
                    <FolderOpen size={48} className="text-text-tertiary" />
                ) : (
                    <ImageIcon size={48} className="text-text-tertiary" />
                )}
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
                <div>
                    <h3 className="font-medium text-text-primary truncate" title={item.name}>
                        {item.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-text-tertiary capitalize">
                            {item.type}
                        </span>
                        {item.type === 'gallery' && item.photoCount !== undefined && (
                            <>
                                <span className="text-text-tertiary">·</span>
                                <span className="text-xs text-text-tertiary">
                                    {item.photoCount} photo{item.photoCount !== 1 ? 's' : ''}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Status indicator */}
                <div
                    className={`
            flex items-center gap-1.5 text-xs
            ${warningLevel === 'failed'
                            ? 'text-error font-medium'
                            : warningLevel === 'critical'
                                ? 'text-error'
                                : warningLevel === 'warning'
                                    ? 'text-warning'
                                    : 'text-text-tertiary'
                        }
          `}
                >
                    {warningLevel === 'failed' ? (
                        <>
                            <AlertTriangle size={14} />
                            <span>Deletion failed - tap to retry</span>
                        </>
                    ) : warningLevel === 'critical' ? (
                        <>
                            <AlertTriangle size={14} />
                            <span>{daysLabel}</span>
                        </>
                    ) : (
                        <>
                            <Clock size={14} />
                            <span>{daysLabel}</span>
                        </>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <AppButton
                        variant="secondary"
                        size="sm"
                        fullWidth
                        leftIcon={<RotateCcw size={14} />}
                        onClick={() => onRestore(item)}
                        isLoading={isRestoring}
                        disabled={isDeleting}
                    >
                        Restore
                    </AppButton>
                    <AppButton
                        variant="destructive"
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white border-red-600 px-3"
                        onClick={() => onPermanentDelete(item)}
                        isLoading={isDeleting}
                        disabled={isRestoring}
                        aria-label={hasFailed ? "Retry delete" : "Delete forever"}
                    >
                        <Trash2 size={14} />
                    </AppButton>
                </div>
            </div>
        </AppCard>
    );
};

export const RecycleBinItemCard = React.memo(RecycleBinItemCardComponent);
export default RecycleBinItemCard;
