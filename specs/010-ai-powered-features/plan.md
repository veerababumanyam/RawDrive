# Implementation Plan: AI-Powered Photo Features

**Branch**: `010-ai-powered-features` | **Date**: 2025-12-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/010-ai-powered-features/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement AI-powered photo analysis, caption generation, hashtag generation, gallery story generation, and smart photo curation using Google Gemini LLM with customer-specific API keys and modular, production-ready code.

## Technical Context

**Language/Version**: Python 3.11 (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: google-generativeai, httpx, FastAPI, React, SQLAlchemy
**Storage**: PostgreSQL (analysis results, user settings), Redis (caching)
**Testing**: pytest (backend), Vitest (frontend)
**Target Platform**: Web application (Linux server)
**Performance Goals**: <30 seconds for photo analysis, <10 seconds for captions/hashtags
**Constraints**: Customer-specific API keys, no hardcoded credentials, modular reusable code
**Scale/Scope**: Workspace-scoped, user-specific AI settings, credit-based usage tracking

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

✅ **Library-First**: AI services are implemented as standalone services with clear interfaces
✅ **Test-First**: Unit and integration tests will be written for all services
✅ **Integration Testing**: API contract tests and inter-service communication tests required
✅ **Observability**: Structured logging and AI usage tracking implemented
✅ **Versioning**: API versioning follows existing patterns
✅ **Simplicity**: Modular design with single responsibility principle

**Gates Status**: ✅ PASS - No violations requiring justification

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

## Project Structure

### Documentation (this feature)

```text
specs/010-ai-powered-features/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/src/app/
├── services/
│   ├── photo_analysis_service.py     # NEW: AI photo analysis
│   ├── caption_hashtag_service.py    # NEW: Caption & hashtag generation
│   ├── gallery_story_service.py      # NEW: Gallery story generation
│   └── smart_curation_service.py     # NEW: Smart photo curation
├── api/v1/
│   └── smart_tagging.py              # UPDATED: New AI endpoints
└── config/
    └── settings.py                   # UPDATED: AI provider settings

frontend/src/
├── services/
│   ├── photoAnalysisService.ts       # NEW: Frontend photo analysis API
│   ├── captionService.ts             # NEW: Frontend caption API
│   ├── hashtagService.ts             # NEW: Frontend hashtag API
│   ├── storyService.ts               # NEW: Frontend story API
│   └── curationService.ts            # NEW: Frontend curation API
├── components/ai/
│   ├── PhotoAnalysisPanel.tsx        # NEW: Analysis UI component
│   ├── CaptionGenerator.tsx          # NEW: Caption generation UI
│   ├── HashtagGenerator.tsx          # NEW: Hashtag generation UI
│   ├── StoryGenerator.tsx            # NEW: Story generation UI
│   └── SmartCurationPanel.tsx        # NEW: Curation UI component
└── types/
    └── aiFeatures.ts                 # NEW: TypeScript types for AI features
```

**Structure Decision**: Web application with separate backend/frontend. AI services are backend-only with REST API exposure to frontend. Follows existing patterns for services, API endpoints, and component organization.

## Phase 0: Outline & Research

### Research Tasks

1. **Gemini API Integration Patterns**
   - Best practices for multimodal prompts (text + image)
   - Error handling and rate limiting
   - Cost optimization strategies

2. **AI Service Architecture**
   - Service isolation and dependency injection
   - Async processing patterns
   - Caching strategies for AI results

3. **Frontend AI Integration**
   - Loading states and error boundaries
   - Progressive enhancement for non-JS users
   - Accessibility considerations for AI features

4. **Security & Privacy**
   - API key encryption and rotation
   - User data isolation in AI requests
   - Audit logging requirements

### Expected Research Output

- `research.md` with decisions on implementation approaches
- Technical spikes for Gemini integration
- Security review findings
- Performance benchmarks

## Phase 1: Design & Contracts

### Data Model Design

- Extend existing `asset_analysis` table for AI results
- Add `ai_usage_logs` for tracking and billing
- Update `user_gemini_settings` if needed

### API Contracts

- OpenAPI specifications for new AI endpoints
- Request/response schemas
- Error response formats

### Service Contracts

- Interface definitions for AI services
- Dependency injection patterns
- Mock implementations for testing

### Expected Phase 1 Output

- `data-model.md` with schema changes
- `contracts/` directory with API specs
- `quickstart.md` for development setup
- Updated agent context files

## Phase 2: Implementation & Verification

### Implementation Tasks

1. **Backend Services**
   - Photo analysis service with Gemini integration
   - Caption and hashtag generation services
   - API endpoints with validation
   - Error handling and logging

2. **Frontend Components**
   - AI feature UI components
   - API integration services
   - Loading and error states
   - Accessibility features

3. **Testing & Quality**
   - Unit tests for all services
   - Integration tests for API endpoints
   - E2E tests for user workflows
   - Performance and security testing

### Quality Gates

- ✅ TypeScript: No errors (strict mode)
- ✅ Mobile-first responsive (≤320px → 5K)
- ✅ WCAG 2.1 AA (contrast, focus rings, ARIA)
- ✅ Code quality standards (KISS, DRY, modular)
- ✅ Dark mode integration
- ✅ Component reuse
- ✅ tRPC + Zod validation
- ✅ Error boundaries + loading states
- ✅ Accessibility (keyboard nav, screen readers)
- ✅ Performance (lazy loading, suspense)

## Success Criteria

- All AI features functional with Gemini API
- User-friendly API key configuration flow
- Modular, reusable code architecture
- Comprehensive test coverage
- Performance meets requirements
- Security audit passed

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
