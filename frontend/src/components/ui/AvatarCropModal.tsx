import React, { useState, useCallback, useEffect } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { AppButton } from './AppButton';

/* =============================================================================
   AvatarCropModal Component

   A modal for cropping and adjusting avatar images before upload.
   Features: zoom, pan, circular crop preview.
   ============================================================================= */

interface AvatarCropModalProps {
  /** Image source (data URL or blob URL) */
  imageSrc: string;
  /** Callback when crop is confirmed */
  onCropComplete: (croppedImage: Blob, cropData: CropData) => void;
  /** Callback when modal is closed/cancelled */
  onCancel: () => void;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Loading state during upload */
  isLoading?: boolean;
}

export interface CropData {
  crop_x: number;  // X offset percentage (0-100)
  crop_y: number;  // Y offset percentage (0-100)
  crop_scale: number;  // Zoom level
}

// Helper function to create cropped image
const createCroppedImage = async (
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Set canvas size to crop area
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      'image/webp',
      0.9
    );
  });
};

// Helper to load image
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.crossOrigin = 'anonymous';
    image.src = url;
  });

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  imageSrc,
  onCropComplete,
  onCancel,
  isOpen,
  isLoading = false,
}) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Cleanup blob URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (imageSrc && imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc]);

  const onCropChange = useCallback((crop: Point) => {
    setCrop(crop);
  }, []);

  const onZoomChange = useCallback((zoom: number) => {
    setZoom(zoom);
  }, []);

  const onCropAreaComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) return;

    try {
      const croppedImage = await createCroppedImage(imageSrc, croppedAreaPixels);

      // Calculate crop data percentages
      const cropData: CropData = {
        crop_x: crop.x + 50, // Convert from -50 to 50 range to 0-100
        crop_y: crop.y + 50,
        crop_scale: zoom,
      };

      onCropComplete(croppedImage, cropData);
    } catch (error) {
      console.error('Failed to crop image:', error);
    }
  }, [croppedAreaPixels, imageSrc, crop, zoom, onCropComplete]);

  const handleReset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.1, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.1, 1));
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-surface rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Adjust Photo</h2>
          <button
            onClick={onCancel}
            className="p-3 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Cropper Area */}
        <div className="relative h-80 bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropAreaComplete}
          />
        </div>

        {/* Controls */}
        <div className="px-6 py-4 space-y-4">
          {/* Zoom Slider */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleZoomOut}
              className="p-3 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Zoom out"
            >
              <ZoomOut size={18} />
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-border rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-primary
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:transition-transform
                [&::-webkit-slider-thumb]:hover:scale-110"
              aria-label="Zoom level"
            />
            <button
              onClick={handleZoomIn}
              className="p-3 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Zoom in"
            >
              <ZoomIn size={18} />
            </button>
          </div>

          {/* Reset Button */}
          <div className="flex justify-center">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <AppButton
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? 'Uploading...' : 'Save Photo'}
          </AppButton>
        </div>
      </div>
    </div>
  );
};

export default AvatarCropModal;
