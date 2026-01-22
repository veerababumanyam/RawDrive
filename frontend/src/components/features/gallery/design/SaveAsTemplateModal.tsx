/**
 * Save as Template Modal
 *
 * Allows users to save current design as a reusable template with:
 * - Template name (required, unique)
 * - Category selection (wedding, portrait, event, product, landscape, other)
 * - Description (optional)
 * - Tags (optional, comma-separated)
 * - Validation and error handling
 *
 * Feature: Enhancement 3 - Custom Templates
 */

import React, { useState } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';

interface SaveAsTemplateModalProps {
  currentDesignConfig: any;
  onSave: (template: {
    name: string;
    description?: string;
    category: string;
    tags: string[];
    design_config: any;
  }) => Promise<void>;
  onClose: () => void;
}

const CATEGORIES = [
  { id: 'wedding', label: 'Wedding' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'event', label: 'Event' },
  { id: 'product', label: 'Product' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'other', label: 'Other' },
];

export const SaveAsTemplateModal: React.FC<SaveAsTemplateModalProps> = ({
  currentDesignConfig,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    if (name.length > 200) {
      setError('Template name must be 200 characters or less');
      return;
    }

    // Parse tags from comma-separated input
    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    if (tags.length > 10) {
      setError('Maximum 10 tags allowed');
      return;
    }

    try {
      setLoading(true);

      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        tags,
        design_config: currentDesignConfig,
      });

      setSuccess(true);

      // Close modal after 1 second to show success
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save template. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-default">
          <h2 className="text-xl font-semibold text-text-primary">Save as Template</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-secondary rounded-lg transition-colors"
            aria-label="Close"
            disabled={loading}
          >
            <X className="w-6 h-6 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Success State */}
          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-900">Template saved successfully!</p>
                <p className="text-sm text-green-800 mt-1">
                  Your template is now available in the template library.
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Error</p>
                <p className="text-sm text-red-800 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Template Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">
              Template Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Elegant Wedding 2025"
              maxLength={200}
              className="w-full px-3 py-2 border border-border-default rounded-lg bg-bg-primary text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50"
              disabled={loading}
            />
            <p className="text-xs text-text-tertiary">
              {name.length}/200 characters
            </p>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-border-default rounded-lg bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50"
              disabled={loading}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">
              Description <span className="text-text-tertiary text-xs">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this template for future reference..."
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 border border-border-default rounded-lg bg-bg-primary text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none disabled:opacity-50"
              disabled={loading}
            />
            <p className="text-xs text-text-tertiary">
              {description.length}/500 characters
            </p>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">
              Tags <span className="text-text-tertiary text-xs">(optional, comma-separated)</span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g., elegant, romantic, classic"
              className="w-full px-3 py-2 border border-border-default rounded-lg bg-bg-primary text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50"
              disabled={loading}
            />
            <p className="text-xs text-text-tertiary">
              Add tags to make this template easier to find (max 10)
            </p>
          </div>

          {/* Current Design Info */}
          <div className="p-3 bg-bg-secondary rounded-lg border border-border-default text-sm">
            <p className="text-text-secondary font-medium mb-2">Current Design:</p>
            <ul className="text-text-tertiary space-y-1 text-xs">
              <li>
                • Cover Style:{' '}
                <span className="text-text-primary capitalize">
                  {currentDesignConfig?.cover?.style || 'Not set'}
                </span>
              </li>
              <li>
                • Theme:{' '}
                <span className="text-text-primary capitalize">
                  {currentDesignConfig?.theme?.id || 'Not set'}
                </span>
              </li>
              <li>
                • Font Pairing:{' '}
                <span className="text-text-primary capitalize">
                  {currentDesignConfig?.typography?.pairingId || 'Not set'}
                </span>
              </li>
              <li>
                • Grid Style:{' '}
                <span className="text-text-primary capitalize">
                  {currentDesignConfig?.grid?.style || 'Not set'}
                </span>
              </li>
            </ul>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border-default bg-bg-secondary">
          <AppButton
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </AppButton>
          <AppButton
            onClick={handleSubmit}
            isLoading={loading}
            disabled={!name.trim() || success}
          >
            Save Template
          </AppButton>
        </div>
      </div>
    </div>
  );
};

export default SaveAsTemplateModal;
