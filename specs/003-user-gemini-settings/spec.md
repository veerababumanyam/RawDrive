# Feature Specification: Per-User Gemini LLM Settings

**Feature Branch**: `003-user-gemini-settings`
**Created**: 2025-12-27
**Status**: Draft
**Input**: User description: "Per-User Gemini LLM Settings - allows each user to bring their own Gemini API key and choose a default Gemini LLM model for all AI features, with secure storage and centrally managed model catalogue"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Gemini API Key (Priority: P1)

As a photographer/studio user, I want to add my own Gemini API key so that I can use all AI features in the application without the platform subsidizing my usage.

**Why this priority**: This is the foundational capability - without a configured API key, no AI features can function. Users cannot access any AI functionality until this is complete.

**Independent Test**: Can be fully tested by a user navigating to Settings > AI & Gemini, entering a valid API key, and seeing a "Connected" status confirmation.

**Acceptance Scenarios**:

1. **Given** a user is on the AI & Gemini settings page with no key configured, **When** they enter a valid Gemini API key and submit, **Then** the system validates the key with a test call and displays "Connected" status with timestamp.

2. **Given** a user enters an invalid or malformed API key, **When** they submit the form, **Then** the system displays a clear error message with hints (e.g., "Key invalid or missing permissions") and does NOT clear the input field.

3. **Given** a user has a previously configured API key, **When** they enter a new key and submit, **Then** the new key replaces the old one after successful validation.

4. **Given** a user has a configured API key, **When** they view the settings page, **Then** they see a masked representation (e.g., "AIza...x7Bq") and connection status, never the full key.

---

### User Story 2 - Select Default Gemini Model (Priority: P1)

As a photographer/studio user, I want to select my preferred Gemini model from a dropdown so that all AI features use my chosen model consistently.

**Why this priority**: Equal to P1 because model selection is essential for AI features to work correctly - users need both a key AND a model to use any AI capability.

**Independent Test**: Can be tested by a user selecting a model from the dropdown and verifying the selection persists and is reflected in AI feature usage.

**Acceptance Scenarios**:

1. **Given** a user is on the AI & Gemini settings page with a valid API key, **When** they open the model dropdown, **Then** they see a list of active models from the admin-managed catalogue (e.g., "Gemini 3 Pro Preview", "Gemini 3 Flash Preview", "Gemini 2.5 Pro").

2. **Given** a user has not selected a model, **When** they use an AI feature, **Then** the platform default model (defined by admin) is used automatically.

3. **Given** a user selects "Gemini 3 Pro Preview" as their default model, **When** they use any AI feature (smart curation, captions, etc.), **Then** the feature shows "Using: Gemini 3 Pro Preview" indicator and uses that model.

4. **Given** an admin deactivates a model that User A had selected, **When** User A next visits the AI settings page, **Then** they see an informational message that their model was changed to the platform default.

---

### User Story 3 - Revoke/Delete API Key (Priority: P2)

As a photographer/studio user, I want to revoke my API key so that I can disconnect my Gemini account from the platform when needed.

**Why this priority**: Important for user control and security, but secondary to initial setup - users must first have a key before they can revoke it.

**Independent Test**: Can be tested by a user clicking "Revoke Key" and verifying AI features become unavailable with appropriate messaging.

**Acceptance Scenarios**:

1. **Given** a user has a configured API key, **When** they click "Revoke Key" and confirm, **Then** the key is deleted from the system and status changes to "Not configured".

2. **Given** a user has revoked their key, **When** they attempt to use any AI feature, **Then** they see a friendly message: "AI features are unavailable. Please configure your Gemini API key in Settings."

3. **Given** a user has revoked their key, **When** they visit the AI settings page, **Then** they see the "Add Gemini API key" call-to-action and clear indication that AI is unavailable.

---

### User Story 4 - Admin Manages Model Catalogue (Priority: P2)

As a platform admin, I want to manage the available Gemini models so that I can control which models users can select and ensure consistency across the platform.

**Why this priority**: Essential for platform governance but only affects what users can select - doesn't block basic AI functionality once at least one model exists.

**Independent Test**: Can be tested by an admin adding a new model to the catalogue and verifying it appears in user dropdowns.

**Acceptance Scenarios**:

1. **Given** an admin is in the admin console, **When** they add a new model entry with display name "Gemini 3 Turbo" and identifier "gemini-3-turbo", **Then** the model appears in user dropdowns.

