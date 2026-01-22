/**
 * Cover Photo Uploader Component
 *
 * Handles cover photo selection with two modes:
 * - Upload new: Drag-and-drop file upload
 * - Select from gallery: Choose existing assets
 *
 * Features:
 * - Tab switcher for upload/select modes
 * - File validation (15MB max, JPEG/PNG/WebP)
 * - Progress indication
 * - Preview display
 * - Integration with asset picker
 *
 * Feature: Gallery Design Studio - Cover Photo Management
 */

import React, { useRef, useState } from 'react';
import AssetPickerModal from './AssetPickerModal';
import { AppButton } from '../../../ui/AppButton';

interface CoverPhotoUploaderProps {
  galleryId: string;
  onUploadStart: () => void;
  onUploadProgress: (progress: number) => void;
  onUploadComplete: (assetId: string, coverUrl: string) => void;
  onAssetSelected: (assetId: string, imageUrl: string) => void;
  onUploadError: (error: string) => void;
}

type UploadTab = 'upload' | 'select';

export const CoverPhotoUploader: React.FC<CoverPhotoUploaderProps> = ({
  galleryId,
  onUploadStart,
  onUploadProgress,
  onUploadComplete,
  onAssetSelected,
  onUploadError,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<UploadTab>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  const MAX_SIZE = 15 * 1024 * 1024; // 15MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: 'Only JPEG, PNG, and WebP images are supported',
      };
    }

    if (file.size > MAX_SIZE) {
      return {
        valid: false,
        error: 'File size must be less than 15MB',
      };
    }

    return { valid: true };
  };

  const handleFile = async (file: File) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      onUploadError(validation.error || 'Invalid file');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    await handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    onUploadStart();

    try {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          onUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 201) {
          const response = JSON.parse(xhr.responseText);
          onUploadComplete(response.asset_id, response.variants[0]?.url);
        } else {
          const error = JSON.parse(xhr.responseText);
          onUploadError(error.message || 'Upload failed');
        }
        setIsUploading(false);
      });

      xhr.addEventListener('error', () => {
        onUploadError('Network error during upload');
        setIsUploading(false);
      });

      xhr.open('POST', `/api/v1/galleries/${galleryId}/cover`);
      xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('auth_token')}`);
      xhr.send(formData);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed';
      onUploadError(message);
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleAssetSelect = (asset: any) => {
    const imageUrl = asset.asset.preview_url || asset.asset.thumbnail_url;
    onAssetSelected(asset.asset_id, imageUrl);
    setShowAssetPicker(false);
  };

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-sm text-text-primary">Cover Photo</h3>

      {/* Tab Switcher */}
      <div className="flex gap-2 border-b border-border-default">
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'upload'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Upload New
        </button>
        <button
          onClick={() => setActiveTab('select')}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'select'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Select from Gallery
        </button>
      </div>

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <>
          {preview ? (
            <div className="relative">
              <img
                src={preview}
                alt="Cover preview"
                className="w-full h-48 object-cover rounded-lg"
              />
              <button
                onClick={() => setPreview(null)}
                className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded hover:bg-black/70"
                title="Remove preview"
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-accent-primary bg-accent-primary/5'
                  : 'border-border-default hover:border-accent-primary hover:bg-bg-secondary'
              } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="text-2xl mb-2">📸</div>
              <p className="text-sm text-text-primary font-medium">
                Drag and drop your cover photo
              </p>
              <p className="text-xs text-text-secondary mt-1">or click to browse</p>
              <p className="text-xs text-text-tertiary mt-2">
                JPEG, PNG or WebP • Max 15MB
              </p>

              {isUploading && (
                <div className="mt-3 text-xs text-accent-primary">
                  <div className="animate-spin inline-block">⟳</div> Uploading...
                </div>
              )}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            hidden
          />

          <p className="text-xs text-text-tertiary">
            Use the focal point picker below to adjust how the image is positioned on your
            cover.
          </p>
        </>
      )}

      {/* Select Tab */}
      {activeTab === 'select' && (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Choose an existing photo from your gallery to use as the cover image.
          </p>
          <AppButton onClick={() => setShowAssetPicker(true)} fullWidth>
            Choose Photo
          </AppButton>
        </div>
      )}

      {/* Asset Picker Modal */}
      {showAssetPicker && (
        <AssetPickerModal
          galleryId={galleryId}
          onSelect={handleAssetSelect}
          onClose={() => setShowAssetPicker(false)}
        />
      )}
    </div>
  );
};

export default CoverPhotoUploader;
