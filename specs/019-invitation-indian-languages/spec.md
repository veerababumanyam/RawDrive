# Feature Specification: Indian Language Support for Invitations

**Feature Branch**: `019-invitation-indian-languages`
**Created**: 2026-01-02
**Status**: Draft
**Input**: User description: "I want every place in invitation to support local languages. Application can be in different language, the invitation might be in different language. Like application user might use English, where as the invite the user wants Telugu."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Invitation in Regional Language (Priority: P1)

A user who speaks Hindi at home wants to create a wedding invitation in Hindi for their relatives, even though they use English for the RawDrive interface. They should be able to select Hindi as the invitation language and have AI generate culturally appropriate content in Hindi.

**Why this priority**: This is the core value proposition - enabling users to create invitations in their preferred local language independent of their UI language preference. Without this, the feature has no value.

**Independent Test**: Can be fully tested by creating an invitation, selecting a regional language (e.g., Hindi), generating AI content, and verifying the output is in Hindi script with culturally appropriate phrasing.

**Acceptance Scenarios**:

1. **Given** a user is creating a new invitation with English UI, **When** they open the language selector for invitation content, **Then** they see all 12 Indian languages (plus English) with native script names displayed
2. **Given** a user selects Telugu (తెలుగు) as the invitation language, **When** they generate AI content, **Then** the title and description are generated in Telugu script
3. **Given** a user creates an invitation in any supported language, **When** they save the invitation, **Then** the language preference is persisted with the invitation

---

### User Story 2 - View Public Invitation in Regional Language (Priority: P1)

A guest receives a link to a wedding invitation. The invitation should render correctly in the language the host chose (e.g., Malayalam), including proper font rendering and text direction.

**Why this priority**: Equal to P1 because if guests cannot view invitations correctly in regional languages, the entire feature fails to deliver value.

**Independent Test**: Can be tested by accessing a public invitation link and verifying the content displays in the correct language with proper rendering.

**Acceptance Scenarios**:

1. **Given** an invitation was created in Bengali, **When** a guest opens the public invitation link, **Then** the content displays in Bengali script with appropriate fonts
2. **Given** an invitation was created in Urdu (RTL language), **When** a guest opens the public invitation link, **Then** the text direction is right-to-left and layout adjusts accordingly
3. **Given** an invitation has both primary and secondary languages set, **When** a guest views the invitation, **Then** content in both languages is displayed clearly

---

### User Story 3 - AI Content Generation in Regional Languages (Priority: P2)

A user wants AI-generated content for their invitation. The AI should generate culturally appropriate titles and descriptions in the selected regional language.

**Why this priority**: Enhances the core experience but is not blocking - users can still manually type content if AI generation is not available for a language.

**Independent Test**: Can be tested by opening the AI content generator, selecting each supported language, and verifying the generated content is in the correct language.

**Acceptance Scenarios**:

1. **Given** a user is in the AI content generator modal, **When** they view the language dropdown, **Then** all 12 Indian languages are available for selection
2. **Given** a user selects Kannada and generates content, **When** generation completes, **Then** the title and description are in Kannada script with culturally appropriate phrasing
3. **Given** a user selects a mood (e.g., "Formal") and language (e.g., Tamil), **When** content is generated, **Then** the tone matches the mood in a culturally appropriate way for Tamil speakers

---

### User Story 4 - Language Selection in Invitation Templates (Priority: P3)

When selecting an invitation template, users should see which languages the template supports and be able to filter templates by language compatibility.

**Why this priority**: Improves discoverability and user experience but is not essential for core functionality.

**Independent Test**: Can be tested by browsing templates with a language filter applied and verifying only compatible templates appear.

**Acceptance Scenarios**:

1. **Given** a user is browsing invitation templates, **When** they filter by a specific language, **Then** only templates supporting that language are shown
2. **Given** a template has pre-defined content in multiple languages, **When** a user selects that template, **Then** the content is populated in the user's selected invitation language

---

### Edge Cases

- What happens when a user selects a language not supported by a chosen template?
  - System should show a warning and offer to use a default template or manual content entry
