# Unified AI Provider Settings Design

## Overview

Enable users to configure their own API keys for all AI providers, replacing platform-level keys with user-specific credentials.

## Motivation

**User Requirement**: AI services should use customer API keys stored in their profiles, not platform-level keys.

**Benefits**:
- Users control their own AI budgets and quotas
- No platform API costs for user-initiated AI operations
- Users can use their own Google Cloud credits
- Better privacy - user data processed with their own keys
- Flexible provider selection per user

## Current State

### Gemini (✅ Already Implemented)
- Table: `user_gemini_settings`
- Encrypted API keys per user
- Feature toggles and validation
- Pattern to follow for other providers

### Cloud Vision (❌ Platform-Only)
- Uses platform service account
- Configured via `FaceConfigurationService`
- Admin-managed credentials
- **No user-specific keys**

### Other Providers (❌ Not Implemented)
- Video Intelligence - platform keys only
- OpenAI CLIP - not yet integrated
- Local providers - no API keys needed

## Proposed Architecture

### Database Schema

#### Option A: Unified Table (Recommended)
```sql
CREATE TABLE user_ai_provider_settings (
    setting_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),

    -- Provider identification
    provider VARCHAR(50) NOT NULL, -- 'cloud_vision', 'gemini', 'video_intelligence', 'openai'

    -- Encrypted credentials
    api_key_encrypted TEXT,
    api_key_iv TEXT,
    credentials_json_encrypted TEXT, -- For service account JSON (Cloud Vision)
    credentials_iv TEXT,

    -- Masked display
    api_key_prefix VARCHAR(10),
    api_key_suffix VARCHAR(10),

    -- Status tracking
    status VARCHAR(20) DEFAULT 'not_configured', -- 'not_configured', 'connected', 'validation_failed'
    is_enabled BOOLEAN DEFAULT TRUE,
    last_validated_at TIMESTAMP,
    validation_error TEXT,

    -- Usage tracking
    credits_used INT DEFAULT 0,
    last_used_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT unique_user_provider UNIQUE(user_id, provider),
    CONSTRAINT unique_workspace_provider UNIQUE(workspace_id, provider)
);

CREATE INDEX idx_user_ai_provider_user ON user_ai_provider_settings(user_id);
CREATE INDEX idx_user_ai_provider_workspace ON user_ai_provider_settings(workspace_id);
CREATE INDEX idx_user_ai_provider_status ON user_ai_provider_settings(status) WHERE status != 'not_configured';
```

#### Option B: Separate Tables (Alternative)
Keep `user_gemini_settings` as-is, create similar tables for other providers.

**Recommendation**: Option A for consistency and easier maintenance.

### Service Architecture

```python
# backend/src/app/services/ai_provider_settings_service.py

class AIProviderSettingsService:
    """Unified service for managing user AI provider credentials."""

    SUPPORTED_PROVIDERS = {
        'cloud_vision': {
            'name': 'Google Cloud Vision',
            'credential_type': 'service_account_json',
            'validation_endpoint': 'https://vision.googleapis.com/v1/images:annotate'
        },
        'gemini': {
            'name': 'Google Gemini',
            'credential_type': 'api_key',
            'validation_endpoint': 'https://generativelanguage.googleapis.com/v1/models'
        },
        'video_intelligence': {
            'name': 'Google Video Intelligence',
            'credential_type': 'service_account_json',
            'validation_endpoint': 'https://videointelligence.googleapis.com/v1/videos:annotate'
        },
        'openai': {
            'name': 'OpenAI',
            'credential_type': 'api_key',
            'validation_endpoint': 'https://api.openai.com/v1/models'
        }
    }

    async def get_provider_settings(
        self,
        user_id: UUID,
        workspace_id: UUID,
        provider: str
    ) -> Optional[dict]:
        """Get user's settings for a specific provider."""

    async def create_or_update_settings(
        self,
        user_id: UUID,
        workspace_id: UUID,
        provider: str,
        api_key: Optional[str] = None,
        service_account_json: Optional[dict] = None,
        skip_validation: bool = False
    ) -> dict:
        """Create or update provider settings with validation."""

    async def get_decrypted_credentials(
        self,
        user_id: UUID,
        workspace_id: UUID,
        provider: str
    ) -> Optional[dict]:
        """Get decrypted credentials for making API calls.

        Returns:
            {
                'api_key': str,  # If credential_type is 'api_key'
                'service_account': dict  # If credential_type is 'service_account_json'
            }
        """

    async def validate_credentials(
        self,
        provider: str,
        api_key: Optional[str] = None,
        service_account_json: Optional[dict] = None
    ) -> ValidationResult:
        """Validate credentials by calling provider's test endpoint."""
```

