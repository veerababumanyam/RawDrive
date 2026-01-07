import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeDate, formatDateISO, formatDateTime } from '../src/date';
describe('date utilities', () => {
    const fixedNow = new Date('2026-01-04T12:00:00Z');
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(fixedNow);
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    it('formats relative dates', () => {
        const twoHoursAgo = fixedNow.getTime() - 2 * 60 * 60 * 1000;
        expect(formatRelativeDate(twoHoursAgo)).toBe('2 hours ago');
    });
    it('formats ISO date', () => {
        expect(formatDateISO('2026-01-04T00:00:00Z')).toBe('2026-01-04');
    });
    it('formats date-time locale-aware', () => {
        const formatted = formatDateTime('2026-01-04T12:34:00Z', 'en-US');
        expect(formatted).toContain('2026');
    });
});
