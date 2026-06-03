#!/usr/bin/env node
/**
 * rawdrive-ship — turn finished local work into a clean, auto-merging PR.
 *
 *   npm run ship -- "fix(galleries): correct thumbnail order"
 *
 * What it does, in order:
 *   1. Validate the Conventional-Commit message.
 *   2. Refuse to run on main/master; auto-create a `type/slug` branch from it.
 *   3. (default) Verify in Docker: backend `go test` + frontend test + build.
 *   4. Stage everything, commit (hooks validate), push the branch.
 *   5. Open a PR via `gh` with a templated body + a type label.
 *   6. Arm auto-merge (squash + delete branch) so GitHub merges & cleans up
 *      the moment CI gates pass — no manual step.
 *
 * Flags:
 *   --skip-tests     Skip the Docker verification gate (docs-only changes).
 *   --full-stack     Also bring up docker-compose.dev.yml (--wait) first.
 *   --no-merge       Open the PR but do NOT arm auto-merge (review manually).
 *   --draft          Open the PR as a draft (implies --no-merge).
 *   --base <branch>  PR base branch (default: main).
 *   --dry-run        Print what would happen; touch nothing remote.
 *
 * Zero dependencies — Node + the already-authenticated `gh` CLI only.
 * Lives in scripts/ (tracked), NOT tools/ (gitignored symlink).
 */
import { execFileSync, spawnSync } from 'node:child_process';

// ── tiny ANSI + logging ───────────────────────────────────────────────
const C = {
  red: '\x1b[0;31m', yel: '\x1b[0;33m', grn: '\x1b[0;32m',
  cyn: '\x1b[0;36m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m',
};
const step = (m) => console.log(`${C.cyn}${C.bold}▸ ${m}${C.off}`);
const ok   = (m) => console.log(`${C.grn}✓ ${m}${C.off}`);
const info = (m) => console.log(`${C.dim}  ${m}${C.off}`);
const warn = (m) => console.warn(`${C.yel}! ${m}${C.off}`);
function die(m) { console.error(`${C.red}✗ ship: ${m}${C.off}`); process.exit(1); }

// ── command helpers (injection-safe: arg arrays, never a shell string) ─
function capture(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) die(`\`${cmd} ${args.join(' ')}\` failed (exit ${r.status ?? '?'})`);
}
function tryRun(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });
  return { ok: r.status === 0, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function has(cmd) {
  return spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
}

// ── arg parsing ───────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = { skipTests: false, fullStack: false, noMerge: false, draft: false, dryRun: false, base: 'main', paths: [] };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--skip-tests') opts.skipTests = true;
  else if (a === '--full-stack') opts.fullStack = true;
  else if (a === '--no-merge') opts.noMerge = true;
  else if (a === '--draft') { opts.draft = true; opts.noMerge = true; }
  else if (a === '--dry-run') opts.dryRun = true;
  else if (a === '--base') opts.base = argv[++i];
  else if (a === '--paths') opts.paths = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
  else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  else if (a.startsWith('--')) die(`unknown flag: ${a}`);
  else positional.push(a);
}
const message = positional.join(' ').trim();

function printHelp() {
  console.log(`
${C.bold}npm run ship${C.off} -- "<type>(<scope>): <subject>" [flags]

Turns your finished changes into a clean, auto-merging PR.

Flags:
  --paths a,b,c   commit ONLY these paths (use when you have unrelated WIP in the tree)
  --skip-tests    skip the Docker verification gate (docs-only changes)
  --full-stack    also bring up docker-compose.dev.yml (--wait) first
  --no-merge      open the PR but do not arm auto-merge
  --draft         open the PR as a draft (implies --no-merge)
  --base <b>      PR base branch (default: main)
  --dry-run       show the plan without pushing or opening a PR

Example:
  npm run ship -- "fix(galleries): correct thumbnail order"
`);
}

