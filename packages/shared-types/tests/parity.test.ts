import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InvitationStatus, type GradientConfiguration } from '../src';

describe('TypeScript-Python Parity', () => {
  const fixturesDir = join(__dirname, 'fixtures');

  it('InvitationStatus values match Python fixture', () => {
    const tsValues = Object.values(InvitationStatus);
    const pyValues = JSON.parse(readFileSync(join(fixturesDir, 'invitation_status.json'), 'utf-8'));
    expect(tsValues).toEqual(pyValues);
  });

  it('GradientConfiguration serializes identically to Python fixture', () => {
    const config: GradientConfiguration = {
      type: 'linear',
      preset_id: null,
      direction: 45,
      colors: [
        { color: '#FF5733', position: 0 },
        { color: '#33FF57', position: 100 },
      ],
    };
    const tsJson = JSON.stringify(config);
    const pyJson = readFileSync(join(fixturesDir, 'gradient_config.json'), 'utf-8');
    expect(JSON.parse(tsJson)).toEqual(JSON.parse(pyJson));
  });
});
