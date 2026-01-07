
import { describe, test, expect } from 'vitest';
import { getRawDownloadVariant, isRawAsset } from '../fileUtils';

// Redefine types locally if needed to match implementation
type DownloadPolicy = 'view_only' | 'web_only' | 'watermarked_only' | 'original_allowed';

describe('Download Policy Enforcement', () => {
    test('getRawDownloadVariant respects policy', () => {
        // view_only -> null
        expect(getRawDownloadVariant('view_only')).toBeNull();

        // original_allowed -> original
        expect(getRawDownloadVariant('original_allowed')).toBe('original');

        // web_only -> preview
        expect(getRawDownloadVariant('web_only')).toBe('preview');

        // watermarked_only -> preview
        expect(getRawDownloadVariant('watermarked_only')).toBe('preview');
    });

    test('isRawAsset correctly identifies raw files', () => {
        const rawExtensions = ['cr2', 'nef', 'arw', 'dng'];
        const nonRawExtensions = ['jpg', 'png', 'webp', 'gif'];

        rawExtensions.forEach(ext => {
            expect(isRawAsset(`image.${ext}`)).toBe(true);
            expect(isRawAsset(`IMAGE.${ext.toUpperCase()}`)).toBe(true);
        });

        nonRawExtensions.forEach(ext => {
            expect(isRawAsset(`image.${ext}`)).toBe(false);
        });
    });
});
