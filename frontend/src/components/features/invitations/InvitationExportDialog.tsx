/**
 * InvitationExport: Utility for exporting invitations in various formats
 *
 * Supports:
 * - Instagram Story dimensions (1080x1920)
 * - Square format (1080x1080)
 * - Landscape format (1200x630 for OG images)
 *
 * Feature: 016-save-the-date Phase 9
 */

import React, { useState } from 'react';
import { Download, Image, Instagram, Square, RectangleHorizontal, Loader2 } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { RadioGroup, Radio } from '@/components/ui/FormControls';
import { useToast } from '@/hooks/useToast';

export type ExportFormat = 'instagram_story' | 'square' | 'landscape';

interface ExportDimension {
  width: number;
  height: number;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const EXPORT_DIMENSIONS: Record<ExportFormat, ExportDimension> = {
  instagram_story: {
    width: 1080,
    height: 1920,
    label: 'Instagram Story',
    description: '1080 × 1920px (9:16)',
    icon: <Instagram className="w-5 h-5" />,
  },
  square: {
    width: 1080,
    height: 1080,
    label: 'Square',
    description: '1080 × 1080px (1:1)',
    icon: <Square className="w-5 h-5" />,
  },
  landscape: {
    width: 1200,
    height: 630,
    label: 'Social Share',
    description: '1200 × 630px (OG Image)',
    icon: <RectangleHorizontal className="w-5 h-5" />,
  },
};

interface InvitationExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  invitationId: string;
  workspaceId: string;
  title: string;
  coverImageUrl?: string;
}

export const InvitationExportDialog: React.FC<InvitationExportDialogProps> = ({
  isOpen,
  onClose,
  invitationId,
  workspaceId,
  title,
  coverImageUrl,
}) => {
  const { showToast } = useToast();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('instagram_story');
  const [isExporting, setIsExporting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const dimensions = EXPORT_DIMENSIONS[selectedFormat];
      
      // For now, we'll use the cover image if available
      // In a full implementation, this would call a backend service to render the invitation
      if (coverImageUrl) {
        // Create a canvas and resize the image
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = coverImageUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Fill background
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(0, 0, dimensions.width, dimensions.height);

          // Calculate aspect ratio preserving resize
          const imgAspect = img.width / img.height;
          const canvasAspect = dimensions.width / dimensions.height;

          let drawWidth, drawHeight, drawX, drawY;

          if (imgAspect > canvasAspect) {
            // Image is wider - fit to height
            drawHeight = dimensions.height;
            drawWidth = dimensions.height * imgAspect;
            drawX = (dimensions.width - drawWidth) / 2;
            drawY = 0;
          } else {
            // Image is taller - fit to width
            drawWidth = dimensions.width;
            drawHeight = dimensions.width / imgAspect;
            drawX = 0;
            drawY = (dimensions.height - drawHeight) / 2;
          }

          ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

          // Add title overlay for Instagram story
          if (selectedFormat === 'instagram_story') {
            // Add gradient overlay at bottom
            const gradient = ctx.createLinearGradient(0, dimensions.height * 0.6, 0, dimensions.height);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, dimensions.height * 0.6, dimensions.width, dimensions.height * 0.4);

            // Add title text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 72px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(title, dimensions.width / 2, dimensions.height - 100);
          }

          // Convert to blob and download
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                setPreviewUrl(url);
                
                const link = document.createElement('a');
                link.href = url;
                link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedFormat}.png`;
                link.click();
                
                showToast('Image exported successfully!', 'success');
              }
            },
            'image/png',
            1.0
          );
        }
      } else {
        // No cover image - create a simple text-based export
        const canvas = document.createElement('canvas');
        const dimensions = EXPORT_DIMENSIONS[selectedFormat];
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Create gradient background
          const gradient = ctx.createLinearGradient(0, 0, dimensions.width, dimensions.height);
          gradient.addColorStop(0, '#667eea');
          gradient.addColorStop(1, '#764ba2');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, dimensions.width, dimensions.height);

          // Add title
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${selectedFormat === 'instagram_story' ? 72 : 48}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Word wrap for title
          const words = title.split(' ');
          const lines: string[] = [];
          let currentLine = '';
          const maxWidth = dimensions.width * 0.8;

          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          lines.push(currentLine);

          const lineHeight = selectedFormat === 'instagram_story' ? 90 : 60;
          const startY = (dimensions.height - lines.length * lineHeight) / 2;

          lines.forEach((line, i) => {
            ctx.fillText(line, dimensions.width / 2, startY + i * lineHeight);
          });

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedFormat}.png`;
                link.click();
                
                showToast('Image exported successfully!', 'success');
              }
            },
            'image/png',
            1.0
          );
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Failed to export image', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader>
        <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
          <Image className="w-5 h-5 text-primary" />
          Export Image
        </h2>
      </ModalHeader>

      <ModalBody className="space-y-6">
        <p className="text-sm text-text-secondary">
          Export your invitation as an image for sharing on social media.
        </p>

        <RadioGroup
          name="export_format"
          value={selectedFormat}
          onChange={(val) => setSelectedFormat(val as ExportFormat)}
          direction="vertical"
        >
          {Object.entries(EXPORT_DIMENSIONS).map(([key, dim]) => (
            <div
              key={key}
              className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                selectedFormat === key
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
              onClick={() => setSelectedFormat(key as ExportFormat)}
            >
              <div className="flex items-center gap-3">
                <div className="text-primary">{dim.icon}</div>
                <div className="flex-1">
                  <div className="font-medium text-text-primary">{dim.label}</div>
                  <div className="text-sm text-text-secondary">{dim.description}</div>
                </div>
                <Radio value={key} />
              </div>
            </div>
          ))}
        </RadioGroup>

        {/* Preview area */}
        <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 flex items-center justify-center min-h-[150px]">
          <div
            className="bg-gradient-to-br from-primary to-accent rounded shadow-lg flex items-center justify-center text-white font-semibold text-sm"
            style={{
              width: EXPORT_DIMENSIONS[selectedFormat].width / 10,
              height: EXPORT_DIMENSIONS[selectedFormat].height / 10,
            }}
          >
            {EXPORT_DIMENSIONS[selectedFormat].width} × {EXPORT_DIMENSIONS[selectedFormat].height}
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <div className="flex justify-end gap-3">
          <AppButton variant="ghost" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            onClick={handleExport}
            isLoading={isExporting}
            leftIcon={!isExporting && <Download className="w-4 h-4" />}
          >
            Export
          </AppButton>
        </div>
      </ModalFooter>
    </Modal>
  );
};

export default InvitationExportDialog;
