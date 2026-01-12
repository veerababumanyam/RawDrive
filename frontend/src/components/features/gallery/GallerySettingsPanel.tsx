/**
 * GallerySettingsPanel Component
 * Slide-in panel for gallery settings
 * Organizes settings into sections: General, Access, Downloads, Branding,
 * Interactions, Watermark, FindMe, Slideshow, Notifications, AI
 */

import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { useToast } from '../../ui/Toast';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';
import { AccessSettings } from './AccessSettings';
import { DownloadSettings } from './DownloadSettings';
import { BrandingSettings } from './BrandingSettings';
import { AISettings } from './AISettings';
import { ClientInteractionSettings } from './ClientInteractionSettings';
import { WatermarkSettings } from './WatermarkSettings';
import { FindMeSettings } from './FindMeSettings';
import { SlideshowSettings } from './SlideshowSettings';
import { GalleryNotificationSettings } from './GalleryNotificationSettings';

export interface GallerySettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  gallery: GalleryDetailData;
  onSave: (updates: GalleryUpdateRequest) => Promise<void>;
  isLoading?: boolean;
}

export const GallerySettingsPanel: React.FC<GallerySettingsPanelProps> = ({
  isOpen,
  onClose,
  gallery,
  onSave,
}) => {
  const { addToast } = useToast();
  const [activeSection, setActiveSection] = useState<
    'general' | 'access' | 'downloads' | 'branding' | 'interactions' | 'watermark' | 'findme' | 'slideshow' | 'notifications' | 'ai'
  >('general');
  const [isSaving, setIsSaving] = useState(false);
  const [updates, setUpdates] = useState<Partial<GalleryUpdateRequest>>({});

  // Reset state when panel opens/closes or gallery changes to prevent stale data
  useEffect(() => {
    if (isOpen) {
      setUpdates({});
      // Reset to general section when opening to ensure fresh state
      setActiveSection('general');
    }
  }, [isOpen, gallery.gallery_id]); // Also reset when gallery ID changes

  // Handle Escape key to close modal (WCAG 2.1 AA requirement)
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isSaving, onClose]);

  const handleSave = async () => {
    if (Object.keys(updates).length === 0) {
      addToast({ message: 'No changes to save', variant: 'info' });
      return;
    }

    setIsSaving(true);
    try {
      await onSave(updates);
      setUpdates({});
      addToast({ message: 'Settings saved successfully', variant: 'success' });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save settings';
      addToast({ message, variant: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = (sectionUpdates: Partial<GalleryUpdateRequest>) => {
    setUpdates((prev) => ({ ...prev, ...sectionUpdates }));
  };

  if (!isOpen) return null;

  const sections = [
    { id: 'general' as const, label: 'General' },
    { id: 'access' as const, label: 'Access' },
    { id: 'downloads' as const, label: 'Downloads' },
    { id: 'branding' as const, label: 'Branding' },
    { id: 'interactions' as const, label: 'Interactions' },
    { id: 'watermark' as const, label: 'Watermark' },
    { id: 'findme' as const, label: 'FindMe' },
    { id: 'slideshow' as const, label: 'Slideshow' },
    { id: 'notifications' as const, label: 'Alerts' },
    { id: 'ai' as const, label: 'AI' },
  ];

  const panel = (
    <div
      className="fixed inset-0 z-[9999] flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-panel-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-2xl h-full bg-surface shadow-2xl animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 id="settings-panel-title" className="text-2xl font-bold text-text-primary">
            Settings: {gallery.title}
          </h2>
          <AppButton
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={20} />
          </AppButton>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`
                px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap
                border-b-2
                ${
                  activeSection === section.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }
              `}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeSection === 'general' && (
            <div className="space-y-6">
              <AppCard padding="md">
                <h3 className="text-lg font-semibold text-text-primary mb-4">General Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Gallery Title
                    </label>
                    <input
                      type="text"
                      defaultValue={gallery.title}
                      onChange={(e) => handleUpdate({ title: e.target.value })}
                      className="w-full px-4 py-2 bg-surface border border-border rounded-input text-text-primary"
                      maxLength={255}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Description
                    </label>
                  <textarea
                    defaultValue={gallery.description || ''}
                    onChange={(e) => handleUpdate({ description: e.target.value || undefined })}
                    className="w-full px-4 py-2 bg-surface border border-border rounded-input text-text-primary"
                    rows={4}
                    maxLength={1000}
                  />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Client Name
                    </label>
                    <input
                      type="text"
                      defaultValue={gallery.client_name || ''}
                      onChange={(e) => handleUpdate({ client_name: e.target.value.trim() || undefined })}
                      className="w-full px-4 py-2 bg-surface border border-border rounded-input text-text-primary"
                      maxLength={255}
                    />
                  </div>
                </div>
              </AppCard>
            </div>
          )}

          {activeSection === 'access' && (
            <AccessSettings
              gallery={gallery}
              onUpdate={handleUpdate}
            />
          )}

          {activeSection === 'downloads' && (
            <DownloadSettings
              gallery={gallery}
              onUpdate={handleUpdate}
            />
          )}

          {activeSection === 'branding' && (
            <BrandingSettings
              gallery={gallery}
              onUpdate={handleUpdate}
            />
          )}

          {activeSection === 'interactions' && (
            <ClientInteractionSettings
              gallery={gallery}
              onUpdate={handleUpdate}
            />
          )}

          {activeSection === 'watermark' && (
            <WatermarkSettings
              gallery={gallery}
              onUpdate={handleUpdate}
            />
          )}

          {activeSection === 'findme' && (
            <FindMeSettings
              gallery={gallery}
              onUpdate={handleUpdate}
            />
          )}

          {activeSection === 'slideshow' && (
            <SlideshowSettings
              gallery={gallery}
              onUpdate={handleUpdate}
            />
          )}

          {activeSection === 'notifications' && (
            <GalleryNotificationSettings
              gallery={gallery}
              onUpdate={handleUpdate}
            />
          )}

          {activeSection === 'ai' && (
            <AISettings gallery={gallery} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-surface-hover">
          <AppButton variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            onClick={handleSave}
            disabled={isSaving || Object.keys(updates).length === 0}
            leftIcon={isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </AppButton>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
};

