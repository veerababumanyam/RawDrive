import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeFilename, sanitizeSlug } from '../src/sanitizers';
describe('Sanitizers', () => {
    it('escapes HTML for XSS prevention', () => {
        const result = sanitizeHtml('<script>alert("xss")</script>');
        expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
    it('sanitizes filenames', () => {
        expect(sanitizeFilename('../evil.exe')).toBe('__evil.exe');
        expect(sanitizeFilename('nice-file.png')).toBe('nice-file.png');
    });
    it('sanitizes slugs', () => {
        expect(sanitizeSlug('Hello World!')).toBe('hello-world');
        expect(sanitizeSlug('---Hello---World---')).toBe('hello-world');
    });
});
