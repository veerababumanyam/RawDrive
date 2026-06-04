#!/usr/bin/env node
/**
 * check-migration-numbers — fail CI when a NEW migration reuses an existing number.
 *
 *   node scripts/check-migration-numbers.mjs
 *
 * RawDrive migrations are append-only paired files:
 *
 *   backend/internal/database/migrations/NNN_feature_name.up.sql
 *   backend/internal/database/migrations/NNN_feature_name.down.sql
 *
 * The NNN numeric prefix is meant to be UNIQUE across the directory. The
 * migrator keys on the FULL filename (not the bare number), so duplicate
 * numbers "run fine" — which is exactly why four of them slipped onto `main`
 * before anyone noticed (006, 133, 160, 164). They are a latent ordering
 * hazard and they violate the append-only / unique-number rule.
 *
 * This guard scans every *.up.sql / *.down.sql, groups them by numeric
 * prefix, and FAILS (exit 1) on any number owned by more than one feature
 * slug — EXCEPT the explicit GRANDFATHER allowlist of the four historical
 * dups, which are already merged + applied in every environment and MUST NOT
 * be renumbered (that would change their version key and break migrated DBs).
 *
 * The grandfather entries pin the EXACT feature-slug SET per number. So:
 *   - the four known historical dups pass (grandfathered, frozen as-is);
 *   - ANY new duplicate number FAILS;
 *   - piling a THIRD file onto a grandfathered number (e.g. a new 164_*) ALSO
 *     FAILS, because the observed slug set no longer matches the frozen set.
 *
 * Zero dependencies — Node stdlib only. Mirrors scripts/rawdrive-ship.mjs style.
 * The same invariant is also asserted by the hermetic Go contract test
 *   backend/internal/database/migrations/migration_number_uniqueness_test.go
 * so it runs in the `backend` test gate too; this script is the cheap,
 * DB-free CI step wired into .github/workflows/production-gates.yml.
 */
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── tiny ANSI + logging (matches rawdrive-ship.mjs) ───────────────────────
const C = {
  red: '\x1b[0;31m', yel: '\x1b[0;33m', grn: '\x1b[0;32m',
  cyn: '\x1b[0;36m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m',
};
const ok = (m) => console.log(`${C.grn}✓ ${m}${C.off}`);
const info = (m) => console.log(`${C.dim}  ${m}${C.off}`);
function die(m) {
  console.error(`${C.red}✗ check-migration-numbers: ${m}${C.off}`);
  process.exit(1);
}

// ── GRANDFATHER allowlist — the four historical duplicate numbers, frozen ──
//
// Each number maps to the EXACT set of feature slugs that legitimately share
// it today. Freezing the slug SET (not just the bare number) is what stops the
// guard from being defeated by piling a third file onto a grandfathered number:
// the observed set would gain a member and no longer deep-equal the frozen set.
//
// These four are ALREADY MERGED TO main and APPLIED in dev/CI/prod. Renumbering
// any of them would change its version key and re-run / error in migrated
// environments — so they are grandfathered, never renumbered. See AGENTS.md
// "Database & Migrations".
const GRANDFATHERED = {
  '006': ['add_password_to_users', 'create_profiles'],
  '133': ['gallery_tethering', 'user_auth_methods_unique'],
  '160': ['ai_jobs_claimed_at', 'role_session_timeouts'],
  '164': ['fix_ai_tags_index', 'gallery_default_cover_backfill'],
};

// migrationFileRe captures (number, slug) from a migration file name, e.g.
// "164_gallery_default_cover_backfill.up.sql" -> ["164", "gallery_default_cover_backfill"].
const migrationFileRe = /^(\d+)_(.+?)\.(?:up|down)\.sql$/;

/**
 * collectSlugsByNumber reads a migrations directory and returns a Map of
 * numeric-prefix -> sorted, de-duplicated array of feature slugs that use it.
 * The .up.sql and .down.sql of one migration collapse to a single slug.
 */
export function collectSlugsByNumber(dir) {
  const slugsByNumber = new Map(); // number -> Set<slug>
  for (const name of readdirSync(dir)) {
    const m = migrationFileRe.exec(name);
    if (!m) continue;
    const [, number, slug] = m;
    if (!slugsByNumber.has(number)) slugsByNumber.set(number, new Set());
    slugsByNumber.get(number).add(slug);
  }
  const out = new Map();
  for (const [number, set] of slugsByNumber) {
    out.set(number, [...set].sort());
  }
  return out;
}

const arraysEqual = (a, b) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * findCollisions returns an array of { number, slugs, grandfathered } for every
 * number that is shared by more than one feature slug and is NOT exactly the
 * frozen grandfathered set. The grandfathered:true flag is informational only —
 * those are NOT collisions and are not returned as failures.
 */
export function findCollisions(slugsByNumber) {
  const collisions = [];
  for (const [number, slugs] of slugsByNumber) {
    if (slugs.length < 2) continue; // unique number — fine
    const frozen = GRANDFATHERED[number];
    if (frozen && arraysEqual(slugs, [...frozen].sort())) {
      continue; // grandfathered, exactly as recorded — allowed
    }
    collisions.push({ number, slugs });
  }
  return collisions;
}

// ── main (only when run as a script, not when imported by the test) ───────
function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..');
  const dir = join(repoRoot, 'backend', 'internal', 'database', 'migrations');

  let slugsByNumber;
  try {
    slugsByNumber = collectSlugsByNumber(dir);
  } catch (err) {
    die(`cannot read migrations directory ${dir}: ${err.message}`);
  }

  const collisions = findCollisions(slugsByNumber);
  const total = [...slugsByNumber.values()].reduce((n, s) => n + s.length, 0);

  if (collisions.length > 0) {
    console.error(
      `${C.red}${C.bold}✗ duplicate migration number(s) detected${C.off}`,
    );
    for (const { number } of collisions) {
      const frozen = GRANDFATHERED[number];
      console.error(
        `${C.red}  number ${number} is used by ${collisions.find((c) => c.number === number).slugs.length} migrations:${C.off}`,
      );
      for (const slug of collisions.find((c) => c.number === number).slugs) {
        console.error(`${C.red}    - ${number}_${slug}.{up,down}.sql${C.off}`);
      }
      if (frozen) {
        console.error(
          `${C.yel}  (number ${number} is GRANDFATHERED for exactly [${frozen.join(', ')}] — ` +
            `do NOT add another file on this number; pick the next free number)${C.off}`,
        );
      }
    }
    console.error(
      `${C.yel}Migration numbers must be unique. Pick the next free number ` +
        `(append-only). Never renumber a committed/merged migration. ` +
        `See AGENTS.md "Database & Migrations".${C.off}`,
    );
    process.exit(1);
  }

  ok(`migration numbers OK — ${total} migrations, no new duplicate prefixes`);
  const gf = Object.keys(GRANDFATHERED).sort();
  info(`grandfathered historical dups: ${gf.join(', ')}`);
}

// Run only when invoked directly (so the test can import the pure functions).
if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
