/**
 * ModelFormModal Component
 * Modal form for creating and editing Gemini models.
 * Feature: 003-user-gemini-settings
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import type {
  GeminiModelAdmin,
  CreateGeminiModelRequest,
  UpdateGeminiModelRequest,
} from '../../../types/geminiSettings';

interface ModelFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateGeminiModelRequest | UpdateGeminiModelRequest) => Promise<void>;
  model?: GeminiModelAdmin | null;
  isLoading: boolean;
}

export const ModelFormModal: React.FC<ModelFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  model,
  isLoading,
}) => {
  const isEdit = !!model;
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const getInitialFormData = useCallback(() => ({
    identifier: model?.identifier || '',
    display_name: model?.display_name || '',
    description: model?.description || '',
    capabilities: model?.capabilities?.join(', ') || '',
    sort_order: model?.sort_order?.toString() || '0',
    is_active: model?.is_active ?? true,
    is_default: model?.is_default ?? false,
  }), [model]);

  const [formData, setFormData] = useState(getInitialFormData);
  const [error, setError] = useState<string | null>(null);

  // Sync form state when model prop changes (fixes editing different models)
  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialFormData());
      setError(null);
    }
  }, [isOpen, model, getInitialFormData]);

  // Focus trap and initial focus
  useEffect(() => {
    if (!isOpen) return;

    // Focus first input on open
    const timer = setTimeout(() => {
      firstInputRef.current?.focus();
    }, 50);

    // Handle Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusableEls = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const firstEl = focusableEls[0];
        const lastEl = focusableEls[focusableEls.length - 1];

        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.identifier.trim() || !formData.display_name.trim()) {
      setError('Identifier and Display Name are required');
      return;
    }

    const data: CreateGeminiModelRequest | UpdateGeminiModelRequest = {
      ...(isEdit ? {} : { identifier: formData.identifier.trim() }),
      display_name: formData.display_name.trim(),
      description: formData.description.trim() || undefined,
      capabilities: formData.capabilities
        ? formData.capabilities.split(',').map((c) => c.trim()).filter(Boolean)
        : undefined,
      sort_order: parseInt(formData.sort_order) || 0,
      is_active: formData.is_active,
      is_default: formData.is_default,
    };

    try {
      await onSubmit(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save model');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="glass-card rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-form-title"
      >
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 id="model-form-title" className="text-xl font-semibold text-text-primary">
              {isEdit ? 'Edit Model' : 'Add New Model'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Model Identifier *
            </label>
            <AppInput
              ref={firstInputRef}
              value={formData.identifier}
              onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
              placeholder="gemini-2.0-flash"
              disabled={isEdit}
              className={isEdit ? 'opacity-60 cursor-not-allowed' : ''}
            />
            <p className="text-xs text-text-tertiary mt-1">
              {isEdit
                ? 'Identifier cannot be changed after creation'
                : 'The model identifier used by Gemini API (e.g., gemini-2.0-flash)'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Display Name *
            </label>
            <AppInput
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="Gemini 2.0 Flash"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Fast and efficient for most tasks"
              rows={3}
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Capabilities
            </label>
            <AppInput
              value={formData.capabilities}
              onChange={(e) => setFormData({ ...formData, capabilities: e.target.value })}
              placeholder="text, vision, code (comma-separated)"
            />
            <p className="text-xs text-text-tertiary mt-1">Comma-separated list of capabilities</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Sort Order
            </label>
            <AppInput
              type="number"
              value={formData.sort_order}
              onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })}
              placeholder="0"
              min="0"
            />
            <p className="text-xs text-text-tertiary mt-1">Lower numbers appear first</p>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
              />
              <span className="text-sm text-text-primary">Active</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
              />
              <span className="text-sm text-text-primary">Default Model</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t border-border">
            <AppButton type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </AppButton>
            <AppButton type="submit" variant="primary" disabled={isLoading} className="flex-1">
              {isLoading ? 'Saving...' : isEdit ? 'Update Model' : 'Add Model'}
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModelFormModal;
