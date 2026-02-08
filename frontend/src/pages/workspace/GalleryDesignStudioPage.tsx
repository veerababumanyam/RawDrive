/**
 * Gallery Design Studio Page
 *
 * Main route component for the gallery design and customization interface.
 *
 * Features:
 * - Split-screen layout (360px controls + flexible preview)
 * - Real-time design preview
 * - Draft persistence via localStorage
 * - Publish to backend via API
 * - Theme/font/layout customization
 *
 * Route: /workspace/galleries/:id/design
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useDesignDraft } from '../../hooks/useDesignDraft';
import { useDesignStudioCollaboration } from '../../hooks/useDesignStudioCollaboration';
import { useGallery } from '../../hooks/useGallery';
import { useToast } from '../../components/ui/Toast';
import { setupThemeWithSystemPreference } from '../../utils/themeUtils';
import { loadGalleryFontPairing } from '../../utils/fontLoader';
import { DesignControlsPanel } from '../../components/features/gallery/design/DesignControlsPanel';
import { DesignPreviewCanvas } from '../../components/features/gallery/design/DesignPreviewCanvas';
import { SaveAsTemplateModal } from '../../components/features/gallery/design/SaveAsTemplateModal';
import { TemplateLibrary } from '../../components/features/gallery/design/TemplateLibrary';
import { DesignStudioTooltip } from '../../components/features/gallery/design/DesignStudioTooltip';
import { PresenceIndicators, CompactPresenceBadge, ConnectionStatusBadge } from '../../components/features/gallery/design/PresenceIndicators';
import { LiveCursorOverlay } from '../../components/features/gallery/design/LiveCursorOverlay';
import { CollaboratorsList } from '../../components/features/gallery/design/CollaboratorsList';
import { ConflictResolutionModal, ConflictAlertBanner } from '../../components/features/gallery/design/ConflictResolutionModal';
import galleryDesignService from '../../services/galleryDesignService';
import type { DesignSection, DesignConflict } from '../../types/design-studio-collaboration';
import {
  Undo2,
  Redo2,
  Smartphone,
  Tablet,
  Monitor,
  Library,
  Save,
  Send,
  Ruler,
  Users,
  X
} from 'lucide-react';

interface ViewportMode {
  type: 'mobile' | 'tablet' | 'desktop';
  width?: number; // For mobile/tablet, optional width override
}

const MIN_PREVIEW_WIDTH = 200; // Minimum width before showing "too small" message

/**
 * Gallery Design Studio Page Component
 */
