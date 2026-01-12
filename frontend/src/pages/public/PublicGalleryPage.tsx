import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { galleryService } from '../../services/galleryService';
import { magicLinkService } from '../../services/magicLinkService';
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
    Play,
    Pause,
    Volume2,
    VolumeX,
    Video,
    Keyboard,
} from 'lucide-react';
import { ClientEmailModal } from '../../components/features/gallery/ClientEmailModal';
import { PinVerificationModal } from '../../components/features/gallery/PinVerificationModal';
import { PasswordVerificationModal } from '../../components/features/gallery/PasswordVerificationModal';
import { FaceDiscovery } from '../../components/features/gallery/FaceDiscovery';
import { ShareMenu } from '../../components/features/gallery/ShareMenu';
import { Breadcrumbs, BreadcrumbItem } from '../../components/features/gallery/Breadcrumbs';
import { useUtmTracking } from '../../hooks/useUtmTracking';
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
    // galleryId is actually the magic link token
    const { galleryId: token } = useParams<{ galleryId: string }>();
    const navigate = useNavigate();
    const [gallery, setGallery] = useState<GalleryDetailData | null>(null);
    const [actualGalleryId, setActualGalleryId] = useState<string | null>(null);
    const [assets, setAssets] = useState<PublicGalleryAsset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    // UTM Tracking for marketing attribution
    const { getUtmPayload, clearUtm } = useUtmTracking();

    // Workflow tabs state
    const [activeTab, setActiveTab] = useState<WorkflowTab>('all');

    // Lightbox state
    const [lightboxAsset, setLightboxAsset] = useState<PublicGalleryAsset | null>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number>(0);
    const [showExif, setShowExif] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Video player state
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [isVideoMuted, setIsVideoMuted] = useState(false);
    const videoRef = React.useRef<HTMLVideoElement>(null);

    // Touch/swipe state for mobile navigation
    const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);
    const lightboxRef = React.useRef<HTMLDivElement>(null);
    const lastTapRef = React.useRef<number>(0);

    // Zoom state for lightbox
    const [isZoomed, setIsZoomed] = useState(false);
    const [zoomPosition, setZoomPosition] = useState<{ x: number; y: number }>({ x: 50, y: 50 });

    // Accessibility state
    const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
    const [announcement, setAnnouncement] = useState<string>('');

    // Announce to screen readers
    const announce = useCallback((message: string) => {
        setAnnouncement(message);
        // Clear after announcement is read
        setTimeout(() => setAnnouncement(''), 1000);
    }, []);

    // Sub-gallery filter state
    const [activeSubGallery, setActiveSubGallery] = useState<string | null>(null);

    // Breadcrumb navigation state
    const [breadcrumbItems, setBreadcrumbItems] = useState<BreadcrumbItem[]>([]);

    // Emotion filter state
    const [activeEmotion, setActiveEmotion] = useState<string | null>(null);
    const EMOTIONS = [
        { value: 'joy', label: 'Joy', emoji: '😊' },
        { value: 'sadness', label: 'Sad', emoji: '😢' },
        { value: 'anger', label: 'Angry', emoji: '😠' },
        { value: 'surprise', label: 'Surprise', emoji: '😮' },
        { value: 'fear', label: 'Fear', emoji: '😨' },
        { value: 'disgust', label: 'Disgust', emoji: '😒' },
        { value: 'contentment', label: 'Content', emoji: '😌' },
    ];

    // Local client selections (for optimistic UI updates)
    const [localFavorites, setLocalFavorites] = useState<Set<string>>(new Set());
    const [localSelections, setLocalSelections] = useState<Set<string>>(new Set());

    // Bulk download state
    const [isBulkDownloading, setIsBulkDownloading] = useState(false);
    const [bulkDownloadProgress, setBulkDownloadProgress] = useState(0);

    // Toast notifications
    const { addToast } = useToast();

    // Load visitor ID from storage
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
            if (!token) return;
            setIsLoading(true);
            try {
                // Security: Detect if URL parameter is a UUID (gallery_id) instead of a token
                // Magic link tokens are base64-encoded (43 chars), not UUIDs (36 chars with dashes)
                const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (uuidPattern.test(token)) {
                    console.error('Security: Detected gallery_id in URL instead of magic link token', {
                        token,
                        url: window.location.href,
                        referrer: document.referrer,
                    });
                    setError(
                        'Invalid link format. This URL uses a gallery ID instead of a secure magic link token. ' +
                        'Please create a shareable link from the gallery\'s Share dialog. ' +
                        'Direct gallery ID access is disabled for security reasons.'
                    );
                    setIsLoading(false);
                    return;
                }

                // Validate magic link token first (token is the magic link token from URL)
                const validatedLink = await magicLinkService.validateToken(token);

                // Extract gallery_id from validation response
                const galleryIdFromValidation = validatedLink.gallery_id;
                setActualGalleryId(galleryIdFromValidation);

                // Use gallery data from validation response
                const galleryData: GalleryDetailData = {
                    gallery_id: validatedLink.gallery.gallery_id,
                    title: validatedLink.album_title || validatedLink.gallery.title,
                    description: validatedLink.gallery.description,
                    status: validatedLink.gallery.status,
                    cover_asset_id: validatedLink.gallery.cover_asset_id,
                    primary_color: validatedLink.gallery.primary_color,
                    font_family: validatedLink.gallery.font_family,
                    // Map branding fields from magic link validation response
                    gradient_config: validatedLink.gallery.gradient_config,
                    theme: validatedLink.gallery.theme,
                    layout_style: validatedLink.gallery.layout_style,
                    download_policy: validatedLink.gallery.download_policy,
                    watermark_config: validatedLink.gallery.watermark_config,
                    findme_config: validatedLink.gallery.findme_config,
                    slideshow_config: validatedLink.gallery.slideshow_config,
                    activity_tracking: validatedLink.gallery.activity_tracking,
                    custom_domain: validatedLink.gallery.custom_domain,
                    custom_links: validatedLink.gallery.custom_links || [],
                    pin_protected: validatedLink.gallery.pin_protected || false,
                    email_registration_required: validatedLink.gallery.email_registration_required || false,
                    password_protected: false, // Add if available in response
                    workspace_id: '', // Not needed for public view
                    created_by_user_id: '', // Not needed for public view
                    created_at: new Date().toISOString(), // Default, will be updated if available
                    sub_galleries: [], // Default empty array
                    stats: {
                        total_items: 0,
                        total_photos: 0,
                        total_videos: 0,
                        favorites_count: 0,
                        selections_count: 0,
                    }, // Default stats, will be updated when assets are loaded
                };

                setGallery(galleryData);

                // Check registration requirement (use actual gallery_id for storage keys)
                const isRegistered = localStorage.getItem(`${VISITOR_STORAGE_KEY_PREFIX}${galleryIdFromValidation}`);

                if (galleryData.email_registration_required && !isRegistered) {
                    setShowEmailModal(true);
                } else {
                    setIsVisitorAuthenticated(true);

                    // Check Password protection first
                    const passwordVerified = localStorage.getItem(`${PASSWORD_VERIFIED_KEY_PREFIX}${galleryIdFromValidation}`);
                    if (galleryData.password_protected && !passwordVerified) {
                        setShowPasswordModal(true);
                        // Don't check PIN yet if password is needed
                        return;
                    }
                    setIsPasswordVerified(true);

                    // Check PIN protection

                    const pinVerified = localStorage.getItem(`${PIN_VERIFIED_KEY_PREFIX}${galleryIdFromValidation}`);
                    if (galleryData.pin_protected && !pinVerified) {
                        setPinModalMode('gallery');
                        setShowPinModal(true);
                    } else {
                        setIsPinVerified(true);
                        // Check if private photos were previously unlocked
                        const privateUnlocked = localStorage.getItem(`${PRIVATE_UNLOCKED_KEY_PREFIX}${galleryIdFromValidation}`);
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
                } else {
                    setError('Failed to load gallery.');
                }
            } finally {
                setIsLoading(false);
            }
        };
        fetchGalleryData();
    }, [token]);

    // Fetch assets with current filter
    const fetchAssets = useCallback(async () => {
        if (!actualGalleryId) return;
        try {
            // Use filtered endpoint to get client interaction data
            const filterType = activeTab === 'all' ? undefined : activeTab;
            const assetsData = await galleryService.getPublicGalleryAssetsFiltered(
                actualGalleryId,
                filterType,
                activeSubGallery || undefined,
                activeEmotion ? { emotion: activeEmotion, minEmotionConfidence: 0.7 } : undefined
            );
            setAssets(assetsData);

            // Update stats based on loaded assets
            setGallery(prev => {
                if (!prev) return prev;
                const totalPhotos = assetsData.filter(a => a.type === 'photo' || !a.type).length;
                const totalVideos = assetsData.filter(a => a.type === 'video').length;
                const favoritesCount = assetsData.filter(a => a.favorites_count && a.favorites_count > 0).length;
                const selectionsCount = assetsData.filter(a => a.is_selected).length;

                return {
                    ...prev,
                    stats: {
                        total_items: assetsData.length,
                        total_photos: totalPhotos,
                        total_videos: totalVideos,
                        favorites_count: favoritesCount,
                        selections_count: selectionsCount,
                    },
                };
            });

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
    }, [actualGalleryId, activeTab, activeSubGallery, activeEmotion]);

    // Refetch when tab changes
    useEffect(() => {
        if (isVisitorAuthenticated && isPinVerified && isPasswordVerified && actualGalleryId) {
            fetchAssets();
        }
    }, [activeTab, isVisitorAuthenticated, isPinVerified, isPasswordVerified, actualGalleryId, fetchAssets]);

    // Build breadcrumb navigation when sub-gallery changes
    useEffect(() => {
        if (!gallery || !actualGalleryId) {
            setBreadcrumbItems([]);
            return;
        }

        // Start with gallery root
        const items: BreadcrumbItem[] = [
            {
                id: actualGalleryId,
                name: gallery.title,
                type: 'gallery',
            },
        ];

        // Add active sub-gallery if selected
        if (activeSubGallery) {
            const subGallery = gallery.sub_galleries?.find(sg => sg.sub_gallery_id === activeSubGallery);
            if (subGallery) {
                items.push({
                    id: subGallery.sub_gallery_id,
                    name: subGallery.name,
                    type: 'sub_gallery',
                });
            }
        }

        setBreadcrumbItems(items);
    }, [gallery, actualGalleryId, activeSubGallery]);

    // Handle breadcrumb navigation
    const handleBreadcrumbNavigate = useCallback((item: BreadcrumbItem) => {
        if (item.type === 'gallery') {
            setActiveSubGallery(null);
        } else {
            // For nested sub-galleries, this would navigate to the parent
            // For now with flat structure, clicking a sub-gallery breadcrumb stays on it
            setActiveSubGallery(item.id);
        }
    }, []);

    const handleVisitorSubmit = async (data: { email: string; first_name: string; last_name: string; phone: string; address?: string }) => {
        if (!actualGalleryId) return;
        setIsRegistering(true);
        try {
            // Include UTM tracking parameters for marketing attribution
            const utmPayload = getUtmPayload();
            const registrationData = {
                ...data,
                ...utmPayload,
            };

            const result = await galleryService.registerVisitor(actualGalleryId, registrationData);
            localStorage.setItem(`${VISITOR_STORAGE_KEY_PREFIX}${actualGalleryId}`, 'true');
            localStorage.setItem(`${VISITOR_ID_KEY_PREFIX}${actualGalleryId}`, result.visitor_id);
            setVisitorId(result.visitor_id);
            setShowEmailModal(false);
            setIsVisitorAuthenticated(true);

            // Clear UTM params after successful registration (attribution recorded)
            clearUtm();

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

        // Hide private photos if not unlocked
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
                client_favorites_count: publicAsset.favorites_count ?? 0,
                client_picks_count: 0,
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
        // Accept both legacy 'continuous' and explicit 'masonry' settings
        return (gallery?.layout_style === 'continuous' || gallery?.layout_style === 'masonry') ? 'masonry' : 'grid';
    }, [gallery?.layout_style]);

    // Compute hero gradient style from branding config
    const heroGradientStyle = useMemo(() => {
        if (gallery?.gradient_config && isValidGradientConfig(gallery.gradient_config)) {
            return gradientToCss(gallery.gradient_config);
        }
        // Fallback or default gradient if no valid config
        return gallery?.primary_color
            ? `linear-gradient(135deg, ${gallery.primary_color} 0%, #000000 100%)`
            : 'linear-gradient(135deg, #1f2937 0%, #000000 100%)';
    }, [gallery?.gradient_config, gallery?.primary_color]);

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

        // Reset video state when navigating
        setIsVideoPlaying(false);
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }

        // Reset zoom state when navigating
        setIsZoomed(false);
        setZoomPosition({ x: 50, y: 50 });

        setLightboxIndex(newIndex);
        setLightboxAsset(displayedAssets[newIndex]);
    }, [lightboxAsset, lightboxIndex, displayedAssets]);

    const closeLightbox = useCallback(() => {
        setLightboxAsset(null);
        setShowExif(false);
        // Reset video state
        setIsVideoPlaying(false);
        if (videoRef.current) {
            videoRef.current.pause();
        }
        // Reset zoom state
        setIsZoomed(false);
        setZoomPosition({ x: 50, y: 50 });
    }, []);

    // Video playback controls
    const toggleVideoPlayback = useCallback(() => {
        if (!videoRef.current) return;

        if (isVideoPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setIsVideoPlaying(!isVideoPlaying);
    }, [isVideoPlaying]);

    const toggleVideoMute = useCallback(() => {
        if (!videoRef.current) return;
        videoRef.current.muted = !isVideoMuted;
        setIsVideoMuted(!isVideoMuted);
    }, [isVideoMuted]);

    // Touch event handlers for mobile swipe navigation
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        touchStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
        };
    }, []);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (!touchStartRef.current || e.changedTouches.length !== 1) return;

        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - touchStartRef.current.x;
        const deltaY = touch.clientY - touchStartRef.current.y;
        const deltaTime = Date.now() - touchStartRef.current.time;

        // Double-tap detection for zoom
        const now = Date.now();
        const doubleTapDelay = 300;

        // Check for double-tap (quick tap without much movement)
        if (deltaTime < 200 && Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20) {
            if (now - lastTapRef.current < doubleTapDelay) {
                // Double-tap detected - toggle zoom
                if (lightboxAsset?.type !== 'video') {
                    setIsZoomed(prev => !prev);
                    // Set zoom position based on tap location
                    const rect = lightboxRef.current?.getBoundingClientRect();
                    if (rect) {
                        const x = ((touch.clientX - rect.left) / rect.width) * 100;
                        const y = ((touch.clientY - rect.top) / rect.height) * 100;
                        setZoomPosition({ x, y });
                    }
                }
                lastTapRef.current = 0;
                touchStartRef.current = null;
                return;
            }
            lastTapRef.current = now;
        }

        // Minimum swipe distance and maximum time for a valid swipe
        const minSwipeDistance = 50;
        const maxSwipeTime = 300;
        const swipeThreshold = 0.5; // Ratio of horizontal to vertical movement

        touchStartRef.current = null;

        // Don't allow swipe navigation when zoomed
        if (isZoomed) return;

        // Check if it's a valid swipe (fast enough and far enough)
        if (deltaTime > maxSwipeTime) return;

        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        // Horizontal swipe detection (for navigation)
        if (absX > minSwipeDistance && absX > absY * swipeThreshold) {
            if (deltaX > 0) {
                // Swipe right - go to previous
                navigateLightbox('prev');
            } else {
                // Swipe left - go to next
                navigateLightbox('next');
            }
            return;
        }

        // Vertical swipe detection (swipe up to close)
        if (absY > minSwipeDistance && absY > absX * swipeThreshold && deltaY < 0) {
            // Swipe up - close lightbox
            closeLightbox();
        }
    }, [navigateLightbox, closeLightbox, isZoomed, lightboxAsset?.type]);

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
                case ' ':
                    // Spacebar toggles video playback
                    if (lightboxAsset?.type === 'video') {
                        e.preventDefault();
                        toggleVideoPlayback();
                    }
                    break;
                case 'm':
                case 'M':
                    // M key toggles video mute
                    if (lightboxAsset?.type === 'video') {
                        toggleVideoMute();
                    }
                    break;
                case '?':
                    // ? key shows keyboard shortcuts help
                    e.preventDefault();
                    setShowKeyboardHelp(true);
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [lightboxAsset, navigateLightbox, closeLightbox, handleFavorite, handleSelection, handleDownload, gallery?.exif_visible, gallery?.download_policy, toggleVideoPlayback, toggleVideoMute]);

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
            let processed = 0;
            let successful = 0;
            let failed = 0;

            // Download files sequentially to avoid overwhelming the browser
            for (const asset of assetsToDownload) {
                try {
                    const url = `/api/v1/public/galleries/${actualGalleryId}/assets/${asset.asset_id}/${variant}`;
                    const response = await fetch(url);

                    if (!response.ok) {
                        failed++;
                        processed++;
                        setBulkDownloadProgress(Math.round((processed / assetsToDownload.length) * 100));
                        continue;
                    }

                    const blob = await response.blob();
                    const downloadUrl = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.download = asset.filename || `photo-${asset.asset_id}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(downloadUrl);

                    successful++;
                    processed++;
                    setBulkDownloadProgress(Math.round((processed / assetsToDownload.length) * 100));

                    // Small delay between downloads to avoid browser overload
                    await new Promise(resolve => setTimeout(resolve, BULK_DOWNLOAD_DELAY_MS));
                } catch (err) {
                    console.error('Failed to download asset:', asset.asset_id, err);
                    failed++;
                    processed++;
                    setBulkDownloadProgress(Math.round((processed / assetsToDownload.length) * 100));
                }
            }

            // Show summary toast after completion
            if (failed > 0) {
                addToast({
                    message: `Downloaded ${successful} of ${assetsToDownload.length} photos. ${failed} failed.`,
                    variant: failed === assetsToDownload.length ? 'error' : 'warning',
                });
            } else {
                addToast({
                    message: `Successfully downloaded ${successful} photo${successful !== 1 ? 's' : ''}.`,
                    variant: 'success',
                });
            }
        } catch (err) {
            console.error('Bulk download failed:', err);
            addToast({
                message: 'Bulk download failed. Please try again.',
                variant: 'error',
            });
        } finally {
            setIsBulkDownloading(false);
            setBulkDownloadProgress(0);
        }
    }, [gallery, actualGalleryId, activeTab, displayedAssets, localSelections, localFavorites, addToast]);

    const company_profile = gallery?.company_profile;
    // Priority: gallery override > company profile > default
    const activeColor = gallery?.primary_color || company_profile?.brand_color || '#6366f1';
    const fontFamily = gallery?.font_family || 'inherit';

    // Construct cover URL
    const coverUrl = gallery?.cover_asset_id
        ? `/api/v1/public/galleries/${gallery.gallery_id}/assets/${gallery.cover_asset_id}/preview`
        : null;



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

            {/* Skip to main content - accessibility */}
            <a
                href="#main-gallery-content"
                className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
                Skip to gallery content
            </a>

            {/* Screen reader announcements */}
            <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
            >
                {announcement}
            </div>

            {/* Keyboard shortcuts help modal */}
            {showKeyboardHelp && (
                <div
                    className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4"
                    onClick={() => setShowKeyboardHelp(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Keyboard shortcuts"
                >
                    <div
                        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <Keyboard size={20} />
                                Keyboard Shortcuts
                            </h2>
                            <button
                                onClick={() => setShowKeyboardHelp(false)}
                                className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Navigation</h3>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">←</kbd>
                                    <span className="text-gray-700 dark:text-gray-300">Previous photo</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">→</kbd>
                                    <span className="text-gray-700 dark:text-gray-300">Next photo</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">Esc</kbd>
                                    <span className="text-gray-700 dark:text-gray-300">Close viewer</span>
                                </div>
                            </div>
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pt-2">Actions</h3>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">F</kbd>
                                    <span className="text-gray-700 dark:text-gray-300">Toggle favorite</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">S</kbd>
                                    <span className="text-gray-700 dark:text-gray-300">Toggle selection</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">I</kbd>
                                    <span className="text-gray-700 dark:text-gray-300">Show info</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">D</kbd>
                                    <span className="text-gray-700 dark:text-gray-300">Download</span>
                                </div>
                            </div>
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pt-2">Video</h3>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">Space</kbd>
                                    <span className="text-gray-700 dark:text-gray-300">Play/Pause</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">M</kbd>
                                    <span className="text-gray-700 dark:text-gray-300">Mute/Unmute</span>
                                </div>
                            </div>
                        </div>
                        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
                            Press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">?</kbd> anytime to show this help
                        </p>
                    </div>
                </div>
            )}

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

            {/* Enhanced Lightbox with swipe support */}
            {lightboxAsset && (
                <div
                    ref={lightboxRef}
                    className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center touch-none"
                    onClick={closeLightbox}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
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
                                    className={`p-2 rounded-full transition-colors ${showExif ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
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

                    {/* Main media (image or video) with watermark */}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                        {lightboxAsset.type === 'video' ? (
                            <>
                                {/* Video Player */}
                                <video
                                    ref={videoRef}
                                    src={`/api/v1/public/galleries/${gallery.gallery_id}/assets/${lightboxAsset.asset_id}/preview`}
                                    className="max-w-[90vw] max-h-[85vh] object-contain"
                                    controls={false}
                                    playsInline
                                    onPlay={() => setIsVideoPlaying(true)}
                                    onPause={() => setIsVideoPlaying(false)}
                                    onEnded={() => setIsVideoPlaying(false)}
                                    onClick={toggleVideoPlayback}
                                />
                                {/* Video Controls Overlay */}
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
                                    <button
                                        className="p-2 text-white/80 hover:text-white transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleVideoPlayback();
                                        }}
                                        aria-label={isVideoPlaying ? 'Pause video' : 'Play video'}
                                        title={isVideoPlaying ? 'Pause (Space)' : 'Play (Space)'}
                                    >
                                        {isVideoPlaying ? <Pause size={24} /> : <Play size={24} />}
                                    </button>
                                    <button
                                        className="p-2 text-white/80 hover:text-white transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleVideoMute();
                                        }}
                                        aria-label={isVideoMuted ? 'Unmute video' : 'Mute video'}
                                        title={isVideoMuted ? 'Unmute (M)' : 'Mute (M)'}
                                    >
                                        {isVideoMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                                    </button>
                                </div>
                                {/* Play button overlay when paused */}
                                {!isVideoPlaying && (
                                    <div
                                        className="absolute inset-0 flex items-center justify-center cursor-pointer"
                                        onClick={toggleVideoPlayback}
                                    >
                                        <div className="p-4 bg-black/50 backdrop-blur-sm rounded-full">
                                            <Play size={48} className="text-white" />
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {/* Image with zoom support */}
                                <div
                                    className={`relative overflow-hidden ${isZoomed ? 'cursor-move' : 'cursor-zoom-in'}`}
                                    style={{
                                        maxWidth: '90vw',
                                        maxHeight: '85vh',
                                    }}
                                >
                                    <img
                                        src={`/api/v1/public/galleries/${gallery.gallery_id}/assets/${lightboxAsset.asset_id}/preview`}
                                        alt={lightboxAsset.filename}
                                        className="max-w-[90vw] max-h-[85vh] object-contain transition-transform duration-200"
                                        style={isZoomed ? {
                                            transform: 'scale(2.5)',
                                            transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
                                        } : undefined}
                                        onDoubleClick={(e) => {
                                            // Desktop double-click to zoom
                                            setIsZoomed(prev => !prev);
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const x = ((e.clientX - rect.left) / rect.width) * 100;
                                            const y = ((e.clientY - rect.top) / rect.height) * 100;
                                            setZoomPosition({ x, y });
                                        }}
                                        onMouseMove={(e) => {
                                            // Pan when zoomed on desktop
                                            if (isZoomed) {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const x = ((e.clientX - rect.left) / rect.width) * 100;
                                                const y = ((e.clientY - rect.top) / rect.height) * 100;
                                                setZoomPosition({ x, y });
                                            }
                                        }}
                                    />
                                </div>
                            </>
                        )}
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
                        {/* Caption display below media */}
                        {(lightboxAsset.caption || lightboxAsset.ai_caption || lightboxAsset.metadata?.caption || lightboxAsset.metadata?.ai_caption) && (
                            <div className="absolute -bottom-12 left-0 right-0 text-center px-4">
                                <p className="text-white/90 text-sm md:text-base max-w-2xl mx-auto line-clamp-2">
                                    {lightboxAsset.caption || lightboxAsset.ai_caption || lightboxAsset.metadata?.caption || lightboxAsset.metadata?.ai_caption}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Info Panel (EXIF for photos, metadata for videos) */}
                    {showExif && (lightboxAsset.metadata || lightboxAsset.type === 'video') && (
                        <div
                            className="absolute right-4 top-20 bg-black/80 backdrop-blur-md rounded-lg p-4 text-white text-sm max-w-xs z-10"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                                {lightboxAsset.type === 'video' ? (
                                    <>
                                        <Video size={16} />
                                        Video Info
                                    </>
                                ) : (
                                    <>
                                        <Camera size={16} />
                                        Photo Info
                                    </>
                                )}
                            </h4>
                            <div className="space-y-2 text-white/80">
                                {/* Video-specific info */}
                                {lightboxAsset.type === 'video' && lightboxAsset.duration && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Duration</span>
                                        <span>{Math.floor(lightboxAsset.duration / 60)}:{String(Math.floor(lightboxAsset.duration % 60)).padStart(2, '0')}</span>
                                    </div>
                                )}
                                {/* Photo-specific EXIF */}
                                {lightboxAsset.type !== 'video' && lightboxAsset.metadata?.make && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Camera</span>
                                        <span>{lightboxAsset.metadata.make} {lightboxAsset.metadata.model || ''}</span>
                                    </div>
                                )}
                                {lightboxAsset.type !== 'video' && lightboxAsset.metadata?.lens && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Lens</span>
                                        <span>{lightboxAsset.metadata.lens}</span>
                                    </div>
                                )}
                                {lightboxAsset.type !== 'video' && lightboxAsset.metadata?.focal_length && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Focal Length</span>
                                        <span>{lightboxAsset.metadata.focal_length}mm</span>
                                    </div>
                                )}
                                {lightboxAsset.type !== 'video' && lightboxAsset.metadata?.aperture && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Aperture</span>
                                        <span>f/{lightboxAsset.metadata.aperture}</span>
                                    </div>
                                )}
                                {lightboxAsset.type !== 'video' && lightboxAsset.metadata?.shutter_speed && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Shutter</span>
                                        <span>{lightboxAsset.metadata.shutter_speed}</span>
                                    </div>
                                )}
                                {lightboxAsset.type !== 'video' && lightboxAsset.metadata?.iso && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">ISO</span>
                                        <span>{lightboxAsset.metadata.iso}</span>
                                    </div>
                                )}
                                {/* Common info for both */}
                                {lightboxAsset.width && lightboxAsset.height && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Resolution</span>
                                        <span>{lightboxAsset.width} × {lightboxAsset.height}</span>
                                    </div>
                                )}
                                {lightboxAsset.metadata?.date_taken && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Date Taken</span>
                                        <span>{new Date(lightboxAsset.metadata.date_taken).toLocaleDateString()}</span>
                                    </div>
                                )}
                            </div>
                            {/* Caption in info panel */}
                            {(lightboxAsset.caption || lightboxAsset.ai_caption || lightboxAsset.metadata?.caption || lightboxAsset.metadata?.ai_caption) && (
                                <div className="mt-3 pt-3 border-t border-white/20">
                                    <span className="text-white/60 text-xs uppercase tracking-wider">Caption</span>
                                    <p className="text-white/90 text-sm mt-1">
                                        {lightboxAsset.caption || lightboxAsset.ai_caption || lightboxAsset.metadata?.caption || lightboxAsset.metadata?.ai_caption}
                                    </p>
                                </div>
                            )}
                            {/* AI Tags */}
                            {(lightboxAsset.ai_tags?.length || lightboxAsset.metadata?.ai_tags?.length || lightboxAsset.metadata?.tags?.length) && (
                                <div className="mt-3 pt-3 border-t border-white/20">
                                    <span className="text-white/60 text-xs uppercase tracking-wider">Tags</span>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {(lightboxAsset.ai_tags || lightboxAsset.metadata?.ai_tags || lightboxAsset.metadata?.tags || []).slice(0, 8).map((tag: string, idx: number) => (
                                            <span
                                                key={idx}
                                                className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/80"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <p className="mt-3 pt-3 border-t border-white/20 text-white/50 text-xs">
                                Press I to toggle
                            </p>
                        </div>
                    )}

                    {/* Bottom action bar */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-4 z-10">
                        {/* Favorite button */}
                        <button
                            className={`p-3 rounded-full backdrop-blur-sm transition-all ${localFavorites.has(lightboxAsset.asset_id)
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
                            className={`p-3 rounded-full backdrop-blur-sm transition-all ${localSelections.has(lightboxAsset.asset_id)
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

                    {/* Keyboard/touch hints */}
                    <div className="absolute bottom-4 right-4 text-white/40 text-xs hidden md:block">
                        ← → Navigate • F Favorite • S Select{gallery.download_policy !== 'view_only' ? ' • D Download' : ''} • I Info{lightboxAsset?.type === 'video' ? ' • Space Play/Pause • M Mute' : ''} • ? Help • Esc Close
                    </div>
                    {/* Mobile swipe hints */}
                    <div className="absolute bottom-4 left-4 right-4 text-white/40 text-xs text-center md:hidden">
                        {lightboxAsset?.type !== 'video' && 'Double-tap to zoom • '}Swipe left/right to navigate • Swipe up to close
                    </div>
                </div>
            )}

            {/* Sticky Header */}
            <header className="sticky top-0 z-50 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 transition-all">
                <div className="max-w-7xl mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {company_profile?.logo_url ? (
                            <img src={company_profile.logo_url} alt={company_profile.name} className="h-10 w-auto object-contain" />
                        ) : (
                            company_profile?.name && <span className="text-lg font-bold font-heading">{company_profile.name}</span>
                        )}
                        <div className="w-px h-8 bg-gray-200 dark:bg-gray-800 mx-2 hidden sm:block"></div>
                        <h1 className="text-lg font-medium hidden sm:block truncate max-w-md" title={gallery.title}>{gallery.title}</h1>
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

                        {/* Keyboard shortcuts help button - hidden on mobile */}
                        <button
                            onClick={() => setShowKeyboardHelp(true)}
                            className="hidden md:flex items-center justify-center p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            aria-label="Keyboard shortcuts (press ? key)"
                            title="Keyboard shortcuts (?)"
                        >
                            <Keyboard size={16} />
                        </button>

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
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-lg font-heading">{gallery.title}</h2>
                        {gallery.description && (
                            <p className="text-white/90 text-lg md:text-xl drop-shadow-md max-w-2xl mx-auto">{gallery.description}</p>
                        )}
                        <div className="mt-6 flex flex-wrap justify-center gap-4 text-white/80 text-sm font-medium">
                            <span className="bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">{new Date(gallery.created_at).toLocaleDateString()}</span>
                            {!showEmailModal && gallery.stats && <span className="bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">{gallery.stats.total_photos} Photos</span>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main id="main-gallery-content" className="flex-1 max-w-7xl mx-auto px-4 md:px-6 py-12 w-full" tabIndex={-1}>

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
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${activeTab === 'all'
                                    ? 'bg-primary text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
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
                                role="tab"
                                aria-selected={activeTab === 'favorites'}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${activeTab === 'favorites'
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
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${activeTab === 'selections'
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

                        {/* Breadcrumb Navigation - Shows when inside a sub-gallery */}
                        {activeSubGallery && breadcrumbItems.length > 1 && (
                            <div className="mb-6">
                                <Breadcrumbs
                                    items={breadcrumbItems}
                                    galleryId={actualGalleryId || ''}
                                    onNavigate={handleBreadcrumbNavigate}
                                    showHomeIcon={true}
                                    className="text-gray-600 dark:text-gray-400"
                                />
                            </div>
                        )}

                        {/* Sub-Gallery Collections (if gallery has sections) */}
                        {gallery.sub_galleries && gallery.sub_galleries.length > 0 && (
                            <div className="mb-8">
                                {/* Collection Cards - Show when no sub-gallery is selected */}
                                {activeSubGallery === null && gallery.sub_galleries.filter(sg => sg.visible).length > 1 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
                                        {gallery.sub_galleries.filter(sg => sg.visible).map(subGallery => {
                                            // Find cover image from assets
                                            const coverAsset = assets.find(a =>
                                                a.asset_id === subGallery.cover_asset_id ||
                                                a.sub_gallery_id === subGallery.sub_gallery_id
                                            );
                                            const coverUrl = subGallery.cover_image_url ||
                                                (coverAsset ? `/api/v1/public/galleries/${gallery.gallery_id}/assets/${coverAsset.asset_id}/thumbnail` : null);

                                            return (
                                                <button
                                                    key={subGallery.sub_gallery_id}
                                                    onClick={() => setActiveSubGallery(subGallery.sub_gallery_id)}
                                                    className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-800 hover:ring-2 hover:ring-primary transition-all focus:outline-none focus:ring-2 focus:ring-primary"
                                                    aria-label={`View ${subGallery.name} (${subGallery.photo_count} photos)`}
                                                >
                                                    {/* Cover Image */}
                                                    {coverUrl ? (
                                                        <img
                                                            src={coverUrl}
                                                            alt={subGallery.name}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <FolderOpen size={32} className="text-gray-400" />
                                                        </div>
                                                    )}
                                                    {/* Overlay */}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                                                    {/* Text */}
                                                    <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                                                        <h3 className="font-semibold text-sm truncate">{subGallery.name}</h3>
                                                        <p className="text-xs text-white/80">{subGallery.photo_count} photos</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Tab Navigation - Always visible for quick switching */}
                                <div className="flex flex-wrap items-center justify-center gap-2" role="tablist" aria-label="Gallery sections">
                                    <button
                                        role="tab"
                                        aria-selected={activeSubGallery === null}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${activeSubGallery === null
                                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        onClick={() => setActiveSubGallery(null)}
                                    >
                                        <FolderOpen size={14} />
                                        All
                                        <span className="px-1.5 py-0.5 rounded text-xs bg-black/10 dark:bg-white/10">
                                            {assets.length}
                                        </span>
                                    </button>
                                    {gallery.sub_galleries.filter(sg => sg.visible).map(subGallery => (
                                        <button
                                            key={subGallery.sub_gallery_id}
                                            role="tab"
                                            aria-selected={activeSubGallery === subGallery.sub_gallery_id}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${activeSubGallery === subGallery.sub_gallery_id
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
                            </div>
                        )}

                        {/* Emotion Filter */}
                        <div className="mb-6 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Filter by emotion">
                            <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Filter by mood:</span>
                            <button
                                className={`px-3 py-1.5 rounded-full text-sm transition-all ${activeEmotion === null
                                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                onClick={() => setActiveEmotion(null)}
                            >
                                All
                            </button>
                            {EMOTIONS.map(emotion => (
                                <button
                                    key={emotion.value}
                                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${activeEmotion === emotion.value
                                        ? 'bg-primary text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                    onClick={() => setActiveEmotion(activeEmotion === emotion.value ? null : emotion.value)}
                                    title={emotion.label}
                                >
                                    <span className="mr-1">{emotion.emoji}</span>
                                    <span className="hidden sm:inline">{emotion.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Active Emotion Filter Indicator */}
                        {activeEmotion && (
                            <div
                                className="mb-6 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between animate-fade-in"
                                role="status"
                                aria-live="polite"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">{EMOTIONS.find(e => e.value === activeEmotion)?.emoji}</span>
                                    <p className="font-medium text-text-primary">
                                        Showing {displayedAssets.length} {activeEmotion} photo{displayedAssets.length !== 1 ? 's' : ''}
                                    </p>
                                </div>
                                <button
                                    className="text-sm text-primary hover:text-primary/80 font-medium"
                                    onClick={() => setActiveEmotion(null)}
                                >
                                    Clear Filter
                                </button>
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
                                    if (gallery?.pin_protected) {
                                        setPinModalMode('private');
                                        setShowPinModal(true);
                                    } else {
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
