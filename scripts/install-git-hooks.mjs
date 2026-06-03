#!/usr/bin/env node
/**
 * Activate the committed .githooks/ directory as this repo's hooks path.
 *
 * Invoked automatically by the root package.json "prepare" script on
 * `npm install` / `pnpm install`, and runnable directly:
 *
 *   node scripts/install-git-hooks.mjs
 *
 * Zero-dependency, cross-platform (Node only — no bash required), and never
 * fails an install: if this is not a git work tree (e.g. a tarball/CI export)
 * it exits 0 silently.
 *
 * NOTE: lives in scripts/ (a real, tracked dir) — NOT tools/, which is a
 * gitignored symlink to the shared CoBolt tooling dir.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, stdio: 'ignore' });
} catch {
  // Not a git checkout — nothing to install. Stay quiet so installs never break.
  process.exit(0);
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'inherit' });
  const hooksDir = join(root, '.githooks');
  if (existsSync(hooksDir)) {
    for (const file of readdirSync(hooksDir)) {
      try { chmodSync(join(hooksDir, file), 0o755); } catch { /* best-effort on Windows */ }
    }
  }
  console.log('✓ git hooks active (core.hooksPath → .githooks)');
} catch (err) {
  console.warn('git hooks install skipped:', err.message);
  process.exit(0);
}
