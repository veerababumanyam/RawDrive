/**
 * DiscoverSection Component
 *
 * Section for AI-powered discovery features including face detection,
 * similarity detection, and people search.
 *
 * Feature: AI Services Consolidation
 */

import React, { useState, useCallback } from 'react';
import {
  Search,
  Users,
  ScanFace,
  Image as ImageIcon,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { FeatureCard } from '../FeatureCard';
import { faceApiService } from '@/services/faceApiService';
import { useToast } from '@/hooks/useToast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoverSectionProps {
  workspaceId: string;
  galleryId: string;
  totalPhotos: number;
  expanded: boolean;
  onToggle: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DiscoverSection: React.FC<DiscoverSectionProps> = ({
  workspaceId,
  galleryId,
  totalPhotos,
  expanded,
  onToggle,
}) => {
  const [activeFeature, setActiveFeature] = useState<'faces' | 'similarity' | 'people' | null>(
    null
  );
  const [isScanning, setIsScanning] = useState(false);
  const { addToast } = useToast();

  const handleFindPeople = useCallback(() => {
    // TODO: Implement people search
    console.log('Find people clicked');
  }, []);

  const handleScanFaces = useCallback(async () => {
    if (!workspaceId || !galleryId) return;

    setIsScanning(true);
    try {
      addToast({ message: 'Starting face scan...', variant: 'info' });
      const result = await faceApiService.scanGalleryFaces(workspaceId, galleryId);

      if (result.jobs_queued > 0) {
        addToast({
          message: result.message || `Scanning ${result.jobs_queued} new photos`,
          variant: 'success',
        });
      } else if (result.pending && result.pending > 0) {
        addToast({
          message: `Scan already in progress: ${result.pending} photos pending`,
          variant: 'info',
        });
      } else {
        addToast({
          message: 'No new faces to scan',
          variant: 'info',
        });
      }
    } catch (error) {
      addToast({ 
        message: 'Failed to start face scan. Please try again.', 
        variant: 'error' 
      });
      console.error('Face scan error:', error);
    } finally {
      setIsScanning(false);
    }
  }, [workspaceId, galleryId, addToast]);

  const handleFindSimilar = useCallback(() => {
    // TODO: Implement similarity detection
    console.log('Find similar clicked');
  }, []);

  return (
    <FeatureCard
      title="Discover"
      description="Face detection, similarity, and people search"
      icon={<Search className="w-4 h-4" />}
      status="idle"
      expanded={expanded}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        {/* Face Detection */}
        <div className="space-y-2">
          <button
            onClick={() => setActiveFeature(activeFeature === 'faces' ? null : 'faces')}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50 hover:bg-surface-hover transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <ScanFace className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Face Detection</p>
              <p className="text-xs text-text-secondary">
                Automatically detect and group faces in photos
              </p>
            </div>
          </button>
          {activeFeature === 'faces' && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-3">
              <p className="text-sm text-text-secondary">
                Scan all photos in the gallery to detect faces and group them by person.
              </p>
              <AppButton
                variant="primary"
                fullWidth
                onClick={handleScanFaces}
                isLoading={isScanning}
                disabled={isScanning}
                leftIcon={<ScanFace className="w-4 h-4" />}
              >
                {isScanning ? 'Scanning...' : 'Scan Faces in Gallery'}
              </AppButton>
            </div>
          )}
        </div>

        {/* People Search */}
        <div className="space-y-2">
          <button
            onClick={() => setActiveFeature(activeFeature === 'people' ? null : 'people')}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50 hover:bg-surface-hover transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Users className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Find People</p>
              <p className="text-xs text-text-secondary">
                Search for photos of specific people
              </p>
            </div>
          </button>
          {activeFeature === 'people' && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-3">
              <p className="text-sm text-text-secondary">
                Find all photos containing specific people using face recognition.
              </p>
              <AppButton
                variant="primary"
                fullWidth
                onClick={handleFindPeople}
                leftIcon={<Users className="w-4 h-4" />}
              >
                Open People Search
              </AppButton>
            </div>
          )}
        </div>

        {/* Similarity Detection */}
        <div className="space-y-2">
          <button
            onClick={() =>
              setActiveFeature(activeFeature === 'similarity' ? null : 'similarity')
            }
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50 hover:bg-surface-hover transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Similarity Detection</p>
              <p className="text-xs text-text-secondary">
                Find duplicate and similar photos
              </p>
            </div>
          </button>
          {activeFeature === 'similarity' && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-3">
              <p className="text-sm text-text-secondary">
                Group near-identical shots to pick the best one.
              </p>
              <AppButton
                variant="primary"
                fullWidth
                onClick={handleFindSimilar}
                leftIcon={<ImageIcon className="w-4 h-4" />}
              >
                Find Similar Photos
              </AppButton>
            </div>
          )}
        </div>
      </div>
    </FeatureCard>
  );
};
