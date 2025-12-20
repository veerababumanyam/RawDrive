/**
 * Dashboard Upload Modal
 * Modal for selecting a gallery/sub-gallery to upload to
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Image, ChevronRight, Check } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { useAuth } from '../../../contexts/AuthContext';
import galleryService from '../../../services/galleryService';
import { GalleryListItem } from '../../../types/gallery';

interface DashboardUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface GalleryWithSubs extends GalleryListItem {
    subGalleries?: any[];
}

export const DashboardUploadModal: React.FC<DashboardUploadModalProps> = ({
    isOpen,
    onClose,
}) => {
    const navigate = useNavigate();
    const { workspace } = useAuth();
    const [galleries, setGalleries] = useState<GalleryWithSubs[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedGallery, setSelectedGallery] = useState<GalleryWithSubs | null>(null);

    useEffect(() => {
        const fetchGalleries = async () => {
            if (!isOpen || !workspace?.workspace_id) return;

            setLoading(true);
            try {
                const response = await galleryService.listGalleries(workspace.workspace_id, {
                    limit: 100, // Fetch reasonable number of latest galleries
                    sort: 'created_at',
                    status: 'draft' // Or published too? Usually uploaded to draft first.
                });
                setGalleries(response.data);
            } catch (error) {
                console.error('Failed to fetch galleries:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchGalleries();
    }, [isOpen, workspace?.workspace_id]);

    const handleSelectGallery = (gallery: GalleryWithSubs) => {
        setSelectedGallery(gallery);
    };

    const handleProceed = () => {
        if (selectedGallery) {
            // Navigate to the gallery details with upload modal open assumption
            // Ideally we would trigger the upload modal state in the target page, 
            // but simpler is just to go there and let user click upload if we can't deep link state.
            // Or we can add a query param ?action=upload
            navigate(`/workspace/galleries/${selectedGallery.gallery_id}?action=upload`);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-2xl animate-scale-up">
                <AppCard padding="none" radius="xl" variant="glass" className="card-glass overflow-hidden flex flex-col max-h-[80vh]">
                    {/* Header */}
                    <div className="p-4 sm:p-6 border-b border-border/50 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-text-primary">Upload to Gallery</h2>
                            <p className="text-sm text-text-secondary mt-1">
                                Select a gallery to upload photos to
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Gallery List */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            </div>
                        ) : galleries.length === 0 ? (
                            <div className="text-center py-8 text-text-secondary">
                                No galleries found. Create a gallery first.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {galleries.map((gallery) => (
                                    <button
                                        key={gallery.gallery_id}
                                        onClick={() => handleSelectGallery(gallery)}
                                        className={`relative p-4 rounded-xl text-left transition-all border ${selectedGallery?.gallery_id === gallery.gallery_id
                                            ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10'
                                            : 'bg-surface/50 border-transparent hover:bg-surface-hover hover:border-border/50'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`p-2 rounded-lg ${selectedGallery?.gallery_id === gallery.gallery_id
                                                ? 'bg-primary text-white'
                                                : 'bg-surface-hover text-text-secondary'
                                                }`}>
                                                <Image size={20} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className={`font-semibold truncate ${selectedGallery?.gallery_id === gallery.gallery_id
                                                    ? 'text-primary'
                                                    : 'text-text-primary'
                                                    }`}>
                                                    {gallery.title}
                                                </h3>
                                                <p className="text-xs text-text-secondary truncate mt-0.5">
                                                    {gallery.client_name || 'No Client'}
                                                </p>
                                                <p className="text-xs text-text-tertiary mt-2">
                                                    {gallery.photo_count} photos
                                                </p>
                                            </div>
                                            {selectedGallery?.gallery_id === gallery.gallery_id && (
                                                <div className="absolute top-4 right-4 text-primary">
                                                    <Check size={18} />
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 sm:p-6 border-t border-border/50 flex justify-end gap-3 bg-surface/30">
                        <AppButton variant="secondary" onClick={onClose}>
                            Cancel
                        </AppButton>
                        <AppButton
                            variant="primary"
                            shine
                            disabled={!selectedGallery}
                            onClick={handleProceed}
                            className="w-32"
                        >
                            Next
                            <ChevronRight size={16} className="ml-1" />
                        </AppButton>
                    </div>
                </AppCard>
            </div>
        </div>
    );
};
