/**
 * Public Gallery Content
 * Renders the gallery page body: header, hero, main content area (tabs, filters,
 * canvas, sub-galleries), footer, auth modals, cinematic viewer, and guestbook.
 * Extracted from PublicGalleryPage monolith for the 400-line-per-file constraint.
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { galleryService } from '../../services/galleryService';
import type { GalleryDetailData, PublicGalleryAsset, GalleryAssetItem, SlideshowConfig } from '../../types/gallery';
import type { LayoutStyle } from '@rawdrive/shared-types';
import { GalleryCanvas } from '../../components/features/gallery/GalleryCanvas';
import { GalleryLayoutEngine, LayoutSwitcher, fromGalleryAssetItem } from '../../components/features/gallery/layouts';
import { AppButton } from '../../components/ui/AppButton';
import { useToast } from '../../components/ui/Toast';
import {
  Download, Grid, Lock as LockIcon, User, X, Heart, Bookmark, LayoutGrid,
  FolderOpen, Loader2, Film, MessageCircle, Users, Keyboard, AlertTriangle,
} from 'lucide-react';
import { ClientEmailModal } from '../../components/features/gallery/ClientEmailModal';
import { PinVerificationModal } from '../../components/features/gallery/PinVerificationModal';
import { PasswordVerificationModal } from '../../components/features/gallery/PasswordVerificationModal';
import { FaceDiscovery } from '../../components/features/gallery/FaceDiscovery';
import { ClientPeopleFilter } from '../../components/features/gallery/ClientPeopleFilter';
import { ShareMenu } from '../../components/features/gallery/ShareMenu';
import { Breadcrumbs, BreadcrumbItem } from '../../components/features/gallery/Breadcrumbs';
import { CinematicViewer, type CinematicTransition, type CinematicViewerSettings } from '../../components/features/gallery/presentation/CinematicViewer';
import { Guestbook } from '../../components/features/gallery/Guestbook';
import { BULK_DOWNLOAD_DELAY_MS, PIN_VERIFIED_KEY_PREFIX, PASSWORD_VERIFIED_KEY_PREFIX, PRIVATE_UNLOCKED_KEY_PREFIX } from '../../constants/gallery';
import { useGalleryTheme } from '../../contexts/GalleryThemeContext';
import { useGalleryInteraction } from '../../contexts/GalleryInteractionContext';
import { useGalleryPlayer } from '../../contexts/GalleryPlayerContext';
import { GalleryPlayer } from '../../components/features/gallery/player';
import { FavoriteButton } from '../../components/features/gallery/public/FavoriteButton';
import { SelectionQuotaBar } from '../../components/features/gallery/public/SelectionQuotaBar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type WorkflowTab = 'all' | 'favorites' | 'selections';

export function mapSlideshowConfigToSettings(config?: SlideshowConfig | null): Partial<CinematicViewerSettings> {
  if (!config || !config.enabled) return {};
  return {
    interval: (config.interval_seconds ?? 5) * 1000,
    loop: config.loop ?? true,
    transition: config.transition === 'none' ? 'instant' : (config.transition as CinematicTransition) ?? 'fade',
    audio: { enabled: config.audio_enabled ?? false, volume: config.audio_volume ?? 0.7, muted: !(config.audio_autoplay ?? false) },
  };
}

export interface PublicGalleryContentProps {
  gallery: GalleryDetailData;
  actualGalleryId: string;
  assets: PublicGalleryAsset[];
  displayedAssets: PublicGalleryAsset[];
  canvasAssets: GalleryAssetItem[];
  canvasViewMode: 'grid' | 'masonry';
  activeLayout?: LayoutStyle;
  onLayoutChange?: (layout: LayoutStyle) => void;
  // Auth states
  isVisitorAuthenticated: boolean;
  isPinVerified: boolean;
  isPrivateUnlocked: boolean;
  showEmailModal: boolean;
  privatePhotoCount: number;
  // Filter states
  activeTab: WorkflowTab;
  setActiveTab: (v: WorkflowTab) => void;
  activeSubGallery: string | null;
  setActiveSubGallery: (v: string | null) => void;
  activeEmotion: string | null;
  setActiveEmotion: (v: string | null) => void;
  filteredPhotoIds: string[] | null;
  matchSimilarity: number | null;
  selectedPersonId: string | null;
  selectedPersonName: string | undefined;
  personPhotoIds: string[] | null;
  // Handlers
  setShowEmailModal: (v: boolean) => void;
  setPinModalMode: (v: 'gallery' | 'private') => void;
  setShowPinModal: (v: boolean) => void;
  setFilteredPhotoIds: (v: string[] | null) => void;
  setMatchSimilarity: (v: number | null) => void;
  handleFilterByPerson: (id: string | null, name?: string) => void;
  clearFaceFilter: () => void;
  // Modal states
  showPinModal: boolean;
  pinModalMode: 'gallery' | 'private';
  showPasswordModal: boolean;
  setShowPasswordModal: (v: boolean) => void;
  setIsPasswordVerified: (v: boolean) => void;
  setIsPinVerified: (v: boolean) => void;
  setIsPrivateUnlocked: (v: boolean) => void;
  fetchAssets: () => Promise<void>;
  handleVisitorSubmit: (data: { email: string; first_name: string; last_name: string; phone: string; address?: string }) => Promise<void>;
  handlePinVerify: (pin: string) => Promise<boolean>;
  handlePrivatePhotoUnlock: (pin: string) => Promise<boolean>;
  isRegistering: boolean;
}

const EMOTIONS = [
  { value: 'joy', label: 'Joy', emoji: '\u{1F60A}' },
  { value: 'sadness', label: 'Sad', emoji: '\u{1F622}' },
  { value: 'anger', label: 'Angry', emoji: '\u{1F620}' },
  { value: 'surprise', label: 'Surprise', emoji: '\u{1F62E}' },
  { value: 'fear', label: 'Fear', emoji: '\u{1F628}' },
  { value: 'disgust', label: 'Disgust', emoji: '\u{1F612}' },
  { value: 'contentment', label: 'Content', emoji: '\u{1F60C}' },
];

export const PublicGalleryContent: React.FC<PublicGalleryContentProps> = (props) => {
  const {
    gallery, actualGalleryId, assets, displayedAssets, canvasAssets, canvasViewMode,
    activeLayout, onLayoutChange,
    isVisitorAuthenticated, isPinVerified, isPrivateUnlocked, showEmailModal, privatePhotoCount,
    activeTab, setActiveTab, activeSubGallery, setActiveSubGallery, activeEmotion, setActiveEmotion,
    filteredPhotoIds, matchSimilarity, selectedPersonId, selectedPersonName, personPhotoIds,
    setShowEmailModal, setPinModalMode, setShowPinModal, setFilteredPhotoIds, setMatchSimilarity,
    handleFilterByPerson, clearFaceFilter,
    showPinModal, pinModalMode, showPasswordModal, setShowPasswordModal,
    setIsPasswordVerified, setIsPinVerified, setIsPrivateUnlocked, fetchAssets,
    handleVisitorSubmit, handlePinVerify, handlePrivatePhotoUnlock, isRegistering,
  } = props;

  const navigate = useNavigate();
  const { addToast } = useToast();
  const { heroGradientStyle } = useGalleryTheme();
  const { favorites, selections, toggleFavorite, toggleSelection, favoriteCount, selectionCount } = useGalleryInteraction();
  const { openPlayer } = useGalleryPlayer();

  // UI state
  const [isDownloading, setIsDownloading] = useState(false);
  const [showCinematicViewer, setShowCinematicViewer] = useState(false);
  const [showGuestbook, setShowGuestbook] = useState(false);
  const [showFaceDiscovery, setShowFaceDiscovery] = useState(false);
  const [showPeopleFilter, setShowPeopleFilter] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState(0);
  const [breadcrumbItems, setBreadcrumbItems] = useState<BreadcrumbItem[]>([]);

  const company_profile = gallery.company_profile;
  const coverUrl = gallery.cover_asset_id ? `/api/v1/public/galleries/${gallery.gallery_id}/assets/${gallery.cover_asset_id}/preview` : null;
  const shareUrl = useMemo(() => (typeof window === 'undefined' ? '' : window.location.href), []);
  const isExpired = useMemo(() => gallery.expires_at ? new Date(gallery.expires_at) < new Date() : false, [gallery.expires_at]);

  // Breadcrumbs
  useEffect(() => {
    const items: BreadcrumbItem[] = [{ id: actualGalleryId, name: gallery.title, type: 'gallery' }];
    if (activeSubGallery) {
      const sg = gallery.sub_galleries?.find(s => s.sub_gallery_id === activeSubGallery);
      if (sg) items.push({ id: sg.sub_gallery_id, name: sg.name, type: 'sub_gallery' });
    }
    setBreadcrumbItems(items);
  }, [gallery, actualGalleryId, activeSubGallery]);

  // Layout engine assets (converted from canvasAssets)
  const layoutAssets = useMemo(() => canvasAssets.map(fromGalleryAssetItem), [canvasAssets]);

  // FavoriteButton overlay for layout engine items
  const renderItemOverlay = useCallback((asset: { asset_id: string }) => (
    <div className="absolute top-2 right-2 z-10">
      <FavoriteButton assetId={asset.asset_id} size="md" />
    </div>
  ), []);

  // Open player from layout engine click
  const handleLayoutAssetClick = useCallback((_asset: { asset_id: string }, index: number) => {
    openPlayer(index);
  }, [openPlayer]);

  const handleDownload = useCallback(async (asset: PublicGalleryAsset) => {
    if (gallery.download_policy === 'view_only') return;
    setIsDownloading(true);
    try {
      const variant = gallery.download_policy === 'original_allowed' ? 'original' : 'preview';
      const resp = await fetch(`/api/v1/public/galleries/${actualGalleryId}/assets/${asset.asset_id}/${variant}`);
      if (!resp.ok) throw new Error('Download failed');
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = asset.filename || `photo-${asset.asset_id}.jpg`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
    } catch { addToast({ message: 'Download failed. Please try again.', variant: 'error' }); }
    finally { setIsDownloading(false); }
  }, [gallery, actualGalleryId, addToast]);

  const handleBulkDownload = useCallback(async () => {
    if (!gallery || gallery.download_policy === 'view_only') return;
    const toDownload = activeTab === 'selections' ? displayedAssets.filter(a => selections.has(a.asset_id)) : activeTab === 'favorites' ? displayedAssets.filter(a => favorites.has(a.asset_id)) : displayedAssets;
    if (!toDownload.length) return;
    setIsBulkDownloading(true); setBulkDownloadProgress(0);
    const variant = gallery.download_policy === 'original_allowed' ? 'original' : 'preview';
    let ok = 0, fail = 0;
    for (let i = 0; i < toDownload.length; i++) {
      try {
        const resp = await fetch(`/api/v1/public/galleries/${actualGalleryId}/assets/${toDownload[i].asset_id}/${variant}`);
        if (!resp.ok) { fail++; } else {
          const blob = await resp.blob(); const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = toDownload[i].filename || `photo-${toDownload[i].asset_id}.jpg`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url); ok++;
          await new Promise(r => setTimeout(r, BULK_DOWNLOAD_DELAY_MS));
        }
      } catch { fail++; }
      setBulkDownloadProgress(Math.round(((i + 1) / toDownload.length) * 100));
    }
    addToast({ message: fail ? `Downloaded ${ok}/${toDownload.length}. ${fail} failed.` : `Downloaded ${ok} photo${ok !== 1 ? 's' : ''}.`, variant: fail === toDownload.length ? 'error' : fail ? 'warning' : 'success' });
    setIsBulkDownloading(false); setBulkDownloadProgress(0);
  }, [gallery, actualGalleryId, activeTab, displayedAssets, selections, favorites, addToast]);

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md mx-4">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" /></div>
          <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Gallery Expired</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-2">This gallery is no longer available.</p>
          <p className="text-sm text-gray-500 mb-6">Expired on {new Date(gallery.expires_at!).toLocaleDateString()}</p>
          {company_profile?.website && <AppButton variant="outline" onClick={() => window.open(company_profile?.website, '_blank')}>Visit {company_profile.name || 'Studio'}</AppButton>}
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>{gallery.title} {company_profile?.name ? `| ${company_profile.name}` : ''}</title></Helmet>
      <a href="#main-gallery-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg">Skip to gallery content</a>

      {/* Auth modals */}
      <ClientEmailModal isOpen={showEmailModal} onClose={() => navigate('/')} onSubmit={handleVisitorSubmit} isLoading={isRegistering} galleryTitle={gallery.title} companyName={company_profile?.name} logoUrl={company_profile?.logo_url} />
      <PinVerificationModal isOpen={showPinModal} onVerify={pinModalMode === 'private' ? handlePrivatePhotoUnlock : handlePinVerify} onCancel={() => { if (pinModalMode === 'private') setShowPinModal(false); else navigate('/'); }} galleryTitle={gallery.title} companyName={company_profile?.name} logoUrl={company_profile?.logo_url} />
      <PasswordVerificationModal isOpen={showPasswordModal} onVerify={async (pw) => { if (!actualGalleryId) return false; try { const ok = await galleryService.verifyPassword(actualGalleryId, pw); if (ok) { localStorage.setItem(`${PASSWORD_VERIFIED_KEY_PREFIX}${actualGalleryId}`, 'true'); setShowPasswordModal(false); setIsPasswordVerified(true); if (gallery.pin_protected) { const pv = localStorage.getItem(`${PIN_VERIFIED_KEY_PREFIX}${actualGalleryId}`); if (!pv) { setShowPinModal(true); return true; } setIsPrivateUnlocked(true); } setIsPinVerified(true); await fetchAssets(); } return ok; } catch { return false; } }} onCancel={() => navigate('/')} galleryTitle={gallery.title} companyName={company_profile?.name} logoUrl={company_profile?.logo_url} />
      <FaceDiscovery isOpen={showFaceDiscovery} onClose={() => setShowFaceDiscovery(false)} onFacesFound={(ids: string[], sim: number) => { setFilteredPhotoIds(ids); setMatchSimilarity(sim); }} galleryId={actualGalleryId} galleryTitle={gallery.title} />
      {gallery.show_people_filter && actualGalleryId && gallery.workspace_id && <ClientPeopleFilter galleryId={actualGalleryId} workspaceId={gallery.workspace_id} isOpen={showPeopleFilter} onClose={() => setShowPeopleFilter(false)} onFilterByPerson={handleFilterByPerson} selectedPersonId={selectedPersonId} />}

      {/* Gallery Player (replaces old PublicGalleryLightbox) */}
      <GalleryPlayer />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {company_profile?.logo_url ? <img src={company_profile.logo_url} alt={company_profile.name} className="h-10 w-auto object-contain" /> : company_profile?.name && <span className="text-lg font-bold font-heading">{company_profile.name}</span>}
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-800 mx-2 hidden sm:block" />
            <h1 className="text-lg font-medium hidden sm:block truncate max-w-md" title={gallery.title}>{gallery.title}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {gallery.pin_protected && !isPrivateUnlocked && privatePhotoCount > 0 && <AppButton variant="outline" leftIcon={<LockIcon size={16} />} size="sm" onClick={() => { setPinModalMode('private'); setShowPinModal(true); }}><span className="hidden sm:inline">Unlock {privatePhotoCount} Private</span><span className="sm:hidden">{privatePhotoCount}</span></AppButton>}
            {isVisitorAuthenticated && isPinVerified && assets.length > 0 && <AppButton variant="outline" leftIcon={<User size={16} />} size="sm" onClick={() => setShowFaceDiscovery(true)}><span className="hidden sm:inline">Find Me</span></AppButton>}
            {gallery.show_people_filter && isVisitorAuthenticated && isPinVerified && assets.length > 0 && <AppButton variant={selectedPersonId ? 'primary' : 'outline'} leftIcon={<Users size={16} />} size="sm" onClick={() => setShowPeopleFilter(true)}><span className="hidden sm:inline">{selectedPersonId ? (selectedPersonName || 'Person') : 'People'}</span></AppButton>}
            {gallery.download_policy !== 'view_only' && isVisitorAuthenticated && isPinVerified && displayedAssets.length > 0 && <AppButton variant="outline" leftIcon={isBulkDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} size="sm" onClick={handleBulkDownload} disabled={isBulkDownloading}><span className="hidden sm:inline">{isBulkDownloading ? `${bulkDownloadProgress}%` : activeTab === 'selections' && selectionCount > 0 ? `Download (${selectionCount})` : activeTab === 'favorites' && favoriteCount > 0 ? `Download (${favoriteCount})` : 'Download All'}</span></AppButton>}
            {isVisitorAuthenticated && isPinVerified && displayedAssets.length > 0 && <AppButton variant="outline" leftIcon={<Film size={16} />} size="sm" onClick={() => setShowCinematicViewer(true)} title="Cinematic Mode"><span className="hidden sm:inline">Cinematic</span></AppButton>}
            {isVisitorAuthenticated && isPinVerified && <AppButton variant="outline" leftIcon={<MessageCircle size={16} />} size="sm" onClick={() => setShowGuestbook(true)} title="Leave a message"><span className="hidden sm:inline">Guestbook</span></AppButton>}
            {activeLayout && onLayoutChange && <LayoutSwitcher activeLayout={activeLayout} onLayoutChange={onLayoutChange} />}
            <ShareMenu shareUrl={shareUrl} title={gallery.title} description={gallery.description} buttonSize="sm" />
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="relative h-[40vh] md:h-[50vh] bg-gray-100 dark:bg-gray-900 overflow-hidden">
        {coverUrl ? <div className="absolute inset-0"><img src={coverUrl} alt="Cover" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} /><div className="absolute inset-0 bg-black/30" /></div> : <div className="absolute inset-0 transition-all duration-500" style={{ background: heroGradientStyle }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-center pb-12 p-4 text-center">
          <div className="max-w-3xl">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-lg font-heading">{gallery.title}</h2>
            {gallery.description && <p className="text-white/90 text-lg md:text-xl drop-shadow-md max-w-2xl mx-auto">{gallery.description}</p>}
            <div className="mt-6 flex flex-wrap justify-center gap-4 text-white/80 text-sm font-medium">
              <span className="bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">{new Date(gallery.created_at).toLocaleDateString()}</span>
              {!showEmailModal && gallery.stats && <span className="bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">{gallery.stats.total_photos} Photos</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <main id="main-gallery-content" className="flex-1 max-w-7xl mx-auto px-4 md:px-6 py-12 w-full" tabIndex={-1}>
        {gallery.status !== 'published' && <div className="mb-8 p-4 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-lg text-center border border-yellow-200 dark:border-yellow-800">This gallery is currently <strong>{gallery.status}</strong>. Only you can see this.</div>}
        {showEmailModal || (gallery.pin_protected && !isPinVerified) ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6"><LockIcon className="w-8 h-8 text-gray-400" /></div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">Restricted Access</h3>
            <p className="text-text-secondary max-w-md mx-auto mb-6">{showEmailModal ? 'Please complete registration to view this gallery.' : 'This gallery is PIN protected. Please enter the PIN.'}</p>
            <AppButton variant="primary" onClick={() => { if (showEmailModal) setShowEmailModal(true); else { setPinModalMode('gallery'); setShowPinModal(true); } }}>{showEmailModal ? 'Register Now' : 'Enter PIN'}</AppButton>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="mb-8 flex flex-wrap items-center justify-center gap-2" role="tablist">
              <button role="tab" aria-selected={activeTab === 'all'} className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${activeTab === 'all' ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} onClick={() => setActiveTab('all')}><LayoutGrid size={16} />All Photos<span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-black/10 dark:bg-white/10">{gallery.stats?.total_photos || 0}</span></button>
              <button role="tab" aria-selected={activeTab === 'favorites'} className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${activeTab === 'favorites' ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} onClick={() => setActiveTab('favorites')}><Heart size={16} />Favorites{favoriteCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-black/10 dark:bg-white/10">{favoriteCount}</span>}</button>
              <button role="tab" aria-selected={activeTab === 'selections'} className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${activeTab === 'selections' ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} onClick={() => setActiveTab('selections')}><Bookmark size={16} />My Picks{selectionCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-black/10 dark:bg-white/10">{selectionCount}</span>}</button>
            </div>
            <SelectionQuotaBar className="mb-4 max-w-md mx-auto" />
            {activeSubGallery && breadcrumbItems.length > 1 && <div className="mb-6"><Breadcrumbs items={breadcrumbItems} galleryId={actualGalleryId} onNavigate={(item) => setActiveSubGallery(item.type === 'gallery' ? null : item.id)} showHomeIcon className="text-gray-600 dark:text-gray-400" /></div>}
            {gallery.sub_galleries && gallery.sub_galleries.length > 0 && (
              <div className="mb-8">
                {activeSubGallery === null && gallery.sub_galleries.filter(sg => sg.visible).length > 1 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
                    {gallery.sub_galleries.filter(sg => sg.visible).map(sg => {
                      const ca = assets.find(a => a.asset_id === sg.cover_asset_id || a.sub_gallery_id === sg.sub_gallery_id);
                      const cu = sg.cover_image_url || (ca ? `/api/v1/public/galleries/${gallery.gallery_id}/assets/${ca.asset_id}/thumbnail` : null);
                      return (<button key={sg.sub_gallery_id} onClick={() => setActiveSubGallery(sg.sub_gallery_id)} className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-800 hover:ring-2 hover:ring-primary transition-all focus:outline-none focus:ring-2 focus:ring-primary">{cu ? <img src={cu} alt={sg.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><FolderOpen size={32} className="text-gray-400" /></div>}<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" /><div className="absolute bottom-0 left-0 right-0 p-3 text-white"><h3 className="font-semibold text-sm truncate">{sg.name}</h3><p className="text-xs text-white/80">{sg.photo_count} photos</p></div></button>);
                    })}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2" role="tablist">
                  <button role="tab" aria-selected={activeSubGallery === null} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${activeSubGallery === null ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} onClick={() => setActiveSubGallery(null)}><FolderOpen size={14} />All<span className="px-1.5 py-0.5 rounded text-xs bg-black/10 dark:bg-white/10">{assets.length}</span></button>
                  {gallery.sub_galleries.filter(sg => sg.visible).map(sg => (<button key={sg.sub_gallery_id} role="tab" aria-selected={activeSubGallery === sg.sub_gallery_id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${activeSubGallery === sg.sub_gallery_id ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} onClick={() => setActiveSubGallery(sg.sub_gallery_id)}>{sg.name}<span className="px-1.5 py-0.5 rounded text-xs bg-black/10 dark:bg-white/10">{sg.photo_count}</span></button>))}
                </div>
              </div>
            )}
            {/* Emotion filter */}
            <div className="mb-6 flex flex-wrap items-center justify-center gap-2" role="group"><span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Filter by mood:</span><button className={`px-3 py-1.5 rounded-full text-sm transition-all ${activeEmotion === null ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} onClick={() => setActiveEmotion(null)}>All</button>{EMOTIONS.map(em => (<button key={em.value} className={`px-3 py-1.5 rounded-full text-sm transition-all ${activeEmotion === em.value ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} onClick={() => setActiveEmotion(activeEmotion === em.value ? null : em.value)} title={em.label}><span className="mr-1">{em.emoji}</span><span className="hidden sm:inline">{em.label}</span></button>))}</div>
            {activeEmotion && <div className="mb-6 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between animate-fade-in"><div className="flex items-center gap-2"><span className="text-lg">{EMOTIONS.find(e => e.value === activeEmotion)?.emoji}</span><p className="font-medium text-text-primary">Showing {displayedAssets.length} {activeEmotion} photo{displayedAssets.length !== 1 ? 's' : ''}</p></div><button className="text-sm text-primary hover:text-primary/80 font-medium" onClick={() => setActiveEmotion(null)}>Clear Filter</button></div>}
            {filteredPhotoIds && <div className="mb-6 p-4 bg-accent/10 border border-accent/20 rounded-lg flex items-center justify-between animate-fade-in"><div className="flex items-center gap-3"><User size={20} className="text-accent" /><div><p className="font-medium text-text-primary">Showing {displayedAssets.length} photo{displayedAssets.length !== 1 ? 's' : ''} of you</p>{matchSimilarity && <p className="text-sm text-text-secondary">Average match: {Math.round(matchSimilarity * 100)}%</p>}</div></div><AppButton variant="ghost" size="sm" onClick={clearFaceFilter}><X size={16} className="mr-1" />Clear</AppButton></div>}
            {selectedPersonId && personPhotoIds && <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between animate-fade-in"><div className="flex items-center gap-3"><Users size={20} className="text-primary" /><p className="font-medium text-text-primary">Showing {displayedAssets.length} photo{displayedAssets.length !== 1 ? 's' : ''} of {selectedPersonName || 'selected person'}</p></div><AppButton variant="ghost" size="sm" onClick={() => handleFilterByPerson(null)}><X size={16} className="mr-1" />Clear</AppButton></div>}
            {displayedAssets.length === 0 ? (
              <div className="text-center py-20 text-gray-500"><Grid className="w-12 h-12 mx-auto mb-4 opacity-20" /><p>{filteredPhotoIds ? 'No matching photos found.' : activeTab === 'favorites' ? 'No favorites yet.' : activeTab === 'selections' ? 'No picks yet.' : 'No photos in this gallery yet.'}</p>{(filteredPhotoIds || activeTab !== 'all') && <AppButton variant="outline" className="mt-4" onClick={() => { clearFaceFilter(); setActiveTab('all'); }}>Show All Photos</AppButton>}</div>
            ) : activeLayout ? (
              <GalleryLayoutEngine
                layout={activeLayout}
                assets={layoutAssets}
                gap={8}
                onAssetClick={handleLayoutAssetClick}
                itemOverlay={renderItemOverlay}
              />
            ) : (
              <GalleryCanvas assets={canvasAssets} viewMode={canvasViewMode} columns={{ sm: 1, md: 2, lg: 3, xl: 4 }} gap="md" selectedAssetIds={selections} lastSelectedId={null} managementSelectable={false} showCustomerSelection onSelectionChange={sel => { const ns = new Set(sel); [...ns].filter(x => !selections.has(x)).forEach(id => toggleSelection(id)); [...selections].filter(x => !ns.has(x)).forEach(id => toggleSelection(id)); }} onCustomerSelectionToggle={(id) => toggleSelection(id)} onAssetClick={(a) => { const idx = displayedAssets.findIndex(x => x.asset_id === a.asset_id); if (idx >= 0) openPlayer(idx); }} onAssetFavorite={(id) => toggleFavorite(id)} onAssetDownload={gallery.download_policy !== 'view_only' ? (id) => { const p = displayedAssets.find(x => x.asset_id === id); if (p) handleDownload(p); } : undefined} isClientView downloadPolicy={gallery.download_policy} showWatermark={gallery.download_policy === 'view_only' || gallery.download_policy === 'watermarked_only'} isPrivateUnlocked={isPrivateUnlocked} onUnlockPrivate={() => { if (gallery.pin_protected) { setPinModalMode('private'); setShowPinModal(true); } else addToast({ message: 'This photo is private.', variant: 'info' }); }} />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 dark:bg-black py-12 border-t border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-6">
          {company_profile?.logo_url && <img src={company_profile.logo_url} alt="Logo" className="h-10 mx-auto grayscale hover:grayscale-0 transition-all opacity-70 hover:opacity-100" />}
          <div><p className="font-medium text-lg text-gray-900 dark:text-white mb-2">{company_profile?.name || 'Studio Name'}</p>{company_profile?.website && <a href={company_profile.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{company_profile.website.replace(/^https?:\/\//, '')}</a>}</div>
          <div className="text-xs text-gray-400">&copy; {new Date().getFullYear()} {company_profile?.name}. All rights reserved.</div>
          {gallery.custom_links && gallery.custom_links.length > 0 && <div className="flex flex-wrap justify-center gap-4 pt-4">{gallery.custom_links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary transition-colors">{l.label}</a>)}</div>}
        </div>
      </footer>

      {/* Cinematic Viewer */}
      {showCinematicViewer && <CinematicViewer isOpen onClose={() => setShowCinematicViewer(false)} assets={canvasAssets} initialIndex={0} onIndexChange={() => {}} getAssetUrl={(id, v) => { const a = canvasAssets.find(x => x.asset_id === id); if (!a) return undefined; return v === 'thumbnail' ? a.asset?.thumbnail_url : a.asset?.preview_url; }} settings={mapSlideshowConfigToSettings(gallery.slideshow_config)} musicUrl={gallery.slideshow_config?.audio_url} galleryTitle={gallery.title} branding={{ name: company_profile?.name, logoUrl: company_profile?.logo_url, primaryColor: gallery.primary_color }} />}

      {/* Guestbook */}
      {showGuestbook && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"><div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"><div className="flex items-center justify-between mb-6"><h2 className="text-xl font-semibold text-gray-900 dark:text-white">Guestbook</h2><button onClick={() => setShowGuestbook(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button></div><Guestbook galleryId={actualGalleryId} enabled galleryTitle={gallery.title} onSubmitMessage={async (d) => { console.log('Guestbook:', d); }} onHeartMessage={async (id) => { console.log('Heart:', id); }} /></div></div>}
    </>
  );
};