// ── Conventional Commit validation (mirrors .githooks/commit-msg) ─────
const TYPES = ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf', 'build', 'ci', 'style', 'revert', 'wip'];
const CC_RE = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9._/-]+\\))?!?: .+`);
function parseMessage(msg) {
  if (!msg) { printHelp(); die('a Conventional-Commit message is required.'); }
  if (!CC_RE.test(msg)) {
    die(`message is not a Conventional Commit.
    Got:      ${msg}
    Expected: <type>(<scope>): <subject>
    Types:    ${TYPES.join(', ')}
    Example:  fix(galleries): correct thumbnail order`);
  }
  if (msg.length > 72) die(`subject is ${msg.length} chars (max 72). Tighten it.`);
  if (msg.endsWith('.')) die('subject must not end with a period.');
  const type = msg.match(/^([a-z]+)/)[1];
  const subject = msg.replace(/^[a-z]+(\([^)]*\))?!?:\s*/, '');
  return { type, subject };
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '') || 'change';
}

const TYPE_LABELS = {
  feat: 'feature', fix: 'bug', chore: 'chore', docs: 'documentation',
  refactor: 'refactor', test: 'tests', perf: 'performance', build: 'build',
  ci: 'ci', style: 'style', revert: 'revert', wip: 'wip',
};

// ── preflight ─────────────────────────────────────────────────────────
function preflight() {
  if (!has('git')) die('git not found on PATH.');
  try { capture('git', ['rev-parse', '--is-inside-work-tree']); }
  catch { die('not inside a git repository.'); }
  if (!has('gh')) {
    die(`GitHub CLI (gh) not found. Install it: https://cli.github.com
    Then authenticate: gh auth login`);
  }
  const auth = tryRun('gh', ['auth', 'status']);
  if (!auth.ok) die(`gh is not authenticated. Run: gh auth login`);
}

// ── main ──────────────────────────────────────────────────────────────
preflight();
const { type, subject } = parseMessage(message);

step(`Shipping: ${C.bold}${message}${C.off}`);

// Is there anything to ship?
const dirty = capture('git', ['status', '--porcelain']);
const current = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

// Decide the working branch.
let branch = current;
if (current === 'main' || current === 'master' || current === 'HEAD') {
  branch = `${type}/${slugify(subject)}`;
  step(`On ${current} → creating feature branch ${C.bold}${branch}${C.off}`);
  if (!opts.dryRun) {
    // If the branch already exists, switch to it; else create it.
    const exists = tryRun('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).ok;
    run('git', exists ? ['switch', branch] : ['switch', '-c', branch]);
  }
} else {
  info(`Using current branch: ${branch}`);
}

if (!dirty) {
  // Allow shipping when the branch already has commits ahead of base (re-ship).
  const ahead = tryRun('git', ['rev-list', '--count', `${opts.base}..HEAD`]);
  if (!ahead.ok || ahead.out.trim() === '0') {
    die('no changes to ship (working tree clean and no commits ahead of base).');
  }
  info('Working tree clean — shipping existing commits on this branch.');
}

// ── Docker verification gate ──────────────────────────────────────────
if (opts.skipTests) {
  warn('Skipping the Docker test gate (--skip-tests). CI will still gate the PR.');
} else if (opts.dryRun) {
  info('[dry-run] would run: backend go test + frontend test + build (Docker)');
} else {
  step('Verifying in Docker (backend tests use testcontainers)…');
  const dockerUp = tryRun('docker', ['info']);
  if (!dockerUp.ok) {
    die(`Docker does not appear to be running — the backend test suite needs it.
    Start Docker Desktop and retry, or use --skip-tests for a docs-only change.`);
  }
  if (opts.fullStack) {
    step('Bringing up docker-compose.dev.yml (--wait)…');
    run('docker', ['compose', '-f', 'docker-compose.dev.yml', 'up', '-d', '--wait']);
  }
  step('Backend: go test ./…');
  run('npm', ['run', 'test:backend']);
  step('Frontend: vitest');
  run('npm', ['run', 'test:frontend']);
  step('Frontend: production build');
  run('npm', ['run', 'build']);
  ok('Docker verification passed.');
}

// ── commit ────────────────────────────────────────────────────────────
if (dirty) {
  step('Committing…');
  if (!opts.dryRun) {
    // Stage the change. With --paths, only those paths — so unrelated WIP
    // elsewhere in the tree is never swept into this commit.
    if (opts.paths.length) {
      run('git', ['add', '--', ...opts.paths]);
    } else {
      run('git', ['add', '-A']);
    }
    // TRANSPARENCY: print exactly what is being committed. A stray dirty file
    // (WIP in an unrelated area) is then visible instead of silently included
    // — the failure mode that once swept a 1300-line lockfile into a commit.
    const staged = capture('git', ['diff', '--cached', '--name-only']);
    const files = staged ? staged.split('\n').filter(Boolean) : [];
    info(`Committing ${files.length} file(s):`);
    for (const f of files) info(`    ${f}`);
    const hasFE = files.some((f) => f.startsWith('frontend/'));
    const hasBE = files.some((f) => f.startsWith('backend/'));
    if (hasFE && hasBE && !opts.paths.length) {
      warn('This commit spans BOTH frontend/ and backend/. If that is unexpected,');
      warn('abort (Ctrl-C) and re-run with --paths to scope it to your change.');
    }
    // pre-commit + commit-msg hooks run here and validate everything.
    run('git', ['commit', '-m', message]);
  } else {
    info(`[dry-run] would: git add ${opts.paths.length ? opts.paths.join(' ') : '-A'} && git commit -m <message>`);
  }
}

// ── push (skip the redundant pre-push test run — we just tested) ──────
step(`Pushing ${branch} → origin…`);
if (!opts.dryRun) {
  run('git', ['push', '-u', 'origin', branch], { env: { ...process.env, SKIP_PREPUSH: '1' } });
} else {
  info(`[dry-run] would: SKIP_PREPUSH=1 git push -u origin ${branch}`);
}

// ── open / reuse the PR ───────────────────────────────────────────────
const body = prBody(type, subject, message);
let prUrl = '';
if (opts.dryRun) {
  info('[dry-run] would: gh pr create + arm auto-merge');
  ok('Dry run complete.');
  process.exit(0);
}

const existing = tryRun('gh', ['pr', 'view', branch, '--json', 'url', '-q', '.url']);
if (existing.ok && existing.out.trim().startsWith('http')) {
  prUrl = existing.out.trim();
  info(`PR already exists for ${branch} — reusing it (pushed updates above).`);
} else {
  const createArgs = ['pr', 'create', '--base', opts.base, '--head', branch, '--title', message, '--body', body];
  if (opts.draft) createArgs.push('--draft');
  const created = tryRun('gh', createArgs);
  if (!created.ok) die(`gh pr create failed:\n${created.out}`);
  prUrl = (created.out.match(/https?:\/\/\S+/) || [''])[0];
  ok(`Opened PR: ${prUrl}`);
}

// Best-effort labeling (won't fail the ship if the label is missing).
const label = TYPE_LABELS[type];
if (label) {
  const lbl = tryRun('gh', ['pr', 'edit', branch, '--add-label', label]);
  if (!lbl.ok) info(`(label "${label}" not applied — run scripts/setup-repo-hygiene.sh once to create labels)`);
}

// ── arm auto-merge ────────────────────────────────────────────────────
if (opts.noMerge) {
  info('Auto-merge not armed (--no-merge/--draft). Merge it yourself when ready.');
} else {
  step('Arming auto-merge (squash + delete branch)…');
  const am = tryRun('gh', ['pr', 'merge', branch, '--auto', '--squash', '--delete-branch']);
  if (am.ok) {
    ok('Auto-merge armed.');
  } else {
    warn(`Could not arm auto-merge. The PR is open and CI will still run.`);
    info(`Likely cause: auto-merge isn't enabled on the repo yet.`);
    info(`Fix once:     bash scripts/setup-repo-hygiene.sh`);
    info(`gh said:      ${am.out.split('\n')[0]}`);
  }
}

