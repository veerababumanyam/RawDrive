# Research: Per-User Gemini LLM Settings

**Feature**: 003-user-gemini-settings
**Date**: 2025-12-27
**Status**: Complete

## Research Topics

### 1. Gemini API Key Validation

**Decision**: Use the `generativelanguage.googleapis.com/v1/models` endpoint with the API key to validate credentials.

**Rationale**:
- Lightweight call that returns available models (proves key is valid and has permissions)
- Fast response time (< 1s typical)
- Does not consume model quota/tokens
- Returns useful data (model list) that can inform the UI

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| Generate dummy text | Consumes quota unnecessarily |
| HEAD request | Not supported by Gemini API |
| Hardcoded model names | Would miss new models; validation wouldn't prove key works |

**Implementation**:
```python
async def validate_gemini_api_key(api_key: str) -> tuple[bool, list[str] | None]:
    """Validate API key by listing available models."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://generativelanguage.googleapis.com/v1/models",
            params={"key": api_key},
            timeout=5.0
        )
        if response.status_code == 200:
            models = response.json().get("models", [])
            return True, [m["name"] for m in models]
        return False, None
```

---

### 2. Secure API Key Storage

**Decision**: Use existing `EncryptionService` with user-scoped key derivation.

**Rationale**:
- `EncryptionService` already implements AES-256-GCM with HKDF-SHA256
- Workspace-scoped keys provide cryptographic isolation
- Existing code is audited and battle-tested
- User ID as additional context for HKDF provides per-user isolation

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| Store in environment variables | Not per-user; doesn't scale |
| Use external secrets manager (Vault) | Adds infrastructure complexity; overkill for BYOK |
| Store plaintext with access controls | Security risk; violates SOC 2 requirements |

**Implementation Extension**:
```python
def _derive_user_key(self, user_id: UUID, workspace_id: UUID) -> bytes:
    """Derive user-specific encryption key."""
    combined = f"{workspace_id}:{user_id}".encode()
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"rawdrive-user-api-key")
    return hkdf.derive(self.master_key + combined)
```

---

### 3. Admin Model Catalogue Management

**Decision**: Store models in PostgreSQL `gemini_models` table with seed data for initial models.

**Rationale**:
- Database storage allows runtime CRUD without deployments
- Sort order column enables admin-controlled dropdown ordering
- Active/inactive status supports deprecation without data loss
- Default flag ensures fallback model is always available

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| Config file (YAML/JSON) | Requires deployment to update; no runtime management |
| Environment variables | Can't support admin UI; hard to manage list |
| Hardcoded in application | Same as config file; poor flexibility |

**Seed Data**:
```python
INITIAL_MODELS = [
    {"identifier": "gemini-2.5-flash", "display_name": "Gemini 2.5 Flash", "sort_order": 1, "is_default": True},
    {"identifier": "gemini-2.5-pro", "display_name": "Gemini 2.5 Pro", "sort_order": 2},
    {"identifier": "gemini-1.5-flash", "display_name": "Gemini 1.5 Flash", "sort_order": 3},
    {"identifier": "gemini-1.5-pro", "display_name": "Gemini 1.5 Pro", "sort_order": 4},
]
```

---

### 4. Per-User Gemini Client Factory

**Decision**: Create `GeminiClientService` that resolves user credentials at runtime and provides configured httpx client.

**Rationale**:
- Single point of credential resolution for all AI features
- Caches decrypted credentials per-request (not persisted)
- Enforces isolation - each user's request uses their own credentials
- Easy to mock in tests

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| Global Gemini client | Can't support per-user keys |
| Pass credentials through every AI function | Couples all AI code to settings; error-prone |
| Middleware injection | Complicates request flow; harder to test |

**Implementation Pattern**:
```python
class GeminiClientService:
    async def get_client_for_user(self, user_id: UUID, workspace_id: UUID) -> GeminiClient:
        """Get configured Gemini client for user."""
        settings = await self.settings_service.get_user_settings(user_id)
        if not settings or not settings.api_key_encrypted:
            raise AIConfigurationError("Gemini API key not configured")

        api_key = await self.encryption.decrypt_user_key(
            settings.api_key_encrypted, user_id, workspace_id
        )
        model = settings.selected_model_identifier or await self._get_default_model()

        return GeminiClient(api_key=api_key, model=model)
```

---

### 5. Masked Key Display

**Decision**: Store and return prefix/suffix of original key (first 4 + last 4 characters) as separate metadata.

**Rationale**:
- Allows UI to show "AIza...x7Bq" without decrypting
- Stored as plaintext metadata (not sensitive)
- User can recognize their key without full exposure
- No cryptographic operation needed for display

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| Decrypt and mask on read | Unnecessary decryption; security risk |
| Don't show any part of key | Poor UX; user can't verify correct key |
| Hash-based identifier | Doesn't help user recognize their key |

**Storage Schema**:
```sql
api_key_prefix VARCHAR(10),  -- e.g., "AIza"
api_key_suffix VARCHAR(10),  -- e.g., "x7Bq"
```

---

### 6. Error Mapping for User-Friendly Messages

**Decision**: Create error code mapping from Gemini API responses to user-friendly messages.

**Error Mapping**:
| Gemini Response | User Message |
|-----------------|--------------|
| 400 (invalid key format) | "The API key format appears invalid. Please check and try again." |
| 401 (unauthorized) | "This API key is not authorized. Please verify it in Google AI Studio." |
| 403 (forbidden) | "This API key doesn't have permission to access Gemini. Check your Google Cloud project settings." |
| 429 (rate limit) | "You've reached your Gemini usage limit. Please wait or check your Google account." |
| 500+ (server error) | "Gemini is temporarily unavailable. Please try again in a few minutes." |
| Network error | "Unable to connect to Gemini. Please check your internet connection." |

---

### 7. Settings Page UI Pattern

**Decision**: Create new `AISettingsPage.tsx` following existing settings page patterns (SecuritySettingsPage as reference).

**Rationale**:
- Consistent with existing Settings UX (SecuritySettingsPage, ProfileSettingsPage)
- Uses established component patterns (section cards, form validation)
- Integrates with existing router structure

**UI Structure**:
```
Settings > AI & Gemini
├── API Key Section
│   ├── Status badge (Connected / Not configured / Error)
│   ├── Masked key display (if configured)
│   ├── "Add/Change API Key" button → form modal
│   └── "Revoke Key" button (if configured)
├── Model Selection Section
│   ├── Dropdown of active models
│   └── Current selection indicator
└── Help Section
    ├── Link to Google AI Studio
    └── Privacy explanation
```

---

## Summary

All research topics resolved with no NEEDS CLARIFICATION items remaining. The implementation will:

1. **Validate keys** via Gemini models endpoint (fast, no quota consumption)
2. **Store keys** encrypted using extended `EncryptionService` with user-scoped HKDF
3. **Manage models** in PostgreSQL with admin CRUD and seed data
4. **Provide clients** via factory pattern for per-user isolation
5. **Display keys** using stored prefix/suffix metadata (no decryption for display)
6. **Map errors** to user-friendly messages with actionable hints
7. **Build UI** following existing SecuritySettingsPage patterns
