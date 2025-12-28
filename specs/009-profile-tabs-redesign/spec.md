# Feature Specification: User Profile Tabbed Navigation Redesign

**Feature Branch**: `009-profile-tabs-redesign`
**Created**: 2025-12-28
**Status**: Draft
**Input**: User description: "The user profile is not in sync with the main workspace UI/UX style and not in sync with the application. It is opening a new sidebar when profile is selected in workspace sidebar. Instead of opening a new window with new sidebar, it is better to configure all options as tabs in the same user profile page so that the user can navigate in the tabs. UI/UX should follow application central/global style UI/UX with mobile-first approach, responsive to device resolutions, modern, intuitive, elegant, and user friendly. Check gallery for button colors if required and follow similar styles."

## Problem Statement

The current user profile settings experience is inconsistent with the main application design:

1. **Inconsistent Layout**: Clicking "My Profile" in the workspace sidebar navigates to a completely separate layout (`SettingsLayout`) with its own sidebar navigation, creating a jarring context switch
2. **Duplicate Navigation Paradigm**: The settings sidebar duplicates navigation concepts already present in the workspace, confusing users about their location in the app
3. **Mobile Experience**: On mobile, the settings use a dropdown selector rather than the intuitive tab patterns seen elsewhere in the app (like `GallerySettingsPanel`)
4. **Visual Disconnect**: The settings pages don't match the glassmorphism, gradients, and modern styling used throughout the workspace

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate Profile Settings via Tabs (Priority: P1)

As a photographer, I want to manage my profile settings using tabs within a single page so that I can quickly switch between different settings sections without losing context or waiting for page loads.

**Why this priority**: This is the core UX improvement that addresses the main user pain point - the disjointed navigation experience.

**Independent Test**: Can be fully tested by navigating to profile settings and switching between tabs (Profile, Security, Notifications, Privacy, AI & Gemini, Subscription, Account). Each tab switch should be instant without page reload.

**Acceptance Scenarios**:

1. **Given** I am logged into my workspace, **When** I click "My Profile" in the workspace sidebar, **Then** a single-page profile settings view opens with horizontal tabs for each section
2. **Given** I am on the Profile tab, **When** I click the "Security" tab, **Then** the content switches to security settings without a page reload and the active tab is visually highlighted
3. **Given** I am on any settings tab, **When** I make changes, **Then** unsaved changes persist when switching between tabs until I explicitly save or discard

---

### User Story 2 - Mobile-First Responsive Navigation (Priority: P1)

As a photographer using my phone, I want the profile settings to adapt seamlessly to my screen size so that I can manage settings comfortably on any device.

**Why this priority**: Mobile-first design is essential for modern SaaS applications and directly impacts user satisfaction.

**Independent Test**: Can be fully tested by accessing profile settings on various viewport sizes (mobile 375px, tablet 768px, desktop 1024px+) and verifying layout adapts appropriately.

**Acceptance Scenarios**:

1. **Given** I am on a mobile device (width < 768px), **When** I view profile settings, **Then** tabs display as a scrollable horizontal row or a compact dropdown/pill selector
2. **Given** I am on a tablet device (768px - 1024px), **When** I view profile settings, **Then** tabs display horizontally with appropriate spacing
3. **Given** I am on a desktop device (width > 1024px), **When** I view profile settings, **Then** tabs display with comfortable spacing and the content area has appropriate max-width for readability

---

### User Story 3 - Consistent Visual Design (Priority: P2)

As a photographer, I want the profile settings to match the visual style of the rest of the application so that the experience feels cohesive and professional.

**Why this priority**: Visual consistency builds trust and reduces cognitive load, but functionality comes first.

**Independent Test**: Can be tested by comparing visual elements (buttons, cards, inputs, colors, spacing) against the gallery settings panel and toolbar patterns.

**Acceptance Scenarios**:

1. **Given** I am on any profile settings tab, **When** I view the interface, **Then** buttons use the same primary/outline/ghost variants as gallery toolbar buttons
2. **Given** I am on any profile settings tab, **When** I view form sections, **Then** cards use glassmorphism styling with `bg-surface`, `border-border`, and subtle shadows
3. **Given** I am on any profile settings tab with active state, **When** I view the active tab indicator, **Then** it uses the primary color bottom border style consistent with `GallerySettingsPanel`

---

### User Story 4 - Preserve Workspace Context (Priority: P2)

As a photographer, I want to access profile settings while remaining within the workspace layout so that I can easily return to my work without navigating back.

**Why this priority**: Context preservation improves workflow efficiency and reduces disorientation.

**Independent Test**: Can be tested by verifying the workspace sidebar, header, and navigation remain visible while on profile settings.

**Acceptance Scenarios**:

1. **Given** I am in the workspace view, **When** I open profile settings, **Then** the workspace sidebar and header remain visible
2. **Given** I am on profile settings, **When** I click any workspace sidebar item, **Then** I navigate to that section without any intermediate steps
3. **Given** I have the workspace sidebar collapsed, **When** I open profile settings, **Then** the collapsed state is preserved

---

### User Story 5 - Keyboard Navigation & Accessibility (Priority: P2)

As a photographer with accessibility needs, I want to navigate profile settings using keyboard controls so that I can use the feature without a mouse.

**Why this priority**: WCAG 2.1 AA compliance is mandatory per project requirements.

**Independent Test**: Can be tested by navigating entire profile settings flow using only Tab, Shift+Tab, Enter, Arrow keys, and Escape.

**Acceptance Scenarios**:

