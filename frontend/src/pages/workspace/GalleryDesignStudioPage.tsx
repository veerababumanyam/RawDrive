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
import galleryDesignService from '../../services/galleryDesignService';

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
    <div className="flex flex-col h-screen bg-background">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-text-primary">Design Studio</h1>
          {isDirty && <span className="text-xs px-2 py-1 bg-accent-primary/10 text-accent-primary rounded">Unsaved</span>}
          {saveStatus === 'saved' && <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">Saved</span>}
        </div>

        <div className="flex items-center gap-3">
          {/* Undo/Redo */}
          <div className="flex gap-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo (Ctrl+Z)"
              className="p-2 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bg-secondary"
            >
              <span aria-hidden="true">↶</span>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo (Ctrl+Y)"
              className="p-2 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bg-secondary"
            >
              <span aria-hidden="true">↷</span>
            </button>
          </div>

          {/* Viewport Mode */}
          <div className="flex gap-1 px-2 py-1 bg-bg-secondary rounded">
            <button
              onClick={() => setViewportMode({ type: 'mobile', width: 375 })}
              className={`px-2 py-1 text-sm rounded transition-colors ${
                viewportMode.type === 'mobile' ? 'bg-accent-primary text-white' : 'text-text-secondary hover:bg-bg-tertiary'
              }`}
              title="Mobile (375px)"
            >
              📱
            </button>
            <button
              onClick={() => setViewportMode({ type: 'tablet', width: 768 })}
              className={`px-2 py-1 text-sm rounded transition-colors ${
                viewportMode.type === 'tablet' ? 'bg-accent-primary text-white' : 'text-text-secondary hover:bg-bg-tertiary'
              }`}
              title="Tablet (768px)"
            >
              📋
            </button>
            <button
              onClick={() => setViewportMode({ type: 'desktop' })}
              className={`px-2 py-1 text-sm rounded transition-colors ${
                viewportMode.type === 'desktop' ? 'bg-accent-primary text-white' : 'text-text-secondary hover:bg-bg-tertiary'
              }`}
              title="Desktop (Full width)"
            >
              🖥️
            </button>
          </div>

          {/* Template Actions */}
          <div className="flex gap-2 border-l border-border-default pl-3">
            <button
              onClick={() => setShowTemplateLibrary(true)}
              className="px-3 py-2 text-sm rounded bg-bg-secondary text-text-primary hover:bg-bg-tertiary transition-colors"
              title="Load a design template"
            >
              📚 Templates
            </button>
            <button
              onClick={() => setShowSaveTemplateModal(true)}
              className="px-3 py-2 text-sm rounded bg-bg-secondary text-text-primary hover:bg-bg-tertiary transition-colors"
              title="Save current design as a template"
            >
              💾 Save as Template
            </button>
          </div>

          {/* Publish Button */}
          <button
            onClick={handlePublish}
            disabled={!isDirty || publishStatus === 'publishing'}
            className="px-4 py-2 rounded bg-accent-primary text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {publishStatus === 'publishing' ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Main Content - Split Screen */}
      <div ref={mainContainerRef} className="flex flex-1 overflow-hidden">
        {/* Left Panel - Controls (Resizable) */}
        <div
          className="border-r border-border-default bg-surface overflow-y-auto shadow-sm flex-shrink-0"
          style={{ width: `${controlsWidth}px` }}
        >
          <DesignControlsPanel
            config={config}
            onChange={updateConfig}
            saveStatus={saveStatus}
            lastSavedAt={lastSavedAt}
            error={error}
            lockedSections={lockedSections}
          />
        </div>

        {/* Resizable Divider */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize controls panel (Drag or use arrow keys)"
          aria-valuenow={controlsWidth}
          aria-valuemin={280}
          aria-valuemax={500}
          tabIndex={0}
          className={`w-1 cursor-col-resize flex-shrink-0 transition-colors ${
            isResizing ? 'bg-accent-primary' : 'bg-border-default hover:bg-accent-primary/50'
          }`}
          onMouseDown={handleMouseDown}
          onKeyDown={handleDividerKeyDown}
        />

        {/* Right Panel - Preview (Flexible with Container Queries) */}
        <div className="flex-1 overflow-auto bg-bg-primary">
          {/* Minimum width warning */}
          {previewWidth < MIN_PREVIEW_WIDTH && previewWidth > 0 ? (
            <div className="flex items-center justify-center h-full p-8 transition-opacity duration-200">
              <div className="text-center space-y-2">
                <div className="text-4xl">📐</div>
                <p className="text-text-secondary font-medium">Preview too small</p>
                <p className="text-text-tertiary text-sm">
                  Drag the divider left to expand the preview area
                </p>
              </div>
            </div>
          ) : (
            <div
              ref={previewContainerRef}
              className={`flex items-start justify-center p-8 min-h-full transition-all duration-300 ease-in-out ${
                viewportMode.type !== 'desktop' ? 'bg-bg-secondary' : ''
              }`}
              style={{
                // Container type for container queries (T048)
                containerType: 'inline-size',
              }}
            >
              <DesignPreviewCanvas
                config={config}
                galleryId={galleryId}
                viewportMode={viewportMode}
                viewerCount={viewerCount}
                collaborators={collaborators}
              />
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