### Provider Integration Pattern

#### Modified Base Provider
```python
# backend/src/app/services/ai/providers/base_provider.py

class BaseProvider(ABC):
    def __init__(self, settings_service: AIProviderSettingsService):
        self._settings_service = settings_service
        self._client = None

    async def _get_credentials(
        self,
        user_id: UUID,
        workspace_id: UUID
    ) -> dict:
        """Get user credentials with fallback to platform keys.

        Priority:
        1. User-specific credentials
        2. Workspace-level credentials
        3. Platform-level credentials (admin configured)
        """
        # Try user credentials first
        creds = await self._settings_service.get_decrypted_credentials(
            user_id, workspace_id, self.provider_name
        )

        if creds:
            return creds

        # Fall back to platform credentials
        return await self._get_platform_credentials()
```

#### Updated Cloud Vision Provider
```python
# backend/src/app/services/ai/providers/cloud_vision_provider.py

class CloudVisionProvider(BaseProvider):
    async def detect_faces(
        self,
        image_content: bytes,
        user_id: UUID,
        workspace_id: UUID,
        options: Optional[DetectionOptions] = None
    ) -> list[FaceDetectionResult]:
        """Detect faces using user's Cloud Vision credentials."""

        # Get user credentials (or fall back to platform)
        creds = await self._get_credentials(user_id, workspace_id)

        # Initialize client with user credentials
        if 'service_account' in creds:
            client = self._create_client_from_json(creds['service_account'])
        else:
            client = self._get_platform_client()

        # Make API call
        return await self._detect_faces_with_client(client, image_content, options)
```

### API Endpoints

```python
# backend/src/app/api/v1/ai_provider_settings.py

@router.get("/workspaces/{workspace_id}/ai-providers")
async def list_ai_providers(workspace_id: UUID, current_user: User = Depends(get_current_user)):
    """List all supported AI providers and user's configuration status."""

@router.get("/workspaces/{workspace_id}/ai-providers/{provider}")
async def get_provider_settings(
    workspace_id: UUID,
    provider: str,
    current_user: User = Depends(get_current_user)
):
    """Get user's settings for a specific provider."""

@router.post("/workspaces/{workspace_id}/ai-providers/{provider}")
async def configure_provider(
    workspace_id: UUID,
    provider: str,
    settings: AIProviderSettingsCreate,
    current_user: User = Depends(get_current_user)
):
    """Configure user's API credentials for a provider."""

@router.delete("/workspaces/{workspace_id}/ai-providers/{provider}")
async def revoke_provider(
    workspace_id: UUID,
    provider: str,
    current_user: User = Depends(get_current_user)
):
    """Revoke user's API credentials for a provider."""
```

### Request Schemas

```python
# Pydantic schemas for API requests

class AIProviderSettingsCreate(BaseModel):
    # For API key providers (Gemini, OpenAI)
    api_key: Optional[str] = None

    # For service account providers (Cloud Vision, Video Intelligence)
    service_account_json: Optional[dict] = None

    # Validation
    skip_validation: bool = False

class AIProviderSettingsResponse(BaseModel):
    provider: str
    provider_name: str
    status: str
    has_credentials: bool
    api_key_masked: Optional[str]
    last_validated_at: Optional[datetime]
    validation_error: Optional[str]
    credits_used: int
    last_used_at: Optional[datetime]
```

## Migration Strategy

### Phase 1: Create Infrastructure (Week 1)
1. Create `user_ai_provider_settings` table
2. Implement `AIProviderSettingsService`
3. Add API endpoints for credential management
4. Migrate existing `user_gemini_settings` to new table (optional)

### Phase 2: Update Providers (Week 2)
1. Modify `BaseProvider` to support user credentials
2. Update `CloudVisionProvider` for user keys
3. Update `GeminiProvider` for user keys
4. Add credential fallback logic (user → workspace → platform)

### Phase 3: Emotion Detection with User Keys (Week 3)
1. Implement `EmotionDetectionService` using updated providers
2. Pass `user_id` and `workspace_id` to all provider calls
3. Add API endpoints with credit tracking
4. Create MCP tool

