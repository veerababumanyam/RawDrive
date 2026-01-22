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
import { useDesignDraft } from '../../hooks/useDesignDraft';
import { useDesignCollaboration } from '../../hooks/useDesignCollaboration';
import { useToast } from '../../components/ui/Toast';
import { setupThemeWithSystemPreference } from '../../utils/themeUtils';
import { loadGalleryFontPairing } from '../../utils/fontLoader';
import { DesignControlsPanel } from '../../components/features/gallery/design/DesignControlsPanel';
import { DesignPreviewCanvas } from '../../components/features/gallery/design/DesignPreviewCanvas';
import { SaveAsTemplateModal } from '../../components/features/gallery/design/SaveAsTemplateModal';
import { TemplateLibrary } from '../../components/features/gallery/design/TemplateLibrary';
import { DesignStudioTooltip } from '../../components/features/gallery/design/DesignStudioTooltip';
import galleryDesignService from '../../services/galleryDesignService';
import {
  Undo2,
  Redo2,
  Smartphone,
  Tablet,
  Monitor,
  Library,
  Save,
  Send,
  Ruler
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
  const workspaceId = localStorage.getItem('current_workspace_id') || '';
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
    workspaceId,
    autoSaveInterval: 3000,
  });

  // Setup design collaboration
  const {
    isCollaborating,
    lockedSections,
    viewerCount,
    collaborators,
  } = useDesignCollaboration({
    galleryId: galleryId || '',
    enabled: true,
  });

  // Handle missing gallery ID after all hooks are called
  if (!galleryId) {
    return <div className="p-4">Error: Gallery ID not found</div>;
  }

  const [viewportMode, setViewportMode] = useState<ViewportMode>({
    type: 'desktop',
  });

  // Template modals
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);

  // Resizable divider state
  const [controlsWidth, setControlsWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(0);

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const themeCleanupRef = useRef<(() => void) | null>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Track preview container width
  useEffect(() => {
    if (!mainContainerRef.current) return;

    const updatePreviewWidth = () => {
      if (mainContainerRef.current) {
        const containerWidth = mainContainerRef.current.offsetWidth;
        setPreviewWidth(containerWidth - controlsWidth);
      }
    };

    updatePreviewWidth();

    const resizeObserver = new ResizeObserver(updatePreviewWidth);
    resizeObserver.observe(mainContainerRef.current);

    return () => resizeObserver.disconnect();
  }, [controlsWidth]);

  // Handle divider drag for resizing (mouse)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Handle divider keyboard resizing
  const handleDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 50 : 10; // Shift for larger increments

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        setControlsWidth(prev => Math.max(280, prev - step));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setControlsWidth(prev => Math.min(500, prev + step));
        break;
      case 'Home':
        e.preventDefault();
        setControlsWidth(280);
        break;
      case 'End':
        e.preventDefault();
        setControlsWidth(500);
        break;
    }
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!mainContainerRef.current) return;

      const containerRect = mainContainerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      // Clamp controls width between 280px and 500px
      const clampedWidth = Math.max(280, Math.min(500, newWidth));
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
  }, [isResizing]);

  /**
   * Apply theme and font to preview container
   */
  useEffect(() => {
    if (!previewContainerRef.current) return;

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
  }, [config.theme.id, config.theme.mode, config.theme.accentColorOverride, config.typography.pairingId]);

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
    <div className="flex flex-col h-screen bg-[#0a1628] text-white overflow-hidden font-sans">
      {/* Top Bar - Floating Glass */}
      <div className="relative z-50 px-6 py-4 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl px-5 py-2.5 shadow-2xl pointer-events-auto">
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-tight text-white uppercase opacity-90">Design Studio</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-medium text-white/60">Live Preview</span>
              {isDirty && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" title="Unsaved changes" />}
            </div>
          </div>
          {saveStatus === 'saved' && (
            <div className="ml-2 px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded-md">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Synced</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 pointer-events-auto">
          {/* Undo/Redo - Glass Capsule */}
          <div className="flex items-center bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-1 shadow-2xl">
            <DesignStudioTooltip content="Undo (Ctrl+Z)">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="p-2 rounded-xl text-white opacity-80 hover:opacity-100 hover:bg-white/10 disabled:opacity-20 transition-all active:scale-95 flex items-center justify-center"
              >
                <Undo2 className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
            <DesignStudioTooltip content="Redo (Ctrl+Y)">
              <button
                onClick={redo}
                disabled={!canRedo}
                className="p-2 rounded-xl text-white opacity-80 hover:opacity-100 hover:bg-white/10 disabled:opacity-20 transition-all active:scale-95 flex items-center justify-center"
              >
                <Redo2 className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
          </div>

          {/* Viewport Mode - Segmented Control */}
          <div className="flex bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-1 shadow-2xl">
            <DesignStudioTooltip content="Mobile View">
              <button
                onClick={() => setViewportMode({ type: 'mobile', width: 375 })}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 ${viewportMode.type === 'mobile' ? 'bg-white text-[#0a1628] shadow-lg scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
              >
                <Smartphone className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
            <DesignStudioTooltip content="Tablet View">
              <button
                onClick={() => setViewportMode({ type: 'tablet', width: 768 })}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 ${viewportMode.type === 'tablet' ? 'bg-white text-[#0a1628] shadow-lg scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
              >
                <Tablet className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
            <DesignStudioTooltip content="Desktop View">
              <button
                onClick={() => setViewportMode({ type: 'desktop' })}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 ${viewportMode.type === 'desktop' ? 'bg-white text-[#0a1628] shadow-lg scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
              >
                <Monitor className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
          </div>

          {/* Template Actions */}
          <div className="flex bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-1 shadow-2xl">
            <DesignStudioTooltip content="Load Template">
              <button
                onClick={() => setShowTemplateLibrary(true)}
                className="p-2.5 rounded-xl text-white opacity-80 hover:opacity-100 hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center"
              >
                <Library className="w-5 h-5" />
              </button>
            </DesignStudioTooltip>
            <DesignStudioTooltip content="Save as Template">
              <button
                onClick={() => setShowSaveTemplateModal(true)}
                className="p-2.5 rounded-xl text-white opacity-80 hover:opacity-100 hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center"
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

      {/* Main Content - Full Screen Split */}
      <div ref={mainContainerRef} className="absolute inset-0 flex overflow-hidden">
        {/* Left Panel - Controls (Floating Glass Sidebar) */}
        <div
          className="relative z-20 h-full flex items-center pl-6 pointer-events-none"
          style={{ width: `${controlsWidth + 24}px` }}
        >
          <div className="w-full h-[90%] bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden pointer-events-auto flex flex-col">
            <DesignControlsPanel
              config={config}
              onChange={updateConfig}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
              error={error}
              lockedSections={lockedSections}
            />
          </div>
        </div>

        {/* Resizable Divider (Invisible handle, visible glow) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize controls panel"
          aria-valuenow={controlsWidth}
          aria-valuemin={280}
          aria-valuemax={500}
          tabIndex={0}
          className={`relative z-30 w-2 cursor-col-resize group flex-shrink-0 transition-opacity duration-300 ${isResizing ? 'opacity-100' : 'opacity-0 hover:opacity-100'
            }`}
          onMouseDown={handleMouseDown}
          onKeyDown={handleDividerKeyDown}
        >
          <div className="absolute inset-y-[20%] left-1/2 -translate-x-1/2 w-0.5 bg-gradient-to-b from-transparent via-cyan-400 to-transparent shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
        </div>

        {/* Right Panel - Preview Canvas Environment */}
        <div className="flex-1 relative z-10 overflow-auto bg-[radial-gradient(circle_at_center,_#1e293b_0%,_#0f172a_100%)]">
          {/* Minimum width warning */}
          {previewWidth < MIN_PREVIEW_WIDTH && previewWidth > 0 ? (
            <div className="flex items-center justify-center h-full p-8 transition-opacity duration-200">
              <div className="text-center space-y-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 shadow-2xl">
                <Ruler className="w-16 h-16 text-white/40 animate-bounce mx-auto" />
                <h3 className="text-xl font-bold text-white">Canvas Too Compressed</h3>
                <p className="text-white/60 text-sm max-w-[200px] mx-auto">
                  Expand the workspace to reveal the design preview
                </p>
              </div>
            </div>
          ) : (
            <div
              ref={previewContainerRef}
              className="flex items-center justify-center p-20 min-h-full transition-all duration-700 ease-[cubic-bezier(0.34, 1.56, 0.64, 1)]"
              style={{
                containerType: 'inline-size',
              }}
            >
              <div className="relative group">
                {/* Decorative Atmosphere Glow */}
                <div className="absolute -inset-20 bg-cyan-500/10 blur-[100px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

                <DesignPreviewCanvas
                  config={config}
                  galleryId={galleryId}
                  viewportMode={viewportMode}
                  viewerCount={viewerCount}
                  collaborators={collaborators}
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
        <div className="fixed bottom-4 left-4 p-4 bg-red-100 text-red-700 rounded border border-red-300">
          {error}
        </div>
      )}

      {publishError && (
        <div className="fixed bottom-4 left-4 p-4 bg-red-100 text-red-700 rounded border border-red-300">
          Publish failed: {publishError}
        </div>
      )}
    </div>
  );
};



export default GalleryDesignStudioPage;
