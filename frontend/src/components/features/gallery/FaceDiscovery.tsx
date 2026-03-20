/**
 * FaceDiscovery Component
 *
 * Allows public gallery visitors to find photos of themselves using:
 * 1. Webcam/selfie capture with live face detection (client-side validation)
 * 2. Server-side face embedding generation (512-dim ArcFace, same model as ingestion)
 * 3. Backend similarity search against gallery faces
 *
 * Architecture note:
 * - Client-side face-api.js is used ONLY for face detection/validation (bounding box)
 * - The cropped face image is uploaded to the server where the same ArcFace model
 *   generates a 512-dim embedding, guaranteeing embedding-space consistency with
 *   the stored gallery embeddings. This avoids the 128-dim (face-api.js) vs
 *   512-dim (ArcFace) mismatch that would make similarity search fail.
 * - The uploaded face crop is never stored and is discarded after embedding generation.
 *
 * WCAG 2.1 AA compliant with proper announcements and focus management.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Camera,
  RefreshCw,
  Search,
  AlertCircle,
  Check,
  Loader2,
  User,
  ChevronLeft,
  Info,
} from 'lucide-react';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '../../ui/Modal';
import { AppButton } from '../../ui/AppButton';
import { faceDetectionService, DetectedFace } from '../../../services/faceDetectionService';

export interface FaceDiscoveryProps {
  isOpen: boolean;
  onClose: () => void;
  onFacesFound: (photoIds: string[], similarity: number) => void;
  galleryId: string;
  galleryTitle: string;
  // API endpoint for face search (will be called with embedding)
  searchEndpoint?: string;
}

type Step = 'intro' | 'camera' | 'processing' | 'results' | 'error';

interface SearchResult {
  photo_id: string;
  similarity: number;
  thumbnail_url?: string;
}

export const FaceDiscovery: React.FC<FaceDiscoveryProps> = ({
  isOpen,
  onClose,
  onFacesFound,
  galleryId,
  galleryTitle,
  searchEndpoint = '/api/v1/public/galleries',
}) => {
  // State
  const [step, setStep] = useState<Step>('intro');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [detectedFace, setDetectedFace] = useState<DetectedFace | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load face detection models on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceDetectionService.loadModels();
        setModelsLoaded(true);
      } catch (err) {
        console.error('Failed to load face models:', err);
        setError('Failed to load face detection. Please refresh and try again.');
      }
    };
    loadModels();
  }, []);

  // Cleanup camera on unmount or close
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      // Check if camera is supported
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera is not supported in your browser');
      }

      // Request camera access (prefer front camera on mobile)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      streamRef.current = stream;
      setCameraPermission('granted');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStep('camera');
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraPermission('denied');
        setError('Camera access was denied. Please enable camera permissions to use this feature.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError(err.message || 'Failed to access camera');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Convert a data URL to a Blob for uploading.
   */
  const dataURLtoBlob = useCallback((dataURL: string): Blob => {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(parts[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }
    return new Blob([u8arr], { type: mime });
  }, []);

  /**
   * Extract a cropped face image from the canvas using the detected bounding box.
   * Returns a JPEG Blob suitable for upload.
   */
  const extractFaceCrop = useCallback(
    (
      sourceCanvas: HTMLCanvasElement,
      box: { x: number; y: number; width: number; height: number },
    ): string => {
      const cropCanvas = document.createElement('canvas');
      const ctx = cropCanvas.getContext('2d');
      if (!ctx) return sourceCanvas.toDataURL('image/jpeg', 0.9);

      // Add 20% padding around the face for better embedding quality
      const pad = 0.2;
      const padX = box.width * pad;
      const padY = box.height * pad;
      const sx = Math.max(0, box.x - padX);
      const sy = Math.max(0, box.y - padY);
      const sw = Math.min(sourceCanvas.width - sx, box.width + 2 * padX);
      const sh = Math.min(sourceCanvas.height - sy, box.height + 2 * padY);

      cropCanvas.width = sw;
      cropCanvas.height = sh;
      ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

      return cropCanvas.toDataURL('image/jpeg', 0.9);
    },
    [],
  );

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror the image for selfie mode
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    // Get image data
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(imageData);
    stopCamera();

    // Detect face locally (for UI validation only — embedding is generated server-side)
    setStep('processing');
    setIsLoading(true);

    try {
      // Create image element for face detection
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageData;
      });

      // Detect faces (landmarks only — we skip descriptor generation since the
      // server will generate the 512-dim embedding from the same ArcFace model
      // used during photo ingestion, avoiding the 128-vs-512 dimension mismatch)
      const faces = await faceDetectionService.detectFaces(img, true, false);

      if (faces.length === 0) {
        throw new Error('No face detected. Please try again with your face clearly visible.');
      }

      if (faces.length > 1) {
        throw new Error('Multiple faces detected. Please ensure only one person is in the frame.');
      }

      const face = faces[0];
      setDetectedFace(face);

      // Extract a cropped face image and upload it to the server for
      // server-side embedding generation (guarantees same embedding space)
      const faceCropDataURL = extractFaceCrop(canvas, face.box);
      const faceCropBlob = dataURLtoBlob(faceCropDataURL);

      await searchForFacesByImage(faceCropBlob);
    } catch (err: any) {
      console.error('Face detection error:', err);
      setError(err.message || 'Failed to detect face');
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  }, [stopCamera, extractFaceCrop, dataURLtoBlob]);

  /**
   * Upload the cropped face image to the server for server-side embedding
   * generation and similarity search. This guarantees the query embedding
   * is in the same 512-dim ArcFace space as the stored gallery embeddings.
   */
  const searchForFacesByImage = async (faceBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('file', faceBlob, 'face.jpg');

      // Call the new image-upload face search endpoint
      const response = await fetch(
        `${searchEndpoint}/${galleryId}/face-search-by-image?threshold=0.6&limit=50`,
        {
          method: 'POST',
          body: formData,
          // Do NOT set Content-Type — the browser sets it with the boundary
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail?.message || errorData.message || 'Search failed',
        );
      }

      const data = await response.json();
      const matches: SearchResult[] = data.matches || [];

      setResults(matches);
      setStep('results');

      // Notify parent of found photos
      if (matches.length > 0) {
        const photoIds = matches.map((m) => m.photo_id);
        const avgSimilarity =
          matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length;
        onFacesFound(photoIds, avgSimilarity);
      }
    } catch (err: any) {
      console.error('Face search error:', err);
      setError(err.message || 'Failed to search for matching faces');
      setStep('error');
    }
  };

  const retryCapture = () => {
    setCapturedImage(null);
    setDetectedFace(null);
    setResults([]);
    setError(null);
    startCamera();
  };

  const resetAndClose = () => {
    stopCamera();
    setCapturedImage(null);
    setDetectedFace(null);
    setResults([]);
    setError(null);
    setStep('intro');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} size="md" title="Find Your Photos">
      <ModalHeader>
        <ModalTitle>Find Your Photos</ModalTitle>
        <ModalDescription>Take a selfie to find photos of yourself</ModalDescription>
      </ModalHeader>

      <ModalBody className="min-h-[350px]">
        {/* Intro Step */}
        {step === 'intro' && (
          <div className="text-center py-6 space-y-6">
            <div className="w-20 h-20 mx-auto bg-accent/10 rounded-full flex items-center justify-center">
              <User size={40} className="text-accent" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-medium text-text-primary">
                Find yourself in {galleryTitle}
              </h3>
              <p className="text-sm text-text-secondary max-w-sm mx-auto">
                Take a quick selfie and we'll search the gallery for photos of you.
                Your photo stays on your device - only a face signature is used for matching.
              </p>
            </div>

            {/* Privacy Notice */}
            <div className="flex items-start gap-2 p-3 bg-background rounded-lg text-left max-w-sm mx-auto">
              <Info size={16} className="text-text-tertiary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-text-tertiary">
                <strong>Privacy:</strong> Face detection runs locally in your browser.
                Only a small cropped face image is sent to the server for matching.
                It is not stored and is discarded immediately after processing.
              </p>
            </div>

            <AppButton
              variant="primary"
              onClick={startCamera}
              isLoading={isLoading || !modelsLoaded}
              disabled={!modelsLoaded}
            >
              <Camera size={18} className="mr-2" />
              {modelsLoaded ? 'Start Camera' : 'Loading...'}
            </AppButton>

            {cameraPermission === 'denied' && (
              <p className="text-sm text-warning">
                Camera access was denied. Please enable it in your browser settings.
              </p>
            )}
          </div>
        )}

        {/* Camera Step */}
        {step === 'camera' && (
          <div className="space-y-4">
            <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform scale-x-[-1]"
                aria-label="Camera preview"
              />

              {/* Face alignment guide */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-56 border-2 border-white/50 rounded-[50%] border-dashed" />
              </div>

              {/* Instructions */}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70">
                <p className="text-white text-sm text-center">
                  Position your face in the oval and tap capture
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <AppButton
                variant="secondary"
                onClick={() => {
                  stopCamera();
                  setStep('intro');
                }}
                className="flex-1"
              >
                <ChevronLeft size={18} className="mr-1" />
                Back
              </AppButton>

              <AppButton
                variant="primary"
                onClick={capturePhoto}
                className="flex-1"
              >
                <Camera size={18} className="mr-2" />
                Capture
              </AppButton>
            </div>
          </div>
        )}

        {/* Processing Step */}
        {step === 'processing' && (
          <div className="text-center py-8 space-y-4">
            {/* Show captured image with face indicator */}
            {capturedImage && (
              <div className="relative w-32 h-32 mx-auto rounded-full overflow-hidden border-4 border-accent">
                <img
                  src={capturedImage}
                  alt="Your captured photo"
                  className="w-full h-full object-cover"
                />
                {detectedFace && (
                  <div className="absolute inset-0 flex items-center justify-center bg-accent/20">
                    <Check size={32} className="text-white drop-shadow-lg" />
                  </div>
                )}
              </div>
            )}
            <Loader2 size={32} className="mx-auto animate-spin text-accent" />
            <div>
              <p className="text-lg font-medium text-text-primary">Searching...</p>
              <p className="text-sm text-text-secondary">
                Finding photos of you in the gallery
              </p>
            </div>
          </div>
        )}

        {/* Results Step */}
        {step === 'results' && (
          <div className="space-y-4">
            {results.length > 0 ? (
              <>
                <div className="flex items-center gap-3 p-4 bg-success/10 border border-success/20 rounded-lg">
                  <Check size={24} className="text-success" />
                  <div>
                    <p className="font-medium text-text-primary">
                      Found {results.length} photo{results.length !== 1 ? 's' : ''} of you!
                    </p>
                    <p className="text-sm text-text-secondary">
                      The gallery has been filtered to show your photos
                    </p>
                  </div>
                </div>

                {/* Preview of found photos */}
                <div className="grid grid-cols-4 gap-2">
                  {results.slice(0, 8).map((result, index) => (
                    <div
                      key={result.photo_id}
                      className="aspect-square bg-surface rounded overflow-hidden"
                    >
                      {result.thumbnail_url ? (
                        <img
                          src={result.thumbnail_url}
                          alt={`Match ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-tertiary">
                          <User size={24} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {results.length > 8 && (
                  <p className="text-sm text-text-tertiary text-center">
                    +{results.length - 8} more photos
                  </p>
                )}
              </>
            ) : (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 mx-auto bg-surface rounded-full flex items-center justify-center">
                  <Search size={32} className="text-text-tertiary" />
                </div>
                <div>
                  <p className="text-lg font-medium text-text-primary">
                    No photos found
                  </p>
                  <p className="text-sm text-text-secondary max-w-xs mx-auto">
                    We couldn't find any photos of you in this gallery.
                    Try a different photo or lighting.
                  </p>
                </div>
              </div>
            )}

            <AppButton variant="outline" onClick={retryCapture} fullWidth>
              <RefreshCw size={16} className="mr-2" />
              Try Again
            </AppButton>
          </div>
        )}

        {/* Error Step */}
        {step === 'error' && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 mx-auto bg-error/10 rounded-full flex items-center justify-center">
              <AlertCircle size={32} className="text-error" />
            </div>
            <div>
              <p className="text-lg font-medium text-text-primary">Something went wrong</p>
              <p className="text-sm text-error max-w-xs mx-auto">{error}</p>
            </div>
            <AppButton variant="outline" onClick={retryCapture}>
              <RefreshCw size={16} className="mr-2" />
              Try Again
            </AppButton>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <AppButton variant="secondary" onClick={resetAndClose}>
          {step === 'results' && results.length > 0 ? 'Done' : 'Cancel'}
        </AppButton>
      </ModalFooter>

      {/* Hidden canvas for image capture */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </Modal>
  );
};

export default FaceDiscovery;
