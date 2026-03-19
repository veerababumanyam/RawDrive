import { describe, it, expect } from 'vitest';
import { mapSlideshowConfigToSettings } from '../../../../../pages/public/PublicGalleryShell';
import type { SlideshowConfig } from '../../../../../types/gallery';

describe('mapSlideshowConfigToSettings', () => {
  it('converts interval_seconds to milliseconds', () => {
    const config: SlideshowConfig = { enabled: true, interval_seconds: 5 };
    const result = mapSlideshowConfigToSettings(config);
    expect(result.interval).toBe(5000);
  });

  it('defaults interval to 5000ms when interval_seconds is not provided', () => {
    const config: SlideshowConfig = { enabled: true };
    const result = mapSlideshowConfigToSettings(config);
    expect(result.interval).toBe(5000);
  });

  it('maps transition field (fade -> fade, none -> instant)', () => {
    const fadeCfg: SlideshowConfig = { enabled: true, transition: 'fade' };
    expect(mapSlideshowConfigToSettings(fadeCfg).transition).toBe('fade');

    const noneCfg: SlideshowConfig = { enabled: true, transition: 'none' };
    expect(mapSlideshowConfigToSettings(noneCfg).transition).toBe('instant');

    const slideCfg: SlideshowConfig = { enabled: true, transition: 'slide' };
    expect(mapSlideshowConfigToSettings(slideCfg).transition).toBe('slide');

    const zoomCfg: SlideshowConfig = { enabled: true, transition: 'zoom' };
    expect(mapSlideshowConfigToSettings(zoomCfg).transition).toBe('zoom');
  });

  it('defaults transition to fade when not specified', () => {
    const config: SlideshowConfig = { enabled: true };
    const result = mapSlideshowConfigToSettings(config);
    expect(result.transition).toBe('fade');
  });

  it('maps audio fields (audio_enabled, audio_volume, audio_autoplay)', () => {
    const config: SlideshowConfig = {
      enabled: true,
      audio_enabled: true,
      audio_volume: 0.5,
      audio_autoplay: true,
    };
    const result = mapSlideshowConfigToSettings(config);
    expect(result.audio).toEqual({
      enabled: true,
      volume: 0.5,
      muted: false, // autoplay=true means not muted
    });
  });

  it('defaults audio to disabled with volume 0.7 and muted', () => {
    const config: SlideshowConfig = { enabled: true };
    const result = mapSlideshowConfigToSettings(config);
    expect(result.audio).toEqual({
      enabled: false,
      volume: 0.7,
      muted: true,
    });
  });

  it('maps loop field', () => {
    const loopTrue: SlideshowConfig = { enabled: true, loop: true };
    expect(mapSlideshowConfigToSettings(loopTrue).loop).toBe(true);

    const loopFalse: SlideshowConfig = { enabled: true, loop: false };
    expect(mapSlideshowConfigToSettings(loopFalse).loop).toBe(false);
  });

  it('defaults loop to true when not specified', () => {
    const config: SlideshowConfig = { enabled: true };
    expect(mapSlideshowConfigToSettings(config).loop).toBe(true);
  });

  it('returns empty object for undefined config', () => {
    expect(mapSlideshowConfigToSettings(undefined)).toEqual({});
  });

  it('returns empty object for null config', () => {
    expect(mapSlideshowConfigToSettings(null)).toEqual({});
  });

  it('returns empty object when slideshow_config.enabled is false', () => {
    const config: SlideshowConfig = { enabled: false, interval_seconds: 10 };
    expect(mapSlideshowConfigToSettings(config)).toEqual({});
  });
});
