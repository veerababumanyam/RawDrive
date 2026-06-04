#!/usr/bin/env node
/**
 * Design-token guard — fails CI when components bypass the central system.
 *
 * Bans, inside all .tsx files under src (excluding tests):
 *  1. Raw Tailwind palette color classes (bg-white, text-gray-500, …) —
 *     all colors must come from semantic tokens (design-tokens.json).
 *  2. Tailwind backdrop-blur-* classes — use the token-driven
 *     glass-blur-{subtle,soft,medium,full} utilities instead.
 *  3. Arbitrary color values in classes (text-[#hex], bg-[rgb(...)]).
 *
 * Allowlist: QR quiet zones must stay literal white for scanner contrast.
 * Run: npm run lint:tokens
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = new URL("../src", import.meta.url).pathname;

/** Files allowed to keep specific literal colors (reason documented inline). */
const ALLOWLIST = new Map([
  // QR quiet zones — scanner contrast is intentionally theme-independent.
  ["components/gallery/share-dialog.tsx", [/bg-white/]],
  ["components/gallery/share-qr-popover.tsx", [/bg-white/]],
  ["components/streams/InviteGenerator.tsx", [/bg-white/]],
  // Offline-feature glass components inherited from origin/main when the
  // WCAG-token branch merged main in. They predate this guard (added on this
  // branch), so their ad-hoc backdrop-blur / hairline border-white were never
  // checked. Allowlisted to keep this merge scoped to the a11y/token work;
  // migrating them to glass-blur-* / border-border-subtle belongs in the
  // offline feature's own follow-up, not this integration commit.
  ["components/offline/manage-offline-storage.tsx", [/border-white/, /backdrop-blur-/]],
  ["components/offline/offline-storage-launcher.tsx", [/backdrop-blur-/]],
]);

const PALETTE =
  "(?:white|black|gray|grey|neutral|slate|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const UTIL =
  "(?:bg|text|border|border-[trbl]|ring|ring-offset|divide|from|to|via|placeholder|accent|caret|fill|stroke|shadow|outline|decoration)";
const VARIANTS = "(?:[a-z-]+:)*";

const RULES = [
  {
    name: "raw Tailwind palette color class",
    // matches e.g. bg-white, hover:text-gray-500/40, border-white/[0.06]
    regex: new RegExp(
      `(?<=["'\`\\s{])${VARIANTS}!?${UTIL}-${PALETTE}(?:-[0-9]{2,3})?(?:/\\[?[0-9.]+\\]?)?(?=["'\`\\s}])`,
      "g",
    ),
  },
  {
    name: "ad-hoc backdrop-blur class (use glass-blur-* utilities)",
    regex: new RegExp(
      `(?<=["'\`\\s{])${VARIANTS}backdrop-blur(?:-[a-z0-9[\\]]+)?(?=["'\`\\s}])`,
      "g",
    ),
  },
  {
    name: "arbitrary color value in class",
    regex: new RegExp(
      `(?<=["'\`\\s{])${VARIANTS}${UTIL}-\\[(?:#|rgb|hsl)[^\\]]*\\]`,
      "g",
    ),
  },
];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      yield* walk(path);
    } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
      yield path;
    }
  }
}

function stripComments(source) {
  // Remove block comments and line comments so commented-out classes
  // (and docs that mention old classes) don't trip the guard.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

let violations = 0;
for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  const allow = ALLOWLIST.get(rel) ?? [];
  const text = stripComments(readFileSync(file, "utf8"));
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.regex)) {
      const hit = match[0];
      if (allow.some((re) => re.test(hit))) continue;
      violations += 1;
      console.error(`✗ ${rel}: ${rule.name}: "${hit}"`);
    }
  }
}

if (violations > 0) {
  console.error(
    `\n${violations} design-token violation(s). Use semantic token classes ` +
      `(see design-tokens.json / AGENTS.md). Legitimate exceptions go in ` +
      `frontend/scripts/check-design-tokens.mjs ALLOWLIST with a reason.`,
  );
  process.exit(1);
}
console.log("✓ design-token guard: no raw palette/blur/arbitrary-color classes");
