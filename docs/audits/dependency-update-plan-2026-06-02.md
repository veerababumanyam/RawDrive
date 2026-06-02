# RawDrive — package.json Library Update Plan

**Date:** 2026-06-02
**App version:** `rawdrive` v0.1.2 (`package.json`, `cobolt-state.json`)
**Scope:** The three npm manifests only — root `package.json`, `frontend/package.json`, `e2e/package.json`. Backend Go modules, Python sidecar, and container images are **out of scope here** (they have no `package.json`); for those, see the still-valid §5–§7 of [`dependency-update-plan-2026-05-30.md`](./dependency-update-plan-2026-05-30.md).
**Method:** Read all three manifests in-repo, then resolved every package's `dist-tags.latest` + publish date live from the npm registry JSON on 2026-06-02, and resolved the peer/engines ranges of every gatekeeper (`next`, `eslint-config-next`, `eslint`, `typescript`, `typescript-eslint`, `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `jsdom`) to verify compatibility. No version below is guessed from training data.
**Type:** Documentation-only. No installs, no builds, no edits applied. This is a planning artifact.

> **Relationship to the 2026-05-30 plan:** That plan's frontend Wave 2 has been applied — the repo is now on `next 16.2.6`, `react 19.2.6`, `eslint-config-next 16.2.6`, `lucide 1.17.0`, `tailwind-merge 3.6.0`, `vitest 4.1.7`, `@vitejs/plugin-react 6.0.2`, `jsdom 29.1.1`. **This document supersedes §3–§4 of the May 30 plan** with fresh 2026-06-02 data and adds the compatibility analysis for the three newly-available majors.

---

## 0. Executive summary

The frontend is **already current** — every caret-ranged dependency already permits the latest within its range. The actionable work splits cleanly:

| Bucket | Items | Risk | Effort |
|---|---|---|---|
| 🟢 **Pinned patch bumps** (exact-pinned → newer patch exists) | `next`, `react`, `react-dom`, `eslint-config-next` → `.7` | Trivial | Manifest edit + `pnpm test`/`build` |
| 🟢 **Caret refresh** (range already allows; lockfile-only) | `tailwindcss`, `@tailwindcss/postcss`, `@types/react`, `@types/react-dom`, `vitest`, `@axe-core/playwright` | Trivial | `pnpm update` |
| 🟡 **Majors — newly available, compatibility-verified** | `eslint 9→10`, `@types/node 20→25` | Low–Moderate | Branch + `pnpm lint`/`test` |
| 🔵 **Major — verified at tooling layer, codebase risk** | `typescript 5→6` | Moderate | Branch + full `tsc --noEmit` + `next build` |
| ⏸️ **Hold** (latest stable already installed; only alpha/rc newer) | `prettier` (4.0 alpha), `playwright`/`@playwright/test` (1.61 alpha), `sharp` (0.35 rc) | — | Watch |

**The single most important detail:** `eslint 10` and `typescript 6` are gated by the **same** transitive package — `typescript-eslint`, which `eslint-config-next` bundles. The latest 8.x line clears **both** gates (see §2). Treat them as one coordinated decision, not two.

**Recommended order:** Wave 1 (pinned patches + caret refresh) → Wave 2 (`eslint 10` + `@types/node 25`) → Wave 3 (`typescript 6`, its own branch).

---

## 1. Current vs latest — every package, all three manifests

Resolved live from the npm registry on 2026-06-02. "In range?" = does the existing caret/pin already permit `latest`.

### `frontend/package.json` — dependencies
| Package | Current | Latest (2026-06-02) | In range? | Action |
|---|---|---|---|---|
| next | `16.2.6` (pinned) | **16.2.7** | ❌ pinned | Bump to `16.2.7` (lockstep w/ `eslint-config-next`). 16.2.7 = 2026-06-01 patch. |
| react | `19.2.6` (pinned) | **19.2.7** | ❌ pinned | Bump to `19.2.7` (with `react-dom`). No React 20. |
| react-dom | `19.2.6` (pinned) | **19.2.7** | ❌ pinned | Bump to `19.2.7` (with `react`). |
| lucide-react | `^1.17.0` | 1.17.0 | ✅ | None (current). |
| tailwind-merge | `^3.6.0` | 3.6.0 | ✅ | None (current; v3 line is correct for Tailwind v4). |
| clsx | `^2.1.1` | 2.1.1 | ✅ | None. |
| class-variance-authority | `^0.7.1` | 0.7.1 | ✅ | None — but **dormant ~2 yrs**; watch for a maintained successor. No CVE. |
| qrcode | `^1.5.4` | 1.5.4 | ✅ | None (stable/dormant). |
| react-dropzone | `^15.0.0` | 15.0.0 | ✅ | None. |

