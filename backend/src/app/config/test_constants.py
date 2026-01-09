"""Centralized test constants for RawDrive.

These constants define test user emails, UUIDs, and credentials used across:
- Database seeding (seed_static.py)
- E2E tests
- Operational scripts (services/llm-service)

IMPORTANT: Do not change these values without updating the database seeds,
as they are tied to deterministic UUIDs used for testing.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import ClassVar


# =============================================================================
# Core Constants
# =============================================================================

# Email domain for all test users
TEST_EMAIL_DOMAIN: str = "test.rawdrive.in"

# Universal test password (Argon2 hashed in database)
TEST_PASSWORD: str = "Test@123"


# =============================================================================
# Test User Data Class
# =============================================================================


@dataclass(frozen=True)
class TestUser:
    """Represents a test user with ID, email pattern, and role.

    Attributes:
        user_id: Deterministic UUID for the test user
        email_prefix: Part before @ in email (e.g., "professional")
        display_name: Human-readable name for the user
        role: Role code (matches plan code or admin role)
        workspace_id: Deterministic UUID for the user's primary workspace
    """

    user_id: uuid.UUID
    email_prefix: str
    display_name: str
    role: str
    workspace_id: uuid.UUID

    @property
    def email(self) -> str:
        """Generate full email address from prefix and domain."""
        return f"{self.email_prefix}@{TEST_EMAIL_DOMAIN}"

    def as_tuple(self) -> tuple[uuid.UUID, str, str, str]:
        """Convert to tuple format used by seed_static.py."""
        return (self.user_id, self.email, self.display_name, self.role)


# =============================================================================
# Tier Users (by subscription plan)
# =============================================================================


class TierUsers:
    """Test users for each subscription tier.

    UUID pattern for users: 11111111-1111-1111-1111-11111111100X
    UUID pattern for workspaces: 11111111-1111-1111-1111-00000000000X
    """

    FREE: ClassVar[TestUser] = TestUser(
        uuid.UUID("11111111-1111-1111-1111-111111111001"),
        "free",
        "Free User",
        "free",
        uuid.UUID("11111111-1111-1111-1111-000000000001"),
    )
    STARTER: ClassVar[TestUser] = TestUser(
        uuid.UUID("11111111-1111-1111-1111-111111111002"),
        "starter",
        "Starter User",
        "starter",
        uuid.UUID("11111111-1111-1111-1111-000000000002"),
    )
    PROFESSIONAL: ClassVar[TestUser] = TestUser(
        uuid.UUID("11111111-1111-1111-1111-111111111003"),
        "professional",
        "Professional User",
        "professional",
        uuid.UUID("11111111-1111-1111-1111-000000000003"),
    )
    BUSINESS: ClassVar[TestUser] = TestUser(
        uuid.UUID("11111111-1111-1111-1111-111111111004"),
        "business",
        "Business User",
        "business",
        uuid.UUID("11111111-1111-1111-1111-000000000004"),
    )
    ENTERPRISE: ClassVar[TestUser] = TestUser(
        uuid.UUID("11111111-1111-1111-1111-111111111005"),
        "enterprise",
        "Enterprise User",
        "enterprise",
        uuid.UUID("11111111-1111-1111-1111-000000000005"),
    )

    @classmethod
    def all(cls) -> list[TestUser]:
        """Return all tier users in order."""
        return [cls.FREE, cls.STARTER, cls.PROFESSIONAL, cls.BUSINESS, cls.ENTERPRISE]


# =============================================================================
# Admin Users (platform-level)
# =============================================================================


class AdminUsers:
    """Test users for platform admin roles.

    UUID pattern for users: 22222222-2222-2222-2222-22222222200X
    UUID pattern for workspaces: 22222222-2222-2222-2222-00000000000X
    """

    SUPER_ADMIN: ClassVar[TestUser] = TestUser(
        uuid.UUID("22222222-2222-2222-2222-222222222001"),
        "superadmin",
        "Super Admin",
        "super_admin",
        uuid.UUID("22222222-2222-2222-2222-000000000001"),
    )
    PLATFORM_ADMIN: ClassVar[TestUser] = TestUser(
        uuid.UUID("22222222-2222-2222-2222-222222222002"),
        "platformadmin",
        "Platform Admin",
        "platform_admin",
        uuid.UUID("22222222-2222-2222-2222-000000000002"),
    )
    SUPPORT_ADMIN: ClassVar[TestUser] = TestUser(
        uuid.UUID("22222222-2222-2222-2222-222222222003"),
        "supportadmin",
        "Support Admin",
        "support_admin",
        uuid.UUID("22222222-2222-2222-2222-000000000003"),
    )
    BILLING_ADMIN: ClassVar[TestUser] = TestUser(
        uuid.UUID("22222222-2222-2222-2222-222222222004"),
        "billingadmin",
        "Billing Admin",
        "billing_admin",
        uuid.UUID("22222222-2222-2222-2222-000000000004"),
    )
    CONTENT_MOD: ClassVar[TestUser] = TestUser(
        uuid.UUID("22222222-2222-2222-2222-222222222005"),
        "contentmod",
        "Content Moderator",
        "content_moderator",
        uuid.UUID("22222222-2222-2222-2222-000000000005"),
    )
    SECURITY_ADMIN: ClassVar[TestUser] = TestUser(
        uuid.UUID("22222222-2222-2222-2222-222222222006"),
        "securityadmin",
        "Security Admin",
        "security_admin",
        uuid.UUID("22222222-2222-2222-2222-000000000006"),
    )
    OBSERVABILITY_ADMIN: ClassVar[TestUser] = TestUser(
        uuid.UUID("22222222-2222-2222-2222-222222222007"),
        "observabilityadmin",
        "Observability Admin",
        "observability_admin",
        uuid.UUID("22222222-2222-2222-2222-000000000007"),
    )
    AUDITOR: ClassVar[TestUser] = TestUser(
        uuid.UUID("22222222-2222-2222-2222-222222222008"),
        "auditor",
        "Auditor",
        "auditor_readonly",
        uuid.UUID("22222222-2222-2222-2222-000000000008"),
    )
    PRODUCT_ADMIN: ClassVar[TestUser] = TestUser(
        uuid.UUID("22222222-2222-2222-2222-222222222009"),
        "productadmin",
        "Product Admin",
        "product_admin",
        uuid.UUID("22222222-2222-2222-2222-000000000009"),
    )

    @classmethod
    def all(cls) -> list[TestUser]:
        """Return all admin users in order."""
        return [
            cls.SUPER_ADMIN,
            cls.PLATFORM_ADMIN,
            cls.SUPPORT_ADMIN,
            cls.BILLING_ADMIN,
            cls.CONTENT_MOD,
            cls.SECURITY_ADMIN,
            cls.OBSERVABILITY_ADMIN,
            cls.AUDITOR,
            cls.PRODUCT_ADMIN,
        ]


# =============================================================================
# Workspace Role Users
# =============================================================================


class WorkspaceUsers:
    """Test users for workspace-level roles.

    UUID pattern for users: 33333333-3333-3333-3333-33333333300X
    All workspace users share the same workspace: 44444444-4444-4444-4444-444444444000
    """

    # Shared workspace for all workspace role test users
    SHARED_WORKSPACE_ID: ClassVar[uuid.UUID] = uuid.UUID("44444444-4444-4444-4444-444444444000")

    OWNER: ClassVar[TestUser] = TestUser(
        uuid.UUID("33333333-3333-3333-3333-333333333001"),
        "workspaceowner",
        "Workspace Owner",
        "owner",
        uuid.UUID("44444444-4444-4444-4444-444444444000"),
    )
    ADMIN: ClassVar[TestUser] = TestUser(
        uuid.UUID("33333333-3333-3333-3333-333333333002"),
        "workspaceadmin",
        "Workspace Admin",
        "admin",
        uuid.UUID("44444444-4444-4444-4444-444444444000"),
    )
    STAFF: ClassVar[TestUser] = TestUser(
        uuid.UUID("33333333-3333-3333-3333-333333333003"),
        "staffuser",
        "Staff User",
        "editor",
        uuid.UUID("44444444-4444-4444-4444-444444444000"),
    )
    VIEWER: ClassVar[TestUser] = TestUser(
        uuid.UUID("33333333-3333-3333-3333-333333333004"),
        "clientviewer",
        "Client Viewer",
        "viewer",
        uuid.UUID("44444444-4444-4444-4444-444444444000"),
    )

    @classmethod
    def all(cls) -> list[TestUser]:
        """Return all workspace role users in order."""
        return [cls.OWNER, cls.ADMIN, cls.STAFF, cls.VIEWER]


# =============================================================================
# Convenience Exports
# =============================================================================

# For backward compatibility and quick access
ALL_TEST_USERS: list[TestUser] = TierUsers.all() + AdminUsers.all() + WorkspaceUsers.all()


def get_test_user_by_email(email: str) -> TestUser | None:
    """Look up a test user by email address."""
    for user in ALL_TEST_USERS:
        if user.email == email:
            return user
    return None


def get_test_user_by_id(user_id: uuid.UUID) -> TestUser | None:
    """Look up a test user by UUID."""
    for user in ALL_TEST_USERS:
        if user.user_id == user_id:
            return user
    return None
