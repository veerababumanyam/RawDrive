# Feature Specification: Shared Packages Infrastructure

**Feature Branch**: `022-shared-packages`
**Created**: 2026-01-04
**Status**: Draft
**Input**: User description: "Implement shared packages for reusable types, constants, validation, and utilities across frontend, backend, and microservices - safely without breaking current application"

## Executive Summary

RawDrive currently has significant code duplication across its frontend (TypeScript/React), backend (Python/FastAPI), and microservices (invitations-service). This specification defines a shared packages infrastructure that eliminates duplication, ensures type consistency, and provides a single source of truth for domain types, constants, validation rules, and utilities.

The implementation follows a non-breaking, incremental migration strategy that maintains backward compatibility throughout the transition.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Uses Shared Types (Priority: P1)

A RawDrive developer imports shared domain types (e.g., `InvitationStatus`, `GalleryStatus`) from a central package rather than defining them locally. When the type changes, all services automatically receive the update.

**Why this priority**: Eliminates the highest-impact duplication (invitation enums duplicated 3 ways) and establishes the foundational shared package pattern that all other packages build upon.

**Independent Test**: Can be fully tested by creating a new TypeScript file that imports from `@rawdrive/shared-types` and verifying correct IntelliSense, type checking, and runtime values. Delivers immediate value by preventing type drift.

**Acceptance Scenarios**:

1. **Given** shared-types package is installed, **When** developer imports `InvitationStatus`, **Then** TypeScript provides correct enum values and type checking
2. **Given** shared-types package is installed, **When** developer uses incorrect enum value, **Then** TypeScript compilation fails with clear error message
3. **Given** shared-types package is updated, **When** developer runs package update, **Then** all consuming services receive the new type definitions without code changes

---

### User Story 2 - Developer Uses Shared Constants (Priority: P1)

A developer references API route paths, storage limits, and configuration values from a shared constants package. All services use identical values, preventing configuration drift.

**Why this priority**: API routes and storage constants are referenced throughout the codebase. Inconsistent values cause runtime errors and broken functionality.

**Independent Test**: Can be tested by importing `API_BASE` and `STORAGE.GB` constants and verifying they match expected values. Any consuming service using these constants will have consistent behavior.

**Acceptance Scenarios**:

1. **Given** shared-constants package is installed, **When** developer imports API_BASE, **Then** value matches `/api/v1` across all services
2. **Given** a constant value needs to change, **When** maintainer updates shared package, **Then** all services receive the update through normal dependency update flow
3. **Given** Python backend needs constants, **When** developer imports from generated Python module, **Then** values match TypeScript package exactly

---

### User Story 3 - Developer Uses Shared Validation (Priority: P2)

A developer uses shared validation patterns (hex color regex, UUID validation) that work identically in frontend forms and backend API validation, ensuring consistent user experience.

**Why this priority**: Validation inconsistency causes frustrating UX where forms accept values that API rejects. Shared validation prevents this class of bugs entirely.

**Independent Test**: Can be tested by validating the same input string through both TypeScript and Python validation functions, verifying identical accept/reject behavior.

**Acceptance Scenarios**:

1. **Given** shared hex color regex, **When** `#FF5733` is validated in frontend and backend, **Then** both accept the value
2. **Given** shared hex color regex, **When** `#GGGGGG` is validated in frontend and backend, **Then** both reject the value with consistent error message
3. **Given** shared UUID v4 pattern, **When** invalid UUID is submitted, **Then** frontend form validation matches backend API validation

---

### User Story 4 - Developer Uses Shared Utilities (Priority: P2)

A developer uses shared utility functions (date formatting, relative time) that produce consistent output across frontend UI and backend email templates.

**Why this priority**: Utility functions like `formatRelativeDate` are used in multiple places. Shared utilities ensure "2 hours ago" displays identically everywhere.

**Independent Test**: Can be tested by calling `formatRelativeDate` with a fixed timestamp and verifying output matches across TypeScript and Python implementations.

