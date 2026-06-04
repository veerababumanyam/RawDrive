/**
 * Self-test for scripts/check-migration-numbers.mjs — the migration-number
 * dup guard (MIG-160). Zero-dep, uses the Node built-in test runner:
 *
 *   node --test scripts/check-migration-numbers.test.mjs
 *
 * Proves the pure functions: grandfathered dups pass, a NEW dup is detected,
 * and a THIRD file piled onto a grandfathered number is detected.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { collectSlugsByNumber, findCollisions } from './check-migration-numbers.mjs';

function fixtureDir(names) {
  const dir = mkdtempSync(join(tmpdir(), 'migguard-'));
  for (const name of names) writeFileSync(join(dir, name), '-- fixture\n');
  return dir;
}

test('unique numbers produce no collisions', () => {
  const dir = fixtureDir([
    '200_alpha.up.sql', '200_alpha.down.sql',
    '201_beta.up.sql', '201_beta.down.sql',
  ]);
  try {
    assert.deepEqual(findCollisions(collectSlugsByNumber(dir)), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a NEW duplicate number is detected', () => {
  const dir = fixtureDir([
    '200_first.up.sql', '200_first.down.sql',
    '200_second.up.sql', '200_second.down.sql',
  ]);
  try {
    const collisions = findCollisions(collectSlugsByNumber(dir));
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].number, '200');
    assert.deepEqual(collisions[0].slugs, ['first', 'second']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the exact grandfathered slug set passes', () => {
  const dir = fixtureDir([
    '164_fix_ai_tags_index.up.sql', '164_fix_ai_tags_index.down.sql',
    '164_gallery_default_cover_backfill.up.sql', '164_gallery_default_cover_backfill.down.sql',
  ]);
  try {
    assert.deepEqual(findCollisions(collectSlugsByNumber(dir)), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a THIRD file on a grandfathered number is detected', () => {
  const dir = fixtureDir([
    '164_fix_ai_tags_index.up.sql', '164_fix_ai_tags_index.down.sql',
    '164_gallery_default_cover_backfill.up.sql', '164_gallery_default_cover_backfill.down.sql',
    '164_sneaky_third.up.sql', '164_sneaky_third.down.sql',
  ]);
  try {
    const collisions = findCollisions(collectSlugsByNumber(dir));
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].number, '164');
    assert.ok(collisions[0].slugs.includes('sneaky_third'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
