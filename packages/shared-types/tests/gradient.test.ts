import { describe, it, expect } from 'vitest';
import { GradientType, type GradientConfiguration, type ColorStop } from '../src/gradient';

const sampleStops: ColorStop[] = [
  { color: '#FF5733', position: 0 },
  { color: '#33FF57', position: 100 },
];

const sampleConfig: GradientConfiguration = {
  type: 'linear',
  preset_id: null,
  direction: 45,
  colors: sampleStops,
};

describe('Gradient configuration types', () => {
  it('GradientType values match specification', () => {
    expect(Object.values(GradientType)).toEqual(['linear']);
  });

  it('GradientConfiguration structure allows valid config', () => {
    expect(sampleConfig.colors).toHaveLength(2);
    expect(sampleConfig.type).toBe('linear');
    expect(sampleConfig.direction).toBeGreaterThanOrEqual(0);
    expect(sampleConfig.direction).toBeLessThanOrEqual(360);
  });
});