### `frontend/package.json` — devDependencies
| Package | Current | Latest | In range? | Action |
|---|---|---|---|---|
| eslint | `^9` | **10.4.1** | ❌ major | **🟡 Wave 2 — bump `^9`→`^10`.** Compatibility verified, see §2. |
| typescript | `^5` | **6.0.3** | ❌ major | **🔵 Wave 3 — bump `^5`→`^6`.** Tooling-compatible, codebase risk, see §2. |
| @types/node | `^20` | **25.9.1** | ❌ major | **🟡 Wave 2 — bump `^20`→`^25`.** Runtime is Node 26; `^20` is stale. Low risk, see §2. |
| eslint-config-next | `16.2.7`? → currently `16.2.6` (pinned) | **16.2.7** | ❌ pinned | Bump to `16.2.7` (lockstep with `next`). |
| tailwindcss | `^4` | **4.3.0** | ✅ | Caret refresh (`pnpm update`). |
| @tailwindcss/postcss | `^4` | **4.3.0** | ✅ | Caret refresh. Keep == `tailwindcss`. |
| @types/react | `^19` | **19.2.16** | ✅ | Caret refresh. |
| @types/react-dom | `^19` | **19.2.3** | ✅ | Caret refresh. |
| vitest | `^4.1.7` | **4.1.8** | ✅ | Caret refresh. |
| @vitejs/plugin-react | `^6.0.2` | 6.0.2 | ✅ | None (current). |
| jsdom | `^29.1.1` | 29.1.1 | ✅ | None. |
| @testing-library/react | `^16.3.2` | 16.3.2 | ✅ | None. |
| @testing-library/jest-dom | `^6.9.1` | 6.9.1 | ✅ | None. |
| @types/qrcode | `^1.5.6` | 1.5.6 | ✅ | None. |
| sharp | `^0.34.5` | 0.34.5 (0.35.0-rc.5 = `next`) | ✅ | ⏸️ Hold for stable 0.35. |
| prettier | `^3.8.3` | 3.8.3 (4.0.0-alpha.13 = `next`) | ✅ | ⏸️ Hold — 4.0 is alpha. |

### root `package.json` — devDependencies
| Package | Current | Latest | In range? | Action |
|---|---|---|---|---|
| playwright | `^1.60.0` | 1.60.0 (1.61.0-alpha = `next`) | ✅ | None — at latest stable. Keep == `@playwright/test`. |
| prettier | `^3.8.3` | 3.8.3 | ✅ | ⏸️ Hold (4.0 alpha). |

Root `engines`: `node >=20.0.0`. **Recommend raising to `>=22`** (carry-over from May 30 plan): `eslint 10`, `@vitejs/plugin-react 6`, `jsdom 29`, and `vitest 4` all declare a Node `^20.19 || ^22.13 || >=24` floor. Local runtime is **Node 26.1.0** — already fine; the manifest floor is just lagging.

### `e2e/package.json` — devDependencies
| Package | Current | Latest | In range? | Action |
|---|---|---|---|---|
| @playwright/test | `^1.60.0` | 1.60.0 | ✅ | None — at latest stable. MUST equal the Docker `playwright` image tag. |
| @axe-core/playwright | `^4.11.2` | **4.11.3** | ✅ | Caret refresh. |

---

## 2. Compatibility analysis — the three majors

This is the core of the request. Verdicts are derived from live peer/engines ranges, not assumptions.

### 🟡 `eslint 9 → 10.4.1` — **COMPATIBLE (conditional on a lockfile refresh)**

