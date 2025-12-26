import React, { useState, useEffect } from 'react';
import { X, Check, Search } from 'lucide-react';
import { galleryService } from '../../../services/galleryService';
import { useAuth } from '../../../contexts/AuthContext';
import { GalleryListItem } from '../../../types/gallery';

interface MoveToGalleryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onMove: (galleryId: string) => Promise<void>;
    selectedCount: number;
}

const MoveToGalleryModal: React.FC<MoveToGalleryModalProps> = ({ 
    isOpen, 
    onClose, 
    onMove,
    selectedCount
}) => {
    const { user } = useAuth();
    const [galleries, setGalleries] = useState<GalleryListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);
    const [moving, setMoving] = useState(false);

    useEffect(() => {
        if (isOpen && user?.workspace_id) {
            fetchGalleries();
        }
    }, [isOpen, user?.workspace_id]);

    const fetchGalleries = async () => {
        if (!user?.workspace_id) return;
        setLoading(true);
        try {
            const response = await galleryService.listGalleries(user.workspace_id, {
                limit: 100, // Fetch first 100 for now
                sort: 'created_at'
            });
            setGalleries(response.data);
        } catch (error) {
            console.error("Failed to fetch galleries", error);
        } finally {
            setLoading(false);
        }
    };

    const handleMove = async () => {
        if (!selectedGalleryId) return;
        setMoving(true);
        try {
            await onMove(selectedGalleryId);
            onClose();
        } catch (error) {
            console.error("Failed to move assets", error);
        } finally {
            setMoving(false);
        }
    };

    const filteredGalleries = galleries.filter(g => 
        g.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-surface border border-white/10 rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-text-primary">
                        Add {selectedCount} assets to Gallery
                    </h2>
                    <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search galleries..." 
                            className="w-full pl-9 pr-4 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                         <div className="space-y-2">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="h-12 bg-surface-hover/50 animate-pulse rounded-lg" />
                            ))}
                        </div>
                    ) : filteredGalleries.length === 0 ? (
                        <div className="text-center py-8 text-text-tertiary">
                            No galleries found
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filteredGalleries.map(gallery => (
                                <button
                                    key={gallery.gallery_id}
                                    onClick={() => setSelectedGalleryId(gallery.gallery_id)}
                                    className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                                        selectedGalleryId === gallery.gallery_id 
                                            ? 'bg-primary/10 border border-primary/50' 
                                            : 'hover:bg-surface-hover border border-transparent'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-md bg-background-alt overflow-hidden">
                                            {gallery.cover_image_url ? (
                                                <img src={gallery.cover_image_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs text-text-tertiary">No Img</div>
                                            )}
                                        </div>
                                        <div className="text-left">
                                            <div className="text-sm font-medium text-text-primary truncate max-w-[200px]">{gallery.title}</div>
                                            <div className="text-xs text-text-tertiary">{gallery.photo_count} items</div>
                                        </div>
                                    </div>
                                    {selectedGalleryId === gallery.gallery_id && (
                                        <Check size={16} className="text-primary" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleMove}
                        disabled={!selectedGalleryId || moving}
                        className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {moving ? 'Adding...' : 'Add to Gallery'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MoveToGalleryModal;
