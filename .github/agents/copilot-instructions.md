# RawDrive Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-12-28

## Active Technologies
- Backend Python 3.11 (FastAPI), Frontend TypeScript 5.2 + React 18 (Vite) + FastAPI, SQLAlchemy/asyncpg, Redis, structlog, SendGrid SDK, Zod, React Query, Tailwind UI kit (`AppButton`, `AppInput`, etc.) (020-invitation-rsvp-hardening)
- PostgreSQL 16 for RSVPs/audit events, Redis 7 for idempotency + job queues, S3/R2 for asset storage (unchanged) (020-invitation-rsvp-hardening)
- TypeScript 5.2+, Python 3.9+ + npm/pnpm workspaces, Zod 4.2+, Pydantic 2.7+, json-schema-to-typescrip (022-shared-packages)
- N/A (no database changes - application-level type sharing) (022-shared-packages)

- (010-ai-powered-features) Python 3.11, TypeScript 5.2+, Google Gemini API, FastAPI, React
- (009-profile-tabs-redesign)

## Project Structure

```text
backend/src/app/
├── services/
│   ├── photo_analysis_service.py     # AI photo analysis
│   ├── caption_hashtag_service.py    # Caption & hashtag generation
│   └── gemini_client_service.py      # User-specific Gemini clients
├── api/v1/
│   └── smart_tagging.py              # AI endpoints
└── config/
    └── settings.py                   # AI provider settings

frontend/src/
├── services/
│   ├── geminiSettingsService.ts      # User settings API
│   └── adminGeminiService.ts         # Admin model management
├── components/ai/                    # AI feature components
└── types/
    └── geminiSettings.ts             # TypeScript types
```

## Commands

### Backend
```bash
# Install AI dependencies
pip install google-generativeai httpx

# Run tests
python -m pytest tests/ -k "ai" -v

# Check AI usage
psql -d rawdrive -c "SELECT * FROM ai_usage_logs ORDER BY created_at DESC LIMIT 5;"
```

### Frontend
```bash
# Install dependencies
npm install

# Run AI component tests
npm test -- --testPathPattern=ai
```

## Code Style

- **AI Services**: Async/await patterns, comprehensive error handling
- **API Keys**: Never log or expose in frontend, use encrypted backend storage
- **Error Messages**: User-friendly messages with links to settings for missing keys
- **Caching**: 24-hour cache for analysis results to optimize costs
- **Validation**: Strict input validation for AI requests

## Recent Changes
- 022-shared-packages: Added TypeScript 5.2+, Python 3.9+ + npm/pnpm workspaces, Zod 4.2+, Pydantic 2.7+, json-schema-to-typescrip
- 020-invitation-rsvp-hardening: Added Backend Python 3.11 (FastAPI), Frontend TypeScript 5.2 + React 18 (Vite) + FastAPI, SQLAlchemy/asyncpg, Redis, structlog, SendGrid SDK, Zod, React Query, Tailwind UI kit (`AppButton`, `AppInput`, etc.)

- 010-ai-powered-features: AI-powered photo analysis, caption generation, hashtag generation using Gemini LLM

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
