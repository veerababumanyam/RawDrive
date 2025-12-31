/**
 * InvitationQRModal: QR code generation and download modal
 *
 * Features:
 * - Preview QR code
 * - Format selection (PNG, SVG, PDF)
 * - Size selection (512, 1024, 2048)
 * - Color customization
 * - Logo overlay option
 * - Download functionality
 *
 * Feature: 016-save-the-date
 * Tasks: T067-T069
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  X,
  Download,
  Image,
  FileText,
  Code2,
  Loader2,
  Check,
  Palette,
  Maximize2,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { invitationService } from '@/services/invitationService';
import { useToast } from '@/hooks/useToast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvitationQRModalProps {
  workspaceId: string;
  invitationId: string;
  invitationTitle: string;
  publicUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

type QRFormat = 'png' | 'svg' | 'pdf';
type QRSize = 512 | 1024 | 2048;

interface FormatOption {
  value: QRFormat;
  label: string;
  icon: React.ReactNode;
  description: string;
}

interface SizeOption {
  value: QRSize;
  label: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'png',
    label: 'PNG',
    icon: <Image className="w-4 h-4" />,
    description: 'Best for web & social media',
  },
  {
    value: 'svg',
    label: 'SVG',
    icon: <Code2 className="w-4 h-4" />,
    description: 'Vector format for printing',
  },
  {
    value: 'pdf',
    label: 'PDF',
    icon: <FileText className="w-4 h-4" />,
    description: 'Professional print-ready',
  },
];

const SIZE_OPTIONS: SizeOption[] = [
  { value: 512, label: 'Small (512px)' },
  { value: 1024, label: 'Medium (1024px)' },
  { value: 2048, label: 'Large (2048px)' },
];

const COLOR_PRESETS = [
  { fill: '#000000', back: '#FFFFFF', label: 'Classic' },
  { fill: '#2563EB', back: '#FFFFFF', label: 'Blue' },
  { fill: '#059669', back: '#FFFFFF', label: 'Green' },
  { fill: '#B91C1C', back: '#FFFFFF', label: 'Red' },
  { fill: '#7C3AED', back: '#FFFFFF', label: 'Purple' },
  { fill: '#D4AF37', back: '#FFFFFF', label: 'Gold' },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const InvitationQRModal: React.FC<InvitationQRModalProps> = ({
  workspaceId,
  invitationId,
  invitationTitle,
  publicUrl,
  isOpen,
  onClose,
}) => {
  const { showToast } = useToast();

  // State
  const [format, setFormat] = useState<QRFormat>('png');
  const [size, setSize] = useState<QRSize>(1024);
  const [fillColor, setFillColor] = useState('#000000');
  const [backColor, setBackColor] = useState('#FFFFFF');
  const [includeLogo, setIncludeLogo] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // T122: Keyboard navigation - close on Escape
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Generate preview URL
  const previewUrl = useMemo(() => {
    return invitationService.getInvitationQRUrl(workspaceId, invitationId, {
      format: 'png', // Always preview as PNG
      size: 512, // Preview at smaller size
      fillColor,
      backColor,
      includeLogo,
    });
  }, [workspaceId, invitationId, fillColor, backColor, includeLogo]);

  // Handle download
  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const blob = await invitationService.downloadInvitationQR(workspaceId, invitationId, {
        format,
        size,
        fillColor,
        backColor,
        includeLogo,
      });

      // Get file extension
      const ext = format === 'svg' ? 'svg' : format === 'pdf' ? 'pdf' : 'png';
      const safeTitle = invitationTitle.replace(/[^a-zA-Z0-9\s-_]/g, '').substring(0, 30);
      const filename = `${safeTitle}-qr-${size}px.${ext}`;

      // Trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`QR code downloaded as ${format.toUpperCase()}`, 'success');
    } catch (error) {
      console.error('Download failed:', error);
      showToast('Failed to download QR code', 'error');
    } finally {
      setIsDownloading(false);
    }
  }, [invitationId, invitationTitle, format, size, fillColor, backColor, includeLogo, showToast]);

  // Handle color preset selection
  const handleColorPreset = (preset: (typeof COLOR_PRESETS)[0]) => {
    setFillColor(preset.fill);
    setBackColor(preset.back);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-modal-title"
      >
        <div className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 id="qr-modal-title" className="text-xl font-semibold text-text-primary">
              Download QR Code
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>

          <div className="p-6 grid md:grid-cols-2 gap-6">
            {/* Left: Preview */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-text-secondary">Preview</h3>
              <div
                className="aspect-square rounded-lg border border-border overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: backColor }}
              >
                <img
                  key={previewUrl}
                  src={previewUrl}
                  alt="QR Code Preview"
                  className="w-full h-full object-contain p-4"
                />
              </div>
              <p className="text-xs text-text-tertiary text-center truncate">
                {publicUrl}
              </p>
            </div>

            {/* Right: Options */}
            <div className="space-y-6">
              {/* Format Selection */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-text-secondary flex items-center gap-2">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  Format
                </legend>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="QR code format">
                  {FORMAT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFormat(option.value)}
                      role="radio"
                      aria-checked={format === option.value}
                      aria-label={`${option.label} format - ${option.description}`}
                      className={`
                        flex flex-col items-center gap-1 p-3 rounded-lg border transition-all
                        focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
                        ${format === option.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/50 text-text-secondary'
                        }
                      `}
                    >
                      <span aria-hidden="true">{option.icon}</span>
                      <span className="font-medium text-sm">{option.label}</span>
                      {format === option.value && (
                        <Check className="w-3 h-3" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-tertiary" aria-live="polite">
                  {FORMAT_OPTIONS.find(o => o.value === format)?.description}
                </p>
              </fieldset>

              {/* Size Selection */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-text-secondary flex items-center gap-2">
                  <Maximize2 className="w-4 h-4" aria-hidden="true" />
                  Size
                </legend>
                <div className="flex gap-2" role="radiogroup" aria-label="QR code size">
                  {SIZE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSize(option.value)}
                      role="radio"
                      aria-checked={size === option.value}
                      aria-label={`${option.label} pixels`}
                      className={`
                        flex-1 px-3 py-2 rounded-lg border text-sm transition-all
                        focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
                        ${size === option.value
                          ? 'border-primary bg-primary/5 text-primary font-medium'
                          : 'border-border hover:border-primary/50 text-text-secondary'
                        }
                      `}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Color Selection */}
              <fieldset className="space-y-2">
                <div className="flex items-center justify-between">
                  <legend className="text-sm font-medium text-text-secondary flex items-center gap-2">
                    <Palette className="w-4 h-4" aria-hidden="true" />
                    Colors
                  </legend>
                  <button
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="text-xs text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded"
                    aria-expanded={showColorPicker}
                    aria-controls="custom-color-picker"
                  >
                    {showColorPicker ? 'Hide Custom' : 'Custom Colors'}
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Color preset">
                  {COLOR_PRESETS.map((preset, index) => (
                    <button
                      key={index}
                      onClick={() => handleColorPreset(preset)}
                      role="radio"
                      aria-checked={fillColor === preset.fill && backColor === preset.back}
                      aria-label={`${preset.label} color scheme`}
                      className={`
                        w-8 h-8 rounded-full border-2 transition-all
                        focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
                        ${fillColor === preset.fill && backColor === preset.back
                          ? 'ring-2 ring-primary ring-offset-2'
                          : 'border-border hover:border-primary'
                        }
                      `}
                      style={{ backgroundColor: preset.fill }}
                    />
                  ))}
                </div>

                {showColorPicker && (
                  <div id="custom-color-picker" className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label htmlFor="qr-fill-color" className="text-xs text-text-tertiary block mb-1">
                        QR Color
                      </label>
                      <input
                        id="qr-fill-color"
                        type="color"
                        value={fillColor}
                        onChange={(e) => setFillColor(e.target.value)}
                        className="w-full h-8 rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                        aria-label="QR code foreground color"
                      />
                    </div>
                    <div>
                      <label htmlFor="qr-back-color" className="text-xs text-text-tertiary block mb-1">
                        Background
                      </label>
                      <input
                        id="qr-back-color"
                        type="color"
                        value={backColor}
                        onChange={(e) => setBackColor(e.target.value)}
                        className="w-full h-8 rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                        aria-label="QR code background color"
                      />
                    </div>
                  </div>
                )}
              </fieldset>

              {/* Logo Option */}
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={includeLogo}
                  onChange={(e) => setIncludeLogo(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <div>
                  <span className="text-sm font-medium text-text-primary">
                    Include Cover Image
                  </span>
                  <p className="text-xs text-text-tertiary">
                    Overlay cover image as logo (if available)
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-border bg-surface-hover/50">
            <p className="text-sm text-text-secondary">
              {format.toUpperCase()} • {size}px
              {includeLogo && ' • With logo'}
            </p>
            <div className="flex gap-3">
              <AppButton variant="outline" onClick={onClose}>
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download QR Code
                  </>
                )}
              </AppButton>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default InvitationQRModal;
