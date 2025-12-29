# Feature Specification: Public Gallery Branding & Album Title

**Feature Branch**: `013-public-gallery-branding`
**Created**: 2025-12-29
**Status**: Draft
**Input**: User description: "In publicly shared gallery - Next to logo, there should be customer company name. In the black area, there should be cover photo auto fill the black space with cover photo which is selected in the gallery, if nothing selected, there should be auto select from the gallery. There should be a title for the album shown and not the gallery name. This should be asked while sharing to public link in the gallery. The other text should be removed. Cover photo with the title."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Photographer Shares Gallery with Custom Album Title (Priority: P1)

A photographer has completed editing photos for a client's wedding. When creating a public share link, the photographer wants to give it a professional album title like "Sarah & John's Wedding - June 2025" rather than showing the internal gallery name "johnson_wedding_june" that they use for organization.

**Why this priority**: This is the core value proposition - enabling photographers to present professional, client-facing album names without changing their internal organization.

**Independent Test**: Can be fully tested by creating a magic link and verifying the album title appears on the public page, and delivers a professional client experience.

**Acceptance Scenarios**:

1. **Given** a photographer is on the Share Dialog for a published gallery, **When** they click to create a public link, **Then** they see an input field for "Album Title" that is required before generating the link
2. **Given** a photographer has entered an album title "Beautiful Wedding Day", **When** they create the magic link, **Then** the album title is saved and associated with that specific link
3. **Given** a client opens a public gallery link, **When** the page loads, **Then** they see the album title (not the gallery name) displayed prominently on the cover section

---

### User Story 2 - Company Branding in Header (Priority: P1)

A photography studio wants their company name "Elegant Moments Photography" to appear next to the logo on public gallery pages, reinforcing their brand identity to clients viewing shared galleries.

**Why this priority**: Brand visibility is critical for professional photographers - every client touchpoint should reinforce the studio's identity.

**Independent Test**: Can be fully tested by viewing any public gallery link and verifying the company name appears in the header next to the logo.

**Acceptance Scenarios**:

1. **Given** a workspace has a company name configured, **When** a client opens a public gallery link, **Then** they see the company name displayed next to the RawDrive logo in the header
2. **Given** a workspace does not have a company name configured, **When** a client opens a public gallery link, **Then** the header shows only the logo without any placeholder text

---

### User Story 3 - Cover Photo in Hero Section (Priority: P2)

Photographers want the large black hero area to display a beautiful cover photo that sets the mood for the gallery, rather than showing an empty dark background.

**Why this priority**: Visual appeal is important but depends on having the branding basics in place first.

**Independent Test**: Can be fully tested by opening a public gallery and verifying a photo fills the hero section.

**Acceptance Scenarios**:

1. **Given** a gallery has a designated cover photo set, **When** a client opens the public gallery, **Then** the cover photo fills the hero section background
2. **Given** a gallery does NOT have a cover photo set, **When** a client opens the public gallery, **Then** the first available photo from the gallery is automatically used as the cover
3. **Given** a gallery has no photos at all, **When** a client opens the public gallery, **Then** a tasteful gradient or placeholder background is shown instead of an error state

---

### User Story 4 - Simplified Hero Display (Priority: P3)

The hero section should show only the album title on top of the cover photo, removing the date and photo count badges that currently clutter the design.

**Why this priority**: Clean design enhancement that improves the look but is not critical to core functionality.

**Independent Test**: Can be fully tested by viewing a public gallery and confirming only the album title is visible in the hero section.

**Acceptance Scenarios**:

1. **Given** a client opens a public gallery, **When** the hero section loads, **Then** only the album title is displayed (no date badge, no photo count badge)
2. **Given** the album title is very long, **When** displayed on the hero section, **Then** it truncates gracefully with ellipsis after 2 lines

---

### Edge Cases

- What happens when the album title contains special characters or emojis?
  - *They should be allowed and displayed correctly*
- What happens when the company name is extremely long (>50 characters)?
  - *It should truncate with ellipsis to fit the header*
- What happens when the cover photo fails to load?
  - *Fall back to gradient background, do not show broken image*
- What happens when a magic link is created without entering an album title?
  - *The field should be required - prevent link creation until filled*
- What happens when viewing an existing magic link created before this feature?
  - *Use the gallery title as fallback for backward compatibility*

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display the workspace company name next to the logo in the header of public gallery pages
- **FR-002**: System MUST provide an "Album Title" input field in the Share Dialog when creating a public magic link
- **FR-003**: System MUST require the album title to be filled before allowing magic link creation
- **FR-004**: System MUST store the album title associated with each magic link
- **FR-005**: System MUST display the album title (not gallery name) in the hero section of public gallery pages
- **FR-006**: System MUST display the designated cover photo as the hero background image
- **FR-007**: System MUST automatically select the first gallery photo as cover if no cover photo is explicitly set
- **FR-008**: System MUST remove the date and photo count badges from the hero section
- **FR-009**: System MUST support backward compatibility - existing magic links without album titles should display the gallery title

### Key Entities

- **Magic Link**: Extended to include `album_title` field (text, stores the client-facing title for this specific link)
- **Workspace**: Already contains `company_name` which will be used for header branding
- **Gallery**: Already contains `cover_asset_id` for cover photo reference

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of newly created magic links include an album title
- **SC-002**: Public gallery pages load with cover photo visible within 2 seconds
- **SC-003**: Company name is visible in header for all workspaces that have it configured
- **SC-004**: Photo count and date badges are removed from hero section on all public galleries
- **SC-005**: Existing magic links (created before this feature) continue to work without errors

## Assumptions

- Workspace company name is already stored in the database and accessible to the frontend
- Gallery cover photo selection functionality already exists
- Share Dialog component exists and can be extended with new input fields
- Magic Links table can be extended with a new column for album title
