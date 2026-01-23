import React, { useState, useRef, useCallback } from 'react';
import { Camera, Trash2, Loader2 } from 'lucide-react';
import { AppButton } from '../ui/AppButton';
import { AvatarCropModal } from '../ui/AvatarCropModal';
import type { CropData } from '../ui/AvatarCropModal';
import { useAvatarUrl } from '../../hooks/useAvatarUrl';

/* =============================================================================
   AvatarUploader Component

   Allows users to upload, crop, and manage their profile avatar.
   Features:
   - File selection with validation (JPEG, PNG, WebP, max 5MB)
   - Crop/zoom modal integration
   - Delete functionality
   - Accessible keyboard navigation
   ============================================================================= */

interface AvatarUploaderProps {
  /** Current avatar URL */
  currentAvatarUrl?: string | null;
  /** User's display name for fallback initials */
  displayName: string;
  /** Callback when avatar is uploaded successfully */
  onUpload: (file: File, cropData?: CropData) => Promise<void>;
  /** Callback when avatar is deleted */
  onDelete: () => Promise<void>;
  /** Whether upload is in progress */
  isUploading?: boolean;
  /** Whether delete is in progress */
  isDeleting?: boolean;
}

// Allowed file types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Generate initials from display name
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const AvatarUploader: React.FC<AvatarUploaderProps> = ({
  currentAvatarUrl,
  displayName,
  onUpload,
  onDelete,
  isUploading = false,
  isDeleting = false,
}) => {
  // Resolve avatar URL (handles authenticated API endpoints)
  const resolvedAvatarUrl = useAvatarUrl(currentAvatarUrl);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please select a JPEG, PNG, or WebP image');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError('Image must be less than 5MB');
      return;
    }

    // Create preview URL and open crop modal
    const imageUrl = URL.createObjectURL(file);
    setSelectedImageUrl(imageUrl);
    setSelectedFile(file);
    setCropModalOpen(true);

    // Reset input value to allow selecting same file again
    event.target.value = '';
  }, []);

  const handleCropComplete = useCallback(async (croppedBlob: Blob, cropData: CropData) => {
    if (!selectedFile) return;

    try {
      // Convert the cropped blob to a File (frontend already created perfect crop)
      const croppedFile = new File([croppedBlob], selectedFile.name, {
        type: 'image/webp',
        lastModified: Date.now(),
      });
      // Send the cropped file to backend (no re-cropping needed)
      await onUpload(croppedFile, cropData);
      setCropModalOpen(false);
    } catch (err) {
      // Error handling is done by parent, but we keep modal open
      console.error('Upload failed:', err);
    } finally {
      // Cleanup
      if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
      }
      setSelectedImageUrl(null);
      setSelectedFile(null);
    }
  }, [selectedFile, selectedImageUrl, onUpload]);

  const handleCropCancel = useCallback(() => {
    setCropModalOpen(false);
    if (selectedImageUrl) {
      URL.revokeObjectURL(selectedImageUrl);
    }
    setSelectedImageUrl(null);
    setSelectedFile(null);
  }, [selectedImageUrl]);

  const handleDeleteClick = useCallback(async () => {
    if (window.confirm('Are you sure you want to remove your avatar?')) {
      await onDelete();
    }
  }, [onDelete]);

  const handleAvatarClick = useCallback(() => {
    if (!isUploading && !isDeleting) {
      fileInputRef.current?.click();
    }
  }, [isUploading, isDeleting]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleAvatarClick();
    }
  }, [handleAvatarClick]);

  const isLoading = isUploading || isDeleting;
  const initials = getInitials(displayName);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar Preview */}
      <div className="relative group">
        <button
          type="button"
          onClick={handleAvatarClick}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className={`
            relative w-32 h-32 rounded-full overflow-hidden
            border-4 border-border hover:border-primary
            transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
            ${isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
          `}
          aria-label={currentAvatarUrl ? 'Change avatar' : 'Upload avatar'}
        >
          {resolvedAvatarUrl ? (
            <img
              src={resolvedAvatarUrl}
              alt={`${displayName}'s avatar`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-primary/10 flex items-center justify-center">
              <span className="text-3xl font-semibold text-primary">{initials}</span>
            </div>
          )}

          {/* Hover overlay */}
          {!isLoading && (
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-8 h-8 text-white" />
            </div>
          )}

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}
        </button>

        {/* Delete button */}
        {currentAvatarUrl && !isLoading && (
          <button
            type="button"
            onClick={handleDeleteClick}
            className="absolute -bottom-1 -right-1 p-2 rounded-full bg-surface border border-border shadow-sm
              hover:bg-error/10 hover:border-error hover:text-error
              transition-colors focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2"
            aria-label="Delete avatar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleFileSelect}
        className="sr-only"
        aria-label="Select avatar image"
      />

      {/* Action buttons */}
      <div className="flex gap-2">
        <AppButton
          variant="outline"
          size="sm"
          onClick={handleAvatarClick}
          disabled={isLoading}
        >
          <Camera className="w-4 h-4 mr-2" />
          {currentAvatarUrl ? 'Change Photo' : 'Upload Photo'}
        </AppButton>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}

      {/* Helper text */}
      <p className="text-xs text-text-tertiary text-center">
        JPEG, PNG or WebP. Max 5MB.
      </p>

      {/* Avatar Crop Modal */}
      {selectedImageUrl && (
        <AvatarCropModal
          imageSrc={selectedImageUrl}
          isOpen={cropModalOpen}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          isLoading={isUploading}
        />
      )}
    </div>
  );
};

export default AvatarUploader;
