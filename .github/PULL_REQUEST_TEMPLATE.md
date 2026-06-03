<!--
  PRs are squash-merged, so this PR's TITLE becomes the commit subject on main.
  Title must be a Conventional Commit, e.g.  fix(galleries): correct thumbnail order
  (Tip: `npm run ship` does all of this for you.)
-->

## Summary

<!-- What changed and why. Link issues with "Closes #NN". -->

## How it was tested

<!-- Commands run, scenarios covered. Backend tests run in Docker (testcontainers). -->

## Checklist (RawDrive laws — see AGENTS.md)

- [ ] `npm run test` passes locally (backend + frontend, in Docker)
- [ ] No hardcoded secrets — config via `platform_settings` (DB) or env only
- [ ] Storage stays on the `s3`/B2 driver — no `STORAGE_DRIVER=local` path
- [ ] UI uses design tokens (no `neutral-*`/`gray-*`/arbitrary `[...]` values)
- [ ] Icon actions use `GlassIconButton` (no raw `<button>` + inline SVG)
- [ ] DB migrations are paired `NNN_*.up.sql` / `.down.sql`, not renumbered
- [ ] Handlers read JWT via `middleware.JWTClaimsFromContext` (no local context-key type)
- [ ] Renders across all three themes; interactive touch targets ≥ 44px
- [ ] No new OTP-on-login path; email-OTP stays registration-only
