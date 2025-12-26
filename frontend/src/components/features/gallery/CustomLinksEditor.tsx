/**
 * CustomLinksEditor Component
 * Editor for custom navigation links in gallery header/footer
 */

import React, { useState } from 'react';
import { Link2, Plus, Trash2, GripVertical } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { AppInput } from '../../ui/AppInput';
import { AppButton } from '../../ui/AppButton';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';

export interface CustomLink {
  label: string;
  url: string;
}

export interface CustomLinksEditorProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

export const CustomLinksEditor: React.FC<CustomLinksEditorProps> = ({ gallery, onUpdate }) => {
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const links = gallery.custom_links || [];

  const handleAddLink = () => {
    if (newLabel.trim() && newUrl.trim()) {
      const updatedLinks = [...links, { label: newLabel.trim(), url: newUrl.trim() }];
      onUpdate({ custom_links: updatedLinks });
      setNewLabel('');
      setNewUrl('');
    }
  };

  const handleRemoveLink = (index: number) => {
    const updatedLinks = links.filter((_, i) => i !== index);
    onUpdate({ custom_links: updatedLinks.length > 0 ? updatedLinks : null });
  };

  const handleUpdateLink = (index: number, field: 'label' | 'url', value: string) => {
    const updatedLinks = links.map((link, i) =>
      i === index ? { ...link, [field]: value } : link
    );
    onUpdate({ custom_links: updatedLinks });
  };

  return (
    <AppCard padding="md">
      <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Link2 size={20} />
        Custom Navigation Links
      </h3>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Add custom links to display in the gallery header or footer. These can link to your website, 
          social profiles, or other resources.
        </p>

        {/* Existing Links */}
        {links.length > 0 && (
          <div className="space-y-2">
            {links.map((link, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-3 bg-surface-hover rounded-lg border border-border"
              >
                <GripVertical size={16} className="text-text-tertiary cursor-grab" />
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <AppInput
                    type="text"
                    value={link.label}
                    onChange={(e) => handleUpdateLink(index, 'label', e.target.value)}
                    placeholder="Link Label"
                  />
                  <AppInput
                    type="url"
                    value={link.url}
                    onChange={(e) => handleUpdateLink(index, 'url', e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <AppButton
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveLink(index)}
                  className="text-error hover:text-error"
                >
                  <Trash2 size={16} />
                </AppButton>
              </div>
            ))}
          </div>
        )}

        {/* Add New Link */}
        <div className="flex flex-col md:flex-row gap-2">
          <AppInput
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Link label (e.g., My Website)"
            className="flex-1"
          />
          <AppInput
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1"
          />
          <AppButton
            variant="outline"
            size="md"
            onClick={handleAddLink}
            disabled={!newLabel.trim() || !newUrl.trim()}
            className="shrink-0"
          >
            <Plus size={16} className="mr-1" />
            Add Link
          </AppButton>
        </div>

        {links.length === 0 && (
          <div className="text-center py-6 text-text-tertiary">
            <Link2 size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No custom links added yet</p>
          </div>
        )}
      </div>
    </AppCard>
  );
};
