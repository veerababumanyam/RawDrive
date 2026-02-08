"""Biometric Consent Seeding Utility.

This module provides utilities for seeding biometric consent for development
and testing purposes. It should ONLY be used in non-production environments.

Features:
- Seed consent for test workspaces
- Seed consent for all workspaces (development)
- Verify consent status
- Auto-seed for test user workspaces at startup (development only)

WARNING: This bypasses GDPR Article 9 consent requirements and should
NEVER be used in production environments.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID
from typing import Optional

from app.services.biometric_consent_service import (
    BiometricConsentService,
    BiometricConsentGrant,
)
from app.services.biometric_consent_service import get_biometric_consent_service
from app.db.postgres import get_postgres_pool
from app.models.workspace_biometric_settings import BiometricConsentStatus

logger = logging.getLogger(__name__)

# Known test workspace IDs: tier users (TEST_USERS.md) + test-roles workspace
# Tier: free, starter, professional, business, enterprise
# Test roles workspace: shared workspace for workspaceowner, workspaceadmin, etc.
TEST_WORKSPACE_IDS = [
    UUID("11111111-1111-1111-1111-000000000001"),  # free
    UUID("11111111-1111-1111-1111-000000000002"),  # starter
    UUID("11111111-1111-1111-1111-000000000003"),  # professional
    UUID("11111111-1111-1111-1111-000000000004"),  # business
    UUID("11111111-1111-1111-1111-000000000005"),  # enterprise
    UUID("44444444-4444-4444-4444-444444444000"),  # test-roles-workspace
]

# Test user email domains (TEST_USERS.md) – workspaces with members using these get consent
TEST_EMAIL_DOMAINS = ("@test.rawdrive.in", "@test.rawdrive.ai")

# Test user for consent attribution (system/dev)
TEST_CONSENT_USER = UUID("00000000-0000-0000-0000-000000000001")  # System user


async def seed_consent_for_workspace(
    workspace_id: UUID,
    user_id: Optional[UUID] = None,
    policy_version: str = "1.0-dev",
) -> bool:
    """Seed biometric consent for a specific workspace.

    This grants consent programmatically for testing purposes.
    DO NOT use in production.

    Args:
        workspace_id: The workspace ID to grant consent for
        user_id: Optional user ID to attribute consent to (defaults to system user)
        policy_version: Policy version to record

    Returns:
        True if consent was seeded, False if already granted
    """
    consent_service = get_biometric_consent_service()

    # Check if consent already granted
    settings = await consent_service.get_settings(workspace_id)
    if settings.consent_status == BiometricConsentStatus.GRANTED:
        logger.info(f"Consent already granted for workspace {workspace_id}")
        return False

    # Grant consent
    grant_data = BiometricConsentGrant(
        ip_address="127.0.0.1",  # Localhost for development
        user_agent="RawDrive Development Seeder",
        policy_version=policy_version,
    )

    user_id = user_id or TEST_CONSENT_USER

    try:
        await consent_service.grant_consent(workspace_id, user_id, grant_data)
        logger.info(f"Seeded consent for workspace {workspace_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to seed consent for workspace {workspace_id}: {e}")
        return False


async def seed_consent_for_all_workspaces(
    policy_version: str = "1.0-dev",
    dry_run: bool = False,
) -> dict[str, int]:
    """Seed biometric consent for ALL workspaces.

    WARNING: This grants consent for every workspace in the database.
    ONLY use for local development.

    Args:
        policy_version: Policy version to record
        dry_run: If True, only report what would be done

    Returns:
        Dictionary with counts: {granted, skipped, failed, total}
    """
    pool = await get_postgres_pool()
    consent_service = get_biometric_consent_service()

    stats = {
        "granted": 0,
        "skipped": 0,
        "failed": 0,
        "total": 0,
    }

    async with pool.acquire() as conn:
        # Get all workspaces
        rows = await conn.fetch(
            """
            SELECT workspace_id, name
            FROM workspaces
            ORDER BY created_at DESC
            """
        )

    stats["total"] = len(rows)

    for row in rows:
        workspace_id = row["workspace_id"]
        workspace_name = row["name"]

        # Check if consent already granted
        settings = await consent_service.get_settings(workspace_id)
        if settings.consent_status == BiometricConsentStatus.GRANTED:
            stats["skipped"] += 1
            logger.debug(f"Skipping {workspace_name} ({workspace_id}): consent already granted")
            continue

        if dry_run:
            logger.info(f"Would grant consent for {workspace_name} ({workspace_id})")
            stats["granted"] += 1
            continue

        # Grant consent
        grant_data = BiometricConsentGrant(
            ip_address="127.0.0.1",
            user_agent="RawDrive Development Seeder (Bulk)",
            policy_version=policy_version,
        )

        try:
            await consent_service.grant_consent(workspace_id, TEST_CONSENT_USER, grant_data)
            stats["granted"] += 1
            logger.info(f"Granted consent for {workspace_name} ({workspace_id})")
        except Exception as e:
            stats["failed"] += 1
            logger.error(f"Failed to grant consent for {workspace_name} ({workspace_id}): {e}")

    logger.info(f"Consent seeding complete: {stats}")
    return stats


async def verify_consent_status(workspace_id: UUID) -> dict[str, any]:
    """Verify and report consent status for a workspace.

    Args:
        workspace_id: The workspace ID to check

    Returns:
        Dictionary with consent status details
    """
    consent_service = get_biometric_consent_service()
    settings = await consent_service.get_settings(workspace_id)

    return {
        "workspace_id": str(workspace_id),
        "consent_status": settings.consent_status.value,
        "face_detection_enabled": settings.face_detection_enabled,
        "consented_at": settings.consented_at.isoformat() if settings.consented_at else None,
        "consented_by": str(settings.consented_by) if settings.consented_by else None,
        "is_allowed": await consent_service.is_face_detection_allowed(workspace_id),
    }


async def seed_test_workspaces() -> dict[str, int]:
    """Seed consent for known test workspaces.

    Reads test workspace IDs from configuration or uses predefined list.

    Returns:
        Dictionary with seeding statistics
    """
    import os

    # Get test workspace IDs from environment or use defaults
    env_workspaces = os.getenv("TEST_WORKSPACE_IDS", "")
    if env_workspaces:
        workspace_ids = [UUID(wid.strip()) for wid in env_workspaces.split(",")]
    else:
        workspace_ids = TEST_WORKSPACE_IDS

    stats = {
        "granted": 0,
        "skipped": 0,
        "failed": 0,
        "total": len(workspace_ids),
    }

    for workspace_id in workspace_ids:
        result = await seed_consent_for_workspace(workspace_id)
        if result:
            stats["granted"] += 1
        else:
            stats["skipped"] += 1

    logger.info(f"Test workspace consent seeding complete: {stats}")
    return stats


async def seed_consent_for_test_user_workspaces(
    policy_version: str = "1.0-dev",
) -> dict[str, int]:
    """Seed biometric consent for all test-user workspaces (persistent, idempotent).

    - Grants consent for TEST_WORKSPACE_IDS (tier + test-roles).
    - Also finds workspaces where any member has email ending with
      @test.rawdrive.in or @test.rawdrive.ai and grants consent for those.
    So all test users get consent pre-granted and are not asked again.

    Call at backend startup in development only (see main.py lifespan).
    Data is stored in workspace_biometric_settings; Redis cache is invalidated per workspace.

    Returns:
        Dictionary with granted, skipped, failed, total.
    """
    pool = await get_postgres_pool()
    consent_service = get_biometric_consent_service()
    stats = {"granted": 0, "skipped": 0, "failed": 0, "total": 0}

    # 1) Collect workspace IDs: known test list + workspaces with test-user members
    workspace_ids: set[UUID] = set(TEST_WORKSPACE_IDS)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT wm.workspace_id
            FROM workspace_memberships wm
            JOIN users u ON u.user_id = wm.user_id
            WHERE wm.status = 'active'
            AND (u.email LIKE $1 OR u.email LIKE $2)
            """,
            "%@test.rawdrive.in",
            "%@test.rawdrive.ai",
        )
        for row in rows:
            workspace_ids.add(row["workspace_id"])

    ordered_ids = list(workspace_ids)
    stats["total"] = len(ordered_ids)

    grant_data = BiometricConsentGrant(
        ip_address="127.0.0.1",
        user_agent="RawDrive Test User Consent Seeder (Startup)",
        policy_version=policy_version,
    )

    for workspace_id in ordered_ids:
        settings = await consent_service.get_settings(workspace_id)
        if settings.consent_status == BiometricConsentStatus.GRANTED:
            stats["skipped"] += 1
            continue
        try:
            await consent_service.grant_consent(
                workspace_id, TEST_CONSENT_USER, grant_data
            )
            stats["granted"] += 1
            logger.debug("Granted biometric consent for test workspace %s", workspace_id)
        except Exception as e:
            stats["failed"] += 1
            logger.warning(
                "Failed to grant consent for workspace %s: %s",
                workspace_id,
                e,
            )

    if stats["granted"] or stats["skipped"]:
        logger.info(
            "Test user biometric consent seeding: total=%s granted=%s skipped=%s failed=%s",
            stats["total"],
            stats["granted"],
            stats["skipped"],
            stats["failed"],
        )
    return stats


