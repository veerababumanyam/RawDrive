/**
 * Gallery Preview Page
 * Authenticated preview of how the gallery looks to clients
 * Works even if sharing is not enabled - this is a preview-only feature
 * Opens in a new tab and shows the full public gallery view
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { galleryService } from '../../services/galleryService';
import { GalleryDetailData, PublicGalleryAsset, GalleryAssetItem } from '../../types/gallery';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { gradientToCss, isValidGradientConfig } from '../../utils/gradientUtils';
import { GalleryCanvas } from '../../components/features/gallery/GalleryCanvas';
import { AppButton } from '../../components/ui/AppButton';
import { useAuth } from '../../contexts/AuthContext';
import {
    Download,
    LayoutGrid,
    Heart,
    Bookmark,
    Loader2,
} from 'lucide-react';
import { ShareMenu } from '../../components/features/gallery/ShareMenu';

// Workflow tab type for client viewing
type WorkflowTab = 'all' | 'favorites' | 'selections';

const GalleryPreviewPage: React.FC = () => {
    const { id: galleryId } = useParams<{ id: string }>();
    const { workspace } = useAuth();
    const [gallery, setGallery] = useState<GalleryDetailData | null>(null);
    const [assets, setAssets] = useState<PublicGalleryAsset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<WorkflowTab>('all');
    const [lightboxAsset, setLightboxAsset] = useState<PublicGalleryAsset | null>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number>(0);

    // Fetch gallery data using authenticated endpoint
    useEffect(() => {
        const fetchGalleryData = async () => {
            if (!galleryId || !workspace?.workspace_id) return;
            setIsLoading(true);
            setError(null);
            try {
                // Use authenticated endpoint - works even if gallery is not published
                const galleryData = await galleryService.getGallery(workspace.workspace_id, galleryId);
                setGallery(galleryData);

                // Fetch assets using authenticated endpoint
                // Note: Backend limit max is 100, fetch first page for preview
                const assetsData = await galleryService.listGalleryAssets(workspace.workspace_id, galleryId, {
                    limit: 100,
                    page: 1,
                });
                
                // Convert GalleryAssetItem[] to PublicGalleryAsset[] for preview
                const previewAssets: PublicGalleryAsset[] = (assetsData.data || [])
                    .filter(asset => asset.visible) // Only show visible assets
                    .map(asset => ({
                        asset_id: asset.asset_id,
                        gallery_id: galleryId,
                        filename: asset.asset?.filename || asset.asset_id,
                        type: (asset.asset?.type || 'photo') as 'photo' | 'video',
                        width: asset.asset?.width,
                        height: asset.asset?.height,
                        size_bytes: asset.asset?.file_size || 0,
                        sort_order: asset.sort_order || 0,
                        created_at: asset.asset?.created_at || new Date().toISOString(),
                        is_favorited: asset.is_favorited || false,
                        favorites_count: asset.favorites_count || 0,
                        is_selected: asset.is_selected || false,
                        is_private: asset.is_private || false,
                    }));
                setAssets(previewAssets);
                
                // Update stats based on loaded assets
                const totalPhotos = previewAssets.filter(a => a.type === 'photo' || !a.type).length;
                const totalVideos = previewAssets.filter(a => a.type === 'video').length;
                const favoritesCount = previewAssets.filter(a => a.is_favorited || (a.favorites_count && a.favorites_count > 0)).length;
                const selectionsCount = previewAssets.filter(a => a.is_selected).length;
                
                setGallery(prev => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        stats: {
                            total_items: previewAssets.length,
                            total_photos: totalPhotos,
                            total_videos: totalVideos,
                            favorites_count: favoritesCount,
                            selections_count: selectionsCount,
                        },
                    };
                });
            } catch (err: any) {
                console.error('Failed to load gallery preview:', err);
                setError(err.message || 'Failed to load gallery preview');
            } finally {
                setIsLoading(false);
            }
        };
        fetchGalleryData();
    }, [galleryId, workspace?.workspace_id]);

    // Filter assets based on active tab
    const displayedAssets = useMemo(() => {
        if (activeTab === 'favorites') {
            return assets.filter(a => a.is_favorited || (a.favorites_count && a.favorites_count > 0));
        }
        if (activeTab === 'selections') {
            return assets.filter(a => a.is_selected);
        }
        return assets;
    }, [assets, activeTab]);

    // Convert PublicGalleryAsset[] to GalleryAssetItem[] for GalleryCanvas
    const canvasAssets: GalleryAssetItem[] = useMemo(() => {
        return displayedAssets.map(asset => {
            // Find the original asset data if available
            const originalAsset = assets.find(a => a.asset_id === asset.asset_id);
            return {
                gallery_asset_id: `preview-${asset.asset_id}`,
                asset_id: asset.asset_id,
                sort_order: asset.sort_order,
                visible: true,
                is_private: asset.is_private || false,
                is_favorited: asset.is_favorited || false,
                is_selected: asset.is_selected || false,
                favorites_count: asset.favorites_count || 0,
                client_favorites_count: asset.favorites_count || 0,
                client_picks_count: asset.is_selected ? 1 : 0,
                asset: {
                    type: asset.type,
                    status: 'available',
                    mime_type: asset.type === 'video' ? 'video/mp4' : 'image/jpeg',
                    filename: asset.filename,
                    width: asset.width,
                    height: asset.height,
                    file_size: asset.size_bytes,
                    created_at: asset.created_at,
                },
            };
        });
    }, [displayedAssets, assets]);

    // Compute gradient CSS for hero section
    const activeColor = gallery?.primary_color || '#6366f1';
    const fontFamily = gallery?.font_family || 'inherit';
    const heroGradientStyle = useMemo(() => {
        if (gallery?.gradient_config && isValidGradientConfig(gallery.gradient_config)) {
            return gradientToCss(gallery.gradient_config);
        }
        if (activeColor && activeColor !== '#6366f1') {
            return `linear-gradient(135deg, ${activeColor} 0%, ${activeColor}dd 100%)`;
        }
        return 'linear-gradient(135deg, #1f2937 0%, #111827 100%)';
    }, [gallery?.gradient_config, activeColor]);

    // Construct cover URL using authenticated endpoint
    const coverUrl = gallery?.cover_asset_id && workspace?.workspace_id
        ? `/api/v1/workspaces/${workspace.workspace_id}/media/${gallery.cover_asset_id}/preview`
        : null;

    // Share URL (for preview, we'll use the workspace route)
    const shareUrl = gallery ? `${window.location.origin}/workspace/galleries/${galleryId}/preview` : '';

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-text-secondary">Loading preview...</p>
                </div>
            </div>
        );
    }

    if (error || !gallery) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center max-w-md">
                    <h1 className="text-2xl font-bold text-text-primary mb-4">Preview Unavailable</h1>
                    <p className="text-text-secondary mb-6">{error || 'Gallery not found'}</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <Helmet>
                <title>{gallery.title} - Preview | RawDrive</title>
            </Helmet>
            <div className="min-h-screen bg-background flex flex-col">
                {/* Preview Banner */}
                <div className="bg-yellow-500 dark:bg-yellow-600 text-white px-4 py-2 text-center text-sm font-medium sticky top-0 z-50">
                    <span className="inline-flex items-center gap-2">
                        👁️ Preview Mode - This is how your gallery looks to clients
                        {gallery.status !== 'published' && (
                            <span className="ml-2 px-2 py-0.5 bg-yellow-600 dark:bg-yellow-700 rounded text-xs">
                                Gallery is {gallery.status} - not publicly shared
                            </span>
                        )}
                    </span>
                </div>

                {/* Header */}
                <header className="sticky top-[41px] z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                    <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <h1 className="text-xl font-bold text-text-primary truncate">{gallery.title}</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <ShareMenu
                                shareUrl={shareUrl}
                                title={gallery.title}
                                description={gallery.description}
                                buttonSize="sm"
                            />
                        </div>
                    </div>
                </header>

                {/* Hero / Cover with Gradient Branding */}
                <div className="relative h-[40vh] md:h-[50vh] bg-gray-100 dark:bg-gray-900 overflow-hidden">
                    {coverUrl ? (
                        <div className="absolute inset-0">
                            <img
                                src={coverUrl}
                                alt="Cover"
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            <div className="absolute inset-0 bg-black/30"></div>
                        </div>
                    ) : (
                        <div
                            className="absolute inset-0 transition-all duration-500"
                            style={{ background: heroGradientStyle }}
                        />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-center pb-12 p-4 text-center">
                        <div className="max-w-3xl">
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-lg" style={{ fontFamily }}>{gallery.title}</h2>
                            {gallery.description && (
                                <p className="text-white/90 text-lg md:text-xl drop-shadow-md max-w-2xl mx-auto">{gallery.description}</p>
                            )}
                            <div className="mt-6 flex flex-wrap justify-center gap-4 text-white/80 text-sm font-medium">
                                <span className="bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">{new Date(gallery.created_at).toLocaleDateString()}</span>
                                {gallery.stats && <span className="bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">{gallery.stats.total_photos} Photos</span>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <main className="flex-1 max-w-7xl mx-auto px-4 md:px-6 py-12 w-full">
                    {/* Workflow Tabs */}
                    <div className="mb-8 flex items-center gap-2 border-b border-border">
                        <button
                            className={`px-4 py-2 flex items-center gap-2 font-medium transition-colors ${
                                activeTab === 'all'
                                    ? 'text-primary border-b-2 border-primary'
                                    : 'text-text-secondary hover:text-text-primary'
                            }`}
                            onClick={() => setActiveTab('all')}
                        >
                            <LayoutGrid size={16} />
                            All Photos
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-black/10 dark:bg-white/10">
                                {gallery.stats?.total_photos || 0}
                            </span>
                        </button>
                        <button
                            className={`px-4 py-2 flex items-center gap-2 font-medium transition-colors ${
                                activeTab === 'favorites'
                                    ? 'text-primary border-b-2 border-primary'
                                    : 'text-text-secondary hover:text-text-primary'
                            }`}
                            onClick={() => setActiveTab('favorites')}
                        >
                            <Heart size={16} />
                            Favorites
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-black/10 dark:bg-white/10">
                                {gallery.stats?.favorites_count || 0}
                            </span>
                        </button>
                        <button
                            className={`px-4 py-2 flex items-center gap-2 font-medium transition-colors ${
                                activeTab === 'selections'
                                    ? 'text-primary border-b-2 border-primary'
                                    : 'text-text-secondary hover:text-text-primary'
                            }`}
                            onClick={() => setActiveTab('selections')}
                        >
                            <Bookmark size={16} />
                            Selections
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-black/10 dark:bg-white/10">
                                {gallery.stats?.selections_count || 0}
                            </span>
                        </button>
                    </div>

                    {/* Gallery Canvas - Reuse the same component */}
                    {canvasAssets.length > 0 ? (
                        <GalleryCanvas
                            assets={canvasAssets}
                            galleryId={galleryId}
                            viewMode="grid"
                            columns={{ sm: 1, md: 2, lg: 3, xl: 4 }}
                            gap="md"
                            selectedAssetIds={new Set<string>()}
                            managementSelectable={false}
                            showCustomerSelection={true}
                            onSelectionChange={() => {}} // Preview mode - selections not persisted
                            onAssetClick={(asset, index) => {
                                const pubAsset = displayedAssets.find(a => a.asset_id === asset.asset_id);
                                if (pubAsset) {
                                    setLightboxAsset(pubAsset);
                                    setLightboxIndex(index);
                                }
                            }}
                            isClientView={true}
                            downloadPolicy={gallery.download_policy}
                            showWatermark={gallery.download_policy === 'view_only' || gallery.download_policy === 'watermarked_only'}
                        />
                    ) : (
                        <div className="text-center py-20">
                            <p className="text-text-secondary">No {activeTab === 'all' ? 'photos' : activeTab} to display</p>
                        </div>
                    )}
                </main>
            </div>
        </>
    );
};

export default GalleryPreviewPage;
