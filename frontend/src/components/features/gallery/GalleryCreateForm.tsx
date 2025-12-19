/**
 * GalleryCreateForm Component
 * Form for creating a new gallery with validation
 * Property 4: Gallery Title Validation
 */

import React, { useState } from 'react';
import { AppInput } from '../../ui/AppInput';
import { AppButton } from '../../ui/AppButton';
import type { GalleryCreateRequest } from '../../../types/gallery';

export interface GalleryCreateFormProps {
  onSubmit: (data: GalleryCreateRequest) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

interface FormErrors {
  title?: string;
  description?: string;
  client_name?: string;
}

export const GalleryCreateForm: React.FC<GalleryCreateFormProps> = ({
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validateTitle = (value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'Gallery title is required';
    }
    if (trimmed.length > 255) {
      return 'Title must be 255 characters or less';
    }
    return undefined;
  };

  const validateDescription = (value: string): string | undefined => {
    if (value.length > 1000) {
      return 'Description must be 1000 characters or less';
    }
    return undefined;
  };

  const validateClientName = (value: string): string | undefined => {
    if (value.length > 255) {
      return 'Client name must be 255 characters or less';
    }
    return undefined;
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTitle(value);
    const error = validateTitle(value);
    setErrors((prev) => ({ ...prev, title: error }));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDescription(value);
    const error = validateDescription(value);
    setErrors((prev) => ({ ...prev, description: error }));
  };

  const handleClientNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setClientName(value);
    const error = validateClientName(value);
    setErrors((prev) => ({ ...prev, client_name: error }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Validate all fields
    const titleError = validateTitle(title);
    const descriptionError = validateDescription(description);
    const clientNameError = validateClientName(clientName);

    const newErrors: FormErrors = {};
    if (titleError) newErrors.title = titleError;
    if (descriptionError) newErrors.description = descriptionError;
    if (clientNameError) newErrors.client_name = clientNameError;

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        client_name: clientName.trim() || undefined,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create gallery');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title - Required */}
      <div>
        <AppInput
          label="Gallery Title"
          value={title}
          onChange={handleTitleChange}
          placeholder="e.g., Johnson Wedding"
          error={errors.title}
          isRequired
          inputSize="lg"
          autoFocus
          aria-describedby={errors.title ? 'title-error' : undefined}
        />
      </div>

      {/* Description - Optional */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-text-primary mb-1.5">
          Description <span className="text-text-tertiary text-xs">(optional)</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={handleDescriptionChange}
          placeholder="Add a description for this gallery..."
          rows={4}
          className={`
            w-full px-4 py-3
            bg-surface border rounded-input
            text-text-primary placeholder:text-text-tertiary
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
            resize-y
            min-h-[100px]
            ${errors.description ? 'border-error' : 'border-border'}
          `}
          aria-describedby={errors.description ? 'description-error' : 'description-helper'}
          aria-invalid={!!errors.description}
        />
        {errors.description && (
          <span id="description-error" className="text-error text-sm mt-1 block" role="alert">
            {errors.description}
          </span>
        )}
        <span id="description-helper" className="text-text-tertiary text-xs mt-1 block">
          {description.length}/1000 characters
        </span>
      </div>

      {/* Client Name - Optional */}
      <div>
        <AppInput
          label="Client Name"
          value={clientName}
          onChange={handleClientNameChange}
          placeholder="e.g., Sarah & Mike Johnson"
          error={errors.client_name}
          inputSize="lg"
          aria-describedby={errors.client_name ? 'client-name-error' : undefined}
        />
        <p className="text-text-tertiary text-xs mt-1">
          Optional: Name of the client for this gallery
        </p>
      </div>

      {/* Submit Error */}
      {submitError && (
        <div
          className="p-3 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-400 text-sm"
          role="alert"
        >
          {submitError}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        {onCancel && (
          <AppButton
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </AppButton>
        )}
        <AppButton
          type="submit"
          variant="primary"
          isLoading={isLoading}
          loadingText="Creating gallery..."
          disabled={isLoading || !title.trim()}
        >
          Create Gallery
        </AppButton>
      </div>
    </form>
  );
};