- How does the system handle fonts for languages with complex scripts (e.g., Malayalam, Tamil)?
  - System must include web fonts that support all Indic scripts and fall back gracefully
- What happens when AI content generation fails for a specific language?
  - System shows user-friendly error and allows manual content entry
- How does the system handle mixed-language content (e.g., names in English, message in Hindi)?
  - System should support storing transliterated names alongside native script content
- What happens when the guest's browser doesn't support the invitation's font?
  - System uses web-safe fallback fonts with proper Unicode support

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display all 12 Indian languages plus English in every language selection dropdown across the invitation creation workflow
- **FR-002**: System MUST show each language with its native script name (e.g., "తెలుగు" for Telugu, "हिन्दी" for Hindi)
- **FR-003**: System MUST support Urdu with right-to-left (RTL) text direction throughout the invitation display
- **FR-004**: System MUST allow users to set a primary language for their invitation independent of their UI language preference
- **FR-005**: System MUST persist the selected invitation language and display content in that language on public invitation pages
- **FR-006**: System MUST include web fonts that correctly render all 12 Indian scripts (Devanagari, Telugu, Tamil, Kannada, Malayalam, Bengali, Gujarati, Odia, Gurmukhi, and Perso-Arabic for Urdu)
- **FR-007**: AI content generation MUST support generating titles and descriptions in all 12 Indian languages with culturally appropriate phrasing
- **FR-008**: System MUST display language options consistently using the existing `SUPPORTED_LANGUAGES` configuration across all components
- **FR-009**: System MUST support setting an optional secondary language for bilingual invitations
- **FR-010**: Public invitation pages MUST render in the language specified by the invitation, regardless of the viewer's browser language setting
- **FR-011**: System MUST provide appropriate error messages in the user's UI language when language-specific operations fail

### Key Entities

- **Invitation**: Extended with `primary_language` and `secondary_language` fields (already exists in schema)
- **InvitationTemplate**: Has `supported_languages` array and `content_i18n` for pre-translated content (already exists)
- **SUPPORTED_LANGUAGES**: Configuration constant defining the 12 Indian languages plus English with native names, codes, and text direction

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create invitations in any of the 12 Indian languages within 30 seconds of starting the creation flow (time to first language selection)
- **SC-002**: 100% of supported regional language scripts render correctly on invitation preview and public pages across major browsers
- **SC-003**: AI content generation returns culturally appropriate content in the selected language 90% of the time (measured by user acceptance rate - users who apply generated content without editing)
- **SC-004**: RTL language (Urdu) invitations display with correct text alignment and layout in 100% of test cases
- **SC-005**: Zero reports of "missing characters" or "boxes" in public invitation views for any supported language
- **SC-006**: Users can complete the entire invitation creation flow in a regional language without switching to English for any mandatory step

## Assumptions

- The existing i18n configuration (`frontend/src/i18n/config.ts`) already defines all 12 Indian languages and will be the single source of truth
- The AI service (Gemini) supports content generation in all 12 Indian languages
- Users have basic familiarity with their selected language's script
- Templates can be created/updated to include multi-language content progressively
- Font loading performance is acceptable (lazy-loaded on demand)

## Supported Languages Reference

| Language | Native Name | Code | Direction |
|----------|-------------|------|-----------|
| English | English | en | LTR |
| Hindi | हिन्दी | hi | LTR |
| Telugu | తెలుగు | te | LTR |
| Tamil | தமிழ் | ta | LTR |
| Kannada | ಕನ್ನಡ | kn | LTR |
| Malayalam | മലയാളം | ml | LTR |
| Assamese | অসমীয়া | as | LTR |
| Bengali | বাংলা | bn | LTR |
| Gujarati | ગુજરાતી | gu | LTR |
| Marathi | मराठी | mr | LTR |
| Odia | ଓଡ଼ିଆ | or | LTR |
| Punjabi | ਪੰਜਾਬੀ | pa | LTR |
| Urdu | اردو | ur | RTL |
