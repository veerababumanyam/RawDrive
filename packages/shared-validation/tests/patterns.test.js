import { describe, it, expect } from 'vitest';
import { PATTERNS, isValidHexColor, isValidUUID, isValidEmail } from '../src/patterns';
describe('Validation patterns', () => {
    it('validates hex colors', () => {
        expect(PATTERNS.HEX_COLOR.test('#FF5733')).toBe(true);
        expect(PATTERNS.HEX_COLOR.test('#GGGGGG')).toBe(false);
        expect(isValidHexColor('#abc')).toBe(true);
        expect(isValidHexColor('#12345')).toBe(false);
    });
    it('validates UUID v4', () => {
        expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
        expect(isValidUUID('not-a-uuid')).toBe(false);
    });
    it('validates email format', () => {
        expect(isValidEmail('user@example.com')).toBe(true);
        expect(isValidEmail('user@@example')).toBe(false);
    });
});