2. **Given** an admin views the model catalogue, **When** they deactivate "Gemini 2.5 Flash", **Then** it is removed from user dropdowns and affected users are migrated to the platform default.

3. **Given** an admin wants to reorder models, **When** they drag "Gemini 3 Pro Preview" to the top, **Then** it appears first in all user dropdowns.

4. **Given** an admin sets "Gemini 3 Flash Preview" as the platform default, **When** a new user registers or an existing user's model is deactivated, **Then** that model is automatically assigned.

---

### User Story 5 - Admin Visibility into User AI Configuration (Priority: P3)

As a platform admin, I want visibility into which users have configured Gemini keys and their model selections so that I can support users and monitor platform AI usage.

**Why this priority**: Operational visibility is valuable but doesn't affect user functionality - it's an administrative enhancement.

**Independent Test**: Can be tested by an admin viewing the user AI configuration dashboard and verifying data accuracy.

**Acceptance Scenarios**:

1. **Given** an admin is in the admin console, **When** they view the AI configuration overview, **Then** they see a list of users showing: username, key configured (yes/no), selected model, last AI call timestamp.

2. **Given** an admin views a user's AI status, **When** the user has a configured key, **Then** the admin sees "Key configured: Yes" but NEVER sees the actual key value.

3. **Given** the platform tracks AI usage, **When** an admin views aggregate metrics, **Then** they see total AI calls per user without any secret exposure.

---

### User Story 6 - Graceful AI Feature Failure Handling (Priority: P2)

As a user with a configured key, I want clear feedback when AI features fail so that I can quickly diagnose and resolve issues.

**Why this priority**: Critical for user experience when things go wrong - prevents confusion and reduces support burden.

**Independent Test**: Can be tested by simulating various failure scenarios and verifying appropriate error messages appear.

**Acceptance Scenarios**:

1. **Given** a user's API key has become invalid (revoked at Google), **When** they use an AI feature, **Then** they see: "We couldn't reach Gemini with your current API key. Please check your Gemini settings."

2. **Given** Gemini is experiencing an outage, **When** a user triggers an AI feature, **Then** they see: "Gemini is temporarily unavailable. Please try again in a few minutes."

3. **Given** a user has exceeded their Gemini rate limit, **When** they trigger an AI feature, **Then** they see: "You've reached your Gemini usage limit. Please wait or check your Gemini account."

4. **Given** any AI error occurs, **When** the error is displayed, **Then** no cryptic technical errors or partial outputs are shown to the user.

---

### Edge Cases

- What happens when a user's account is deleted? API key must be permanently deleted from the system.
- What happens when a user is downgraded to a plan without AI access? Key should be preserved but AI features disabled until plan upgraded.
- What happens when validation succeeds but first real AI call fails? User should see specific error guidance, not generic "invalid key" message.
- What happens when an admin deletes all models from the catalogue? System should prevent this action (at least one active model required).
- What happens when network connectivity is lost during key validation? Form should show network error and allow retry without clearing input.
- What happens when a user has multiple browser tabs open and changes their model? Other tabs should reflect the change on next AI call or page refresh.

## Requirements *(mandatory)*

### Functional Requirements

**API Key Management**

- **FR-001**: System MUST provide a dedicated "AI & Gemini" section in user Settings
- **FR-002**: System MUST allow users to add, update, or revoke their Gemini API key
- **FR-003**: System MUST validate API keys with a test call to Gemini before accepting them
- **FR-004**: System MUST display clear success/failure feedback during key validation
- **FR-005**: System MUST NOT clear the API key input field when validation fails
- **FR-006**: System MUST display masked key representation on settings page (never full key)
- **FR-007**: System MUST show configuration status: "Connected", "Not configured", or "Validation failed"
- **FR-008**: System MUST show last successful validation timestamp when connected

**Model Selection**

- **FR-009**: System MUST display a dropdown of active Gemini models from admin catalogue
- **FR-010**: System MUST allow users to select exactly one default model for their account
- **FR-011**: System MUST persist model selection across sessions
- **FR-012**: System MUST show current model selection on settings page and in AI feature indicators
- **FR-013**: System MUST automatically assign platform default model when user has no selection
- **FR-014**: System MUST migrate users to platform default when their selected model is deactivated
- **FR-015**: System MUST notify users when their model selection was changed due to deactivation