**Acceptance Scenarios**:

1. **Given** shared date utility, **When** formatting a date 2 hours ago, **Then** output is "2 hours ago" in both frontend and backend
2. **Given** shared file size formatter, **When** formatting 1073741824 bytes, **Then** output is "1 GB" in both services

---

### User Story 5 - Zero Downtime Migration (Priority: P1)

Existing services continue functioning during migration. Old imports work alongside new shared imports, with gradual replacement over multiple releases.

**Why this priority**: Breaking changes would cause production outages. Backward compatibility is mandatory for safe rollout.

**Independent Test**: Can be tested by running existing test suites after each migration step. All tests must pass throughout the transition.

**Acceptance Scenarios**:

1. **Given** existing service using local types, **When** shared package is introduced, **Then** existing imports continue working
2. **Given** partial migration (some files using shared, some using local), **When** application runs, **Then** no runtime conflicts occur
3. **Given** deprecated local type, **When** TypeScript compiles, **Then** deprecation warning is shown but compilation succeeds

---

### User Story 6 - Python Backend Consumes Shared Types (Priority: P2)

Python FastAPI backend uses generated Pydantic models derived from the TypeScript source of truth, ensuring API request/response types match frontend expectations.

**Why this priority**: Frontend-backend type mismatches are a major source of bugs. Generating Python types from TypeScript eliminates this class of errors.

**Independent Test**: Can be tested by importing generated Pydantic model and verifying field names, types, and validation match the TypeScript interface.

**Acceptance Scenarios**:

1. **Given** TypeScript `GradientConfiguration` interface, **When** Python module is generated, **Then** Pydantic model has identical field names and constraints
2. **Given** enum values in TypeScript, **When** Python enum is generated, **Then** string values match exactly

---

### Edge Cases

- What happens when a developer uses both old local type and new shared type in the same file? (Compiler should warn about duplicate identifiers)
- How does system handle version mismatches between shared package and consuming service? (Semantic versioning with breaking change protection)
- What happens if Python generation fails? (Build fails fast with clear error, blocking deployment)
- How does system handle circular dependencies between shared packages? (Package structure prevents circular imports by design)

## Requirements *(mandatory)*

### Functional Requirements

#### Package Structure

- **FR-001**: System MUST provide a `@rawdrive/shared-types` package containing all domain type definitions
- **FR-002**: System MUST provide a `@rawdrive/shared-constants` package containing all configuration constants
- **FR-003**: System MUST provide a `@rawdrive/shared-validation` package containing validation patterns and schemas
- **FR-004**: System MUST provide a `@rawdrive/shared-utils` package containing cross-platform utility functions
- **FR-005**: All packages MUST be installable via workspace protocol for local development

#### Type Sharing

- **FR-006**: Shared types MUST include all invitation-related enums (InvitationStatus, RSVPStatus, EventType, TemplateCategory, GuestStatus, etc.)
- **FR-007**: Shared types MUST include all gallery-related enums (GalleryStatus, DownloadPolicy, ThemeMode, LayoutStyle)
- **FR-008**: Shared types MUST include gradient configuration types (GradientConfiguration, ColorStop)
- **FR-009**: Shared types MUST include common response types (PaginatedResponse, ErrorResponse)
- **FR-010**: All enums MUST be defined as string literal unions for TypeScript and string enums for Python compatibility

#### Constants Sharing

- **FR-011**: Shared constants MUST include API version and route path definitions
- **FR-012**: Shared constants MUST include storage size constants (GB, MB, KB conversions)
- **FR-013**: Shared constants MUST include feature thresholds (face search threshold, pagination limits)
- **FR-014**: Constants MUST be exportable as both TypeScript and Python modules

#### Validation Sharing

- **FR-015**: Shared validation MUST include regex patterns (hex color, UUID v4, email format)
- **FR-016**: Shared validation MUST include Zod schemas for common form validation
- **FR-017**: Validation patterns MUST be usable in both client-side and server-side contexts
- **FR-018**: Python validation MUST use equivalent patterns with identical accept/reject behavior