| Gate | Finding | Verdict |
|---|---|---|
| Config format | `eslint 10` removed legacy `.eslintrc` entirely; flat config only. Repo uses `frontend/eslint.config.mjs` (flat, imports `eslint-config-next/core-web-vitals` + `/typescript`). | ✅ Met |
| `eslint-config-next@16.2.7` peer | `eslint: ">=9.0.0"` | ✅ Permits 10 |
| Transitive `typescript-eslint` | `eslint-config-next` depends on `typescript-eslint: ^8.46.0`. **`8.46.0` peers `eslint: ^8.57 \|\| ^9` (NO 10).** The latest 8.x, **`8.60.1`, peers `eslint: ^8.57 \|\| ^9 \|\| ^10`.** The `^8.46.0` caret resolves to `8.60.1` on a fresh install/update. | ⚠️ Must ensure lockfile resolves `typescript-eslint ≥ 8.60` |
| Node engine | `eslint 10` engines `^20.19 \|\| ^22.13 \|\| >=24`. Runtime = Node 26. | ✅ Met |
| `jiti` peer | `eslint 10` peers `jiti: *` (optional, for TS config files). Not needed — config is `.mjs`. | ✅ N/A |

**Action:** bump `eslint` `^9`→`^10`; run `pnpm update typescript-eslint` (or a full `pnpm update`) so the transitive `typescript-eslint` lands on `8.60.x`; then `pnpm lint`. **Residual risk:** new/retuned rules in `eslint 10` may surface new warnings/errors — fix or `// eslint-disable` as appropriate. Low–moderate, fully visible from `pnpm lint`.

### 🔵 `typescript 5 → 6.0.3` — **TOOLING-COMPATIBLE; codebase risk requires a typecheck run**

| Gate | Finding | Verdict |
|---|---|---|
| `eslint-config-next@16.2.7` peer | `typescript: ">=3.3.1"` | ✅ Permits 6 |
| Transitive `typescript-eslint` | **`8.46.0` peers `typescript: ">=4.8.4 <6.0.0"` (EXCLUDES 6).** The latest **`8.60.1` peers `typescript: ">=4.8.4 <6.1.0"` (INCLUDES 6.0.x).** Same caret-resolution as above lands `8.60.1`. | ⚠️ Must ensure `typescript-eslint ≥ 8.60` (same gate as eslint 10 — coupled) |
| `next 16` typecheck | Next does not declare a `typescript` peer; it consumes whatever is installed for `next build` type-checking and `next-env.d.ts`. TS 6 support is not contractually guaranteed by a peer range. | ⚠️ Verify via `next build` |
| Codebase | TS 6.0 is a language **major** — stricter `lib.*.d.ts`, removed deprecated flags/behaviors. This can surface **new type errors in app code** independent of any tooling peer. | ⚠️ **Cannot be confirmed by a doc audit** |

**Action (its own branch, last):** bump `typescript` `^5`→`^6`; ensure `typescript-eslint ≥ 8.60` resolves; run **`pnpm exec tsc --noEmit`** and **`pnpm build`** and **`pnpm lint`** — all three must pass before merge. **Residual risk:** moderate; the unknown is how many app-code type errors TS 6 surfaces. Stage after eslint 10 so the `typescript-eslint` bump is already proven.

> **Coupling note:** because both majors depend on `typescript-eslint ≥ 8.60`, doing `eslint 10` first (Wave 2) de-risks `typescript 6` (Wave 3) — the transitive bump is already locked and lint-proven by the time TS 6 lands.

### 🟡 `@types/node 20 → 25.9.1` — **COMPATIBLE, LOW RISK**

| Gate | Finding | Verdict |
|---|---|---|
| `vitest 4.1.8` peer | `@types/node: "^20 \|\| ^22 \|\| >=24"` | ✅ Permits 25 |
| Runtime alignment | Local/CI runtime is **Node 26.1.0**; `^20` types are 6 majors behind the runtime. `@types/node 25` is the latest published line (no `26` line yet — types lag the runtime). | ✅ Closer to truth |

**Action:** bump `@types/node` `^20`→`^25`. **Residual risk:** low — newly-typed/removed Node APIs may surface a handful of type adjustments; visible from `tsc`. Safe to do in Wave 2 alongside eslint 10.

---

## 3. ⚠️ The `pnpm.overrides` gotcha (do not miss)

`frontend/package.json` pins transitive security patches via:
```json
"pnpm": {
  "overrides": {
    "postcss@<8.5.10": "8.5.15",
    "next@16.2.6>postcss": "8.5.15",          // ← keyed to the EXACT next version
    "brace-expansion@>=5.0.0 <5.0.6": "5.0.6"
  }
}
```
The middle override is keyed to **`next@16.2.6`**. When `next` is bumped to **`16.2.7`** (Wave 1), this key **silently becomes a no-op** and the `postcss` pin for next's subtree is lost. **Update the key to `next@16.2.7>postcss` in the same edit.** Verify after install: `pnpm why postcss` should still show `8.5.15` everywhere.