**Admin Model Catalogue**

- **FR-016**: Admins MUST be able to add new model entries with display name and identifier
- **FR-017**: Admins MUST be able to rename model display names
- **FR-018**: Admins MUST be able to deactivate/reactivate models
- **FR-019**: Admins MUST be able to reorder models in the dropdown list
- **FR-020**: Admins MUST be able to set a platform default model
- **FR-021**: System MUST prevent deactivation of the last remaining active model
- **FR-022**: System MUST prevent deletion of a model currently set as platform default

**Security & Isolation**

- **FR-023**: System MUST encrypt API keys at rest using platform encryption standards
- **FR-024**: System MUST NEVER return API keys in plain text to any frontend
- **FR-025**: System MUST NEVER log API keys in application logs or analytics
- **FR-026**: System MUST NEVER expose API keys to any user other than the owner
- **FR-027**: System MUST NEVER expose raw API keys to admins (only "configured: yes/no")
- **FR-028**: System MUST execute all Gemini API requests server-side only
- **FR-029**: System MUST ensure complete isolation between users' AI configurations
- **FR-030**: System MUST delete API keys when user accounts are deleted

**AI Feature Integration**

- **FR-031**: All AI features MUST use the user's configured key and selected model
- **FR-032**: AI features MUST display model indicator (e.g., "Powered by Gemini 3 Pro Preview")
- **FR-033**: AI features MUST fail gracefully with user-friendly messages when key is invalid/missing
- **FR-034**: System MUST provide a shared "Gemini client" configuration per user for all AI features

**Admin Visibility**

- **FR-035**: Admins MUST be able to see which users have configured API keys (yes/no only)
- **FR-036**: Admins MUST be able to see which model each user has selected
- **FR-037**: Admins MUST be able to see aggregate AI usage metrics per user

### Key Entities

- **UserGeminiSettings**: Stores per-user AI configuration including encrypted API key reference, selected model ID, configuration status, and validation timestamp
- **GeminiModel**: Admin-managed catalogue of available models including display name, internal identifier, active status, sort order, and platform default flag
- **AIUsageLog**: Tracks AI feature usage per user including feature type, model used, timestamp, and success/failure status (no secrets stored)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can configure their Gemini API key in under 2 minutes from first visit to AI settings
- **SC-002**: API key validation feedback appears within 5 seconds of submission
- **SC-003**: 95% of users with configured keys can successfully use AI features on first attempt
- **SC-004**: Zero API keys are exposed in application logs, network responses, or admin views
- **SC-005**: Model selection changes take effect immediately for the next AI feature call
- **SC-006**: Users whose model was deactivated are automatically migrated within 24 hours
- **SC-007**: Admin model catalogue changes propagate to user dropdowns within 1 minute
- **SC-008**: AI feature error messages are user-friendly (no technical jargon) in 100% of cases
- **SC-009**: Support tickets related to AI configuration issues decrease by 50% compared to baseline (once established)
- **SC-010**: 90% of users who start API key configuration complete it successfully

## Assumptions

- Users obtain their own Gemini API keys from Google AI Studio (outside the platform's scope)
- Google provides a lightweight validation endpoint (e.g., model listing) suitable for key verification
- The platform has existing encryption infrastructure for storing sensitive credentials
- The platform has an existing admin console where model management features can be added
- All AI features in the application share a common service layer for LLM interactions
- The platform currently uses (or will use) environment variables for default AI configuration, which this feature supplements with per-user overrides

## Scope Boundaries

**In Scope**:
- User-facing Gemini API key management
- User model selection from admin catalogue
- Admin model catalogue management (CRUD operations)
- Admin visibility into user AI configuration status
- Error handling for common AI failure scenarios
- Integration points for existing AI features

**Out of Scope**:
- Platform-provided shared API keys (potential future enhancement)
- Per-feature model overrides (all features use user's default)
- API key usage billing/metering by the platform
- Automatic key rotation
- Multi-provider support (Anthropic, OpenAI, etc.) - Gemini only for this feature
- AI feature implementation (existing features, this is configuration only)

## Dependencies

- Existing AI features must be refactored to use the shared Gemini client configuration
- Admin console must exist or be created for model catalogue management
- Platform encryption service must be available for secure key storage
- Settings page infrastructure must support the new AI & Gemini section
