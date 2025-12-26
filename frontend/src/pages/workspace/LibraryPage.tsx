import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { libraryService, LibraryAsset } from '../../services/libraryService';
import { galleryService } from '../../services/galleryService';
import { PhotoGrid, Photo } from '../../components/ui/PhotoGrid';
import { Search, Plus, FolderOpen, Trash2 } from 'lucide-react';
import { useUpload } from '../../hooks/useUpload';
import MoveToGalleryModal from '../../components/workspace/library/MoveToGalleryModal';
import DeleteConfirmModal from '../../components/ui/DeleteConfirmModal';

const LibraryPage: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [assets, setAssets] = useState<LibraryAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [filterType, setFilterType] = useState<'all' | 'unassigned' | 'photo' | 'video'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchAssets = useCallback(async () => {
        if (!user?.workspace_id) return;
        setLoading(true);
        try {
            const response = await libraryService.listAssets(user.workspace_id, {
                page,
                limit: 50,
                type: filterType === 'photo' || filterType === 'video' ? filterType : undefined,
                unassigned_only: filterType === 'unassigned',
                search: searchQuery || undefined
            });
            setAssets(response.data);
            // setTotalPages(response.meta.totalPages);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [user?.workspace_id, page, filterType, searchQuery]);

    const { addFiles, isUploading } = useUpload({
        workspaceId: user?.workspace_id || '',
        // No gallery ID for library uploads
        onComplete: () => {
             // Refresh list after upload
             fetchAssets();
        },
        onError: (error) => {
            console.error("Upload failed", error);
        }
    });

    useEffect(() => {
        fetchAssets();
    }, [fetchAssets]);

    // Map LibraryAsset to PhotoGrid Photo
    const gridPhotos: Photo[] = assets.map(asset => ({
        id: asset.asset_id,
        src: asset.preview_url || asset.thumbnail_url || '', // Should be signed URL
        thumbnailSrc: asset.thumbnail_url,
        alt: asset.filename || 'Untitled',
        width: asset.width || 1000,
        height: asset.height || 1000,
        title: asset.filename,
        metadata: {
            dateTaken: asset.date_taken,
        }
    }));

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchAssets();
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            addFiles(Array.from(e.target.files));
             // Reset input
            e.target.value = '';
        }
    };

    return (
        <div className="flex flex-col h-full bg-background">
             {/* Header */}
            <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                         <div className="flex-1 min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold text-gradient">
                                {t('nav.libraries')}
                            </h1>
                        </div>
                    </div>
                </div>
            </div>

            
            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search assets..." 
                            className="pl-9 pr-4 py-2 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-64"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
                        />
                    </div>
                    
                    <div className="h-8 w-[1px] bg-border mx-2" />
                    
                    <div className="flex items-center gap-1 bg-surface rounded-lg p-1 border border-border">
                        <button 
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${filterType === 'all' ? 'bg-background-alt text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                            onClick={() => setFilterType('all')}
                        >
                            All
                        </button>
                        <button 
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${filterType === 'unassigned' ? 'bg-background-alt text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                            onClick={() => setFilterType('unassigned')}
                        >
                            Unassigned
                        </button>
                    </div>
                </div>


                <div className="flex items-center gap-2">
                     <button 
                        onClick={handleUploadClick}
                        disabled={isUploading}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus size={16} />
                        <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                        multiple
                        accept="image/*,video/*"
                    />
                </div>
            </div>

            {/* Selection Bar */}
            {selectedIds.size > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-surface border border-white/10 shadow-xl rounded-full px-6 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-200">
                    <span className="text-sm font-medium text-text-primary">
                        {selectedIds.size} selected
                    </span>
                    <div className="h-4 w-[1px] bg-white/10" />
                    <button 
                        onClick={() => setSelectedIds(new Set())}
                        className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                    >
                        Clear
                    </button>
                    <button
                        onClick={() => setIsMoveModalOpen(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-background-alt hover:bg-surface-hover text-text-primary rounded-md transition-colors text-sm"
                    >
                        <FolderOpen size={14} />
                        <span>Add to Gallery</span>
                    </button>
                    <div className="h-4 w-[1px] bg-white/10" />
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md transition-colors text-sm"
                    >
                        <Trash2 size={14} />
                        <span>Delete</span>
                    </button>
                </div>
            )}

            <MoveToGalleryModal 
                isOpen={isMoveModalOpen}
                onClose={() => setIsMoveModalOpen(false)}
                selectedCount={selectedIds.size}
                onMove={async (galleryId) => {
                    if (user?.workspace_id) {
                         await galleryService.addAssetsToGallery(user.workspace_id, galleryId, Array.from(selectedIds));
                         // Clear selection after move
                         setSelectedIds(new Set());
                         // Refresh assets to update 'is_assigned' status if we show it
                         fetchAssets();
                    }
                }}
            />

            <DeleteConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={async () => {
                    if (!user?.workspace_id) return;
                    setIsDeleting(true);
                    try {
                        await libraryService.deleteAssets(user.workspace_id, Array.from(selectedIds));
                        setSelectedIds(new Set());
                        setShowDeleteConfirm(false);
                        fetchAssets();
                    } catch (error) {
                        console.error("Failed to delete assets", error);
                        alert("Failed to delete assets");
                    } finally {
                        setIsDeleting(false);
                    }
                }}
                isDeleting={isDeleting}
                itemCount={selectedIds.size}
            />

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                 {loading ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="aspect-square bg-surface animate-pulse rounded-lg" />
                        ))}
                    </div>
                 ) : (
                    <PhotoGrid 
                        photos={gridPhotos}
                        layout="masonry"
                        gap="md"
                        selectable
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                        onPhotoClick={(photo) => console.log('Clicked', photo)}
                        columns={{ sm: 2, md: 3, lg: 4, xl: 5 }}
                    />
                 )}
                 
                 {!loading && assets.length === 0 && (
                     <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
                         <FolderOpen size={48} className="mb-4 opacity-50" />
                         <p>No assets found</p>
                     </div>
                 )}
            </div>
        </div>
    );
};

export default LibraryPage;
