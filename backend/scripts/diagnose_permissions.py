"""Diagnose test user workspace setup and identify mismatches.

This script checks the database state of test users and compares it against
the expected configuration in test_constants.py to identify any mismatches.

Usage:
    docker exec rawdrive-backend python scripts/diagnose_permissions.py
"""
import asyncio
import os
import sys
from pathlib import Path
from uuid import UUID

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import asyncpg
from app.config.test_constants import TierUsers, AdminUsers, WorkspaceUsers


class Colors:
    """ANSI color codes for terminal output."""
    RESET = '\033[0m'
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'


def status_icon(exists: bool) -> str:
    """Return a status icon and color."""
    return f"{Colors.GREEN}✓{Colors.RESET}" if exists else f"{Colors.RED}✗{Colors.RESET}"


async def diagnose():
    """Run comprehensive diagnosis of test user setup."""
    database_url = os.getenv("DATABASE_URL", "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    try:
        conn = await asyncpg.connect(database_url)
    except Exception as e:
        print(f"{Colors.RED}Error connecting to database: {e}{Colors.RESET}")
        return

    try:
        print(f"\n{Colors.BOLD}{'='*80}{Colors.RESET}")
        print(f"{Colors.BOLD}TEST USER WORKSPACE DIAGNOSIS{Colors.RESET}")
        print(f"{Colors.BOLD}{'='*80}{Colors.RESET}\n")

        all_test_users = TierUsers.all() + AdminUsers.all() + WorkspaceUsers.all()
        total_users = len(all_test_users)
        healthy_users = 0

        for test_user in all_test_users:
            print(f"{Colors.BLUE}{Colors.BOLD}User: {test_user.email}{Colors.RESET}")
            print(f"  Expected User ID: {test_user.user_id}")
            print(f"  Expected Workspace ID: {test_user.workspace_id}")

            # Check user exists
            user_row = await conn.fetchrow(
                "SELECT user_id, email FROM users WHERE user_id = $1",
                test_user.user_id
            )
            user_exists = user_row is not None
            print(f"  {status_icon(user_exists)} User exists in database")

            if not user_exists:
                print(f"    {Colors.RED}User record not found!{Colors.RESET}\n")
                continue

            # Check workspace exists
            workspace_row = await conn.fetchrow(
                "SELECT workspace_id, name FROM workspaces WHERE workspace_id = $1",
                test_user.workspace_id
            )
            workspace_exists = workspace_row is not None
            print(f"  {status_icon(workspace_exists)} Workspace exists with expected ID")

            if not workspace_exists:
                print(f"    {Colors.RED}Expected workspace not found!{Colors.RESET}")

            # Check membership
            membership_row = await conn.fetchrow(
                """
                SELECT membership_id, status FROM workspace_memberships
                WHERE user_id = $1 AND workspace_id = $2
                """,
                test_user.user_id,
                test_user.workspace_id,
            )
            membership_exists = membership_row is not None
            membership_active = membership_row and membership_row['status'] == 'active'

            print(f"  {status_icon(membership_exists)} Membership exists")
            if membership_exists:
                status_color = Colors.GREEN if membership_active else Colors.YELLOW
                print(f"    Status: {status_color}{membership_row['status']}{Colors.RESET}")

            if not membership_active:
                print(f"    {Colors.YELLOW}Warning: Membership is not active!{Colors.RESET}")

            # Check subscription
            subscription_row = await conn.fetchrow(
                """
                SELECT subscription_id, status FROM workspace_subscriptions
                WHERE workspace_id = $1
                """,
                test_user.workspace_id,
            )
            subscription_exists = subscription_row is not None
            print(f"  {status_icon(subscription_exists)} Subscription exists")

            if subscription_exists:
                sub_status_color = Colors.GREEN if subscription_row['status'] in ['active', 'trialing'] else Colors.YELLOW
                print(f"    Status: {sub_status_color}{subscription_row['status']}{Colors.RESET}")

            # Check roles
            role_rows = await conn.fetch(
                """
                SELECT DISTINCT r.name FROM member_roles mr
                JOIN roles r ON mr.role_id = r.role_id
                WHERE mr.membership_id = (
                    SELECT membership_id FROM workspace_memberships
                    WHERE user_id = $1 AND workspace_id = $2
                )
                """,
                test_user.user_id,
                test_user.workspace_id,
            )
            roles_assigned = len(role_rows) > 0
            print(f"  {status_icon(roles_assigned)} Roles assigned")

            if roles_assigned:
                role_names = ', '.join([r['name'] for r in role_rows])
                print(f"    Roles: {role_names}")
            else:
                print(f"    {Colors.YELLOW}Warning: No roles assigned!{Colors.RESET}")

            # Determine health status
            is_healthy = (
                user_exists and
                workspace_exists and
                membership_active and
                subscription_exists and
                roles_assigned
            )

            if is_healthy:
                print(f"  {Colors.GREEN}{Colors.BOLD}✓ HEALTHY{Colors.RESET}")
                healthy_users += 1
            else:
                print(f"  {Colors.RED}{Colors.BOLD}✗ NEEDS REPAIR{Colors.RESET}")

            print()

        # Summary
        print(f"{Colors.BOLD}{'='*80}{Colors.RESET}")
        print(f"{Colors.BOLD}SUMMARY{Colors.RESET}")
        print(f"{Colors.BOLD}{'='*80}{Colors.RESET}\n")

        health_percentage = (healthy_users / total_users * 100) if total_users > 0 else 0
        health_color = Colors.GREEN if healthy_users == total_users else Colors.YELLOW

        print(f"Total Test Users: {total_users}")
        print(f"Healthy Users: {health_color}{healthy_users}/{total_users}{Colors.RESET} ({health_percentage:.0f}%)")

        if healthy_users == total_users:
            print(f"\n{Colors.GREEN}{Colors.BOLD}✓ All test users are properly configured!{Colors.RESET}\n")
        else:
            print(f"\n{Colors.YELLOW}{Colors.BOLD}⚠ Some test users need repair.{Colors.RESET}")
            print(f"{Colors.YELLOW}Run 'python scripts/fix_test_user_workspaces.py' to fix them.{Colors.RESET}\n")

    except Exception as e:
        print(f"{Colors.RED}Error during diagnosis: {e}{Colors.RESET}")
        import traceback
        traceback.print_exc()

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(diagnose())
