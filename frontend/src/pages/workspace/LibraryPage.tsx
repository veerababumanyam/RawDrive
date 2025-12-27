import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { libraryService, LibraryAsset, LibraryFolder, LibraryFolderDetail } from '../../services/libraryService';
import { galleryService } from '../../services/galleryService';
import { PhotoGrid, Photo } from '../../components/ui/PhotoGrid';
import { AppButton } from '../../components/ui/AppButton';
import { useToast } from '../../components/ui/Toast';
import {
    Search,
    FolderOpen,
    Trash2,
    FolderPlus,
    ChevronRight,
    Home,
    FolderInput,
    AlertCircle,
    Upload,
    Loader2
} from 'lucide-react';
import { useUpload } from '../../hooks/useUpload';
import MoveToGalleryModal from '../../components/workspace/library/MoveToGalleryModal';
import DeleteConfirmModal from '../../components/ui/DeleteConfirmModal';
import CreateFolderModal from '../../components/features/library/CreateFolderModal';
import EditFolderModal from '../../components/features/library/EditFolderModal';
import LibraryFolderCard from '../../components/features/library/LibraryFolderCard';
import MoveToLibraryFolderModal from '../../components/features/library/MoveToLibraryFolderModal';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';

const LibraryPage: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { addToast } = useToast();
    const [assets, setAssets] = useState<LibraryAsset[]>([]);
    const [folders, setFolders] = useState<LibraryFolder[]>([]);
    const [currentFolder, setCurrentFolder] = useState<LibraryFolderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [filterType, setFilterType] = useState<'all' | 'unassigned' | 'photo' | 'video'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    
    // Folder modals
    const [showCreateFolder, setShowCreateFolder] = useState(false);
    const [showEditFolder, setShowEditFolder] = useState(false);
    const [showMoveToFolder, setShowMoveToFolder] = useState(false);
    const [editingFolder, setEditingFolder] = useState<LibraryFolder | null>(null);
    const [showDeleteFolderConfirm, setShowDeleteFolderConfirm] = useState(false);
    const [deletingFolder, setDeletingFolder] = useState<LibraryFolder | null>(null);

    // Lightbox state
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);

    const fetchFolders = useCallback(async () => {
        if (!user?.workspace_id) return;
        try {
            const folderList = await libraryService.listFolders(
                user.workspace_id,
                currentFolder?.folder_id
            );
            setFolders(folderList);
        } catch (error) {
            console.error('Failed to fetch folders:', error);
            addToast({
                title: 'Failed to load folders',
                message: 'Please try refreshing the page.',
                variant: 'error',
            });
        }
    }, [user?.workspace_id, currentFolder?.folder_id, addToast]);

    const fetchAssets = useCallback(async () => {
        if (!user?.workspace_id) return;
        setLoading(true);
        setLoadError(null);
        try {
            const response = await libraryService.listAssets(user.workspace_id, {
                page,
                limit: 50,
                type: filterType === 'photo' || filterType === 'video' ? filterType : undefined,
                unassigned_only: filterType === 'unassigned',
                search: searchQuery || undefined,
                folder_id: currentFolder?.folder_id,
            });
            setAssets(response.data);
        } catch (error) {
            console.error('Failed to fetch assets:', error);
            setLoadError('Failed to load assets. Please try again.');
            addToast({
                title: 'Failed to load assets',
                message: 'There was a problem loading your assets. Please try again.',
                variant: 'error',
            });
        } finally {
            setLoading(false);
        }
    }, [user?.workspace_id, page, filterType, searchQuery, currentFolder?.folder_id, addToast]);

    const { addFiles, isUploading } = useUpload({
        workspaceId: user?.workspace_id || '',
        folderId: currentFolder?.folder_id || null,
        onComplete: () => {
            fetchAssets();
            fetchFolders();
            addToast({
                title: 'Upload complete',
                message: 'Your file has been uploaded and is being processed.',
                variant: 'success',
            });
        },
        onError: (error) => {
            console.error("Upload failed", error);
            addToast({
                title: 'Upload failed',
                message: error.message || 'There was a problem uploading your file.',
                variant: 'error',
            });
        }
    });

    // Initial load and re-fetch when folder changes
    useEffect(() => {
        fetchFolders();
        fetchAssets();
    }, [fetchFolders, fetchAssets]);

    // Navigate to folder with proper state synchronization
    const navigateToFolder = useCallback(async (folderId: string | null) => {
        if (!user?.workspace_id) return;

        // Clear error state and selection when navigating
        setLoadError(null);
        setSelectedIds(new Set());
        setLoading(true);

        if (folderId === null) {
            // Navigate to root - setting null triggers useEffect via dependency chain
            setCurrentFolder(null);
        } else {
            try {
                const folder = await libraryService.getFolder(user.workspace_id, folderId);
                setCurrentFolder(folder);
            } catch (error) {
                console.error('Failed to navigate to folder:', error);
                setLoading(false);
                addToast({
                    title: 'Failed to open folder',
                    message: 'Could not access this folder. Please try again.',
                    variant: 'error',
                });
            }
        }
        // Note: fetchFolders and fetchAssets will be called via useEffect
        // when currentFolder state changes (they depend on currentFolder?.folder_id)
    }, [user?.workspace_id, addToast]);

    // Create folder handler
    const handleCreateFolder = async (name: string, color?: string, description?: string) => {
        if (!user?.workspace_id) return;
        await libraryService.createFolder(user.workspace_id, {
            name,
            color,
            description,
            parent_folder_id: currentFolder?.folder_id,
        });
        fetchFolders();
    };

    // Edit folder handler
    const handleEditFolder = async (name: string, color?: string, description?: string) => {
        if (!user?.workspace_id || !editingFolder) return;
        await libraryService.updateFolder(user.workspace_id, editingFolder.folder_id, {
            name,
            color,
            description,
        });
        fetchFolders();
        // If we edited the current folder, refresh its details
        if (currentFolder?.folder_id === editingFolder.folder_id) {
            const updated = await libraryService.getFolder(user.workspace_id, editingFolder.folder_id);
            setCurrentFolder(updated);
        }
    };

    // Delete folder handler
    const handleDeleteFolder = async () => {
        if (!user?.workspace_id || !deletingFolder) return;
        setIsDeleting(true);
        try {
            await libraryService.deleteFolder(user.workspace_id, deletingFolder.folder_id, true);
            setShowDeleteFolderConfirm(false);
            setDeletingFolder(null);
            fetchFolders();
            fetchAssets();
        } catch (error) {
            console.error('Failed to delete folder:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    // Move assets to folder
    const handleMoveToFolder = async (folderId: string | null) => {
        if (!user?.workspace_id) return;
        await libraryService.moveAssetsToFolder(user.workspace_id, Array.from(selectedIds), folderId);
        setSelectedIds(new Set());
        setShowMoveToFolder(false);
        fetchAssets();
        fetchFolders();
    };

    // Map LibraryAsset to PhotoGrid Photo
    const gridPhotos: Photo[] = assets.map(asset => ({
        id: asset.asset_id,
        src: asset.preview_url || asset.thumbnail_url || '',
        thumbnailSrc: asset.thumbnail_url,
        alt: asset.filename || 'Untitled',
        width: asset.width || 1000,
        height: asset.height || 1000,
        title: asset.filename,
        status: asset.status, // Pass status for processing indicator
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
            e.target.value = '';
        }
    };

    return (
        <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-6"
        >
            {/* Page Header - Enhanced with glass effect */}
            <motion.div variants={staggerItem} className="card-glass rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gradient">{t('nav.libraries')}</h1>
                    <p className="text-text-secondary mt-1">
                        {loading ? (
                            'Loading...'
                        ) : loadError ? (
                            'Error loading assets'
                        ) : (
                            <>
                                {assets.length} assets
                                {folders.length > 0 && `, ${folders.length} folders`}
                            </>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <AppButton
                        onClick={() => setShowCreateFolder(true)}
                        variant="secondary"
                        leftIcon={<FolderPlus size={18} />}
                        className="w-full sm:w-auto"
                    >
                        New Folder
                    </AppButton>
                    <AppButton
                        onClick={handleUploadClick}
                        variant="primary"
                        leftIcon={isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                        disabled={isUploading}
                        shine
                        className="w-full sm:w-auto"
                    >
                        {isUploading ? 'Uploading...' : 'Upload'}
                    </AppButton>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                        multiple
                        accept="image/*,video/*"
                    />
                </div>
            </motion.div>

            {/* Breadcrumb */}
            {currentFolder && (
                <motion.div 
                    variants={staggerItem}
                    className="card-glass rounded-xl px-4 py-3 flex items-center gap-2 text-sm"
                >
                    <button
                        onClick={() => navigateToFolder(null)}
                        className="flex items-center gap-1.5 text-text-tertiary hover:text-text-primary transition-colors"
                    >
                        <Home size={14} />
                        <span>Library</span>
                    </button>
                    {currentFolder.breadcrumb.map((crumb, index) => (
                        <React.Fragment key={crumb.folder_id}>
                            <ChevronRight size={14} className="text-text-tertiary" />
                            <button
                                onClick={() => navigateToFolder(crumb.folder_id)}
                                className={`hover:text-text-primary transition-colors ${
                                    index === currentFolder.breadcrumb.length - 1
                                        ? 'text-text-primary font-medium'
                                        : 'text-text-tertiary'
                                }`}
                            >
                                {crumb.name}
                            </button>
                        </React.Fragment>
                    ))}
                </motion.div>
            )}

            {/* Search and Filters - Enhanced with glass effect */}
            <motion.div variants={staggerItem} className="card-glass rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                    <Search
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                    />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
                        placeholder="Search assets..."
                        className="
                            w-full pl-10 pr-4 py-2.5
                            glass-light border border-white/20 dark:border-white/10
                            rounded-xl text-text-primary placeholder:text-text-tertiary
                            focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
                            hover:border-white/30 dark:hover:border-white/20
                            transition-all duration-200
                            min-h-[44px]
                        "
                    />
                </div>

                {/* Filter Controls */}
                <div className="flex items-center gap-2">
                    {/* Type Filter Toggle */}
                    <div className="flex items-center glass-light border border-white/20 dark:border-white/10 rounded-xl overflow-hidden">
                        {(['all', 'unassigned', 'photo', 'video'] as const).map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`
                                    px-4 py-2.5
                                    ${filterType === type 
                                        ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg' 
                                        : 'text-text-tertiary hover:bg-surface-hover/50 hover:text-text-primary'
                                    }
                                    transition-all duration-200
                                    min-h-[44px] capitalize text-sm font-medium
                                `}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Selection Bar */}
            {selectedIds.size > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 card-glass shadow-xl rounded-full px-6 py-3 flex items-center gap-4"
                >
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
                    <AppButton
                        onClick={() => setShowMoveToFolder(true)}
                        variant="secondary"
                        size="sm"
                        leftIcon={<FolderInput size={14} />}
                    >
                        Move to Folder
                    </AppButton>
                    <AppButton
                        onClick={() => setIsMoveModalOpen(true)}
                        variant="secondary"
                        size="sm"
                        leftIcon={<FolderOpen size={14} />}
                    >
                        Add to Gallery
                    </AppButton>
                    <div className="h-4 w-[1px] bg-white/10" />
                    <AppButton
                        onClick={() => setShowDeleteConfirm(true)}
                        variant="destructive"
                        size="sm"
                        leftIcon={<Trash2 size={14} />}
                    >
                        Delete
                    </AppButton>
                </motion.div>
            )}

            {/* Modals */}
            <MoveToGalleryModal 
                isOpen={isMoveModalOpen}
                onClose={() => setIsMoveModalOpen(false)}
                selectedCount={selectedIds.size}
                onMove={async (galleryId) => {
                    if (user?.workspace_id) {
                        await galleryService.addAssetsToGallery(user.workspace_id, galleryId, Array.from(selectedIds));
                        setSelectedIds(new Set());
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

            <CreateFolderModal
                isOpen={showCreateFolder}
                onClose={() => setShowCreateFolder(false)}
                onCreate={handleCreateFolder}
                parentFolderName={currentFolder?.name}
            />

            {editingFolder && (
                <EditFolderModal
                    isOpen={showEditFolder}
                    onClose={() => {
                        setShowEditFolder(false);
                        setEditingFolder(null);
                    }}
                    onSave={handleEditFolder}
                    folder={editingFolder}
                />
            )}

            <MoveToLibraryFolderModal
                isOpen={showMoveToFolder}
                onClose={() => setShowMoveToFolder(false)}
                onMove={handleMoveToFolder}
                folders={folders}
                selectedCount={selectedIds.size}
                currentFolderId={currentFolder?.folder_id}
            />

            <DeleteConfirmModal
                isOpen={showDeleteFolderConfirm}
                onClose={() => {
                    setShowDeleteFolderConfirm(false);
                    setDeletingFolder(null);
                }}
                onConfirm={handleDeleteFolder}
                isDeleting={isDeleting}
                itemCount={1}
                title={`Delete "${deletingFolder?.name}"?`}
                message="Assets in this folder will be moved to the root level."
            />

            {/* Content */}
            {/* Folders Section */}
            {folders.length > 0 && (
                <motion.div variants={staggerItem}>
                    <h2 className="text-sm font-medium text-text-secondary mb-3">Folders</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {folders.map((folder) => (
                            <LibraryFolderCard
                                key={folder.folder_id}
                                folder={folder}
                                onClick={() => navigateToFolder(folder.folder_id)}
                                onEdit={() => {
                                    setEditingFolder(folder);
                                    setShowEditFolder(true);
                                }}
                                onDelete={() => {
                                    setDeletingFolder(folder);
                                    setShowDeleteFolderConfirm(true);
                                }}
                            />
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Assets Section */}
            {loading ? (
                <motion.div variants={staggerItem} className="flex items-center justify-center py-16">
                    <Loader2 size={32} className="text-primary animate-spin" />
                </motion.div>
            ) : loadError ? (
                <motion.div variants={staggerItem} className="flex flex-col items-center justify-center py-16">
                    <div className="w-16 h-16 mb-4 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                        <AlertCircle size={32} className="text-red-500" />
                    </div>
                    <p className="text-text-primary font-medium mb-1">Something went wrong</p>
                    <p className="text-sm text-text-tertiary mb-4">{loadError}</p>
                    <AppButton
                        onClick={() => {
                            fetchFolders();
                            fetchAssets();
                        }}
                        variant="primary"
                    >
                        Try Again
                    </AppButton>
                </motion.div>
            ) : assets.length > 0 ? (
                <motion.div variants={staggerItem}>
                    {folders.length > 0 && (
                        <h2 className="text-sm font-medium text-text-secondary mb-3">Assets</h2>
                    )}
                    <PhotoGrid 
                        photos={gridPhotos}
                        layout="masonry"
                        gap="md"
                        selectable
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                        onPhotoClick={(photo) => {
                            const index = gridPhotos.findIndex(p => p.id === photo.id);
                            if (index !== -1) {
                                setLightboxIndex(index);
                                setLightboxOpen(true);
                            }
                        }}
                        columns={{ sm: 2, md: 3, lg: 4, xl: 5 }}
                    />
                </motion.div>
            ) : folders.length === 0 ? (
                // Empty State - only show if no assets AND no folders AND no error
                <motion.div variants={staggerItem} className="card-glass rounded-2xl p-12 flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <FolderOpen size={40} className="text-primary" />
                    </div>
                    <p className="text-lg font-medium text-text-primary">
                        {currentFolder ? 'This folder is empty' : 'Your library is empty'}
                    </p>
                    <p className="text-sm text-text-tertiary mt-2 max-w-sm">
                        {currentFolder
                            ? 'Add assets to this folder or create subfolders'
                            : 'Upload files or create a folder to get started'}
                    </p>
                    <div className="flex gap-3 mt-6">
                        <AppButton
                            onClick={handleUploadClick}
                            variant="primary"
                            leftIcon={<Upload size={16} />}
                            shine
                        >
                            Upload Files
                        </AppButton>
                        <AppButton
                            onClick={() => setShowCreateFolder(true)}
                            variant="secondary"
                            leftIcon={<FolderPlus size={16} />}
                        >
                            New Folder
                        </AppButton>
                    </div>
                </motion.div>
            ) : (
                // Partial Empty State - has folders but no assets in current view
                <motion.div variants={staggerItem} className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-sm text-text-tertiary text-center py-8">
                        No assets in {currentFolder ? 'this folder' : 'root'} – browse subfolders above or upload files
                    </p>
                </motion.div>
            )}

            {/* Simple Lightbox for Library Assets */}
            {lightboxOpen && assets[lightboxIndex] && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
                    onClick={() => setLightboxOpen(false)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setLightboxOpen(false);
                        if (e.key === 'ArrowLeft' && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
                        if (e.key === 'ArrowRight' && lightboxIndex < assets.length - 1) setLightboxIndex(lightboxIndex + 1);
                    }}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={0}
                >
                    {/* Close button */}
                    <button
                        onClick={() => setLightboxOpen(false)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
                        aria-label="Close"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>

                    {/* Navigation - Previous */}
                    {lightboxIndex > 0 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
                            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                            aria-label="Previous"
                        >
                            <ChevronRight className="w-6 h-6 rotate-180" />
                        </button>
                    )}

                    {/* Navigation - Next */}
                    {lightboxIndex < assets.length - 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                            aria-label="Next"
                        >
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    )}

                    {/* Image */}
                    <img
                        src={assets[lightboxIndex].preview_url || assets[lightboxIndex].original_url || assets[lightboxIndex].thumbnail_url || ''}
                        alt={assets[lightboxIndex].filename || 'Image'}
                        className="max-h-[90vh] max-w-[90vw] object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />

                    {/* Footer info */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-4 py-2 rounded-full">
                        {assets[lightboxIndex].filename} • {lightboxIndex + 1} / {assets.length}
                    </div>
                </div>
            )}
        </motion.div>
    );
};

export default LibraryPage;
