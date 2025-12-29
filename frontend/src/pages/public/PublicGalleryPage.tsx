import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { galleryService } from '../../services/galleryService';
import { GalleryDetailData, PublicGalleryAsset, GalleryAssetItem } from '../../types/gallery';
import { gradientToCss, isValidGradientConfig } from '../../utils/gradientUtils';
import { GalleryCanvas } from '../../components/features/gallery/GalleryCanvas';
import { AppButton } from '../../components/ui/AppButton';
import { useToast } from '../../components/ui/Toast';
import {
    Download,
    Grid,
    Lock as LockIcon,
    User,
    X,
    Heart,
    Bookmark,
    LayoutGrid,
    ChevronLeft,
    ChevronRight,
    Camera,
    Info,
    AlertTriangle,
    FolderOpen,
    Loader2,
} from 'lucide-react';
import { ClientEmailModal } from '../../components/features/gallery/ClientEmailModal';
import { PinVerificationModal } from '../../components/features/gallery/PinVerificationModal';
import { PasswordVerificationModal } from '../../components/features/gallery/PasswordVerificationModal';
import { FaceDiscovery } from '../../components/features/gallery/FaceDiscovery';
import { ShareMenu } from '../../components/features/gallery/ShareMenu';
import {
    VISITOR_STORAGE_KEY_PREFIX,
    VISITOR_ID_KEY_PREFIX,
    PIN_VERIFIED_KEY_PREFIX,
    PASSWORD_VERIFIED_KEY_PREFIX,
    PRIVATE_UNLOCKED_KEY_PREFIX,
    BULK_DOWNLOAD_DELAY_MS,
} from '../../constants/gallery';

// Workflow tab type for client viewing
type WorkflowTab = 'all' | 'favorites' | 'selections';

