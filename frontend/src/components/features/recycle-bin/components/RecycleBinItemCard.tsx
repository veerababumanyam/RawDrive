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
        <div
            className={`
                group glass-card glass-card-hover rounded-2xl overflow-hidden transition-all duration-300
                ${isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/10' : ''}
                ${hasFailed ? 'ring-2 ring-error/50 bg-error/5' : ''}
            `}
        >
            {/* Selection checkbox */}
            <button
                onClick={() => onSelect(item.id)}
                className="
                    absolute top-3 left-3 z-10
                    p-1.5 rounded-lg
                    bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm
                    shadow-md hover:shadow-lg
                    hover:bg-white dark:hover:bg-slate-800
                    transition-all duration-200
                    border border-white/50 dark:border-slate-700/50
                "
                aria-label={isSelected ? 'Deselect item' : 'Select item'}
            >
                {isSelected ? (
                    <CheckSquare size={20} className="text-primary" />
                ) : (
                    <Square size={20} className="text-text-tertiary group-hover:text-text-secondary" />
                )}
            </button>

            {/* Thumbnail / Icon - clickable for photos */}
            <div
                className={`
                    relative aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900
                    flex items-center justify-center
                    overflow-hidden
                    ${item.type === 'photo' && item.thumbnailUrl ? 'cursor-pointer' : ''}
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
                    <>
                        <img
                            src={imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        {/* Hover overlay for photos */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                    </>
                ) : item.type === 'gallery' ? (
                    <div className="icon-container icon-container-lg icon-container-accent rounded-xl">
                        <FolderOpen size={28} />
                    </div>
                ) : (
                    <div className="icon-container icon-container-lg icon-container-primary rounded-xl">
                        <ImageIcon size={28} />
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-4 space-y-3 border-t border-border/30">
                <div>
                    <h3 className="font-semibold text-text-primary truncate group-hover:text-primary transition-colors" title={item.name}>
                        {item.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-medium text-text-tertiary capitalize bg-surface-hover px-2 py-0.5 rounded-full">
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
                        flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg
                        ${warningLevel === 'failed'
                            ? 'text-error font-medium bg-error/10 border border-error/20'
                            : warningLevel === 'critical'
                                ? 'text-error bg-error/10 border border-error/20'
                                : warningLevel === 'warning'
                                    ? 'text-warning bg-warning/10 border border-warning/20'
                                    : 'text-text-tertiary bg-surface-hover'
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
                        className="bg-red-600 hover:bg-red-700 text-white border-red-600 px-3 shadow-sm hover:shadow-md transition-shadow"
                        onClick={() => onPermanentDelete(item)}
                        isLoading={isDeleting}
                        disabled={isRestoring}
                        aria-label={hasFailed ? "Retry delete" : "Delete forever"}
                    >
                        <Trash2 size={14} />
                    </AppButton>
                </div>
            </div>
        </div>
    );
};

export const RecycleBinItemCard = React.memo(RecycleBinItemCardComponent);
export default RecycleBinItemCard;
