# Quickstart: Per-User Gemini LLM Settings

**Feature**: 003-user-gemini-settings
**Date**: 2025-12-27

## Prerequisites

Before implementing this feature, ensure:

1. **Database migrations up to 0037** are applied
2. **Encryption service** is configured with `ENCRYPTION_MASTER_KEY` env var
3. **Settings pages** exist (Profile, Security, Notifications)
4. **Admin microservice** exists OR admin middleware is set up in main backend

## Setup Steps

### 1. Apply Database Migration

```bash
cd backend
DATABASE_URL="postgresql://rawdrive:rawdrive@localhost:5432/rawdrive" \
  PYTHONPATH=src alembic upgrade head
```

This creates:
- `gemini_models` table with seed data (4 default models)
- `user_gemini_settings` table for per-user configuration
- `ai_usage_logs` table for tracking

### 2. Verify Seed Data

```sql
SELECT identifier, display_name, is_default FROM gemini_models ORDER BY sort_order;
```

Expected output:
```
 identifier        | display_name      | is_default
-------------------+-------------------+------------
 gemini-2.5-flash  | Gemini 2.5 Flash  | t
 gemini-2.5-pro    | Gemini 2.5 Pro    | f
 gemini-1.5-flash  | Gemini 1.5 Flash  | f
 gemini-1.5-pro    | Gemini 1.5 Pro    | f
```

### 3. Start Development Servers

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

## Implementation Order

### Phase 1: Backend Core (Day 1-2)

1. **Migration file** (`migrations/versions/0038_gemini_settings.py`)
   - Use schema from [data-model.md](./data-model.md)

2. **Encryption extension** (`services/encryption_service.py`)
   - Add `_derive_user_key()` method
   - Add `encrypt_user_api_key()` / `decrypt_user_api_key()` methods

3. **Settings service** (`services/gemini_settings_service.py`)
   ```python
   class GeminiSettingsService:
       async def get_user_settings(user_id: UUID) -> UserGeminiSettings | None
       async def update_api_key(user_id: UUID, api_key: str) -> UserGeminiSettings
       async def revoke_api_key(user_id: UUID) -> UserGeminiSettings
       async def update_model_selection(user_id: UUID, model_id: UUID | None) -> UserGeminiSettings
       async def validate_api_key(api_key: str) -> tuple[bool, str | None]
   ```

4. **API endpoints** (`api/v1/gemini_settings.py`)
   - GET/PUT/DELETE `/users/me/gemini-settings`
   - POST `/users/me/gemini-settings/validate`
   - GET `/gemini-models`

### Phase 2: Admin Backend (Day 2-3)

5. **Admin model service** (`services/gemini_model_service.py`)
   ```python
   class GeminiModelService:
       async def list_all_models() -> list[GeminiModel]
       async def create_model(data: CreateModelData) -> GeminiModel
       async def update_model(model_id: UUID, data: UpdateModelData) -> GeminiModel
       async def delete_model(model_id: UUID) -> None
       async def reorder_models(model_ids: list[UUID]) -> None
       async def get_admin_stats() -> GeminiAdminStats
   ```

6. **Admin endpoints** (`api/v1/admin_gemini_models.py`)
   - CRUD on `/admin/gemini-models`
   - GET `/admin/users/gemini-stats`

### Phase 3: Frontend (Day 3-4)

7. **TypeScript types** (`types/geminiSettings.ts`)
   - See API contract schemas

8. **API service** (`services/geminiSettingsService.ts`)
   ```typescript
   export const geminiSettingsService = {
     getSettings: () => api.get('/users/me/gemini-settings'),
     updateSettings: (data) => api.put('/users/me/gemini-settings', data),
     revokeKey: () => api.delete('/users/me/gemini-settings'),
     validateKey: (apiKey) => api.post('/users/me/gemini-settings/validate', { api_key: apiKey }),
     listModels: () => api.get('/gemini-models'),
   };
   ```

9. **React hooks** (`hooks/useGeminiSettings.ts`)
   ```typescript
   export function useGeminiSettings() { /* React Query hooks */ }
   export function useGeminiModels() { /* Model list hook */ }
   ```

10. **Settings page** (`pages/settings/AISettingsPage.tsx`)
    - Follow SecuritySettingsPage pattern
    - Include: status display, key form, model selector

11. **Components**:
    - `GeminiApiKeyForm.tsx` - Key entry with validation
    - `GeminiModelSelector.tsx` - Model dropdown

### Phase 4: Integration (Day 4-5)

12. **Gemini client factory** (`services/gemini_client_service.py`)
    ```python
    class GeminiClientService:
        async def get_client_for_user(user_id: UUID, workspace_id: UUID) -> GeminiClient
    ```

13. **Update existing AI features** to use `GeminiClientService`
    - `ai_policy_service.py`
    - Any other AI features

14. **Add route to settings navigation** in `SettingsLayout.tsx`

## Testing Checklist

### Unit Tests (Backend)
- [ ] `test_gemini_settings_service.py`
  - [ ] `test_create_settings_for_new_user`
  - [ ] `test_validate_api_key_success`
  - [ ] `test_validate_api_key_invalid`
  - [ ] `test_revoke_api_key`
  - [ ] `test_model_selection_with_default_fallback`

- [ ] `test_encryption_user_key.py`
  - [ ] `test_encrypt_decrypt_roundtrip`
  - [ ] `test_user_isolation` (different users get different keys)

### Integration Tests (Backend)
- [ ] `test_gemini_settings_api.py`
  - [ ] `test_get_settings_unauthenticated` → 401
  - [ ] `test_get_settings_new_user` → status='not_configured'
  - [ ] `test_update_with_invalid_key` → 400
  - [ ] `test_update_with_valid_key` → status='connected'
  - [ ] `test_revoke_key` → status='not_configured'

### Component Tests (Frontend)
- [ ] `GeminiApiKeyForm.test.tsx`
  - [ ] Renders form correctly
  - [ ] Shows loading state during validation
  - [ ] Shows error message on validation failure
  - [ ] Does not clear input on error

## Environment Variables

No new environment variables required. Uses existing:
- `ENCRYPTION_MASTER_KEY` - For API key encryption
- `DATABASE_URL` - PostgreSQL connection

## API Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/users/me/gemini-settings` | User | Get current settings |
| PUT | `/api/v1/users/me/gemini-settings` | User | Update key/model |
| DELETE | `/api/v1/users/me/gemini-settings` | User | Revoke API key |
| POST | `/api/v1/users/me/gemini-settings/validate` | User | Validate key only |
| GET | `/api/v1/gemini-models` | User | List active models |
| GET | `/api/v1/admin/gemini-models` | Admin | List all models |
| POST | `/api/v1/admin/gemini-models` | Admin | Create model |
| PUT | `/api/v1/admin/gemini-models/{id}` | Admin | Update model |
| DELETE | `/api/v1/admin/gemini-models/{id}` | Admin | Delete model |
| PUT | `/api/v1/admin/gemini-models/reorder` | Admin | Reorder models |
| GET | `/api/v1/admin/users/gemini-stats` | Admin | Usage statistics |

## Common Pitfalls

1. **Never log API keys** - Use structured logging with `api_key=REDACTED`
2. **Never return API key in responses** - Only return masked version
3. **Handle validation timeout** - Gemini API calls should timeout at 5s
4. **Preserve input on error** - Don't clear form when validation fails
5. **User isolation** - Always scope queries by `user_id`
