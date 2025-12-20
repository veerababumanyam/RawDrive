/**
 * RecycleBinLightbox Component
 * Simplified lightbox for viewing deleted photos with restore option
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AppButton } from '../../ui/AppButton';
import { type RecycleBinItem } from '../../../types/recycleBin';
import { RECYCLE_BIN_CONSTANTS } from './constants';
import { buildAssetUrl } from './utils';

export interface RecycleBinLightboxProps {
    /** Whether the lightbox is open */
    isOpen: boolean;
    /** Callback when lightbox should close */
    onClose: () => void;
    /** Current item being viewed */
    currentItem: RecycleBinItem | null;
    /** All photo items (only photos, not galleries) */
    items: RecycleBinItem[];
    /** Current item index */
    currentIndex: number;
    /** Callback when navigating to a different item */
    onNavigate: (index: number) => void;
    /** Callback when restore is requested */
    onRestore: (item: RecycleBinItem) => void;
    /** Callback when permanent delete is requested */
    onPermanentDelete: (item: RecycleBinItem) => void;
    /** Whether restore is in progress */
    isRestoring?: boolean;
    /** Whether delete is in progress */
    isDeleting?: boolean;
}

export const RecycleBinLightbox: React.FC<RecycleBinLightboxProps> = ({
    isOpen,
    onClose,
    currentItem,
    items,
    currentIndex,
    onNavigate,
    onRestore,
    onPermanentDelete,
    isRestoring = false,
    isDeleting = false,
}) => {
    const [zoom, setZoom] = useState(1);
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);

    // Reset zoom and loading state when item changes
    useEffect(() => {
        if (isOpen && currentItem) {
            setZoom(1);
            setImageLoading(true);
            setImageError(false);
        }
    }, [isOpen, currentItem?.id]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (['ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) {
                e.preventDefault();
            }

            switch (e.key) {
                case 'Escape':
                    onClose();
                    break;
                case 'ArrowLeft':
                    if (currentIndex > 0) {
                        onNavigate(currentIndex - 1);
                    }
                    break;
                case 'ArrowRight':
                    if (currentIndex < items.length - 1) {
                        onNavigate(currentIndex + 1);
                    }
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, currentIndex, items.length, onClose, onNavigate]);

    // Prevent body scroll when lightbox is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Zoom functions
    const handleZoomIn = useCallback(() => {
        setZoom((prev) => Math.min(RECYCLE_BIN_CONSTANTS.ZOOM_MAX, prev + RECYCLE_BIN_CONSTANTS.ZOOM_STEP));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoom((prev) => Math.max(RECYCLE_BIN_CONSTANTS.ZOOM_MIN, prev - RECYCLE_BIN_CONSTANTS.ZOOM_STEP));
    }, []);

    // Navigation
    const handlePrevious = useCallback(() => {
        if (currentIndex > 0) {
            onNavigate(currentIndex - 1);
        }
    }, [currentIndex, onNavigate]);

    const handleNext = useCallback(() => {
        if (currentIndex < items.length - 1) {
            onNavigate(currentIndex + 1);
        }
    }, [currentIndex, items.length, onNavigate]);

    if (!isOpen || !currentItem) return null;

    // Build full image URL using utility
    const imageUrl = buildAssetUrl(currentItem.thumbnailUrl);

    const lightbox = (
        <div
            className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recycle-lightbox-title"
        >
            {/* Close Button */}
            <AppButton
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="absolute top-4 right-4 z-50 bg-black/50 hover:bg-black/70 text-white border-white/20"
                aria-label="Close lightbox"
            >
                <X size={24} />
            </AppButton>

            {/* Navigation Arrows */}
            {currentIndex > 0 && (
                <button
                    onClick={handlePrevious}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full border border-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    aria-label="Previous photo"
                >
                    <ChevronLeft size={24} />
                </button>
            )}

            {currentIndex < items.length - 1 && (
                <button
                    onClick={handleNext}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full border border-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    aria-label="Next photo"
                >
                    <ChevronRight size={24} />
                </button>
            )}

            {/* Image Container */}
            <div className="absolute inset-0 flex items-center justify-center p-4 overflow-hidden">
                {imageLoading && !imageError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white">
                        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                        <p>Loading image...</p>
                    </div>
                )}
                {imageError || !imageUrl ? (
                    <div className="flex flex-col items-center gap-4 text-white">
                        <p>Failed to load image</p>
                    </div>
                ) : (
                    <img
                        src={imageUrl}
                        alt={currentItem.name}
                        className={`max-w-full max-h-full object-contain select-none transition-transform duration-200 ${imageLoading ? 'opacity-0' : 'opacity-100'
                            }`}
                        style={{
                            transform: `scale(${zoom})`,
                        }}
                        draggable={false}
                        onLoad={() => setImageLoading(false)}
                        onError={() => {
                            setImageLoading(false);
                            setImageError(true);
                        }}
                    />
                )}
            </div>



            {/* Controls Bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4">
                <div className="flex items-center justify-between max-w-4xl mx-auto">
                    {/* Left: Asset Info */}
                    <div className="flex items-center gap-4 text-white text-sm">
                        <span id="recycle-lightbox-title" className="font-medium">
                            {currentItem.name}
                        </span>
                        <span className="text-white/60">
                            {currentIndex + 1} / {items.length}
                        </span>
                    </div>

                    {/* Center: Zoom Controls */}
                    <div className="flex items-center gap-2">
                        <AppButton
                            variant="ghost"
                            size="icon"
                            onClick={handleZoomOut}
                            disabled={zoom <= RECYCLE_BIN_CONSTANTS.ZOOM_MIN}
                            className="text-white hover:bg-white/20 border-white/20"
                            aria-label="Zoom out"
                        >
                            <ZoomOut size={20} />
                        </AppButton>
                        <span className="text-white text-sm min-w-[60px] text-center">{Math.round(zoom * 100)}%</span>
                        <AppButton
                            variant="ghost"
                            size="icon"
                            onClick={handleZoomIn}
                            disabled={zoom >= RECYCLE_BIN_CONSTANTS.ZOOM_MAX}
                            className="text-white hover:bg-white/20 border-white/20"
                            aria-label="Zoom in"
                        >
                            <ZoomIn size={20} />
                        </AppButton>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                        <AppButton
                            variant="secondary"
                            size="sm"
                            leftIcon={<RotateCcw size={16} />}
                            onClick={() => onRestore(currentItem)}
                            isLoading={isRestoring}
                            disabled={isDeleting}
                            className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                        >
                            Restore
                        </AppButton>
                        <AppButton
                            variant="destructive"
                            size="sm"
                            leftIcon={<Trash2 size={16} />}
                            onClick={() => onPermanentDelete(currentItem)}
                            isLoading={isDeleting}
                            disabled={isRestoring}
                            className="!bg-red-600 hover:!bg-red-700 !text-white !border-red-600"
                        >
                            Delete
                        </AppButton>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(lightbox, document.body);
};

export default RecycleBinLightbox;