1. **Given** I am on the profile settings page using keyboard, **When** I use Tab/Shift+Tab, **Then** focus moves between tabs and form elements in a logical order
2. **Given** focus is on a tab, **When** I press Left/Right arrow keys, **Then** focus moves between adjacent tabs
3. **Given** focus is on a tab, **When** I press Enter or Space, **Then** that tab becomes active and its content is displayed

---

### User Story 6 - Direct Tab URL Access (Priority: P3)

As a photographer, I want to share or bookmark specific settings sections so that I can quickly return to a specific configuration area.

**Why this priority**: Nice-to-have feature that improves power-user workflows but isn't essential for MVP.

**Independent Test**: Can be tested by navigating to URL with tab parameter (e.g., `/profile?tab=security`) and verifying correct tab is active.

**Acceptance Scenarios**:

1. **Given** I navigate to `/profile?tab=security`, **When** the page loads, **Then** the Security tab is active
2. **Given** I am on the Security tab, **When** I view the URL, **Then** it reflects the current tab state (optional: depends on implementation choice)

---

### Edge Cases

- What happens when a user has no avatar uploaded? Display initials fallback with proper contrast
- How does the system handle deep-linking to a non-existent tab? Default to the Profile tab
- What happens if form validation fails on one tab while switching? Show inline errors and prevent switching until resolved OR allow switching with warning
- How does the system handle slow network when saving? Show loading state on save button, disable tab switching during save
- What happens on extremely narrow screens (< 320px)? Maintain minimum touch target sizes (44x44px) and allow horizontal scroll on tabs

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display all user settings sections (Profile, Security, Notifications, Privacy, AI & Gemini, Subscription, Account) as horizontal tabs within a single page
- **FR-002**: System MUST render profile settings within the existing `WorkspaceLayout` component, preserving the workspace sidebar and header
- **FR-003**: Tab switching MUST be client-side without full page reload
- **FR-004**: System MUST preserve unsaved form changes when switching between tabs within the same session
- **FR-005**: Each settings tab MUST maintain independent scroll position when switching tabs
- **FR-006**: System MUST display the active tab with a visual indicator (bottom border with primary color, following `GallerySettingsPanel` pattern)
- **FR-007**: System MUST support responsive breakpoints: mobile (< 768px), tablet (768px - 1024px), desktop (> 1024px)
- **FR-008**: On mobile viewports, tabs MUST be accessible via horizontal scroll or condensed selector
- **FR-009**: All interactive elements MUST meet minimum touch target size of 44x44 pixels on mobile
- **FR-010**: System MUST support keyboard navigation (Tab, Arrow keys, Enter/Space) for tab switching
- **FR-011**: Active tab MUST be announced to screen readers when changed
- **FR-012**: Save functionality MUST remain per-section (each tab has its own save action)
- **FR-013**: The "Account" tab (danger zone with delete account) MUST have distinct styling to indicate destructive actions

### Non-Functional Requirements

- **NFR-001**: Tab switching MUST complete in under 100ms (perceived as instant)
- **NFR-002**: Initial page load MUST not exceed 3 seconds on 3G connection
- **NFR-003**: Focus management MUST comply with WCAG 2.1 AA standards
- **NFR-004**: Color contrast MUST meet 4.5:1 ratio for text, 3:1 for UI components

### Key Entities

- **ProfileSettingsPage**: Single-page container that orchestrates tab navigation and section rendering
- **SettingsTab**: Navigation unit representing each settings section (Profile, Security, etc.)
- **TabContent**: Section-specific content that renders based on active tab state
- **UserProfile**: Existing entity containing user profile data (display name, avatar, timezone, etc.)
- **UserSecurity**: Existing entity containing security settings (2FA, sessions, password)
- **UserNotifications**: Existing entity containing notification preferences
- **UserPrivacy**: Existing entity containing privacy settings and data export options

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can access any settings section within 2 clicks from workspace (sidebar click + tab click)
- **SC-002**: Tab switching completes in under 100ms as measured by performance profiling
- **SC-003**: Page maintains Lighthouse accessibility score of 90+ on all settings sections
- **SC-004**: Layout adapts correctly at all standard breakpoints (375px, 768px, 1024px, 1440px) without horizontal overflow or broken elements
- **SC-005**: All form elements are keyboard-accessible and announce correctly in screen readers
- **SC-006**: Visual design consistency score: All buttons, cards, and inputs match patterns used in `GallerySettingsPanel` and `GalleryToolbar`
- **SC-007**: Users can complete common tasks (change display name, update password, toggle notification) without consulting help documentation

## Assumptions

- The existing settings pages (`ProfileSettingsPage`, `SecuritySettingsPage`, etc.) will be refactored into tab content components rather than standalone pages
- The current `/settings/*` routes will be deprecated in favor of a single `/profile` or `/settings` route with tab state
- The "Back to Dashboard" functionality currently in `SettingsLayout` is no longer needed since workspace context is preserved
- Each settings section maintains its own form state and save action (no global "Save All" button)
- The `SettingsLayout` component will be removed or deprecated after migration
- Tab state can be managed via React state or URL parameters (implementation choice)

## Out of Scope

- Workspace-level settings (billing, team members) - these remain separate from user profile
- Company profile settings - remains a separate concern
- Dark mode implementation (already exists and should continue working)
- New settings sections not currently implemented
- Backend API changes - frontend-only refactoring

## Dependencies

- Existing UI components: `AppButton`, `AppCard`, `AppInput`, design tokens
- Existing settings pages: `ProfileSettingsPage`, `SecuritySettingsPage`, `NotificationSettingsPage`, `PrivacySettingsPage`, `AISettingsPage`, `SubscriptionSettingsPage`, `AccountSettingsPage`
- Design patterns: `GallerySettingsPanel` tabs, `GalleryToolbar` filter pills
- Router configuration: React Router routes in `routes.tsx`