#### Utility Sharing

- **FR-019**: Shared utilities MUST include date formatting functions (formatRelativeDate, formatDateTime)
- **FR-020**: Shared utilities MUST include file size formatting functions
- **FR-021**: Utility functions MUST have consistent output across TypeScript and Python implementations

#### Build & Distribution

- **FR-022**: Packages MUST be built using standard workspace tooling
- **FR-023**: Python modules MUST be generated from TypeScript sources using automated tooling
- **FR-024**: Build process MUST fail if TypeScript-Python type synchronization fails
- **FR-025**: All packages MUST include comprehensive TypeScript type declarations
- **FR-026**: All packages MUST be tree-shakeable for optimal bundle size

#### Migration & Compatibility

- **FR-027**: Migration MUST NOT require simultaneous changes across all services
- **FR-028**: Old local type definitions MUST be marked deprecated but remain functional during transition
- **FR-029**: System MUST provide codemod scripts to automate import replacement
- **FR-030**: Migration MUST be completable in phases over multiple releases

#### Security

- **FR-031**: Shared packages MUST NOT contain any secrets, credentials, or sensitive configuration
- **FR-032**: All shared code MUST pass security linting (no eval, no dynamic imports from user input)
- **FR-033**: XSS sanitization functions MUST be included in shared-validation and used consistently

#### Testing

- **FR-034**: Each shared package MUST have unit tests with >90% code coverage
- **FR-035**: Cross-platform tests MUST verify TypeScript and Python implementations produce identical output
- **FR-036**: Integration tests MUST verify packages work in consuming services

### Key Entities

- **SharedPackage**: A distributable package containing reusable code (types, constants, validation, or utilities)
- **TypeDefinition**: A TypeScript interface or type alias representing a domain concept
- **EnumDefinition**: A string literal union in TypeScript with corresponding Python string enum
- **ValidationPattern**: A regex or validation schema usable in both frontend and backend
- **GeneratedModule**: A Python module automatically generated from TypeScript sources

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero duplicate type/enum definitions remain in codebase after migration (currently 15+ duplications identified)
- **SC-002**: All services pass existing test suites throughout migration with zero regression
- **SC-003**: New feature development time for cross-service features reduces by 30% due to eliminated duplication
- **SC-004**: Type-related bug reports reduce by 50% within 3 months of full adoption
- **SC-005**: Developer satisfaction survey shows >80% positive response to shared packages experience
- **SC-006**: Build time for shared packages is under 30 seconds
- **SC-007**: No production incidents caused by migration process (zero downtime deployment)
- **SC-008**: Python-TypeScript type parity tests pass with 100% agreement on all shared types
- **SC-009**: Bundle size impact is less than 5KB gzipped per package for frontend consumers
- **SC-010**: Migration can be completed within 4 release cycles with incremental adoption

## Assumptions

1. **Monorepo Tooling**: Project uses npm/pnpm workspaces for package management
2. **Python Generation**: Tools like JSON Schema bridge will be used for Python type generation
3. **Semantic Versioning**: All shared packages follow semver for breaking change management
4. **CI/CD Integration**: Existing CI pipeline can be extended to build and test shared packages
5. **Private Registry**: Private npm registry or workspace protocol is available for package distribution
6. **Tree-Shaking Support**: All consuming services use bundlers that support tree-shaking

## Out of Scope

- Database schema changes (types are application-level, not persistence-level)
- API endpoint refactoring (only type sharing, not API restructuring)
- External third-party package consolidation
- Internationalization/localization of error messages (handled separately)
- Runtime configuration management (environment variables remain in each service)

## Dependencies

- Existing frontend, backend, and microservice codebases must remain functional during migration
- Python 3.11+ for type hint support in generated modules
- TypeScript 5.0+ for const enum and satisfies operator support
- Node.js 18+ for workspace protocol support
