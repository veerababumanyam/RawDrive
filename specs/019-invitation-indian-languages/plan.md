# Implementation Plan: Indian Language Support for Invitations

**Branch**: `019-invitation-indian-languages` | **Date**: 2026-01-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-invitation-indian-languages/spec.md`

## Summary

Enable users to create digital invitations in any of 12 Indian regional languages (Hindi, Telugu, Tamil, Kannada, Malayalam, Assamese, Bengali, Gujarati, Marathi, Odia, Punjabi, Urdu) independent of their application UI language preference. This requires updating frontend components to use the centralized `SUPPORTED_LANGUAGES` configuration and ensuring proper font rendering including RTL support for Urdu.

## Technical Context

**Language/Version**: TypeScript 5.2+ (Frontend React 19), Python 3.11 (Backend FastAPI)
**Primary Dependencies**: React 19, react-i18next, TailwindCSS 3.3, FastAPI 0.115+, Gemini API
**Storage**: PostgreSQL 16 (existing `invitations` table with `primary_language`, `secondary_language` columns)
**Testing**: Vitest (Frontend), pytest (Backend)
**Target Platform**: Web (Desktop + Mobile responsive)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: Language selection < 100ms, AI generation < 5s, font loading < 500ms
**Constraints**: Must support RTL (Urdu), all 12 Indic scripts must render correctly
**Scale/Scope**: 13 languages total (12 Indian + English), 4 components to update

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with RawDrive Constitution (`.specify/memory/constitution.md`):

- [x] **I. Security**: No hardcoded secrets, parameterized queries, input validation
  - *Language codes validated against SUPPORTED_LANGUAGES whitelist*
- [x] **II. Accessibility**: WCAG 2.1 AA compliance, keyboard nav, screen reader support
  - *Language selector uses semantic HTML, native script names improve accessibility for native speakers*
- [x] **III. Design System**: Uses design tokens, no hardcoded colors, standard UI components
  - *Uses existing Select, AppInput components; no new custom UI*
- [x] **IV. Multi-Tenant Isolation**: All queries include workspace_id, RBAC enforced
  - *Invitation language persisted per-workspace; no cross-tenant data access*
- [x] **V. Testing**: Coverage targets defined (95% security, 85% services, 70% UI)
  - *Unit tests for language selection, integration tests for AI generation*
- [x] **VI. Clean Code**: SOLID principles, max file lengths, no over-engineering
  - *Centralizes language config (DRY), simple component updates*
- [x] **VII. Observability**: Structured logging, metrics, audit trail for sensitive ops
  - *AI generation calls already logged; language selection tracked in invitation data*

## Project Structure

### Documentation (this feature)

```text
specs/019-invitation-indian-languages/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── i18n/
│   │   └── config.ts                           # SUPPORTED_LANGUAGES source of truth (EXISTS)
│   ├── components/
│   │   ├── features/
│   │   │   └── invitations/
│   │   │       ├── AITextGenerator.tsx         # UPDATE: use SUPPORTED_LANGUAGES
│   │   │       ├── InvitationWizard.tsx        # UPDATE: use SUPPORTED_LANGUAGES
│   │   │       └── InvitationLanguageSelect.tsx # NEW: reusable language selector
│   │   └── settings/
│   │       └── LanguageSelector.tsx            # REFERENCE: uses SUPPORTED_LANGUAGES correctly
│   ├── pages/
│   │   └── public/
│   │       └── PublicInvitationPage.tsx        # UPDATE: expand LANGUAGE_CONFIG
│   └── index.css                               # UPDATE: add font-lang-* classes for new languages

backend/
├── src/
│   └── app/
│       ├── services/
│       │   └── invitation_ai_service.py        # UPDATE: enhance prompt for cultural context
│       └── api/
│           └── v1/
│               └── invitation_ai.py            # VERIFY: language validation
└── tests/
    └── unit/
        └── test_invitation_ai_service.py       # ADD: tests for regional languages

```

**Structure Decision**: Web application pattern - frontend React components + backend FastAPI services. No new directories needed; updates to existing files plus one new reusable component.

## Complexity Tracking

> No Constitution violations requiring justification. Implementation follows DRY principle by centralizing language configuration.

## Key Implementation Areas

### 1. Frontend Language Configuration Consolidation

**Current State**: Three separate hardcoded language lists:
- `AITextGenerator.tsx:89-97` - 6 Western languages
- `InvitationWizard.tsx:137-144` - 6 Indian languages
- `PublicInvitationPage.tsx:56-66` - 6 Indian languages

**Target State**: All components import from `SUPPORTED_LANGUAGES` in `frontend/src/i18n/config.ts`

### 2. AI Content Generation Enhancement

**Current State**: Backend prompt at `invitation_ai_service.py:106-129` passes language as string but doesn't provide cultural context.

**Target State**: Enhanced prompt with cultural styling guidance per language.

### 3. Font Loading & RTL Support

**Current State**: Font classes exist for 6 languages in `index.css`

**Target State**:
- Font classes for all 12 languages (+ Urdu RTL)
- Google Fonts Noto family for Indic scripts
- RTL layout support via `dir="rtl"` attribute

### 4. Language Selection UX

**Current State**: Different dropdown implementations with inconsistent language lists

**Target State**:
- Single `InvitationLanguageSelect` component showing native script names
- Consistent across AI generator, wizard, and template selector
