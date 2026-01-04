import { describe, it, expect } from 'vitest';
import { STORAGE, FILE_LIMITS, STORAGE_KEYS } from '../src/storage';

describe('Storage constants', () => {
  it('has correct byte multipliers', () => {
    expect(STORAGE.KB).toBe(1024);
    expect(STORAGE.MB).toBe(1024 * 1024);
    expect(STORAGE.GB).toBe(1024 * 1024 * 1024);
    expect(STORAGE.TB).toBe(1024 * 1024 * 1024 * 1024);
  });

  it('defines file limits', () => {
    expect(FILE_LIMITS.MAX_PHOTO_SIZE).toBe(100 * STORAGE.MB);
    expect(FILE_LIMITS.MAX_VIDEO_SIZE).toBe(500 * STORAGE.MB);
    expect(FILE_LIMITS.MAX_DOCUMENT_SIZE).toBe(50 * STORAGE.MB);
    expect(FILE_LIMITS.MAX_AVATAR_SIZE).toBe(5 * STORAGE.MB);
  });

  it('includes storage key prefixes', () => {
    expect(STORAGE_KEYS.WORKSPACE_PREFIX).toBe('workspaces');
    expect(STORAGE_KEYS.ASSETS).toBe('assets');
    expect(STORAGE_KEYS.AVATARS).toBe('avatars');
    expect(STORAGE_KEYS.INVITATIONS).toBe('invitations');
    expect(STORAGE_KEYS.THUMBNAILS).toBe('derived/thumbnails');
    expect(STORAGE_KEYS.ORIGINALS).toBe('original');
  });
});
