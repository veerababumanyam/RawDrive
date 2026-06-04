#!/usr/bin/env node
/**
 * Token drift guard — design-tokens.json is the source of truth.
 *
 * Verifies that the per-theme color values in design-tokens.json are present
 * verbatim in the generated consumers:
 *   - frontend/src/app/globals.css   (CSS custom properties per [data-theme])
 *   - frontend/src/lib/tokens.ts     (themeMetaColors = surface.base)
 *
 * This is the safety net that replaces the (currently missing) generator
 * referenced in CLAUDE.md. It does not regenerate — it fails loudly so a
 * human keeps the three files in lockstep. Run: node scripts/check-token-drift.mjs
 */

import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url).pathname; // repo root
const tokens = JSON.parse(
  readFileSync(`${root}design-tokens.json`, "utf8"),
);
const css = readFileSync(
  `${root}frontend/src/app/globals.css`,
  "utf8",
);
const tokensTs = readFileSync(
  `${root}frontend/src/lib/tokens.ts`,
  "utf8",
);

const errors = [];

// Normalize a color value for substring comparison: lowercase, and collapse
// the rgba spacing so "rgba(20, 86, 184, 0.10)" matches the CSS-serialized
// "rgba(20, 86, 184, 0.1)". We compare on a canonical no-space form.
function canon(v) {
  return v.toLowerCase().replace(/\s+/g, "");
}
const cssCanon = canon(css);

// Color groups to verify exist in globals.css for each theme block.
const GROUPS = ["surface", "text", "accent", "semantic", "border"];

for (const [themeName, theme] of Object.entries(tokens.themes)) {
  for (const group of GROUPS) {
    const entries = theme[group] || {};
    for (const [key, def] of Object.entries(entries)) {
      if (key.startsWith("_") || !def || typeof def.value !== "string") continue;
      const v = def.value;
      // Trailing-zero tolerance: 0.10 in JSON serializes to 0.1 in CSS.
      const variants = new Set([canon(v), canon(v.replace(/(\.\d*?)0+(?=[,)])/g, "$1").replace(/\.(?=[,)])/g, ""))]);
      const hit = [...variants].some((cand) => cssCanon.includes(cand));
      if (!hit) {
        errors.push(
          `globals.css missing ${themeName}.${group}.${key} = ${v}`,
        );
      }
    }
  }
}

// themeMetaColors in tokens.ts must equal each theme's surface.base.
for (const [themeName, theme] of Object.entries(tokens.themes)) {
  const base = theme.surface?.base?.value;
  if (!base) continue;
  // Key may be quoted ("liquid-glass") or a bare identifier (midnight).
  const keyPat = `(?:["']${themeName}["']|${themeName.replace(/[^a-z0-9_$]/gi, "")})`;
  const re = new RegExp(
    `${keyPat}\\s*:\\s*["']${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    "i",
  );
  if (!re.test(tokensTs)) {
    errors.push(
      `tokens.ts themeMetaColors["${themeName}"] != surface.base (${base})`,
    );
  }
}

if (errors.length > 0) {
  console.error("✗ Token drift detected (design-tokens.json is source of truth):\n");
  for (const e of errors) console.error("  - " + e);
  console.error(
    `\n${errors.length} drift(s). Update the generated file(s) to match ` +
      `design-tokens.json, or update the JSON if the value changed intentionally.`,
  );
  process.exit(1);
}
console.log("✓ token drift guard: globals.css + tokens.ts match design-tokens.json");
