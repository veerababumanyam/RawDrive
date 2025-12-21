/**
 * Profile Editor Container Component
 *
 * Main container for the unified profile editor experience.
 * Combines visibility controls, theme selection, customization,
 * and live preview in a cohesive interface.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.10, 8.12
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Eye,
  Palette,
  Type,
  Image,
  ChevronDown,
  ChevronRight,
  Undo2,
  Redo2,
  Smartphone,
  Tablet,
  Monitor,
  Globe,
  History,
  Share2,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';

import { VisibilityControls } from './VisibilityControls';
import { LivePreviewPanel } from './LivePreviewPanel';
import { ThemeGallery } from './ThemeGallery';
import { ColorPaletteBuilder } from './ColorPaletteBuilder';
import { TypographyManager } from './TypographyManager';
import { VersionHistory } from './VersionHistory';
import { useProfileEditor } from '@/hooks/useProfileEditor';

// =============================================================================
// Types
// =============================================================================

interface ProfileEditorContainerProps {
  workspaceId: string;
}

type EditorSection = 'visibility' | 'theme' | 'colors' | 'typography' | 'assets' | 'versions';

interface SectionConfig {
  id: EditorSection;
  label: string;
  icon: React.ReactNode;
  description: string;
}

// =============================================================================
// Constants
// =============================================================================

const SECTIONS: SectionConfig[] = [
  {
    id: 'visibility',
    label: 'Visibility',
    icon: <Eye className="w-4 h-4" />,
    description: 'Control which fields are publicly visible',
  },
  {
    id: 'theme',
    label: 'Theme',
    icon: <Palette className="w-4 h-4" />,
    description: 'Choose a design template for your profile',
  },
  {
    id: 'colors',
    label: 'Colors',
    icon: <Palette className="w-4 h-4" />,
    description: 'Customize your brand color palette',
  },
  {
    id: 'typography',
    label: 'Typography',
    icon: <Type className="w-4 h-4" />,
    description: 'Select fonts for headings and body text',
  },
  {
    id: 'assets',
    label: 'Brand Assets',
    icon: <Image className="w-4 h-4" />,
    description: 'Manage logo variants and visual assets',
  },
  {
    id: 'versions',
    label: 'Version History',
    icon: <History className="w-4 h-4" />,
    description: 'View and restore previous versions',
  },
];

// =============================================================================
// Component
// =============================================================================

export const ProfileEditorContainer: React.FC<ProfileEditorContainerProps> = ({
  workspaceId,
}) => {
  // State
  const [expandedSections, setExpandedSections] = useState<Set<EditorSection>>(
    new Set(['visibility'])
  );

  // Editor hook
  const {
    profile,
    visibility,
    theme,
    customization,
    isLoading,
    isSaving,
    error,
    isDirty,
    canUndo,
    canRedo,
    undo,
    redo,
    deviceMode,
    setDeviceMode,
    updateVisibility,
    setTheme,
    updateColors,
    updateTypography,
    publishProfile,
    createSnapshot,
    restoreVersion,
  } = useProfileEditor({ workspaceId });

  // Toggle section expansion
  const toggleSection = useCallback((sectionId: EditorSection) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      }
      // Redo: Ctrl/Cmd + Shift + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (canRedo) redo();
      }
      // Save: Ctrl/Cmd + S (create snapshot)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        createSnapshot('Manual save');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo, createSnapshot]);

  // Render section content
  const renderSectionContent = (sectionId: EditorSection) => {
    switch (sectionId) {
      case 'visibility':
        return (
          <VisibilityControls
            visibility={visibility}
            onUpdate={updateVisibility}
            profile={profile}
          />
        );
      case 'theme':
        return (
          <ThemeGallery
            selectedThemeId={theme?.theme_id}
            onSelectTheme={setTheme}
            workspaceId={workspaceId}
          />
        );
      case 'colors':
        return (
          <ColorPaletteBuilder
            currentPalette={customization?.custom_colors}
            themePalette={theme?.base_colors}
            onUpdate={updateColors}
            logoUrl={profile?.logo_url}
          />
        );
      case 'typography':
        return (
          <TypographyManager
            currentTypography={customization?.custom_typography}
            themeTypography={theme?.default_typography}
            onUpdate={updateTypography}
            workspaceId={workspaceId}
          />
        );
      case 'assets':
        return (
          <div className="p-4 text-text-secondary text-sm">
            Brand asset management will be available in a future update.
          </div>
        );
      case 'versions':
        return (
          <VersionHistory
            workspaceId={workspaceId}
            onRestore={restoreVersion}
          />
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-error mb-4">{error.message}</p>
          <AppButton variant="outline" onClick={() => window.location.reload()}>
            Retry
          </AppButton>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header Toolbar */}
      <header className="flex-shrink-0 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Title and Status */}
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-text-primary">Profile Editor</h1>
            {isDirty && (
              <span className="text-xs bg-warning/10 text-warning px-2 py-1 rounded">
                Unsaved changes
              </span>
            )}
            {isSaving && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded flex items-center gap-1">
                <div className="animate-spin rounded-full h-3 w-3 border-b border-primary"></div>
                Saving...
              </span>
            )}
          </div>

          {/* Center: Device Mode Selector */}
          <div className="flex items-center gap-1 bg-surface-hover rounded-lg p-1">
            <button
              onClick={() => setDeviceMode('phone')}
              className={`p-2 rounded transition-colors ${
                deviceMode === 'phone'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-surface'
              }`}
              aria-label="Phone preview"
              title="Phone (375px)"
            >
              <Smartphone className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDeviceMode('tablet')}
              className={`p-2 rounded transition-colors ${
                deviceMode === 'tablet'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-surface'
              }`}
              aria-label="Tablet preview"
              title="Tablet (768px)"
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDeviceMode('desktop')}
              className={`p-2 rounded transition-colors ${
                deviceMode === 'desktop'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-surface'
              }`}
              aria-label="Desktop preview"
              title="Desktop (1440px)"
            >
              <Monitor className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Undo/Redo */}
            <div className="flex items-center gap-1 mr-2">
              <AppButton
                variant="ghost"
                size="icon"
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </AppButton>
              <AppButton
                variant="ghost"
                size="icon"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </AppButton>
            </div>

            {/* Share Preview */}
            <AppButton variant="outline" size="sm">
              <Share2 className="w-4 h-4 mr-2" />
              Share Preview
            </AppButton>

            {/* Publish */}
            <AppButton
              variant="primary"
              size="sm"
              onClick={() => publishProfile()}
              disabled={isSaving}
            >
              <Globe className="w-4 h-4 mr-2" />
              Publish
            </AppButton>
          </div>
        </div>
      </header>

      {/* Main Content: Sidebar + Preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Editor Controls */}
        <aside
          className="w-80 flex-shrink-0 border-r border-border bg-surface overflow-y-auto"
          role="complementary"
          aria-label="Editor controls"
        >
          <nav className="p-4 space-y-2">
            {SECTIONS.map((section) => (
              <div key={section.id} className="border border-border rounded-lg overflow-hidden">
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between p-3 hover:bg-surface-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-expanded={expandedSections.has(section.id)}
                  aria-controls={`section-${section.id}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-text-secondary">{section.icon}</span>
                    <div className="text-left">
                      <span className="font-medium text-text-primary block">
                        {section.label}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {section.description}
                      </span>
                    </div>
                  </div>
                  {expandedSections.has(section.id) ? (
                    <ChevronDown className="w-4 h-4 text-text-secondary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-text-secondary" />
                  )}
                </button>

                {/* Section Content */}
                {expandedSections.has(section.id) && (
                  <div
                    id={`section-${section.id}`}
                    className="border-t border-border"
                    role="region"
                    aria-label={`${section.label} settings`}
                  >
                    {renderSectionContent(section.id)}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main: Live Preview */}
        <main className="flex-1 bg-background overflow-hidden" role="main">
          <LivePreviewPanel
            profile={profile}
            visibility={visibility}
            theme={theme}
            customization={customization}
            deviceMode={deviceMode}
          />
        </main>
      </div>
    </div>
  );
};

export default ProfileEditorContainer;