export const GalleryDesignStudioPage: React.FC = () => {
  const { id: galleryId } = useParams<{ id: string }>();
  const { workspaceId } = useWorkspace();
  const { addToast } = useToast();

  const {
    config,
    updateConfig,
    isDirty,
    saveStatus,
    publishStatus,
    lastSavedAt,
    error,
    canUndo,
    canRedo,
    undo,
    redo,
    publish,
    publishError,
  } = useDesignDraft({
    galleryId: galleryId || '',
    workspaceId: workspaceId || '',
    autoSaveInterval: 3000,
  });

  // Setup enhanced design collaboration
  const {
    // State
    isCollaborating,
    connectionStatus,
    collaborators,
    lockedSections,
    conflicts,
    activityFeed,
    myUserId,

    // Actions
    joinSession,
    leaveSession,
    updateCursor,
    lockSection,
    unlockSection,
    broadcastUpdate,
    setTyping,
    setFocusedSection,
    resolveConflict,
  } = useDesignStudioCollaboration({
    galleryId: galleryId || '',
    workspaceId: workspaceId || '',
    enabled: true,
    onRemoteUpdate: (remoteConfig, userId, section) => {
      // Apply remote updates to local config (merge strategy)
      if (remoteConfig && section) {
        updateConfig((prev) => ({
          ...prev,
          [section]: { ...prev[section as keyof typeof prev], ...remoteConfig },
        }));
      }
    },
    onConflict: (conflict) => {
      // Show conflict alert
      setActiveConflict(conflict);
    },
    onSectionLocked: (section, userName) => {
      addToast({
        variant: 'info',
        title: 'Section Locked',
        message: `${userName} is now editing ${section}`,
      });
    },
    onSectionUnlocked: (section) => {
      // Silent unlock - no toast needed
    },
  });

  // Fetch gallery data for cover preview
  const { gallery } = useGallery({
    workspaceId: workspaceId || '',
    galleryId: galleryId || '',
    autoFetch: true,
  });

  // All hooks must be called before any early returns
  const [viewportMode, setViewportMode] = useState<ViewportMode>({
    type: 'desktop',
  });

  // Guard: ensure required IDs are available
  if (!galleryId || !workspaceId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-gray-500">Loading design studio...</p>
        </div>
      </div>
    );
  }

  // Template modals
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);

  // Collaboration UI state
  const [showCollaboratorsSidebar, setShowCollaboratorsSidebar] = useState(false);
  const [activeConflict, setActiveConflict] = useState<DesignConflict | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);

  // Resizable divider state - responsive initial width
  const [controlsWidth, setControlsWidth] = useState(() => {
    // On mobile (< 640px), use 200px; on tablet (< 1024px), use 280px; on desktop, use 360px
    if (typeof window === 'undefined') return 360;
    const width = window.innerWidth;
    if (width < 640) return 200;
    if (width < 1024) return 280;
    return 360;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [actualPreviewWidth, setActualPreviewWidth] = useState(0);

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const themeCleanupRef = useRef<(() => void) | null>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const cursorThrottleRef = useRef<number | null>(null);

  // Handle cursor movement for collaboration
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isCollaborating || !previewContainerRef.current) return;

      // Throttle cursor updates to 50ms (20fps)
      if (cursorThrottleRef.current) return;

      cursorThrottleRef.current = window.setTimeout(() => {
        cursorThrottleRef.current = null;
      }, 50);

      const rect = previewContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      updateCursor({ x, y, panel: 'preview' });
    },
    [isCollaborating, updateCursor]
  );

  // Handle section focus for collaboration
  const handleSectionFocus = useCallback(
    (section: DesignSection) => {
      setFocusedSection(section);
    },
    [setFocusedSection]
  );

  // Handle typing indicator for text fields
  const handleTypingChange = useCallback(
    (isTyping: boolean, field?: string) => {
      setTyping(isTyping, field);
    },
    [setTyping]
  );

  // Handle conflict resolution
  const handleResolveConflict = useCallback(
    async (resolution: 'mine' | 'theirs' | 'merge') => {
      if (!activeConflict) return;

      await resolveConflict({
        conflictId: activeConflict.conflict_id,
        resolution,
      });
      setActiveConflict(null);
      setShowConflictModal(false);

      addToast({
        variant: 'success',
        title: 'Conflict Resolved',
        message: 'Your changes have been synchronized.',
      });
    },
    [activeConflict, resolveConflict, addToast]
  );

  // Handle unlock section from sidebar
  const handleUnlockSection = useCallback(
    async (section: DesignSection) => {
      const success = await unlockSection(section);
      if (success) {
        addToast({
          variant: 'success',
          title: 'Section Unlocked',
          message: `${section} is now available for editing.`,
        });
      }
    },
    [unlockSection, addToast]
  );

  // Handle jump to collaborator cursor
  const handleJumpToCursor = useCallback(
    (userId: string) => {
      const collaborator = collaborators.find((c) => c.user_id === userId);
      if (collaborator?.cursor && previewContainerRef.current) {
        previewContainerRef.current.scrollTo({
          left: collaborator.cursor.x - previewContainerRef.current.offsetWidth / 2,
          top: collaborator.cursor.y - previewContainerRef.current.offsetHeight / 2,
          behavior: 'smooth',
        });
      }
    },
    [collaborators]
  );

  // Track actual preview panel width with ResizeObserver
  useEffect(() => {
    if (!galleryId || !previewContainerRef.current) return;

    const updateActualWidth = () => {
      if (previewContainerRef.current) {
        setActualPreviewWidth(previewContainerRef.current.offsetWidth);
      }
    };

    updateActualWidth(); // Initial measurement

    const resizeObserver = new ResizeObserver(updateActualWidth);
    resizeObserver.observe(previewContainerRef.current);

    return () => resizeObserver.disconnect();
  }, [galleryId]);

  // Handle divider drag for resizing (mouse)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Get responsive min/max constraints based on screen width
  const getResizeConstraints = useCallback(() => {
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    if (screenW < 640) {
      // Mobile: 160-280px
      return { min: 160, max: 280 };
    } else if (screenW < 1024) {
      // Tablet: 200-400px
      return { min: 200, max: 400 };
    }
    // Desktop: 280-500px
    return { min: 280, max: 500 };
  }, []);

  // Handle divider keyboard resizing
  const handleDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { min, max } = getResizeConstraints();
    const step = e.shiftKey ? 50 : 10; // Shift for larger increments

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        setControlsWidth(prev => Math.max(min, prev - step));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setControlsWidth(prev => Math.min(max, prev + step));
        break;
      case 'Home':
        e.preventDefault();
        setControlsWidth(min);
        break;
      case 'End':
        e.preventDefault();
        setControlsWidth(max);
        break;
    }
  }, [getResizeConstraints]);

  useEffect(() => {
    if (!galleryId || !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!mainContainerRef.current) return;

      const { min, max } = getResizeConstraints();
      const containerRect = mainContainerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      // Clamp controls width between responsive min and max
      const clampedWidth = Math.max(min, Math.min(max, newWidth));
      setControlsWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, galleryId, getResizeConstraints]);

  /**
   * Apply theme and font to preview container
   */
  useEffect(() => {
    if (!galleryId || !previewContainerRef.current) return;

    // Apply theme tokens
    const cleanup = setupThemeWithSystemPreference(
      previewContainerRef.current,
      config.theme.id,
      config.theme.mode,
      config.theme.accentColorOverride
    );

    themeCleanupRef.current = cleanup;

    // Load font pairing
    loadGalleryFontPairing(config.typography.pairingId).catch((e) => {
      console.error('Failed to load font:', e);
    });

    return () => {
      cleanup();
    };
  }, [galleryId, config.theme.id, config.theme.mode, config.theme.accentColorOverride, config.typography.pairingId]);

  // Handle missing gallery ID after all hooks are called
  if (!galleryId) {
    return <div className="p-4">Error: Gallery ID not found</div>;
  }

  const handlePublish = async () => {
    try {
      await publish();
      addToast({
        variant: 'success',
        title: 'Design Published',
        message: 'Your design changes have been published to the gallery.',
      });
    } catch (e) {
      console.error('Publish failed:', e);
      addToast({
        variant: 'error',
        title: 'Publish Failed',
        message: 'Unable to publish design. Please try again.',
      });
    }
  };

  const handleSaveTemplate = async (template: { name: string; description?: string; category: string; tags: string[]; design_config: any }) => {
    try {
      await galleryDesignService.createTemplate(template);
      setShowSaveTemplateModal(false);
      addToast({
        variant: 'success',
        title: 'Template Saved',
        message: `Design template "${template.name}" has been saved successfully.`,
      });
    } catch (e) {
      console.error('Failed to save template:', e);
      addToast({
        variant: 'error',
        title: 'Save Failed',
        message: 'Unable to save template. Please try again.',
      });
    }
  };

  const handleApplyTemplate = async (template: any) => {
    try {
      const appliedConfig = await galleryDesignService.applyTemplate(template.template_id, config, true);
      updateConfig(appliedConfig);
      setShowTemplateLibrary(false);
      addToast({
        variant: 'success',
        title: 'Template Applied',
        message: 'Design template has been applied to your gallery.',
      });
    } catch (e) {
      console.error('Failed to apply template:', e);
      addToast({
        variant: 'error',
        title: 'Apply Failed',
        message: 'Unable to apply template. Please try again.',
      });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-[#0a1628] text-gray-900 dark:text-white overflow-hidden font-sans">
      {/* Top Bar - Floating Glass */}
      <div className="relative z-40 px-6 py-4 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-4 bg-gray-100 dark:bg-white/10 backdrop-blur-xl border border-gray-200 dark:border-white/20 rounded-2xl px-5 py-2.5 shadow-2xl pointer-events-auto">
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-tight text-gray-900 dark:text-white uppercase opacity-90">Design Studio</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-medium text-gray-600 dark:text-white/60">Live Preview</span>
              {isDirty && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" title="Unsaved changes" />}
            </div>
          </div>
          {saveStatus === 'saved' && (
            <div className="ml-2 px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded-md">
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Synced</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 pointer-events-auto">
          {/* Collaboration Presence Indicators */}
          {isCollaborating && collaborators.length > 1 && (
            <div className="bg-gray-100 dark:bg-white/10 backdrop-blur-xl border border-gray-200 dark:border-white/20 rounded-2xl px-3 py-2 shadow-2xl">
              <PresenceIndicators
                collaborators={collaborators}
                myUserId={myUserId}
                maxVisible={3}
                size="sm"
                showStatus={true}
                onClick={(collaborator) => handleJumpToCursor(collaborator.user_id)}
              />
            </div>
          )}

          {/* Connection Status & Collaborators Toggle */}
          <div className="flex items-center gap-2">
            <ConnectionStatusBadge status={connectionStatus} />
            <DesignStudioTooltip content="View Collaborators">
              <button
                onClick={() => setShowCollaboratorsSidebar(!showCollaboratorsSidebar)}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-xl transition-all
                  ${showCollaboratorsSidebar
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-white/20'
                  }
                  backdrop-blur-xl border border-gray-200 dark:border-white/20 shadow-2xl
                `}
              >
                <Users className="w-4 h-4" />
                <span className="text-sm font-medium">{collaborators.length}</span>
              </button>
            </DesignStudioTooltip>
          </div>

          {/* Undo/Redo - Glass Capsule */}
          <div className="flex items-center bg-gray-100 dark:bg-white/10 backdrop-blur-xl border border-gray-200 dark:border-white/20 rounded-2xl p-1 shadow-2xl">
            <DesignStudioTooltip content="Undo (Ctrl+Z)">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="p-2 rounded-xl text-gray-700 dark:text-white opacity-80 hover:opacity-100 hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-20 transition-all active:scale-95 flex items-center justify-center"
              >
                <Undo2 className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
            <DesignStudioTooltip content="Redo (Ctrl+Y)">
              <button
                onClick={redo}
                disabled={!canRedo}
                className="p-2 rounded-xl text-gray-700 dark:text-white opacity-80 hover:opacity-100 hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-20 transition-all active:scale-95 flex items-center justify-center"
              >
                <Redo2 className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
          </div>

          {/* Viewport Mode - Segmented Control */}
          <div className="flex bg-gray-100 dark:bg-white/10 backdrop-blur-xl border border-gray-200 dark:border-white/20 rounded-2xl p-1 shadow-2xl">
            <DesignStudioTooltip content="Mobile View">
              <button
                onClick={() => setViewportMode({ type: 'mobile', width: 375 })}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 ${viewportMode.type === 'mobile' ? 'bg-white dark:bg-white text-[#0a1628] shadow-lg scale-105' : 'text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5'
                  }`}
              >
                <Smartphone className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
            <DesignStudioTooltip content="Tablet View">
              <button
                onClick={() => setViewportMode({ type: 'tablet', width: 768 })}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 ${viewportMode.type === 'tablet' ? 'bg-white dark:bg-white text-[#0a1628] shadow-lg scale-105' : 'text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5'
                  }`}
              >
                <Tablet className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
            <DesignStudioTooltip content="Desktop View">
              <button
                onClick={() => setViewportMode({ type: 'desktop' })}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 ${viewportMode.type === 'desktop' ? 'bg-white dark:bg-white text-[#0a1628] shadow-lg scale-105' : 'text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5'
                  }`}
              >
                <Monitor className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
          </div>

          {/* Template Actions */}
          <div className="flex bg-gray-100 dark:bg-white/10 backdrop-blur-xl border border-gray-200 dark:border-white/20 rounded-2xl p-1 shadow-2xl">
            <DesignStudioTooltip content="Load Template">
              <button
                onClick={() => setShowTemplateLibrary(true)}
                className="p-2.5 rounded-xl text-gray-700 dark:text-white opacity-80 hover:opacity-100 hover:bg-gray-200 dark:hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center"
              >
                <Library className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
            <DesignStudioTooltip content="Save as Template">
              <button
                onClick={() => setShowSaveTemplateModal(true)}
                className="p-2.5 rounded-xl text-gray-700 dark:text-white opacity-80 hover:opacity-100 hover:bg-gray-200 dark:hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center"
              >
                <Save className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
          </div>

          {/* Publish Button - High Fidelity */}
          <button
            onClick={handlePublish}
            disabled={!isDirty || publishStatus === 'publishing'}
            className="group relative px-6 py-3 rounded-2xl overflow-hidden shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-500 active:scale-95 flex items-center gap-2"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-blue-600 group-hover:scale-110 transition-transform duration-500" />
            <div className="absolute inset-x-0 top-0 h-px bg-white/30" />
            <Send className="relative z-10 w-4 h-4 text-white" />
            <span className="relative z-10 text-sm font-bold uppercase tracking-wider text-white drop-shadow-md">
              {publishStatus === 'publishing' ? 'Sending...' : 'Publish'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Content - Split Layout */}
      <div ref={mainContainerRef} className="flex-1 relative flex overflow-hidden gap-0 bg-white dark:bg-[radial-gradient(circle_at_center,_#1e293b_0%,_#0f172a_100%)]">
        {/* Left Panel - Controls (Floating Glass Sidebar) - Responsive */}
        <div
          className="relative z-20 h-full flex flex-col justify-center pr-1 sm:pr-2 md:pr-3 ml-2 sm:ml-3 md:ml-6 pointer-events-none flex-shrink-0 py-4 sm:py-6 md:py-8"
          style={{ width: `${controlsWidth}px` }}
        >
          <div className="w-full flex-1 min-h-0 max-h-full bg-white dark:bg-white/5 backdrop-blur-3xl border border-gray-200 dark:border-white/10 rounded-xl sm:rounded-2xl md:rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden pointer-events-auto flex flex-col">
            <DesignControlsPanel
              config={config}
              onChange={updateConfig}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
              error={error}
              lockedSections={lockedSections}
              galleryId={galleryId}
              workspaceId={workspaceId}
              onSectionFocus={handleSectionFocus}
              onTypingChange={handleTypingChange}
              onLockSection={lockSection}
              onUnlockSection={unlockSection}
              collaborators={collaborators}
              myUserId={myUserId}
            />
          </div>
        </div>

        {/* Resizable Divider (Invisible handle, visible glow) */}
        {(() => {
          const { min, max } = getResizeConstraints();
          return (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize controls panel"
              aria-valuenow={controlsWidth}
              aria-valuemin={min}
              aria-valuemax={max}
              tabIndex={0}
              className={`relative z-30 w-2 cursor-col-resize group flex-shrink-0 transition-opacity duration-300 ${isResizing ? 'opacity-100' : 'opacity-0 hover:opacity-100'
                }`}
              onMouseDown={handleMouseDown}
              onKeyDown={handleDividerKeyDown}
            >
              <div className="absolute inset-y-[20%] left-1/2 -translate-x-1/2 w-0.5 bg-gradient-to-b from-transparent via-cyan-400 to-transparent shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
            </div>
          );
        })()}

        {/* Right Panel - Preview Canvas Environment */}
        <div
          ref={previewContainerRef}
          className="flex-1 relative z-10 overflow-auto bg-gray-50 dark:bg-[radial-gradient(circle_at_center,_#1e293b_0%,_#0f172a_100%)]"
          onMouseMove={handleMouseMove}
        >
          {/* Live Cursor Overlay for Collaborators */}
          <LiveCursorOverlay
            collaborators={collaborators}
            myUserId={myUserId}
            containerRef={previewContainerRef}
            enabled={isCollaborating}
          />
          {/* Minimum width warning */}
          {actualPreviewWidth < MIN_PREVIEW_WIDTH && actualPreviewWidth > 0 ? (
            <div className="flex items-center justify-center h-full p-8 transition-opacity duration-200">
              <div className="text-center space-y-4 bg-gray-100 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl p-10 shadow-2xl">
                <Ruler className="w-16 h-16 text-gray-400 dark:text-white/40 animate-bounce mx-auto" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Canvas Too Compressed</h3>
                <p className="text-gray-600 dark:text-white/60 text-sm max-w-[200px] mx-auto">
                  Expand the workspace to reveal the design preview
                </p>
              </div>
            </div>
          ) : (
            <div
              className={`flex items-center p-8 md:p-12 lg:p-20 min-h-full transition-all duration-700 ease-[cubic-bezier(0.34, 1.56, 0.64, 1)] ${
                viewportMode.type === 'desktop' ? 'justify-start' : 'justify-center'
              }`}
              style={{
                containerType: 'inline-size',
              }}
            >
              <div className={`relative group ${viewportMode.type === 'desktop' ? 'w-full' : ''}`}>
                {/* Decorative Atmosphere Glow */}
                <div className="absolute -inset-20 bg-cyan-500/10 blur-[100px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

                <DesignPreviewCanvas
                  config={config}
                  galleryId={galleryId}
                  workspaceId={workspaceId}
                  viewportMode={viewportMode}
                  galleryTitle={gallery?.title}
                  galleryDescription={gallery?.description}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showSaveTemplateModal && (
        <SaveAsTemplateModal
          currentDesignConfig={config}
          onClose={() => setShowSaveTemplateModal(false)}
          onSave={handleSaveTemplate}
        />
      )}

      {showTemplateLibrary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-border-default">
              <h2 className="text-xl font-semibold text-text-primary">Design Templates</h2>
              <button
                onClick={() => setShowTemplateLibrary(false)}
                className="p-1 hover:bg-bg-secondary rounded-lg transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <TemplateLibrary
                galleryId={galleryId || ''}
                onSelectTemplate={handleApplyTemplate}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 left-4 p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200 rounded border border-red-300 dark:border-red-700">
          {error}
        </div>
      )}

      {publishError && (
        <div className="fixed bottom-4 left-4 p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200 rounded border border-red-300 dark:border-red-700">
          Publish failed: {publishError}
        </div>
      )}

      {/* Collaborators Sidebar */}
      {showCollaboratorsSidebar && (
        <div className="fixed inset-y-0 right-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 -left-full w-[200vw]"
            onClick={() => setShowCollaboratorsSidebar(false)}
          />
          {/* Sidebar */}
          <div className="relative shadow-2xl">
            <CollaboratorsList
              collaborators={collaborators}
              myUserId={myUserId}
              locks={lockedSections}
              activityFeed={activityFeed}
              onUnlockSection={handleUnlockSection}
              onJumpToCursor={handleJumpToCursor}
            />
            {/* Close button */}
            <button
              onClick={() => setShowCollaboratorsSidebar(false)}
              className="absolute top-4 -left-10 p-2 bg-white dark:bg-gray-800 rounded-l-lg shadow-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Conflict Alert Banner */}
      {activeConflict && !showConflictModal && (
        <ConflictAlertBanner
          conflict={activeConflict}
          onResolve={() => setShowConflictModal(true)}
          onDismiss={() => setActiveConflict(null)}
        />
      )}

      {/* Conflict Resolution Modal */}
      {showConflictModal && activeConflict && (
        <ConflictResolutionModal
          conflict={activeConflict}
          onResolve={handleResolveConflict}
          onCancel={() => {
            setShowConflictModal(false);
            setActiveConflict(null);
          }}
        />
      )}
    </div>
  );
};



export default GalleryDesignStudioPage;
