/**
 * GallerySettingsPresets Tests
 * Tests preset buttons, active state detection, and onApplyPreset callback
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GallerySettingsPresets, GALLERY_PRESETS } from './GallerySettingsPresets';

describe('GallerySettingsPresets', () => {
  const defaultSettings = {
    access_level: 'password_protected',
    download_policy: 'view_only',
    watermark_enabled: true,
  };

  it('renders 4 preset buttons', () => {
    render(
      <GallerySettingsPresets
        currentSettings={defaultSettings}
        onApplyPreset={vi.fn()}
      />
    );

    expect(screen.getByText('Proofing')).toBeTruthy();
    expect(screen.getByText('Delivery')).toBeTruthy();
    expect(screen.getByText('Sharing')).toBeTruthy();
    expect(screen.getByText('Premium Delivery')).toBeTruthy();
  });

  it('shows description for each preset', () => {
    render(
      <GallerySettingsPresets
        currentSettings={defaultSettings}
        onApplyPreset={vi.fn()}
      />
    );

    expect(screen.getByText(/Clients view and select/)).toBeTruthy();
    expect(screen.getByText(/Clients download full/)).toBeTruthy();
    expect(screen.getByText(/Public viewing/)).toBeTruthy();
    expect(screen.getByText(/Full originals/)).toBeTruthy();
  });

  it('highlights active preset matching current settings', () => {
    // Proofing preset matches: password_protected, view_only, watermark true
    render(
      <GallerySettingsPresets
        currentSettings={{
          access_level: 'password_protected',
          download_policy: 'view_only',
          watermark_enabled: true,
        }}
        onApplyPreset={vi.fn()}
      />
    );

    const proofingCard = screen.getByText('Proofing').closest('[data-preset]')!;
    expect(proofingCard.className).toContain('ring-2');
  });

  it('does not highlight any preset when settings do not match', () => {
    render(
      <GallerySettingsPresets
        currentSettings={{
          access_level: 'public',
          download_policy: 'original_allowed',
          watermark_enabled: true,
        }}
        onApplyPreset={vi.fn()}
      />
    );

    const presetCards = screen.getAllByRole('button');
    const highlighted = presetCards.filter(card => card.className.includes('ring-2'));
    expect(highlighted.length).toBe(0);
  });

  it('calls onApplyPreset with correct config when preset clicked', () => {
    const onApplyPreset = vi.fn();
    render(
      <GallerySettingsPresets
        currentSettings={defaultSettings}
        onApplyPreset={onApplyPreset}
      />
    );

    fireEvent.click(screen.getByText('Delivery'));

    expect(onApplyPreset).toHaveBeenCalledWith({
      access_level: 'password_protected',
      download_policy: 'original_allowed',
      watermark_enabled: false,
    });
  });

  it('exports GALLERY_PRESETS constant', () => {
    expect(GALLERY_PRESETS).toBeDefined();
    expect(GALLERY_PRESETS).toHaveLength(4);
    expect(GALLERY_PRESETS[0].name).toBe('Proofing');
  });
});