# CLI command for development
async def main():
    """CLI entry point for consent seeding.

    Usage:
        python -m app.services.biometric_consent_seeder [--workspace-id ID] [--all] [--dry-run]

    Examples:
        # Seed consent for a specific workspace
        python -m app.services.biometric_consent_seeder --workspace-id 123e4567-e89b-12d3-a456-426614174000

        # Seed consent for all workspaces (development only!)
        python -m app.services.biometric_consent_seeder --all

        # Dry run to see what would be done
        python -m app.services.biometric_consent_seeder --all --dry-run

        # Verify consent status
        python -m app.services.biometric_consent_seeder --verify --workspace-id 123e4567-e89b-12d3-a456-426614174000
    """
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Seed biometric consent for development")
    parser.add_argument("--workspace-id", type=UUID, help="Specific workspace ID")
    parser.add_argument("--all", action="store_true", help="Seed all workspaces")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done")
    parser.add_argument("--verify", action="store_true", help="Verify consent status")

    args = parser.parse_args()

    # Safety check
    if args.all and not os.getenv("RAWDRIVE_ENV") == "development":
        print("ERROR: --all flag can only be used in development environment")
        print("Set RAWDRIVE_ENV=development to proceed")
        sys.exit(1)

    if args.verify:
        if not args.workspace_id:
            print("ERROR: --verify requires --workspace-id")
            sys.exit(1)
        status = await verify_consent_status(args.workspace_id)
        print(f"\nConsent Status for {args.workspace_id}:")
        for key, value in status.items():
            print(f"  {key}: {value}")
        return

    if args.workspace_id:
        result = await seed_consent_for_workspace(args.workspace_id)
        if result:
            print(f"✓ Seeded consent for workspace {args.workspace_id}")
        else:
            print(f"× Consent already granted for workspace {args.workspace_id}")
    elif args.all:
        stats = await seed_consent_for_all_workspaces(dry_run=args.dry_run)
        print(f"\nConsent Seeding Stats:")
        for key, value in stats.items():
            print(f"  {key}: {value}")
    else:
        # Default: seed test workspaces
        stats = await seed_test_workspaces()
        print(f"\nTest Workspace Seeding Stats:")
        for key, value in stats.items():
            print(f"  {key}: {value}")


if __name__ == "__main__":
    import asyncio
    import os

    asyncio.run(main())