### Phase 4: Duplicate Detection with User Keys (Week 4)
1. Implement OpenAI CLIP provider with user keys
2. Add perceptual hash service
3. Create duplicate detection APIs
4. Add MCP tools

## Fallback Logic

```python
# Priority order for credential resolution

async def _resolve_credentials(user_id, workspace_id, provider):
    # 1. User-level credentials
    user_creds = await get_user_credentials(user_id, provider)
    if user_creds and user_creds.is_valid:
        return user_creds

    # 2. Workspace-level credentials
    workspace_creds = await get_workspace_credentials(workspace_id, provider)
    if workspace_creds and workspace_creds.is_valid:
        return workspace_creds

    # 3. Platform-level credentials (admin configured)
    platform_creds = await get_platform_credentials(provider)
    if platform_creds:
        return platform_creds

    # 4. No credentials available
    raise ProviderNotConfiguredError(
        f"{provider} not configured. Please add your API credentials."
    )
```

## Security Considerations

1. **Encryption**: Same pattern as Gemini settings
   - AES-256-GCM encryption
   - Key derivation from `user_id` + `workspace_id` + master key
   - IV stored separately

2. **Validation**: Validate credentials before storing
   - Call provider's test endpoint
   - Check for valid response
   - Store validation status

3. **Exposure**: Never return decrypted credentials in API responses
   - Only show masked keys (prefix + suffix)
   - Decryption only server-side for API calls

4. **Rate Limiting**: Per-user rate limits
   - Prevent abuse of user credentials
   - Track usage in `credits_used`

## Testing Strategy

1. **Unit Tests**:
   - Credential encryption/decryption
   - Validation logic
   - Fallback resolution

2. **Integration Tests**:
   - End-to-end provider configuration
   - API calls with user credentials
   - Fallback scenarios

3. **Load Tests**:
   - Concurrent API calls with different user keys
   - Credential caching performance

## Backward Compatibility

### Option 1: Migrate Gemini Settings
```sql
INSERT INTO user_ai_provider_settings (
    user_id, workspace_id, provider,
    api_key_encrypted, api_key_iv,
    api_key_prefix, api_key_suffix,
    status, last_validated_at, created_at, updated_at
)
SELECT
    ugs.user_id,
    wu.workspace_id,  -- Get from workspace_users
    'gemini' as provider,
    ugs.api_key_encrypted,
    ugs.api_key_iv,
    ugs.api_key_prefix,
    ugs.api_key_suffix,
    ugs.status,
    ugs.last_validated_at,
    ugs.created_at,
    ugs.updated_at
FROM user_gemini_settings ugs
JOIN workspace_users wu ON wu.user_id = ugs.user_id;
```

### Option 2: Keep Both Tables
- Keep `user_gemini_settings` for backward compatibility
- New providers use `user_ai_provider_settings`
- Unified service abstracts the difference

**Recommendation**: Option 2 for safer migration.

## Cost Implications

### User Benefits
- Users pay for their own API usage
- No platform API costs for user operations
- Users can leverage their own Google Cloud credits

### Platform Benefits
- Reduced operational costs
- No need to manage API quotas
- Users self-manage their AI budget

### Fallback Strategy
- Platform keys remain as fallback
- Users without keys can still use platform quota
- Workspace admins can configure workspace-level keys

## Implementation Checklist

- [ ] Create database migration for `user_ai_provider_settings`
- [ ] Implement `AIProviderSettingsService`
- [ ] Add API endpoints for credential management
- [ ] Update `BaseProvider` with credential resolution
- [ ] Modify `CloudVisionProvider` for user keys
- [ ] Modify `GeminiProvider` for user keys
- [ ] Add `VideoIntelligenceProvider` with user keys
- [ ] Add `OpenAIProvider` for CLIP with user keys
- [ ] Update all AI service calls to pass `user_id` + `workspace_id`
- [ ] Add frontend UI for credential management
- [ ] Write integration tests
- [ ] Update documentation

## Timeline

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 1 | Infrastructure | DB schema, service, API endpoints |
| 2 | Provider Updates | Modified providers with user key support |
| 3 | Emotion Detection | Service + MCP tool with user keys |
| 4 | Duplicate Detection | CLIP + perceptual hash + MCP tools |

**Total**: 4 weeks for full implementation

---

**Status**: Design Complete
**Next Step**: Begin database migration implementation
