import React, { useState, useCallback } from 'react';
import { Upload, X, FileVideo, FileAudio, CheckCircle, AlertCircle } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';

// TODO: Import from a centralized API service
const API_BASE_URL = '/api/v1';

import type { InvitationMedia } from '@/types/invitations';

interface MediaUploaderProps {
  workspaceId: string;
  invitationId: string;
  onUploadComplete?: (media: InvitationMedia) => void;
  className?: string;
}

interface UploadState {
  progress: number;
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  workspaceId,
  invitationId,
  onUploadComplete,
  className = '',
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({
    progress: 0,
    status: 'idle',
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    // Validate file type
    const validTypes = ['video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/wav'];
    if (!validTypes.includes(file.type)) {
      setUploadState({
        progress: 0,
        status: 'error',
        error: 'Invalid file type. Please upload MP4, MOV, MP3, or WAV.',
      });
      return;
    }

    // Validate size (e.g., 100MB limit)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      setUploadState({
        progress: 0,
        status: 'error',
        error: 'File too large. Maximum size is 100MB.',
      });
      return;
    }

    setFile(file);
    setUploadState({ progress: 0, status: 'idle' });
  };

  const uploadFile = async () => {
    if (!file) return;

    try {
      setUploadState({ progress: 0, status: 'uploading' });

      // 1. Initiate Upload
      const initResponse = await fetch(
        `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/media`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
            media_type: file.type.startsWith('video/') ? 'video' : 'audio',
          }),
        }
      );

      if (!initResponse.ok) {
        throw new Error('Failed to initiate upload');
      }

      const { media, upload_url } = await initResponse.json();

      // 2. Upload to R2
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', upload_url, true);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadState((prev) => ({ ...prev, progress: percentComplete }));
        }
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error('Upload to storage failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      // 3. Complete Upload
      setUploadState((prev) => ({ ...prev, status: 'processing' }));
      
      const completeResponse = await fetch(
        `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/media/${media.media_id}/complete`,
        {
          method: 'PUT',
        }
      );

      if (!completeResponse.ok) {
        throw new Error('Failed to complete upload');
      }

      setUploadState({ progress: 100, status: 'completed' });
      if (onUploadComplete) {
        onUploadComplete(media);
      }

    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadState({
        progress: 0,
        status: 'error',
        error: err.message || 'Upload failed',
      });
    }
  };

  const resetUpload = () => {
    setFile(null);
    setUploadState({ progress: 0, status: 'idle' });
  };

  return (
    <div className={`w-full ${className}`}>
        {/* Upload Area */}
        {uploadState.status === 'idle' || uploadState.status === 'error' ? (
            <div
            className={`relative border-2 border-dashed rounded-xl p-8 transition-colors ${
                dragActive ? 'border-primary bg-primary/5' : 'border-border'
            } ${uploadState.status === 'error' ? 'border-destructive/50 bg-destructive/5' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            >
            <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleChange}
                accept="video/*,audio/*"
            />
            
            <div className="flex flex-col items-center justify-center text-center">
                {file ? (
                <div className="flex flex-col items-center gap-2">
                    {file.type.startsWith('video/') ? (
                    <FileVideo className="w-10 h-10 text-primary" />
                    ) : (
                    <FileAudio className="w-10 h-10 text-primary" />
                    )}
                    <div>
                    <p className="font-medium text-text-primary">{file.name}</p>
                    <p className="text-sm text-text-secondary">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                    </div>
                </div>
                ) : (
                <>
                    <Upload className="w-10 h-10 text-text-tertiary mb-3" />
                    <p className="font-medium text-text-primary mb-1">
                    Click to upload or drag and drop
                    </p>
                    <p className="text-sm text-text-secondary">
                    MP4, MOV, MP3, WAV (max 100MB)
                    </p>
                </>
                )}
            </div>

            {/* Error Message */}
            {uploadState.status === 'error' && (
                <div className="absolute bottom-4 left-0 right-0 text-center text-sm text-destructive font-medium flex items-center justify-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {uploadState.error}
                </div>
            )}
            </div>
        ) : null}

        {/* Action Buttons */}
        {uploadState.status === 'idle' && file && (
            <div className="flex gap-3 mt-4">
            <AppButton variant="outline" className="flex-1" onClick={resetUpload}>
                Cancel
            </AppButton>
            <AppButton variant="primary" className="flex-1" onClick={uploadFile}>
                Upload
            </AppButton>
            </div>
        )}

      {/* Progress View */}
      {(uploadState.status === 'uploading' || uploadState.status === 'processing') && (
        <div className="border border-border rounded-xl p-6 bg-surface">
            <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-primary">
                {uploadState.status === 'uploading' ? 'Uploading...' : 'Processing...'}
            </span>
            <span className="text-sm text-text-secondary">
                {Math.round(uploadState.progress)}%
            </span>
            </div>
            <div className="h-2 bg-border rounded-full overflow-hidden">
            <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${uploadState.progress}%` }}
            />
            </div>
            {uploadState.status === 'processing' && (
            <p className="text-xs text-text-tertiary mt-2">
                Optimizing media for playback...
            </p>
            )}
        </div>
      )}

      {/* Completed View */}
      {uploadState.status === 'completed' && (
        <div className="border border-green-200 bg-green-50 rounded-xl p-6 flex flex-col items-center justify-center text-center">
            <CheckCircle className="w-10 h-10 text-green-500 mb-2" />
            <p className="font-medium text-green-800">Upload Complete</p>
            <p className="text-sm text-green-600 mb-4">
            Your media has been added to the invitation.
            </p>
            <AppButton variant="outline" size="sm" onClick={resetUpload}>
            Upload Another
            </AppButton>
        </div>
      )}
    </div>
  );
};
