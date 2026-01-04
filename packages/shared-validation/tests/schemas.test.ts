import { describe, it, expect } from 'vitest';
import {
  hexColorSchema,
  uuidSchema,
  emailSchema,
  colorStopSchema,
  gradientConfigSchema,
  paginationSchema,
} from '../src/schemas';

describe('Zod schemas', () => {
  it('validates hex color schema', () => {
    expect(hexColorSchema.safeParse('#FF5733').success).toBe(true);
    expect(hexColorSchema.safeParse('red').success).toBe(false);
  });

  it('validates uuid schema', () => {
    expect(uuidSchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(true);
    expect(uuidSchema.safeParse('123').success).toBe(false);
  });

  it('validates email schema', () => {
    expect(emailSchema.safeParse('user@example.com').success).toBe(true);
    expect(emailSchema.safeParse('bad@').success).toBe(false);
  });

  it('validates color stop schema', () => {
    const result = colorStopSchema.safeParse({ color: '#ABC123', position: 50 });
    expect(result.success).toBe(true);
    expect(colorStopSchema.safeParse({ color: '#GGG', position: 50 }).success).toBe(false);
  });

  it('validates gradient config schema', () => {
    const valid = gradientConfigSchema.safeParse({
      type: 'linear',
      preset_id: null,
      direction: 45,
      colors: [
        { color: '#FF5733', position: 0 },
        { color: '#33FF57', position: 100 },
      ],
    });
    expect(valid.success).toBe(true);

    const invalid = gradientConfigSchema.safeParse({
      type: 'linear',
      preset_id: null,
      direction: 400,
      colors: [],
    });
    expect(invalid.success).toBe(false);
  });

  it('validates pagination schema', () => {
    const parsed = paginationSchema.parse({ page: '2', limit: '10' });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(10);

    expect(paginationSchema.safeParse({ page: 0, limit: 101 }).success).toBe(false);
  });
});