const PublicGalleryPage: React.FC = () => {
    // Note: Parameter name must match route definition
    // This can be either a UUID (direct gallery access) or a magic link token
    const { galleryId: galleryIdOrToken } = useParams<{ galleryId: string }>();
    const navigate = useNavigate();
    const [gallery, setGallery] = useState<GalleryDetailData | null>(null);
    const [assets, setAssets] = useState<PublicGalleryAsset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // The actual gallery UUID - derived from gallery data after loading
    // Use this for all API calls instead of the URL param
    const actualGalleryId = gallery?.gallery_id;

    // Visitor Registration State
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [isVisitorAuthenticated, setIsVisitorAuthenticated] = useState(false);
    const [visitorId, setVisitorId] = useState<string | null>(null);

    // PIN Verification State
    const [showPinModal, setShowPinModal] = useState(false);
    const [isPinVerified, setIsPinVerified] = useState(false);
    const [isPrivateUnlocked, setIsPrivateUnlocked] = useState(false);
    // Track whether PIN modal is for gallery access or private photo unlock
    const [pinModalMode, setPinModalMode] = useState<'gallery' | 'private'>('gallery');

    // Password Verification State
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [isPasswordVerified, setIsPasswordVerified] = useState(false);

    // Face Discovery State
    const [showFaceDiscovery, setShowFaceDiscovery] = useState(false);
    const [filteredPhotoIds, setFilteredPhotoIds] = useState<string[] | null>(null);
    const [matchSimilarity, setMatchSimilarity] = useState<number | null>(null);

    // Workflow tabs state
    const [activeTab, setActiveTab] = useState<WorkflowTab>('all');

    // Lightbox state
    const [lightboxAsset, setLightboxAsset] = useState<PublicGalleryAsset | null>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number>(0);
    const [showExif, setShowExif] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Sub-gallery filter state
    const [activeSubGallery, setActiveSubGallery] = useState<string | null>(null);

    // Local client selections (for optimistic UI updates)
    const [localFavorites, setLocalFavorites] = useState<Set<string>>(new Set());
    const [localSelections, setLocalSelections] = useState<Set<string>>(new Set());

    // Bulk download state
    const [isBulkDownloading, setIsBulkDownloading] = useState(false);
    const [bulkDownloadProgress, setBulkDownloadProgress] = useState(0);

    // Toast notifications
    const { addToast } = useToast();

    // Compute gradient CSS for hero section - MUST be before any early returns (React hooks rule)
    const heroGradientStyle = useMemo(() => {
        if (!gallery) {
            return 'linear-gradient(135deg, #1f2937 0%, #111827 100%)';
        }
        if (gallery.gradient_config && isValidGradientConfig(gallery.gradient_config)) {
            return gradientToCss(gallery.gradient_config);
        }
        // Fallback to primary color or default gradient
        const activeColor = gallery.primary_color || gallery.company_profile?.brand_color || '#6366f1';
        if (activeColor && activeColor !== '#6366f1') {
            return `linear-gradient(135deg, ${activeColor} 0%, ${activeColor}dd 100%)`;
        }
        return 'linear-gradient(135deg, #1f2937 0%, #111827 100%)';
    }, [gallery]);

    // Load visitor ID from storage (using actual gallery ID after it's available)
    useEffect(() => {
        if (actualGalleryId) {
            const storedVisitorId = localStorage.getItem(`${VISITOR_ID_KEY_PREFIX}${actualGalleryId}`);
            if (storedVisitorId) {
                setVisitorId(storedVisitorId);
            }
        }
    }, [actualGalleryId]);

    useEffect(() => {
        const fetchGalleryData = async () => {
            if (!galleryIdOrToken) return;
            setIsLoading(true);
            try {
                // Fetch gallery details - this handles both UUIDs and magic link tokens
                const galleryData = await galleryService.getPublicGallery(galleryIdOrToken);
                setGallery(galleryData);

                // Use the actual gallery ID for localStorage keys
                const realGalleryId = galleryData.gallery_id;

                // Check registration requirement
                const isRegistered = localStorage.getItem(`${VISITOR_STORAGE_KEY_PREFIX}${realGalleryId}`);

                if (galleryData.email_registration_required && !isRegistered) {
                    setShowEmailModal(true);
                } else {
                    setIsVisitorAuthenticated(true);

                    // Check Password protection first
                    const passwordVerified = localStorage.getItem(`${PASSWORD_VERIFIED_KEY_PREFIX}${realGalleryId}`);
                    if (galleryData.password_protected && !passwordVerified) {
                         setShowPasswordModal(true);
                         // Don't check PIN yet if password is needed
                         return;
                    }
                    setIsPasswordVerified(true);

                    // Check PIN protection
                    const pinVerified = localStorage.getItem(`${PIN_VERIFIED_KEY_PREFIX}${realGalleryId}`);
                    if (galleryData.pin_protected && !pinVerified) {
                        setPinModalMode('gallery');
                        setShowPinModal(true);
                    } else {
                        setIsPinVerified(true);
                        // Check if private photos were previously unlocked
                        const privateUnlocked = localStorage.getItem(`${PRIVATE_UNLOCKED_KEY_PREFIX}${realGalleryId}`);
                        if (privateUnlocked) {
                            setIsPrivateUnlocked(true);
                        }
                        // Fetching is now handled by the reactive useEffect hook below
                        // to prevent race conditions and double-fetching.
                    }
                }
            } catch (err: any) {
                console.error(err);
                if (err.message && err.message.includes('404')) {
                    setError('Gallery not found or is not public.');
                } else if (err.message && (err.message.includes('expired') || err.message.includes('revoked'))) {
                    setError('This link is no longer valid.');
                } else {
                    setError('Failed to load gallery.');
                }
            } finally {
                setIsLoading(false);
            }
        };
        fetchGalleryData();
    }, [galleryIdOrToken]);

    // Fetch assets with current filter
    const fetchAssets = useCallback(async () => {
        if (!actualGalleryId) return;
        try {
            // Use filtered endpoint to get client interaction data
            const filterType = activeTab === 'all' ? undefined : activeTab;
            const assetsData = await galleryService.getPublicGalleryAssetsFiltered(actualGalleryId, filterType);
            setAssets(assetsData);

            // Initialize local state from server data
            const favorites = new Set<string>();
            const selections = new Set<string>();
            assetsData.forEach(asset => {
                if (asset.favorites_count && asset.favorites_count > 0) favorites.add(asset.asset_id);
                if (asset.is_selected) selections.add(asset.asset_id);
            });
            setLocalFavorites(favorites);
            setLocalSelections(selections);
        } catch (err) {
            console.error('Failed to fetch assets:', err);
        }
    }, [actualGalleryId, activeTab]);

    // Refetch when tab changes
    useEffect(() => {
        if (isVisitorAuthenticated && isPinVerified && isPasswordVerified && actualGalleryId) {
            fetchAssets();
        }
    }, [activeTab, isVisitorAuthenticated, isPinVerified, isPasswordVerified, actualGalleryId, fetchAssets]);

    const handleVisitorSubmit = async (data: { email: string; first_name: string; last_name: string; phone: string; address?: string }) => {
        if (!actualGalleryId) return;
        setIsRegistering(true);
        try {
            const result = await galleryService.registerVisitor(actualGalleryId, data);
            localStorage.setItem(`${VISITOR_STORAGE_KEY_PREFIX}${actualGalleryId}`, 'true');
            localStorage.setItem(`${VISITOR_ID_KEY_PREFIX}${actualGalleryId}`, result.visitor_id);
            setVisitorId(result.visitor_id);
            setShowEmailModal(false);
            setIsVisitorAuthenticated(true);

            // Check PIN after email registration
            if (gallery?.pin_protected) {
                const pinVerified = localStorage.getItem(`${PIN_VERIFIED_KEY_PREFIX}${actualGalleryId}`);
                if (!pinVerified) {
                    setPinModalMode('gallery');
                    setShowPinModal(true);
                    return;
                }
                // Check if private photos were previously unlocked (separate from PIN)
                const privateUnlocked = localStorage.getItem(`${PRIVATE_UNLOCKED_KEY_PREFIX}${actualGalleryId}`);
                if (privateUnlocked) {
                    setIsPrivateUnlocked(true);
                }
            }
            setIsPinVerified(true);

            // Load assets now
            await fetchAssets();
        } catch (error) {
            console.error(error);
            // In a real app, show toast error
        } finally {
            setIsRegistering(false);
        }
    };

    const handlePinVerify = async (pin: string): Promise<boolean> => {
        if (!actualGalleryId) return false;
        try {
            const isValid = await galleryService.verifyPin(actualGalleryId, pin);
            if (isValid) {
                localStorage.setItem(`${PIN_VERIFIED_KEY_PREFIX}${actualGalleryId}`, 'true');
                setShowPinModal(false);
                setIsPinVerified(true);
                // NOTE: Do NOT auto-unlock private content here
                // Private photos require explicit unlock action via header button

                // Load assets after PIN verification
                await fetchAssets();
            }
            return isValid;
        } catch (error) {
            console.error(error);
            return false;
        }
    };

    // Handler for unlocking private photos (uses same gallery PIN)
    const handlePrivatePhotoUnlock = async (pin: string): Promise<boolean> => {
        if (!actualGalleryId) return false;
        try {
            const isValid = await galleryService.verifyPin(actualGalleryId, pin);
            if (isValid) {
                localStorage.setItem(`${PRIVATE_UNLOCKED_KEY_PREFIX}${actualGalleryId}`, 'true');
                setShowPinModal(false);
                setIsPrivateUnlocked(true);
            }
            return isValid;
        } catch (error) {
            console.error(error);
            return false;
        }
    };

    // Face Discovery callbacks
    const handleFacesFound = useCallback((photoIds: string[], similarity: number) => {
        setFilteredPhotoIds(photoIds);
        setMatchSimilarity(similarity);
    }, []);

    const clearFaceFilter = useCallback(() => {
        setFilteredPhotoIds(null);
        setMatchSimilarity(null);
    }, []);

    // Client interaction handlers
    const handleFavorite = useCallback(async (assetId: string) => {
        if (!actualGalleryId) return;

        const currentlyFavorited = localFavorites.has(assetId);
        const newFavorited = !currentlyFavorited;

        // Optimistic update
        setLocalFavorites(prev => {
            const next = new Set(prev);
            if (newFavorited) {
                next.add(assetId);
            } else {
                next.delete(assetId);
            }
            return next;
        });

        try {
            await galleryService.togglePublicFavorite(actualGalleryId, assetId, newFavorited, visitorId || undefined);
        } catch (err) {
            console.error('Failed to toggle favorite:', err);
            addToast({
                message: 'Failed to update favorite. Please try again.',
                variant: 'error',
            });
            // Revert on error
            setLocalFavorites(prev => {
                const next = new Set(prev);
                if (currentlyFavorited) {
                    next.add(assetId);
                } else {
                    next.delete(assetId);
                }
                return next;
            });
        }
    }, [actualGalleryId, visitorId, localFavorites]);

    const handleSelection = useCallback(async (assetId: string) => {
        if (!actualGalleryId) return;

        const currentlySelected = localSelections.has(assetId);
        const newSelected = !currentlySelected;

        // Optimistic update
        setLocalSelections(prev => {
            const next = new Set(prev);
            if (newSelected) {
                next.add(assetId);
            } else {
                next.delete(assetId);
            }
            return next;
        });

        try {
            await galleryService.togglePublicSelection(actualGalleryId, assetId, newSelected, visitorId || undefined);
        } catch (err) {
            console.error('Failed to toggle selection:', err);
            addToast({
                message: 'Failed to update selection. Please try again.',
                variant: 'error',
            });
            // Revert on error
            setLocalSelections(prev => {
                const next = new Set(prev);
                if (currentlySelected) {
                    next.add(assetId);
                } else {
                    next.delete(assetId);
                }
                return next;
            });
        }
    }, [actualGalleryId, visitorId, localSelections]);

    // Compute counts for tabs
    const favoriteCount = localFavorites.size;
    const selectionCount = localSelections.size;

    // Compute displayed assets based on face filter, sub-gallery, and privacy
    const displayedAssets = useMemo(() => {
        let result = assets;
        
        // Filter out private photos unless unlocked via PIN
        if (!isPrivateUnlocked) {
            result = result.filter(asset => !asset.is_private);
        }
        
        if (filteredPhotoIds) {
            result = result.filter(asset => filteredPhotoIds.includes(asset.asset_id));
        }
        if (activeSubGallery) {
            result = result.filter(asset => asset.sub_gallery_id === activeSubGallery);
        }
        return result;
    }, [assets, filteredPhotoIds, activeSubGallery, isPrivateUnlocked]);

    // Count of private photos (for unlock button badge)
    const privatePhotoCount = useMemo(() => {
        return assets.filter(asset => asset.is_private).length;
    }, [assets]);

    // Adapt PublicGalleryAsset[] to GalleryAssetItem[] for GalleryCanvas
    const canvasAssets: GalleryAssetItem[] = useMemo(() => {
        return displayedAssets.map(publicAsset => {
            // Construct public URLs for the assets
            // This ensures meaningful thumbnails are available even without signed URLs
            const publicThumbnailUrl = `/api/v1/public/galleries/${actualGalleryId}/assets/${publicAsset.asset_id}/thumbnail`;
            const publicPreviewUrl = `/api/v1/public/galleries/${actualGalleryId}/assets/${publicAsset.asset_id}/preview`;

            return {
                gallery_asset_id: publicAsset.asset_id, // Use same ID for simplicity
                asset_id: publicAsset.asset_id,
                sort_order: publicAsset.sort_order,
                visible: true,
                is_private: publicAsset.is_private || false,
                sub_gallery_id: publicAsset.sub_gallery_id,
                is_favorited: localFavorites.has(publicAsset.asset_id),
                is_selected: localSelections.has(publicAsset.asset_id),
                favorites_count: publicAsset.favorites_count ?? 0,
                asset: {
                    type: publicAsset.type,
                    status: 'available' as const,
                    mime_type: publicAsset.type === 'photo' ? 'image/jpeg' : 'video/mp4',
                    filename: publicAsset.filename,
                    width: publicAsset.width,
                    height: publicAsset.height,
                    duration_ms: publicAsset.duration ? publicAsset.duration * 1000 : undefined,
                    file_size: publicAsset.size_bytes,
                    created_at: publicAsset.created_at,
                    // vital: Provide the constructed public URLs
                    thumbnail_url: publicThumbnailUrl,
                    preview_url: publicPreviewUrl,
                },
            };
        });
    }, [displayedAssets, localFavorites, localSelections, actualGalleryId]);

    // Map layout_style to GalleryCanvas viewMode
    const canvasViewMode: 'grid' | 'masonry' = useMemo(() => {
        return gallery?.layout_style === 'continuous' ? 'masonry' : 'grid';
    }, [gallery?.layout_style]);

    // Lightbox navigation functions
    const openLightbox = useCallback((asset: PublicGalleryAsset) => {
        const index = displayedAssets.findIndex(a => a.asset_id === asset.asset_id);
        setLightboxIndex(index >= 0 ? index : 0);
        setLightboxAsset(asset);
        setShowExif(false);
    }, [displayedAssets]);

    const navigateLightbox = useCallback((direction: 'prev' | 'next') => {
        if (!lightboxAsset || displayedAssets.length === 0) return;

        let newIndex: number;
        if (direction === 'prev') {
            newIndex = lightboxIndex > 0 ? lightboxIndex - 1 : displayedAssets.length - 1;
        } else {
            newIndex = lightboxIndex < displayedAssets.length - 1 ? lightboxIndex + 1 : 0;
        }

        setLightboxIndex(newIndex);
        setLightboxAsset(displayedAssets[newIndex]);
    }, [lightboxAsset, lightboxIndex, displayedAssets]);

    const closeLightbox = useCallback(() => {
        setLightboxAsset(null);
        setShowExif(false);
    }, []);

    // Download handler (defined before keyboard navigation useEffect)
    const handleDownload = useCallback(async (asset: PublicGalleryAsset) => {
        if (!gallery || !actualGalleryId) return;

        // Check download policy
        if (gallery.download_policy === 'view_only') return;

        setIsDownloading(true);
        try {
            // Determine which variant to download based on policy
            const variant = gallery.download_policy === 'original_allowed' ? 'original' : 'preview';
            const url = `/api/v1/public/galleries/${actualGalleryId}/assets/${asset.asset_id}/${variant}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = asset.filename || `photo-${asset.asset_id}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);
        } catch (err) {
            console.error('Download failed:', err);
            addToast({
                message: 'Download failed. Please try again.',
                variant: 'error',
            });
        } finally {
            setIsDownloading(false);
        }
    }, [gallery, actualGalleryId, addToast]);

    // Keyboard navigation for lightbox
    useEffect(() => {
        if (!lightboxAsset) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    closeLightbox();
                    break;
                case 'ArrowLeft':
                    navigateLightbox('prev');
                    break;
                case 'ArrowRight':
                    navigateLightbox('next');
                    break;
                case 'f':
                case 'F':
                    // Toggle favorite with F key
                    if (lightboxAsset) handleFavorite(lightboxAsset.asset_id);
                    break;
                case 's':
                case 'S':
                    // Toggle selection with S key
                    if (lightboxAsset) handleSelection(lightboxAsset.asset_id);
                    break;
                case 'i':
                case 'I':
                    // Toggle EXIF info with I key
                    if (gallery?.exif_visible) setShowExif(prev => !prev);
                    break;
                case 'd':
                case 'D':
                    // Download with D key
                    if (lightboxAsset && gallery?.download_policy !== 'view_only') {
                        handleDownload(lightboxAsset);
                    }
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [lightboxAsset, navigateLightbox, closeLightbox, handleFavorite, handleSelection, handleDownload, gallery?.exif_visible, gallery?.download_policy]);

    // Check if gallery has expired
    const isExpired = useMemo(() => {
        if (!gallery?.expires_at) return false;
        return new Date(gallery.expires_at) < new Date();
    }, [gallery?.expires_at]);

    // Get the shareable URL for ShareMenu component
    const shareUrl = useMemo(() => {
        if (typeof window === 'undefined') return '';
        return window.location.href;
    }, []);

    // Bulk download handler
    const handleBulkDownload = useCallback(async () => {
        if (!gallery || !actualGalleryId) return;
        if (gallery.download_policy === 'view_only') return;

        const assetsToDownload = activeTab === 'selections'
            ? displayedAssets.filter(a => localSelections.has(a.asset_id))
            : activeTab === 'favorites'
                ? displayedAssets.filter(a => localFavorites.has(a.asset_id))
                : displayedAssets;

        if (assetsToDownload.length === 0) return;

        setIsBulkDownloading(true);
        setBulkDownloadProgress(0);

        try {
            const variant = gallery.download_policy === 'original_allowed' ? 'original' : 'preview';
            let completed = 0;

            // Download files sequentially to avoid overwhelming the browser
            for (const asset of assetsToDownload) {
                try {
                    const url = `/api/v1/public/galleries/${actualGalleryId}/assets/${asset.asset_id}/${variant}`;
                    const response = await fetch(url);
                    if (!response.ok) continue;

                    const blob = await response.blob();
                    const downloadUrl = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.download = asset.filename || `photo-${asset.asset_id}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(downloadUrl);

                    completed++;
                    setBulkDownloadProgress(Math.round((completed / assetsToDownload.length) * 100));

                    // Small delay between downloads to avoid browser overload
                    await new Promise(resolve => setTimeout(resolve, BULK_DOWNLOAD_DELAY_MS));
                } catch (err) {
                    console.error('Failed to download asset:', asset.asset_id, err);
                }
            }
        } catch (err) {
            console.error('Bulk download failed:', err);
        } finally {
            setIsBulkDownloading(false);
            setBulkDownloadProgress(0);
        }
    }, [gallery, actualGalleryId, activeTab, displayedAssets, localSelections, localFavorites]);

    // Show expired state
    if (isExpired && gallery) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
                <div className="text-center p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md mx-4">
                    <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                    </div>
                    <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Gallery Expired</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-2">
                        This gallery is no longer available.
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                        Expired on {new Date(gallery.expires_at!).toLocaleDateString()}
                    </p>
                    {gallery.company_profile?.website && (
                        <AppButton
                            variant="outline"
                            onClick={() => window.open(gallery.company_profile?.website, '_blank')}
                        >
                            Visit {gallery.company_profile.name || 'Studio'}
                        </AppButton>
                    )}
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error || !gallery) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
                <div className="text-center p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md mx-4">
                    <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Gallery Unavailable</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">{error || "This gallery is not publicly accessible."}</p>
                    <AppButton variant="primary" onClick={() => window.location.href = '/'}>Go Home</AppButton>
                </div>
            </div>
        );
    }

    const { company_profile } = gallery;
    // Priority: gallery override > company profile > default
    const activeColor = gallery.primary_color || company_profile?.brand_color || '#6366f1';
    const fontFamily = gallery.font_family || 'inherit';

    // Construct cover URL with fallback to first asset
    const coverAssetId = gallery.cover_asset_id || assets[0]?.asset_id;
    const coverUrl = coverAssetId
        ? `/api/v1/public/galleries/${gallery.gallery_id}/assets/${coverAssetId}/preview`
        : null;

    return (
        <div
            className="min-h-screen flex flex-col bg-white dark:bg-gray-950"
            style={{
                '--primary-color': activeColor,
                '--gallery-font-family': fontFamily,
                fontFamily: fontFamily !== 'inherit' ? `'${fontFamily}', sans-serif` : undefined,
            } as React.CSSProperties}
        >
            <Helmet>
                <title>{gallery.title} {company_profile?.name ? `| ${company_profile.name}` : ''}</title>
            </Helmet>

            <ClientEmailModal
                isOpen={showEmailModal}
                onClose={() => navigate('/')}
                onSubmit={handleVisitorSubmit}
                isLoading={isRegistering}
                galleryTitle={gallery.title}
                companyName={company_profile?.name}
                logoUrl={company_profile?.logo_url}
            />

            <PinVerificationModal
                isOpen={showPinModal}
                onVerify={pinModalMode === 'private' ? handlePrivatePhotoUnlock : handlePinVerify}
                onCancel={() => {
                    if (pinModalMode === 'private') {
                        // Just close modal when canceling private photo unlock
                        setShowPinModal(false);
                    } else {
                        // Navigate away if canceling gallery access
                        navigate('/');
                    }
                }}
                galleryTitle={gallery.title}
                companyName={company_profile?.name}
                logoUrl={company_profile?.logo_url}
            />

            <PasswordVerificationModal
                isOpen={showPasswordModal}
                onVerify={async (password) => {
                    if (!actualGalleryId) return false;
                    try {
                        const isValid = await galleryService.verifyPassword(actualGalleryId, password);
                        if (isValid) {
                            localStorage.setItem(`${PASSWORD_VERIFIED_KEY_PREFIX}${actualGalleryId}`, 'true');
                            setShowPasswordModal(false);
                            setIsPasswordVerified(true);

                            // Check PIN after Password
                            if (gallery?.pin_protected) {
                                const pinVerified = localStorage.getItem(`${PIN_VERIFIED_KEY_PREFIX}${actualGalleryId}`);
                                if (!pinVerified) {
                                    setShowPinModal(true);
                                    return true;
                                }
                                // PIN was already verified in a previous session, unlock private content
                                setIsPrivateUnlocked(true);
                            }
                            setIsPinVerified(true);
                            await fetchAssets();
                        }
                        return isValid;
                    } catch (error) {
                        console.error(error);
                        return false;
                    }
                }}
                onCancel={() => navigate('/')}
                galleryTitle={gallery.title}
                companyName={company_profile?.name}
                logoUrl={company_profile?.logo_url}
            />

            {/* Face Discovery Modal */}
            <FaceDiscovery
                isOpen={showFaceDiscovery}
                onClose={() => setShowFaceDiscovery(false)}
                onFacesFound={handleFacesFound}
                galleryId={actualGalleryId || ''}
                galleryTitle={gallery.title}
            />

            {/* Enhanced Lightbox */}
            {lightboxAsset && (
                <div
                    className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
                    onClick={closeLightbox}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Photo viewer"
                >
                    {/* Top bar with close and info buttons */}
                    <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10">
                        <div className="flex items-center gap-2 text-white/80 text-sm">
                            <span>{lightboxIndex + 1} / {displayedAssets.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* EXIF toggle button */}
                            {gallery.exif_visible && lightboxAsset.metadata && (
                                <button
                                    className={`p-2 rounded-full transition-colors ${
                                        showExif ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
                                    }`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowExif(!showExif);
                                    }}
                                    aria-label="Toggle photo info"
                                    title="Photo info (I)"
                                >
                                    <Info size={24} />
                                </button>
                            )}
                            {/* Download button */}
                            {gallery.download_policy !== 'view_only' && (
                                <button
                                    className="p-2 text-white/60 hover:text-white transition-colors disabled:opacity-50"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownload(lightboxAsset);
                                    }}
                                    disabled={isDownloading}
                                    aria-label="Download photo"
                                    title="Download"
                                >
                                    <Download size={24} className={isDownloading ? 'animate-pulse' : ''} />
                                </button>
                            )}
                            <button
                                className="p-2 text-white/60 hover:text-white transition-colors"
                                onClick={closeLightbox}
                                aria-label="Close viewer (Escape)"
                                title="Close (Esc)"
                            >
                                <X size={28} />
                            </button>
                        </div>
                    </div>

                    {/* Navigation arrows */}
                    {displayedAssets.length > 1 && (
                        <>
                            <button
                                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white/80 hover:text-white rounded-full transition-all backdrop-blur-sm z-10"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigateLightbox('prev');
                                }}
                                aria-label="Previous photo (←)"
                                title="Previous (←)"
                            >
                                <ChevronLeft size={32} />
                            </button>
                            <button
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white/80 hover:text-white rounded-full transition-all backdrop-blur-sm z-10"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigateLightbox('next');
                                }}
                                aria-label="Next photo (→)"
                                title="Next (→)"
                            >
                                <ChevronRight size={32} />
                            </button>
                        </>
                    )}

                    {/* Main image with watermark */}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={`/api/v1/public/galleries/${gallery.gallery_id}/assets/${lightboxAsset.asset_id}/preview`}
                            alt={lightboxAsset.filename}
                            className="max-w-[90vw] max-h-[85vh] object-contain"
                        />
                        {/* Watermark overlay for restricted downloads */}
                        {(gallery.download_policy === 'view_only' || gallery.download_policy === 'watermarked_only') && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                                <div
                                    className="text-white/15 text-4xl md:text-6xl font-bold uppercase tracking-widest rotate-[-25deg] whitespace-nowrap"
                                    style={{
                                        textShadow: '0 0 20px rgba(0,0,0,0.5)',
                                        letterSpacing: '0.15em',
                                    }}
                                >
                                    {company_profile?.name || 'PREVIEW ONLY'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* EXIF Panel */}
                    {showExif && lightboxAsset.metadata && (
                        <div
                            className="absolute right-4 top-20 bg-black/80 backdrop-blur-md rounded-lg p-4 text-white text-sm max-w-xs z-10"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                                <Camera size={16} />
                                Photo Info
                            </h4>
                            <div className="space-y-2 text-white/80">
                                {lightboxAsset.metadata.make && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Camera</span>
                                        <span>{lightboxAsset.metadata.make} {lightboxAsset.metadata.model || ''}</span>
                                    </div>
                                )}
                                {lightboxAsset.metadata.lens && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Lens</span>
                                        <span>{lightboxAsset.metadata.lens}</span>
                                    </div>
                                )}
                                {lightboxAsset.metadata.focal_length && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Focal Length</span>
                                        <span>{lightboxAsset.metadata.focal_length}mm</span>
                                    </div>
                                )}
                                {lightboxAsset.metadata.aperture && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Aperture</span>
                                        <span>f/{lightboxAsset.metadata.aperture}</span>
                                    </div>
                                )}
                                {lightboxAsset.metadata.shutter_speed && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Shutter</span>
                                        <span>{lightboxAsset.metadata.shutter_speed}</span>
                                    </div>
                                )}
                                {lightboxAsset.metadata.iso && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">ISO</span>
                                        <span>{lightboxAsset.metadata.iso}</span>
                                    </div>
                                )}
                                {lightboxAsset.width && lightboxAsset.height && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Resolution</span>
                                        <span>{lightboxAsset.width} × {lightboxAsset.height}</span>
                                    </div>
                                )}
                                {lightboxAsset.metadata.date_taken && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Date Taken</span>
                                        <span>{new Date(lightboxAsset.metadata.date_taken).toLocaleDateString()}</span>
                                    </div>
                                )}
                            </div>
                            <p className="mt-3 pt-3 border-t border-white/20 text-white/50 text-xs">
                                Press I to toggle
                            </p>
                        </div>
                    )}

                    {/* Bottom action bar */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-4 z-10">
                        {/* Favorite button */}
                        <button
                            className={`p-3 rounded-full backdrop-blur-sm transition-all ${
                                localFavorites.has(lightboxAsset.asset_id)
                                    ? 'bg-red-500 text-white'
                                    : 'bg-white/20 text-white hover:bg-white/30'
                            }`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleFavorite(lightboxAsset.asset_id);
                            }}
                            aria-label={localFavorites.has(lightboxAsset.asset_id) ? 'Remove from favorites' : 'Add to favorites'}
                            title={localFavorites.has(lightboxAsset.asset_id) ? 'Remove from favorites (F)' : 'Add to favorites (F)'}
                        >
                            <Heart size={24} className={localFavorites.has(lightboxAsset.asset_id) ? 'fill-current' : ''} />
                        </button>
                        {/* Selection button */}
                        <button
                            className={`p-3 rounded-full backdrop-blur-sm transition-all ${
                                localSelections.has(lightboxAsset.asset_id)
                                    ? 'bg-green-500 text-white'
                                    : 'bg-white/20 text-white hover:bg-white/30'
                            }`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSelection(lightboxAsset.asset_id);
                            }}
                            aria-label={localSelections.has(lightboxAsset.asset_id) ? 'Remove from picks' : 'Add to picks'}
                            title={localSelections.has(lightboxAsset.asset_id) ? 'Remove from picks (S)' : 'Add to picks (S)'}
                        >
                            <Bookmark size={24} className={localSelections.has(lightboxAsset.asset_id) ? 'fill-current' : ''} />
                        </button>
                    </div>

                    {/* Keyboard hints */}
                    <div className="absolute bottom-4 right-4 text-white/40 text-xs hidden md:block">
                        ← → Navigate • F Favorite • S Select{gallery.download_policy !== 'view_only' ? ' • D Download' : ''} • I Info • Esc Close
                    </div>
                </div>
            )}

            {/* Sticky Header */}
            <header className="sticky top-0 z-50 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 transition-all">
                <div className="max-w-7xl mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Company branding: show logo and/or name */}
                        {(company_profile?.logo_url || company_profile?.name) && (
                            <div className="flex items-center gap-3">
                                {company_profile.logo_url && (
                                    <img src={company_profile.logo_url} alt={company_profile.name || 'Company logo'} className="h-10 w-auto object-contain" />
                                )}
                                {company_profile.name && (
                                    <span className="text-lg font-bold font-heading hidden sm:inline">{company_profile.name}</span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                        {/* Unlock Private Photos Button - show when gallery has PIN protection and private photos exist */}
                        {gallery?.pin_protected && !isPrivateUnlocked && privatePhotoCount > 0 && (
                            <AppButton
                                variant="outline"
                                leftIcon={<LockIcon size={16} />}
                                size="sm"
                                onClick={() => {
                                    setPinModalMode('private');
                                    setShowPinModal(true);
                                }}
                                aria-label="Unlock private photos"
                            >
                                <span className="hidden sm:inline">Unlock {privatePhotoCount} Private</span>
                                <span className="sm:hidden">{privatePhotoCount}</span>
                            </AppButton>
                        )}

                        {/* Find Me Button - only show when authenticated and assets loaded */}
                        {isVisitorAuthenticated && isPinVerified && assets.length > 0 && (
                            <AppButton
                                variant="outline"
                                leftIcon={<User size={16} />}
                                size="sm"
                                onClick={() => setShowFaceDiscovery(true)}
                                aria-label="Find photos of yourself"
                            >
                                <span className="hidden sm:inline">Find Me</span>
                            </AppButton>
                        )}

                        {/* Bulk Download Button */}
                        {gallery.download_policy !== 'view_only' && isVisitorAuthenticated && isPinVerified && displayedAssets.length > 0 && (
                            <AppButton
                                variant="outline"
                                leftIcon={isBulkDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                size="sm"
                                onClick={handleBulkDownload}
                                disabled={isBulkDownloading}
                                aria-label="Download all photos"
                            >
                                <span className="hidden sm:inline">
                                    {isBulkDownloading
                                        ? `${bulkDownloadProgress}%`
                                        : activeTab === 'selections' && selectionCount > 0
                                            ? `Download (${selectionCount})`
                                            : activeTab === 'favorites' && favoriteCount > 0
                                                ? `Download (${favoriteCount})`
                                                : 'Download All'
                                    }
                                </span>
                            </AppButton>
                        )}

                        {/* Share Button with Dropdown - Extracted component */}
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
                    /* Apply gradient_config or fallback gradient when no cover image */
                    <div
                        className="absolute inset-0 transition-all duration-500"
                        style={{ background: heroGradientStyle }}
                    />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-center pb-12 p-4 text-center">
                    <div className="max-w-3xl">
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-lg font-heading">{gallery.album_title || gallery.title}</h2>
                        {gallery.description && (
                            <p className="text-white/90 text-lg md:text-xl drop-shadow-md max-w-2xl mx-auto">{gallery.description}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 max-w-7xl mx-auto px-4 md:px-6 py-12 w-full">

                {gallery.status !== 'published' && (
                    <div className="mb-8 p-4 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-lg text-center border border-yellow-200 dark:border-yellow-800">
                        This gallery is currently <strong>{gallery.status}</strong>. Only you can see this.
                    </div>
                )}

                {/* Privacy Gate */}
                {showEmailModal || (gallery.pin_protected && !isPinVerified) ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
                            <LockIcon className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-text-primary mb-2">
                            Restricted Access
                        </h3>
                        <p className="text-text-secondary max-w-md mx-auto mb-6">
                            {showEmailModal
                                ? "Please complete registration to view this gallery."
                                : "This gallery is PIN protected. Please enter the PIN."}
                        </p>
                        <AppButton
                            variant="primary"
                            onClick={() => {
                                if (showEmailModal) {
                                    setShowEmailModal(true);
                                } else {
                                    setPinModalMode('gallery');
                                    setShowPinModal(true);
                                }
                            }}
                        >
                            {showEmailModal ? "Register Now" : "Enter PIN"}
                        </AppButton>
                    </div>
                ) : (
                    <>
                        {/* Workflow Tabs */}
                        <div className="mb-8 flex flex-wrap items-center justify-center gap-2" role="tablist" aria-label="Photo filters">
                            <button
                                role="tab"
                                aria-selected={activeTab === 'all'}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${
                                    activeTab === 'all'
                                        ? 'bg-primary text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                                onClick={() => setActiveTab('all')}
                            >
                                <LayoutGrid size={16} />
                                All Photos
                                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-black/10 dark:bg-white/10">
                                    {assets.length}
                                </span>
                            </button>
                            <button
                                role="tab"
                                aria-selected={activeTab === 'favorites'}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${
                                    activeTab === 'favorites'
                                        ? 'bg-red-500 text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                                onClick={() => setActiveTab('favorites')}
                            >
                                <Heart size={16} />
                                Favorites
                                {favoriteCount > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-black/10 dark:bg-white/10">
                                        {favoriteCount}
                                    </span>
                                )}
                            </button>
                            <button
                                role="tab"
                                aria-selected={activeTab === 'selections'}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${
                                    activeTab === 'selections'
                                        ? 'bg-green-500 text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                                onClick={() => setActiveTab('selections')}
                            >
                                <Bookmark size={16} />
                                My Picks
                                {selectionCount > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-black/10 dark:bg-white/10">
                                        {selectionCount}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Sub-Gallery Tabs (if gallery has sections) */}
                        {gallery.sub_galleries && gallery.sub_galleries.length > 0 && (
                            <div className="mb-6 flex flex-wrap items-center justify-center gap-2" role="tablist" aria-label="Gallery sections">
                                <button
                                    role="tab"
                                    aria-selected={activeSubGallery === null}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${
                                        activeSubGallery === null
                                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                    onClick={() => setActiveSubGallery(null)}
                                >
                                    <FolderOpen size={14} />
                                    All Sections
                                </button>
                                {gallery.sub_galleries.filter(sg => sg.visible).map(subGallery => (
                                    <button
                                        key={subGallery.sub_gallery_id}
                                        role="tab"
                                        aria-selected={activeSubGallery === subGallery.sub_gallery_id}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${
                                            activeSubGallery === subGallery.sub_gallery_id
                                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                        onClick={() => setActiveSubGallery(subGallery.sub_gallery_id)}
                                    >
                                        {subGallery.name}
                                        <span className="px-1.5 py-0.5 rounded text-xs bg-black/10 dark:bg-white/10">
                                            {subGallery.photo_count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Face Filter Active Indicator */}
                        {filteredPhotoIds && (
                            <div
                                className="mb-6 p-4 bg-accent/10 border border-accent/20 rounded-lg flex items-center justify-between animate-fade-in"
                                role="status"
                                aria-live="polite"
                            >
                                <div className="flex items-center gap-3">
                                    <User size={20} className="text-accent" />
                                    <div>
                                        <p className="font-medium text-text-primary">
                                            Showing {displayedAssets.length} photo{displayedAssets.length !== 1 ? 's' : ''} of you
                                        </p>
                                        {matchSimilarity && (
                                            <p className="text-sm text-text-secondary">
                                                Average match: {Math.round(matchSimilarity * 100)}%
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <AppButton
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearFaceFilter}
                                    aria-label="Clear face filter and show all photos"
                                >
                                    <X size={16} className="mr-1" />
                                    Clear
                                </AppButton>
                            </div>
                        )}

                        {displayedAssets.length === 0 ? (
                            <div className="text-center py-20 text-gray-500">
                                <Grid className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>
                                    {filteredPhotoIds
                                        ? 'No matching photos found.'
                                        : activeTab === 'favorites'
                                            ? 'No favorites yet. Click the heart icon on photos you love!'
                                            : activeTab === 'selections'
                                                ? 'No picks yet. Click the bookmark icon to add to your selection.'
                                                : 'No photos in this gallery yet.'
                                    }
                                </p>
                                {(filteredPhotoIds || activeTab !== 'all') && (
                                    <AppButton
                                        variant="outline"
                                        className="mt-4"
                                        onClick={() => {
                                            clearFaceFilter();
                                            setActiveTab('all');
                                        }}
                                    >
                                        Show All Photos
                                    </AppButton>
                                )}
                            </div>
                        ) : (
                            <GalleryCanvas
                                assets={canvasAssets}
                                viewMode={canvasViewMode}
                                columns={{ sm: 1, md: 2, lg: 3, xl: 4 }}
                                gap="md"
                                selectedAssetIds={localSelections}
                                lastSelectedId={null} // Track this if shift-click range select is needed
                                managementSelectable={false} // Disable admin selection UI for public view
                                showCustomerSelection={true}
                                onSelectionChange={selection => {
                                    // Update local selections based on set difference
                                    const currentlySelected = localSelections;
                                    const newSelections = new Set(selection);
                                    const added = [...newSelections].filter(x => !currentlySelected.has(x));
                                    const removed = [...currentlySelected].filter(x => !newSelections.has(x));

                                    added.forEach(assetId => handleSelection(assetId));
                                    removed.forEach(assetId => handleSelection(assetId));
                                }}
                                onCustomerSelectionToggle={(assetId, _selected) => handleSelection(assetId)}
                                onAssetClick={(asset, _index) => {
                                    const pubAsset = displayedAssets.find(a => a.asset_id === asset.asset_id);
                                    if (pubAsset) openLightbox(pubAsset);
                                }}
                                onAssetFavorite={(assetId, _favorited) => handleFavorite(assetId)}
                                onAssetDownload={gallery?.download_policy !== 'view_only' ? (assetId) => {
                                    const pubAsset = displayedAssets.find(a => a.asset_id === assetId);
                                    if (pubAsset) handleDownload(pubAsset);
                                } : undefined}
                                isClientView={true}
                                downloadPolicy={gallery?.download_policy}
                                showWatermark={gallery?.download_policy === 'view_only' || gallery?.download_policy === 'watermarked_only'}
                                isPrivateUnlocked={isPrivateUnlocked}
                                onUnlockPrivate={() => {
                                    console.log('[PublicGalleryPage] onUnlockPrivate called!', { 
                                        pin_protected: gallery?.pin_protected,
                                        isPrivateUnlocked,
                                        isPinVerified
                                    });
                                    if (gallery?.pin_protected) {
                                        console.log('[PublicGalleryPage] Opening PIN modal for private unlock...');
                                        setPinModalMode('private');
                                        setShowPinModal(true);
                                    } else {
                                        console.log('[PublicGalleryPage] Gallery not PIN protected, showing toast');
                                        addToast({
                                            message: 'This photo is private. Please contact the photographer to view this content.',
                                            variant: 'info',
                                        });
                                    }
                                }}
                            />
                        )}
                    </>
                )}
            </main>

            {/* Footer */}
            <footer className="bg-gray-50 dark:bg-black py-12 border-t border-gray-100 dark:border-gray-800">
                <div className="max-w-7xl mx-auto px-4 text-center space-y-6">
                    {company_profile?.logo_url ? (
                        <img src={company_profile.logo_url} alt="Logo" className="h-10 mx-auto grayscale hover:grayscale-0 transition-all opacity-70 hover:opacity-100" />
                    ) : null}

                    <div>
                        <p className="font-medium text-lg text-gray-900 dark:text-white mb-2">{company_profile?.name || 'Studio Name'}</p>
                        {company_profile?.website && (
                            <a href={company_profile.website} target="_blank" rel="noreferrer" className="text-primary hover:underline transition-colors">
                                {company_profile.website.replace(/^https?:\/\//, '')}
                            </a>
                        )}
                    </div>
                    <div className="text-xs text-gray-400">
                        &copy; {new Date().getFullYear()} {company_profile?.name}. All rights reserved.
                    </div>

                    {/* Custom Links */}
                    {gallery.custom_links && gallery.custom_links.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-4 pt-4">
                            {gallery.custom_links.map((link, index) => (
                                <a
                                    key={index}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary transition-colors"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </footer>
        </div>
    );
};

export default PublicGalleryPage;
