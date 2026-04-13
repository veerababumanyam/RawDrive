# Implementation Plan: Gallery Workspace Unification (F-013)

**Date**: 2026-04-13
**Prepared with**: cobolt-plan feature mode
**Milestones**: M36-M38
**Primary planning artifacts**:

- `_cobolt-output/latest/planning/feature-prd.md`
- `_cobolt-output/latest/planning/feature-architecture-delta.md`
- `_cobolt-output/latest/planning/feature-epics.md`
- `_cobolt-output/latest/planning/stories/36-*.md`
- `_cobolt-output/latest/planning/stories/37-*.md`
- `_cobolt-output/latest/planning/stories/38-*.md`

## Executive Decision

Gallery-related features should be grouped under one umbrella: Gallery Workspace. Business Settings owns studio identity and logo. Clients own relationships. Galleries own delivery. Cover photo, public sharing, proofing, downloads, sales, analytics, AI curation, and settings are sections of the gallery delivery workflow.

## Implementation Sequence

1. M36: Fix the foundation first. Add explicit gallery-client links, route/link cleanup, workspace shell, and API contract consistency.
2. M37: Connect presentation and sharing. Business logo/studio identity, cover photo system, publish checklist, and Share Center.
3. M38: Complete the workflow. Proofing to delivery, delivery package builder, analytics/activity, AI curation, and commerce bridge.

## Why This Order

- `M36-M38` use later milestone numbers only to avoid collisions with reserved CRM and livestream plans. Gallery Workspace has no product dependency on livestream.
- The logical prerequisite for M36 is CRM client/project readiness from M26, not livestream completion.
- Client linkage must exist before public sharing, proofing, delivery, and analytics can be properly attributed.
- Workspace shell must exist before cover/share/proofing/delivery can feel like one UI.
- Studio identity must exist before public gallery branding and share templates can be made consistent.
- Cover photo must be tied to publish readiness before public sharing is improved.
- Delivery packages depend on proofing selections and public sharing settings.

## Mandatory Scope Included

- Gallery-client linkage
- Cover photo system
- Public sharing and Share Center
- Business Settings logo and studio identity
- Public gallery branding
- Client portal and aggregate client pages
- Proofing-to-delivery workflow
- Download packages and audit
- Analytics/activity and top asset routes
- AI curation actions
- Commerce/sales continuity
- Internal link cleanup
- API client consolidation

## Build Readiness Decisions Needed

- Use `primary_contact_id` on `galleries` for main client and `gallery_recipients` for invited viewers.
- Use existing `workspaces.logo_url` for logo and add missing brand fields either to `workspaces` or a `workspace_branding` table.
- Decide whether client dashboard Proofing/Favorites/Downloads should be real aggregate pages in M37 or removed from nav until later.
- Normalize plan tier labels for branding gates before implementation.

## Milestone Summary

### M36: Gallery Workspace Foundation and Link Hygiene

- E90: Gallery-Client-Job Linkage
- E91: Gallery Workspace Shell and Link Hygiene
- E92: Gallery API Contract and Client Consolidation

### M37: Studio Identity, Cover Photo, and Public Sharing

- E93: Studio Identity and Business Branding
- E94: Cover Photo System and Publish Readiness
- E95: Public Sharing and Client Portal Aggregates

### M38: Proofing, Delivery, Insights, AI, and Commerce Continuity

- E96: Proofing to Delivery Workflow
- E97: Delivery Packages and Download Audit
- E98: Gallery Insights and Activity
- E99: AI Curation and Commerce Bridge

## Verification Expectations

- Backend unit tests for migrations, handlers, repository scoping, share logs, delivery sets, analytics endpoints.
- Frontend unit tests for shell routing, client selector, business logo settings, cover publish checklist, share center, aggregate pages.
- Playwright tests inside Docker for gallery create-to-share-to-proof-to-deliver flow using `tests/photos/`.
- Route contract test for static and dynamic dashboard links.
- API contract tests for frontend gallery analytics routes vs backend route registration.

## Constraints

- No standalone upload sidebar route.
- No local storage.
- No hardcoded credentials.
- R2 remains the storage backend.
- Public file serving remains authenticated where required.
- WebP derivatives remain mandatory.
- Email OTP remains registration-only.
