# Feature Specification: Fix Gallery PIN and Password Persistence

**Feature Branch**: `007-fix-gallery-pin-password`
**Created**: 2025-12-28
**Status**: Draft
**Input**: User description: "in gallery setting, the password and pin are not persistent. they are getting lost. also there is no option to check the previously set pin and password. once they are set, they should be persistent and masked. when eye toggle button pressed, it should show the password and pin. if changed, they should update it and make them persistent."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Existing Password/PIN Status (Priority: P1)

A gallery owner navigates to gallery settings and can immediately see whether a password and/or PIN is already configured for the gallery. If credentials are set, they see a masked representation indicating a value exists, without exposing the actual credentials.

**Why this priority**: This is the foundational issue - users currently cannot tell if credentials are set, leading to confusion about gallery protection status.

**Independent Test**: Can be fully tested by navigating to gallery settings for a gallery with pre-set password/PIN and verifying visual indicators show credentials exist.

**Acceptance Scenarios**:

1. **Given** a gallery has a password already set, **When** user opens gallery settings, **Then** the password field displays a masked placeholder (e.g., "********") indicating a password exists
2. **Given** a gallery has a PIN already set, **When** user opens gallery settings, **Then** the PIN field displays a masked placeholder (e.g., "****") indicating a PIN exists
3. **Given** a gallery has no password set, **When** user opens gallery settings, **Then** the password field displays an empty placeholder prompting to enter a password
4. **Given** a gallery has no PIN set, **When** user opens gallery settings, **Then** the PIN field displays an empty placeholder prompting to enter a PIN

---

### User Story 2 - Reveal Existing Credentials (Priority: P2)

A gallery owner who has previously set a password or PIN can reveal the actual value by clicking the eye toggle button, allowing them to verify or share the credential with clients.

**Why this priority**: After knowing credentials exist (P1), users need the ability to retrieve them - critical for sharing with clients.

**Independent Test**: Can be tested by setting credentials, refreshing the page, and using the eye toggle to reveal the stored values.

**Acceptance Scenarios**:

1. **Given** a gallery has a password set and the field shows masked placeholder, **When** user clicks the eye toggle button, **Then** the actual password value is revealed in plain text
2. **Given** a gallery has a PIN set and the field shows masked placeholder, **When** user clicks the eye toggle button, **Then** the actual PIN value is revealed in plain text
3. **Given** the password is revealed, **When** user clicks the eye toggle button again, **Then** the password is masked again
4. **Given** no password is set for the gallery, **When** user clicks the eye toggle, **Then** the field remains empty (nothing to reveal)

---

### User Story 3 - Update Existing Credentials (Priority: P3)

A gallery owner can change an existing password or PIN by typing a new value, which persists across page reloads and browser sessions.

**Why this priority**: After viewing existing credentials, users may need to update them - completes the CRUD cycle.

**Independent Test**: Can be tested by modifying an existing password/PIN, navigating away, returning, and verifying the new value persists.

**Acceptance Scenarios**:

1. **Given** a gallery has an existing password, **When** user types a new password and saves, **Then** the new password is stored and the old password is replaced
2. **Given** a gallery has an existing PIN, **When** user types a new 4-6 digit PIN and saves, **Then** the new PIN is stored and the old PIN is replaced
3. **Given** user has updated the password, **When** user refreshes the page, **Then** the new password is shown (masked by default, revealable via eye toggle)
4. **Given** user has updated the PIN, **When** user navigates away and returns to settings, **Then** the new PIN persists (masked by default, revealable via eye toggle)

---

### User Story 4 - Remove Credentials (Priority: P4)

A gallery owner can disable password or PIN protection entirely, removing the existing credential.

**Why this priority**: Users need ability to remove protection - lower priority as toggle already exists.

**Independent Test**: Can be tested by disabling password/PIN protection toggle and verifying gallery becomes accessible without credentials.

**Acceptance Scenarios**:

1. **Given** a gallery has password protection enabled, **When** user toggles off password protection, **Then** the password is removed and gallery no longer requires password
2. **Given** a gallery has PIN protection enabled, **When** user toggles off PIN protection, **Then** the PIN is removed and gallery no longer requires PIN
3. **Given** user has removed password protection, **When** user refreshes page, **Then** password protection remains disabled

---

### Edge Cases

- What happens when user types in the password field but doesn't save? The change should not persist.
- What happens when user partially types a PIN (less than 4 digits)? Show validation error, don't persist.
- How does system handle concurrent edits from multiple browser tabs? Last write wins.
- What happens if backend returns an error during save? Show error toast, retain unsaved changes in form.
- What happens when password/PIN contains special characters? Should be handled correctly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fetch and display existing password/PIN status when gallery settings are opened
- **FR-002**: System MUST display a masked placeholder (visual indicator) when password/PIN is set, distinguishable from empty state
- **FR-003**: System MUST reveal the actual password/PIN value when user clicks the eye toggle button
- **FR-004**: System MUST re-mask the credential when user clicks the eye toggle button again
- **FR-005**: System MUST persist new or updated password/PIN values to the backend when saved
- **FR-006**: System MUST retain persisted credentials across page reloads and browser sessions
- **FR-007**: System MUST remove the credential when user disables protection via toggle
- **FR-008**: System MUST validate PIN format (4-6 numeric digits) before allowing save
- **FR-009**: System MUST provide visual feedback when credentials are saved (success) or fail (error)
- **FR-010**: Backend MUST provide an API endpoint to retrieve existing credentials (for authorized users only)

### Security Considerations

- **SEC-001**: Only workspace members with appropriate permissions can view or modify gallery credentials
- **SEC-002**: Credentials must be transmitted over secure connection (HTTPS)
- **SEC-003**: Backend must verify user authorization before returning credential values
- **SEC-004**: Credentials returned to frontend should be the plaintext value (for reveal feature), not the hash
- **SEC-005**: Audit log should record credential access and changes

### Key Entities *(include if feature involves data)*

- **Gallery**: Existing entity, contains `password_hash` and `pin_hash` fields (hashed values), and boolean flags `password_protected`, `pin_protected`
- **Gallery Settings UI State**: Local component state for password/PIN values, visibility toggle, and loading states
- **Credential API Response**: New response shape that includes retrievable credential values (plaintext) for authorized users

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of galleries with existing password/PIN display visual indicator that credentials are set
- **SC-002**: Users can reveal existing credentials within 1 second of clicking eye toggle
- **SC-003**: Credential updates persist with 100% reliability across page reloads
- **SC-004**: Zero support tickets related to "lost" or "invisible" gallery passwords after fix
- **SC-005**: 95% of users successfully update gallery credentials on first attempt

## Assumptions

- The existing password and PIN values can be stored in a retrievable format (or the system will store plaintext alongside hash for this feature)
- This is an internal gallery management feature, not public-facing (only workspace members access settings)
- The eye toggle reveal feature requires an additional backend API to return the plaintext credential
- Current toggle functionality for enabling/disabling protection works correctly
- Performance of credential retrieval should not noticeably impact settings page load time

## Out of Scope

- Changes to public gallery access verification flow (password/PIN entry by visitors)
- Changes to how passwords/PINs are validated when visitors access galleries
- Password strength requirements or policy enforcement
- PIN complexity requirements beyond 4-6 digit validation
- Two-factor authentication for gallery access
- Credential expiration or rotation policies
