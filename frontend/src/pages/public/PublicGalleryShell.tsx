/**
 * PublicGalleryShell - Gallery page orchestrator
 *
 * Validates magic-link token, manages auth gates, computes displayed assets,
 * and composes GalleryThemeProvider > GalleryInteractionProvider > GalleryPlayerProvider
 * around the PublicGalleryContent renderer.
 *
 * Extracted from the 2317-line PublicGalleryPage monolith (Phase 15-02).
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { galleryService } from '../../services/galleryService';
import { faceApiService } from '../../services/faceApiService';
import type { GalleryDetailData, PublicGalleryAsset, GalleryAssetItem } from '../../types/gallery';
import type { LayoutStyle } from '@rawdrive/shared-types';
import { LayoutStyle as LayoutStyleEnum } from '@rawdrive/shared-types';
import { AppButton } from '../../components/ui/AppButton';
import {
  VISITOR_STORAGE_KEY_PREFIX,
  VISITOR_ID_KEY_PREFIX,
  PIN_VERIFIED_KEY_PREFIX,
  PASSWORD_VERIFIED_KEY_PREFIX,
  PRIVATE_UNLOCKED_KEY_PREFIX,
} from '../../constants/gallery';
import { useUtmTracking } from '../../hooks/useUtmTracking';
import { usePublicGallery } from '../../hooks/usePublicGallery';
import { usePublicGalleryAssets } from '../../hooks/usePublicGalleryAssets';
import { GalleryThemeProvider } from '../../contexts/GalleryThemeContext';
import { GalleryInteractionProvider } from '../../contexts/GalleryInteractionContext';
import { GalleryPlayerProvider } from '../../contexts/GalleryPlayerContext';
import { PublicGalleryContent } from './PublicGalleryContent';
import { ExpiredGalleryPage } from './ExpiredGalleryPage';

// Re-export for backward compat (test file imports from here)
export { mapSlideshowConfigToSettings } from './PublicGalleryContent';

type WorkflowTab = 'all' | 'favorites' | 'selections';

export const PublicGalleryShell: React.FC = () => {
  const { galleryId: token } = useParams<{ galleryId: string }>();

  // Gallery data via TanStack Query
  const {
    gallery: initialGallery, actualGalleryId, companyProfile,
    isLoading, error, expired,
  } = usePublicGallery(token);

  // Mutable gallery state (stats updated when assets load)
  const [gallery, setGallery] = useState<GalleryDetailData | null>(null);
  useEffect(() => { if (initialGallery) setGallery(initialGallery); }, [initialGallery]);

  // Auth gate states
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isVisitorAuthenticated, setIsVisitorAuthenticated] = useState(false);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [isPrivateUnlocked, setIsPrivateUnlocked] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'gallery' | 'private'>('gallery');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);

  // Filter states
  const [activeTab, setActiveTab] = useState<WorkflowTab>('all');
  const [activeSubGallery, setActiveSubGallery] = useState<string | null>(null);
  const [activeEmotion, setActiveEmotion] = useState<string | null>(null);
  const [filteredPhotoIds, setFilteredPhotoIds] = useState<string[] | null>(null);
  const [matchSimilarity, setMatchSimilarity] = useState<number | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedPersonName, setSelectedPersonName] = useState<string | undefined>(undefined);
  const [personPhotoIds, setPersonPhotoIds] = useState<string[] | null>(null);

  const { getUtmPayload, clearUtm } = useUtmTracking();

  // Load visitor ID from storage
  useEffect(() => {
    if (actualGalleryId) {
      const stored = localStorage.getItem(`${VISITOR_ID_KEY_PREFIX}${actualGalleryId}`);
      if (stored) setVisitorId(stored);
    }
  }, [actualGalleryId]);

  // Auth gate logic when gallery data arrives
  useEffect(() => {
    if (!gallery || !actualGalleryId) return;
    const isRegistered = localStorage.getItem(`${VISITOR_STORAGE_KEY_PREFIX}${actualGalleryId}`);
    if (gallery.email_registration_required && !isRegistered) {
      setShowEmailModal(true);
    } else {
      setIsVisitorAuthenticated(true);
      const pwVerified = localStorage.getItem(`${PASSWORD_VERIFIED_KEY_PREFIX}${actualGalleryId}`);
      if (gallery.password_protected && !pwVerified) { setShowPasswordModal(true); return; }
      setIsPasswordVerified(true);
      const pinVerified = localStorage.getItem(`${PIN_VERIFIED_KEY_PREFIX}${actualGalleryId}`);
      if (gallery.pin_protected && !pinVerified) { setPinModalMode('gallery'); setShowPinModal(true); } else {
        setIsPinVerified(true);
        if (localStorage.getItem(`${PRIVATE_UNLOCKED_KEY_PREFIX}${actualGalleryId}`)) setIsPrivateUnlocked(true);
      }
    }
  }, [gallery, actualGalleryId]);

  // Fetch assets
  const assetsEnabled = isVisitorAuthenticated && isPinVerified && isPasswordVerified && !!actualGalleryId;
  const { assets, refetch: refetchAssets } = usePublicGalleryAssets(actualGalleryId, {
    activeTab, subGalleryId: activeSubGallery, emotion: activeEmotion, enabled: assetsEnabled,
  });

  // Update gallery stats when assets change
  useEffect(() => {
    if (assets.length === 0) return;
    setGallery(prev => {
      if (!prev) return prev;
      return { ...prev, stats: {
        total_items: assets.length,
        total_photos: assets.filter(a => a.type === 'photo' || !a.type).length,
        total_videos: assets.filter(a => a.type === 'video').length,
        favorites_count: assets.filter(a => a.favorites_count && a.favorites_count > 0).length,
        selections_count: assets.filter(a => a.is_selected).length,
      }};
    });
  }, [assets]);

  // Fetch person photos when filter changes
  useEffect(() => {
    if (!selectedPersonId || !gallery?.workspace_id) { setPersonPhotoIds(null); return; }
    (async () => {
      try {
        const ids = await faceApiService.getPhotosByPerson(gallery.workspace_id, selectedPersonId, actualGalleryId || undefined);
        setPersonPhotoIds(ids);
      } catch { setPersonPhotoIds([]); }
    })();
  }, [selectedPersonId, gallery?.workspace_id, actualGalleryId]);

  const fetchAssets = useCallback(async () => { refetchAssets(); }, [refetchAssets]);
  const handleFilterByPerson = useCallback((id: string | null, name?: string) => {
    setSelectedPersonId(id); setSelectedPersonName(name);
    if (id) { setFilteredPhotoIds(null); setMatchSimilarity(null); } else setPersonPhotoIds(null);
  }, []);
  const clearFaceFilter = useCallback(() => { setFilteredPhotoIds(null); setMatchSimilarity(null); }, []);

  // Visitor registration
  const handleVisitorSubmit = useCallback(async (data: { email: string; first_name: string; last_name: string; phone: string; address?: string }) => {
    if (!actualGalleryId) return;
    setIsRegistering(true);
    try {
      const result = await galleryService.registerVisitor(actualGalleryId, { ...data, ...getUtmPayload() });
      localStorage.setItem(`${VISITOR_STORAGE_KEY_PREFIX}${actualGalleryId}`, 'true');
      localStorage.setItem(`${VISITOR_ID_KEY_PREFIX}${actualGalleryId}`, result.visitor_id);
      setVisitorId(result.visitor_id); setShowEmailModal(false); setIsVisitorAuthenticated(true); clearUtm();
      if (gallery?.pin_protected) {
        if (!localStorage.getItem(`${PIN_VERIFIED_KEY_PREFIX}${actualGalleryId}`)) { setPinModalMode('gallery'); setShowPinModal(true); return; }
        if (localStorage.getItem(`${PRIVATE_UNLOCKED_KEY_PREFIX}${actualGalleryId}`)) setIsPrivateUnlocked(true);
      }
      setIsPinVerified(true);
    } catch (e) { console.error(e); } finally { setIsRegistering(false); }
  }, [actualGalleryId, gallery, getUtmPayload, clearUtm]);

  const handlePinVerify = useCallback(async (pin: string): Promise<boolean> => {
    if (!actualGalleryId) return false;
    try {
      const ok = await galleryService.verifyPin(actualGalleryId, pin);
      if (ok) { localStorage.setItem(`${PIN_VERIFIED_KEY_PREFIX}${actualGalleryId}`, 'true'); setShowPinModal(false); setIsPinVerified(true); }
      return ok;
    } catch { return false; }
  }, [actualGalleryId]);

  const handlePrivatePhotoUnlock = useCallback(async (pin: string): Promise<boolean> => {
    if (!actualGalleryId) return false;
    try {
      const ok = await galleryService.verifyPin(actualGalleryId, pin);
      if (ok) { localStorage.setItem(`${PRIVATE_UNLOCKED_KEY_PREFIX}${actualGalleryId}`, 'true'); setShowPinModal(false); setIsPrivateUnlocked(true); }
      return ok;
    } catch { return false; }
  }, [actualGalleryId]);

  // Computed assets
  const displayedAssets = useMemo(() => {
    let r = assets;
    if (!isPrivateUnlocked) r = r.filter(a => !a.is_private);
    if (filteredPhotoIds) r = r.filter(a => filteredPhotoIds.includes(a.asset_id));
    if (personPhotoIds) r = r.filter(a => personPhotoIds.includes(a.asset_id));
    if (activeSubGallery) r = r.filter(a => a.sub_gallery_id === activeSubGallery);
    return r;
  }, [assets, filteredPhotoIds, personPhotoIds, activeSubGallery, isPrivateUnlocked]);

  const privatePhotoCount = useMemo(() => assets.filter(a => a.is_private).length, [assets]);

  const canvasAssets: GalleryAssetItem[] = useMemo(() => displayedAssets.map(a => ({
    gallery_asset_id: a.asset_id, asset_id: a.asset_id, sort_order: a.sort_order,
    visible: true, is_private: a.is_private || false, sub_gallery_id: a.sub_gallery_id,
    is_favorited: false, is_selected: false, favorites_count: a.favorites_count ?? 0,
    client_favorites_count: a.favorites_count ?? 0, client_picks_count: 0,
    asset: { type: a.type, status: 'available' as const, mime_type: a.type === 'photo' ? 'image/jpeg' : 'video/mp4',
      filename: a.filename, width: a.width, height: a.height,
      duration_ms: a.duration ? a.duration * 1000 : undefined, file_size: a.size_bytes, created_at: a.created_at,
      thumbnail_url: `/api/v1/public/galleries/${actualGalleryId}/assets/${a.asset_id}/thumbnail`,
      preview_url: `/api/v1/public/galleries/${actualGalleryId}/assets/${a.asset_id}/preview`,
    },
  })), [displayedAssets, actualGalleryId]);

  // Active layout state with localStorage persistence per gallery
  const layoutStorageKey = `gallery-layout-${actualGalleryId || gallery?.gallery_id}`;
  const [activeLayout, setActiveLayout] = useState<LayoutStyle>(() => {
    try {
      const saved = localStorage.getItem(layoutStorageKey);
      if (saved && Object.values(LayoutStyleEnum).includes(saved as LayoutStyle)) {
        return saved as LayoutStyle;
      }
    } catch { /* SSR / private browsing */ }
    return (gallery?.layout_style as LayoutStyle) || 'grid';
  });

  // Persist layout preference changes
  useEffect(() => {
    try {
      localStorage.setItem(layoutStorageKey, activeLayout);
    } catch { /* private browsing */ }
  }, [activeLayout, layoutStorageKey]);

  // Legacy canvasViewMode for backward compatibility (GalleryCanvas still used for management views)
  const canvasViewMode: 'grid' | 'masonry' = activeLayout === 'masonry' ? 'masonry' : 'grid';

  // Loading
  if (isLoading) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>);
  }

  // Expired gallery
  if (expired) {
    return (
      <ExpiredGalleryPage
        galleryName={expired.galleryName}
        expiredAt={expired.expiredAt}
        photographerName={expired.photographerName}
      />
    );
  }

  // Error
  if (error || !gallery) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950"><div className="text-center p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md mx-4"><h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Gallery Unavailable</h1><p className="text-gray-600 dark:text-gray-400 mb-6">{error || "This gallery is not publicly accessible."}</p><AppButton variant="primary" onClick={() => window.location.href = '/'}>Go Home</AppButton></div></div>);
  }

  return (
    <GalleryThemeProvider gallery={gallery}>
      <GalleryInteractionProvider
        galleryId={actualGalleryId || gallery.gallery_id}
        proofingConfig={{ favorites_enabled: gallery.favorites_enabled, selections_enabled: gallery.selections_enabled, selection_limit: gallery.selection_limit }}
        initialAssets={assets}
      >
        <GalleryPlayerProvider assets={displayedAssets}>
          <PublicGalleryContent
            gallery={gallery} actualGalleryId={actualGalleryId || gallery.gallery_id}
            assets={assets} displayedAssets={displayedAssets} canvasAssets={canvasAssets} canvasViewMode={canvasViewMode}
            activeLayout={activeLayout} onLayoutChange={setActiveLayout}
            isVisitorAuthenticated={isVisitorAuthenticated} isPinVerified={isPinVerified} isPrivateUnlocked={isPrivateUnlocked}
            showEmailModal={showEmailModal} privatePhotoCount={privatePhotoCount}
            activeTab={activeTab} setActiveTab={setActiveTab}
            activeSubGallery={activeSubGallery} setActiveSubGallery={setActiveSubGallery}
            activeEmotion={activeEmotion} setActiveEmotion={setActiveEmotion}
            filteredPhotoIds={filteredPhotoIds} matchSimilarity={matchSimilarity}
            selectedPersonId={selectedPersonId} selectedPersonName={selectedPersonName} personPhotoIds={personPhotoIds}
            setShowEmailModal={setShowEmailModal} setPinModalMode={setPinModalMode} setShowPinModal={setShowPinModal}
            setFilteredPhotoIds={setFilteredPhotoIds} setMatchSimilarity={setMatchSimilarity}
            handleFilterByPerson={handleFilterByPerson} clearFaceFilter={clearFaceFilter}
            showPinModal={showPinModal} pinModalMode={pinModalMode}
            showPasswordModal={showPasswordModal} setShowPasswordModal={setShowPasswordModal}
            setIsPasswordVerified={setIsPasswordVerified} setIsPinVerified={setIsPinVerified} setIsPrivateUnlocked={setIsPrivateUnlocked}
            fetchAssets={fetchAssets}
            handleVisitorSubmit={handleVisitorSubmit} handlePinVerify={handlePinVerify} handlePrivatePhotoUnlock={handlePrivatePhotoUnlock}
            isRegistering={isRegistering}
          />
        </GalleryPlayerProvider>
      </GalleryInteractionProvider>
    </GalleryThemeProvider>
  );
};

export default PublicGalleryShell;