---

## 4. Phased rollout

**Wave 1 — Patches + caret refresh (this sprint, trivial, independently revertible)**
- Edit `frontend/package.json`: `next 16.2.6→16.2.7`, `react 19.2.6→19.2.7`, `react-dom 19.2.6→19.2.7`, `eslint-config-next 16.2.6→16.2.7`, **and** update the `next@16.2.6>postcss` override key → `next@16.2.7>postcss` (§3).
- `pnpm update` to refresh caret-covered: `tailwindcss`/`@tailwindcss/postcss` → 4.3.0, `@types/react` → 19.2.16, `@types/react-dom` → 19.2.3, `vitest` → 4.1.8, `@axe-core/playwright` → 4.11.3.
- Verify: `pnpm install && pnpm lint && pnpm test && pnpm build`; `pnpm why postcss`.

**Wave 2 — `eslint 10` + `@types/node 25` (branch, low–moderate)**
- Edit: `eslint ^9→^10`, `@types/node ^20→^25`. Raise root `engines.node` → `>=22`.
- `pnpm update typescript-eslint` (confirm it resolves `≥8.60`); `pnpm install`.
- Verify: `pnpm lint` (triage new rule output), `pnpm test`, `pnpm build`.

**Wave 3 — `typescript 6` (separate branch, moderate, last)**
- Edit: `typescript ^5→^6`. Relies on the `typescript-eslint ≥8.60` already locked in Wave 2.
- Verify (all must pass): `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm lint`, `pnpm test`. Fix surfaced TS 6 type errors in app code.

**Hold / watch (no action):** `prettier 4.0` (alpha), `playwright`/`@playwright/test 1.61` (alpha), `sharp 0.35` (rc), `class-variance-authority` (dormant — watch for successor).

---

## 5. Command & edit appendix

```bash
# ---- Wave 1: pinned patches + caret refresh (frontend) ----
cd frontend
# Manual edits in package.json:
#   "next": "16.2.7", "react": "19.2.7", "react-dom": "19.2.7",
#   "eslint-config-next": "16.2.7",
#   pnpm.overrides: "next@16.2.7>postcss": "8.5.15"   (was 16.2.6)
pnpm update              # refreshes tailwindcss 4.3.0, @types/react 19.2.16,
                         # @types/react-dom 19.2.3, vitest 4.1.8
pnpm install && pnpm lint && pnpm test && pnpm build
pnpm why postcss         # must still show 8.5.15 in next's subtree

# ---- Wave 2: eslint 10 + @types/node 25 ----
# Edit package.json: "eslint": "^10", "@types/node": "^25"
# Edit root package.json: "engines": { "node": ">=22" }
pnpm update typescript-eslint   # confirm >=8.60 (adds eslint ^10 + ts <6.1 peers)
pnpm install && pnpm lint && pnpm test && pnpm build

# ---- Wave 3: typescript 6 (own branch) ----
# Edit package.json: "typescript": "^6"
pnpm install
pnpm exec tsc --noEmit && pnpm build && pnpm lint && pnpm test

# ---- e2e (caret refresh, anytime) ----
cd ../e2e && pnpm update    # @axe-core/playwright 4.11.3

# ---- sanity: what's actually behind, all manifests ----
pnpm -r outdated 2>/dev/null || (cd frontend && pnpm outdated)
```

---

## 6. Notes & caveats

- **Out of scope here:** backend Go modules (`backend/go.mod`), the Python face-svc sidecar, Robot tests, and all container/base images. Those carry the real security-priority items (pgx CVE, Go toolchain, base-image patches) and are tracked in the still-current §1–§2 and §5–§7 of [`dependency-update-plan-2026-05-30.md`](./dependency-update-plan-2026-05-30.md). This document deliberately covers **only the `package.json` manifests**, per the request.
- **Caret reality:** ~14 of the ~28 npm packages are already at their latest within range — those are lockfile refreshes, not version-bump decisions.
- **Architectural invariants respected:** nothing here touches `STORAGE_DRIVER`, secrets resolution, the WebP pipeline, JWT context, or design tokens. All edits are version strings + one `pnpm.overrides` key.
- **No code changed.** This is a plan; apply via the waves above on a branch, not `main`.
