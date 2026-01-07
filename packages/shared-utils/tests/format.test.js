import { describe, it, expect } from 'vitest';
import { formatFileSize, formatNumber, formatPercentage, truncate } from '../src/format';
describe('format utilities', () => {
    it('formats file sizes', () => {
        expect(formatFileSize(500)).toBe('500 B');
        expect(formatFileSize(2048)).toBe('2.0 KB');
        expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });
    it('formats numbers with separators', () => {
        expect(formatNumber(1234567)).toBe('1,234,567');
    });
    it('formats percentages', () => {
        expect(formatPercentage(0.256, 1)).toBe('25.6%');
    });
    it('truncates strings', () => {
        expect(truncate('hello', 10)).toBe('hello');
        expect(truncate('hello world', 8)).toBe('hello...');
    });
});
