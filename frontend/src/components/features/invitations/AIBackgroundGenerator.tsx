/**
 * AIBackgroundGenerator: Generate AI-powered background images
 *
 * Allows users to describe their ideal background and generate
 * images using AI providers like Imagen, DALL-E, etc.
 *
 * Feature: 016-save-the-date Phase 10
 */

import React, { useState } from 'react';
import {
  Wand2,
  Sparkles,
  Loader2,
  RefreshCw,
  Check,
  Image as ImageIcon,
  Palette,
  Settings,
  AlertCircle,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput, AppTextarea } from '@/components/ui/AppInput';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Select, RadioGroup, Radio } from '@/components/ui/FormControls';
import { AppCard } from '@/components/ui/AppCard';
import { useToast } from '@/hooks/useToast';
import { apiClient } from '@/services/api';

type BackgroundStyle = 'elegant' | 'festive' | 'minimal' | 'romantic' | 'traditional' | 'playful';

interface AIBackgroundGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (imageUrl: string, overlayOpacity: number) => void;
  currentColors?: string[];
  eventType?: string;
}

const STYLE_OPTIONS = [
  { value: 'elegant', label: 'Elegant', description: 'Sophisticated and refined' },
  { value: 'festive', label: 'Festive', description: 'Vibrant and celebratory' },
  { value: 'minimal', label: 'Minimal', description: 'Clean and modern' },
  { value: 'romantic', label: 'Romantic', description: 'Soft and dreamy' },
  { value: 'traditional', label: 'Traditional', description: 'Rich cultural elements' },
  { value: 'playful', label: 'Playful', description: 'Fun and colorful' },
];

const PROMPT_SUGGESTIONS: Record<string, string[]> = {
  wedding: [
    'Floral arch with roses and peonies',
    'Golden mandala patterns',
    'Soft bokeh lights and candles',
    'Marble texture with gold veins',
    'Sunset over water with reflections',
  ],
  birthday: [
    'Confetti and streamers',
    'Balloons in gradient colors',
    'Sparkly glitter texture',
    'Fireworks in night sky',
    'Abstract geometric celebration',
  ],
  engagement: [
    'Ring boxes on silk fabric',
    'Two hearts intertwined',
    'Champagne bubbles',
    'Cherry blossoms falling',
    'Starry night sky',
  ],
  default: [
    'Abstract gradient waves',
    'Soft watercolor textures',
    'Geometric patterns',
    'Nature-inspired foliage',
    'Luxury marble and gold',
  ],
};

export const AIBackgroundGenerator: React.FC<AIBackgroundGeneratorProps> = ({
  isOpen,
  onClose,
  onApply,
  currentColors = [],
  eventType = 'default',
}) => {
  const { showToast } = useToast();

  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<BackgroundStyle>('elegant');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.3);
  const [error, setError] = useState<string | null>(null);

  const suggestions = PROMPT_SUGGESTIONS[eventType] || PROMPT_SUGGESTIONS.default;

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast('Please describe your background', 'error');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await apiClient.post<{ image_url: string; provider: string; prompt_used: string }>(
        '/api/v1/image-generation/generate',
        {
          prompt: prompt.trim(),
          style,
          color_palette: currentColors.length > 0 ? currentColors : undefined,
        }
      );

      const data = response.data;
      if (data?.image_url) {
        setGeneratedImages((prev) => [data.image_url, ...prev.slice(0, 3)]);
        setSelectedImage(data.image_url);
        showToast('Background generated!', 'success');

        // Auto-calculate overlay opacity
        await calculateOverlayOpacity(0.5); // Assume medium brightness for now
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Failed to generate background';
      setError(message);
      
      if (message.includes('not configured')) {
        showToast('Please configure an AI provider in settings first', 'error');
      } else {
        showToast(message, 'error');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const calculateOverlayOpacity = async (brightness: number) => {
    try {
      const response = await apiClient.post<{ opacity: number }>(
        '/api/v1/image-generation/overlay-opacity',
        {
          background_brightness: brightness,
          text_color: '#ffffff',
        }
      );
      if (response.data?.opacity !== undefined) {
        setOverlayOpacity(response.data.opacity);
      }
    } catch (err) {
      // Use default
      setOverlayOpacity(0.3);
    }
  };

  const handleApply = () => {
    if (selectedImage) {
      onApply(selectedImage, overlayOpacity);
      onClose();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setPrompt(suggestion);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          <h2 className="text-xl font-semibold text-text-primary">AI Background Generator</h2>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-6">
        {/* Prompt Input */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            Describe your background
          </label>
          <AppTextarea
            placeholder="e.g., Soft pink and gold watercolor with subtle floral patterns..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />

          {/* Suggestions */}
          <div className="flex flex-wrap gap-2 mt-2">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-3 py-1 text-xs bg-surface-alt rounded-full border border-border text-text-secondary hover:border-primary hover:text-primary transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Style Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            Style
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {STYLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setStyle(option.value as BackgroundStyle)}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  style === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-medium text-text-primary text-sm">{option.label}</div>
                <div className="text-xs text-text-tertiary">{option.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <div className="flex justify-center">
          <AppButton
            variant="primary"
            size="lg"
            onClick={handleGenerate}
            isLoading={isGenerating}
            disabled={!prompt.trim()}
            leftIcon={!isGenerating && <Wand2 className="w-5 h-5" />}
            className="px-8"
          >
            {isGenerating ? 'Generating...' : 'Generate Background'}
          </AppButton>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-error/10 border border-error/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-error font-medium">Generation Failed</p>
              <p className="text-xs text-error/80 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Generated Images Gallery */}
        {generatedImages.length > 0 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-text-primary flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-primary" />
              Generated Backgrounds
            </label>
            <div className="grid grid-cols-2 gap-3">
              {generatedImages.map((imageUrl, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(imageUrl)}
                  className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage === imageUrl
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <img
                    src={imageUrl}
                    alt={`Generated background ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {selectedImage === imageUrl && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Overlay Opacity Slider */}
        {selectedImage && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" />
              Text Overlay Opacity
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm text-text-secondary w-12">
                {Math.round(overlayOpacity * 100)}%
              </span>
            </div>
            <p className="text-xs text-text-tertiary">
              Adjust the darkness of the overlay to ensure text is readable.
            </p>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <div className="flex justify-between w-full">
          <AppButton
            variant="ghost"
            onClick={() => {
              setGeneratedImages([]);
              setSelectedImage(null);
              setPrompt('');
            }}
            leftIcon={<RefreshCw className="w-4 h-4" />}
            disabled={generatedImages.length === 0}
          >
            Start Over
          </AppButton>
          <div className="flex gap-3">
            <AppButton variant="ghost" onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onClick={handleApply}
              disabled={!selectedImage}
            >
              Apply Background
            </AppButton>
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
};

export default AIBackgroundGenerator;
