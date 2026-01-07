#!/usr/bin/env python3
"""
Database Validation Script
Validates database integrity and identifies common issues.

Usage:
    python scripts/validate-database.py [--fix]

Options:
    --fix    Automatically fix issues where possible
"""

import asyncio
import sys
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import asyncpg

# Add backend src to path
sys.path.insert(0, '/app/src')

from app.core.database import get_postgres_pool


class ValidationError:
    """Represents a validation error."""
    def __init__(self, severity: str, category: str, message: str, details: Dict = None):
        self.severity = severity  # CRITICAL, WARNING, INFO
        self.category = category
        self.message = message
        self.details = details or {}
        self.timestamp = datetime.utcnow()

    def __str__(self):
        severity_icons = {
            'CRITICAL': '❌',
            'WARNING': '⚠️',
            'INFO': 'ℹ️'
        }
        icon = severity_icons.get(self.severity, '•')
        return f"{icon} [{self.severity}] {self.category}: {self.message}"


class DatabaseValidator:
    """Validates database integrity."""

    def __init__(self, pool: asyncpg.Pool, fix: bool = False):
        self.pool = pool
        self.fix = fix
        self.errors: List[ValidationError] = []

    async def validate_all(self) -> Tuple[bool, List[ValidationError]]:
        """Run all validation checks."""
        print("🔍 Starting database validation...\n")

        # Run all validation checks
        await self.check_workspace_subscriptions()
        await self.check_orphaned_workspace_members()
        await self.check_session_integrity()
        await self.check_plan_integrity()
        await self.check_expired_trials()
        await self.check_duplicate_slugs()
        await self.check_missing_indexes()

        # Print summary
        print("\n" + "=" * 60)
        print("📊 VALIDATION SUMMARY")
        print("=" * 60)

        critical = sum(1 for e in self.errors if e.severity == 'CRITICAL')
        warnings = sum(1 for e in self.errors if e.severity == 'WARNING')
        info = sum(1 for e in self.errors if e.severity == 'INFO')

        print(f"Critical Issues: {critical}")
        print(f"Warnings: {warnings}")
        print(f"Info: {info}")
        print(f"Total: {len(self.errors)}")

        if self.errors:
            print("\n📋 DETAILED RESULTS:\n")
            for error in self.errors:
                print(str(error))
                if error.details:
                    for key, value in error.details.items():
                        print(f"   {key}: {value}")
                print()

        success = critical == 0
        if success:
            print("✅ Database validation passed!")
        else:
            print("❌ Database validation failed - critical issues found")

        return success, self.errors

    async def check_workspace_subscriptions(self):
        """Check that all active workspaces have subscriptions."""
        print("Checking workspace subscriptions...")

        rows = await self.pool.fetch("""
            SELECT
                w.workspace_id,
                w.name,
                w.slug,
                w.status,
                ws.subscription_id,
                ws.status as subscription_status
            FROM workspaces w
            LEFT JOIN workspace_subscriptions ws ON ws.workspace_id = w.workspace_id
            WHERE w.status = 'active'
        """)

        missing_subscriptions = []
        for row in rows:
            if not row['subscription_id']:
                missing_subscriptions.append({
                    'workspace_id': row['workspace_id'],
                    'name': row['name'],
                    'slug': row['slug']
                })

        if missing_subscriptions:
            for ws in missing_subscriptions:
                self.errors.append(ValidationError(
                    severity='CRITICAL',
                    category='Missing Subscription',
                    message=f"Active workspace '{ws['name']}' has no subscription record",
                    details={
                        'workspace_id': str(ws['workspace_id']),
                        'slug': ws['slug'],
                        'fix': 'Create subscription record with appropriate plan'
                    }
                ))

            if self.fix:
                print(f"  🔧 Fixing {len(missing_subscriptions)} workspaces without subscriptions...")
                await self._fix_missing_subscriptions(missing_subscriptions)
        else:
            print("  ✅ All active workspaces have subscriptions")

    async def _fix_missing_subscriptions(self, workspaces: List[Dict]):
        """Create missing subscription records."""
        # Get the starter plan (default for free tier)
        plan = await self.pool.fetchrow("""
            SELECT plan_id FROM plans WHERE code = 'starter' LIMIT 1
        """)

        if not plan:
            print("  ❌ Cannot fix: No 'starter' plan found in database")
            return

        for ws in workspaces:
            try:
                await self.pool.execute("""
                    INSERT INTO workspace_subscriptions (
                        workspace_id,
                        plan_id,
                        status,
                        trial_started_at,
                        trial_expires_at,
                        current_period_start,
                        current_period_end
                    ) VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '30 days', NOW(), NOW() + INTERVAL '30 days')
                """, ws['workspace_id'], plan['plan_id'])
                print(f"  ✅ Created subscription for workspace '{ws['name']}'")
            except Exception as e:
                print(f"  ❌ Failed to create subscription for '{ws['name']}': {e}")

    async def check_orphaned_workspace_members(self):
        """Check for workspace members without valid workspaces."""
        print("Checking for orphaned workspace members...")

        rows = await self.pool.fetch("""
            SELECT wm.workspace_id, wm.user_id, u.email
            FROM workspace_memberships wm
            JOIN users u ON u.user_id = wm.user_id
            LEFT JOIN workspaces w ON w.workspace_id = wm.workspace_id
            WHERE w.workspace_id IS NULL
        """)

        if rows:
            for row in rows:
                self.errors.append(ValidationError(
                    severity='WARNING',
                    category='Orphaned Member',
                    message=f"User {row['email']} is member of non-existent workspace",
                    details={
                        'user_id': str(row['user_id']),
                        'workspace_id': str(row['workspace_id']),
                        'fix': 'Remove membership or create workspace'
                    }
                ))
        else:
            print("  ✅ No orphaned workspace members")

    async def check_session_integrity(self):
        """Check for session integrity issues."""
        print("Checking session integrity...")

        # Check for sessions without users
        rows = await self.pool.fetch("""
            SELECT s.session_id, s.user_id
            FROM sessions s
            LEFT JOIN users u ON u.user_id = s.user_id
            WHERE u.user_id IS NULL
        """)

        if rows:
            self.errors.append(ValidationError(
                severity='WARNING',
                category='Orphaned Sessions',
                message=f"Found {len(rows)} sessions for deleted users",
                details={
                    'count': len(rows),
                    'fix': 'Delete orphaned sessions'
                }
            ))

            if self.fix:
                count = await self.pool.execute("""
                    DELETE FROM sessions
                    WHERE user_id NOT IN (SELECT user_id FROM users)
                """)
                print(f"  🔧 Deleted {count} orphaned sessions")
        else:
            print("  ✅ All sessions have valid users")

        # Check for expired sessions
        expired = await self.pool.fetchval("""
            SELECT COUNT(*) FROM sessions WHERE expires_at < NOW()
        """)

        if expired > 100:
            self.errors.append(ValidationError(
                severity='INFO',
                category='Expired Sessions',
                message=f"Found {expired} expired sessions (consider cleanup)",
                details={
                    'count': expired,
                    'fix': 'Run periodic session cleanup job'
                }
            ))

    async def check_plan_integrity(self):
        """Check that required plans exist."""
        print("Checking plan integrity...")

        required_plans = ['starter', 'professional', 'enterprise', 'studio']
        existing = await self.pool.fetch("SELECT code FROM plans")
        existing_codes = {row['code'] for row in existing}

        missing = [plan for plan in required_plans if plan not in existing_codes]

        if missing:
            self.errors.append(ValidationError(
                severity='CRITICAL',
                category='Missing Plans',
                message=f"Required plans missing: {', '.join(missing)}",
                details={
                    'missing_plans': missing,
                    'fix': 'Run plan seed migration'
                }
            ))
        else:
            print("  ✅ All required plans exist")

    async def check_expired_trials(self):
        """Check for expired trials that should be marked expired."""
        print("Checking expired trials...")

        rows = await self.pool.fetch("""
            SELECT
                ws.subscription_id,
                ws.workspace_id,
                w.name,
                ws.status,
                ws.trial_expires_at
            FROM workspace_subscriptions ws
            JOIN workspaces w ON w.workspace_id = ws.workspace_id
            WHERE ws.status IN ('trialing', 'active')
            AND ws.trial_expires_at < NOW()
        """)

        if rows:
            self.errors.append(ValidationError(
                severity='WARNING',
                category='Expired Trials',
                message=f"Found {len(rows)} expired trials still marked as active/trialing",
                details={
                    'count': len(rows),
                    'fix': 'Run trial expiration job'
                }
            ))
        else:
            print("  ✅ No expired trials in active status")

    async def check_duplicate_slugs(self):
        """Check for duplicate workspace slugs."""
        print("Checking for duplicate slugs...")

        rows = await self.pool.fetch("""
            SELECT slug, COUNT(*) as count
            FROM workspaces
            GROUP BY slug
            HAVING COUNT(*) > 1
        """)

        if rows:
            for row in rows:
                self.errors.append(ValidationError(
                    severity='CRITICAL',
                    category='Duplicate Slug',
                    message=f"Workspace slug '{row['slug']}' is used {row['count']} times",
                    details={
                        'slug': row['slug'],
                        'count': row['count'],
                        'fix': 'Rename workspaces to have unique slugs'
                    }
                ))
        else:
            print("  ✅ All workspace slugs are unique")

    async def check_missing_indexes(self):
        """Check for missing critical indexes."""
        print("Checking for critical indexes...")

        critical_indexes = [
            ('idx_subscriptions_active', 'workspace_subscriptions'),
            ('idx_sessions_user_id', 'sessions'),
            ('idx_workspace_memberships_user', 'workspace_memberships'),
        ]

        for index_name, table_name in critical_indexes:
            exists = await self.pool.fetchval("""
                SELECT COUNT(*) FROM pg_indexes
                WHERE indexname = $1 AND tablename = $2
            """, index_name, table_name)

            if not exists:
                self.errors.append(ValidationError(
                    severity='WARNING',
                    category='Missing Index',
                    message=f"Critical index '{index_name}' missing on table '{table_name}'",
                    details={
                        'index': index_name,
                        'table': table_name,
                        'fix': 'Run migrations to create missing indexes'
                    }
                ))


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description='Validate database integrity')
    parser.add_argument('--fix', action='store_true', help='Automatically fix issues where possible')
    args = parser.parse_args()

    pool = await get_postgres_pool()

    try:
        validator = DatabaseValidator(pool, fix=args.fix)
        success, errors = await validator.validate_all()

        # Exit with appropriate code
        sys.exit(0 if success else 1)

    finally:
        await pool.close()


if __name__ == '__main__':
    asyncio.run(main())