// ── what happens next ─────────────────────────────────────────────────
console.log(`
${C.grn}${C.bold}Shipped.${C.off} Here's what happens automatically now:

  1. GitHub runs the CI gates on your PR
     (backend, backend-lint, frontend, openapi, security, images, pr-title)
  2. When they all pass, GitHub ${C.bold}squash-merges${C.off} the PR into ${opts.base}
     and ${C.bold}deletes the branch${C.off} — no action needed from you.
  3. When you're ready to release to production, run:
       ${C.bold}npm run deploy:prod${C.off}

  PR: ${C.cyn}${prUrl}${C.off}
  Watch it:  gh pr checks ${branch} --watch
`);

function prBody(type, subject, msg) {
  return `## Summary

\`${msg}\`

<!-- Add context, screenshots, or breaking-change notes here. -->

## Checklist (RawDrive laws — see AGENTS.md)

- [ ] Tests pass locally in Docker (\`npm run test\`) or via \`npm run ship\`
- [ ] No hardcoded secrets — config via \`platform_settings\` / env only
- [ ] UI uses design tokens (no \`neutral-*\`/\`gray-*\`/arbitrary values); icon buttons use \`GlassIconButton\`
- [ ] DB migrations are paired \`NNN_*.up.sql\` / \`.down.sql\`, not renumbered
- [ ] Handlers read JWT via \`middleware.JWTClaimsFromContext\`
- [ ] Renders correctly across all three themes; touch targets ≥ 44px

---
🚢 Opened with \`npm run ship\` · type: \`${type}\``;
}
