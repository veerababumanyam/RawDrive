
import { describe, it, expect } from 'vitest';
import { getRawDownloadVariant, isRawAsset } from '../fileUtils';
import fc from 'fast-check';

// Define types locally if not exported, or just match string literals
type DownloadPolicy = 'view_only' | 'web_only' | 'watermarked_only' | 'original_allowed';

describe('Download Policy Enforcement', () => {
    it('Property 11: Download Policy Enforcement', () => {
        fc.assert(
            fc.property(
                // Policy
                fc.constantFrom<DownloadPolicy>('view_only', 'web_only', 'watermarked_only', 'original_allowed'),
                // Is Raw File?
                fc.boolean(),
                (policy, isRaw) => {
                    // Test getRawDownloadVariant logic (which currently handles logic for RAW files mainly)
                    // But effectively we want to ensure SAFE defaults.
                    
                    const variant = getRawDownloadVariant(policy);
                    
                    if (policy === 'view_only') {
                        // MUST block download
                        expect(variant).toBeNull();
                    } else if (policy === 'original_allowed') {
                        // Should allow original
                        expect(variant).toBe('original');
                    } else {
                        // web_only or watermarked_only
                        // Should be preview (safe version)
                        expect(variant).toBe('preview');
                    }
                }
            )
        );
    });

    it('isRawAsset correctly identifies raw files', () => {
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
