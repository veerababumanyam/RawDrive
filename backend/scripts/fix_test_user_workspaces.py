"""Fix test user workspace setup by creating missing data."""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import asyncpg
from app.config.test_constants import TierUsers, AdminUsers, WorkspaceUsers


class Colors:
    RESET = '\033[0m'
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'


async def fix_test_users():
    database_url = os.getenv("DATABASE_URL", "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    try:
        conn = await asyncpg.connect(database_url)
    except Exception as e:
        print(f"{Colors.RED}Error connecting to database: {e}{Colors.RESET}")
        return

    try:
        print(f"\n{Colors.BOLD}{'='*80}{Colors.RESET}")
        print(f"{Colors.BOLD}REPAIRING TEST USER WORKSPACES{Colors.RESET}")
        print(f"{Colors.BOLD}{'='*80}{Colors.RESET}\n")

        plans = await conn.fetch("SELECT plan_id, code FROM plans ORDER BY code")
        plan_map = {p['code']: p['plan_id'] for p in plans}
        print(f"Available plans: {', '.join(sorted(plan_map.keys()))}\n")

        owner_role = await conn.fetchrow("SELECT role_id FROM roles WHERE name = 'owner' LIMIT 1")
        if not owner_role:
            print(f"{Colors.RED}Error: Default 'owner' role not found in database!{Colors.RESET}")
            return
        
        default_owner_role_id = owner_role['role_id']

        all_test_users = TierUsers.all() + AdminUsers.all() + WorkspaceUsers.all()
        now = datetime.now(timezone.utc)
        trial_end = now + timedelta(days=30)
        fixed_count = 0

        for test_user in all_test_users:
            print(f"{Colors.BLUE}Processing: {test_user.email}{Colors.RESET}")

            user_row = await conn.fetchrow("SELECT user_id FROM users WHERE user_id = $1", test_user.user_id)
            
            if not user_row:
                print(f"  {Colors.YELLOW}Warning: User not found, skipping{Colors.RESET}\n")
                continue

            async with conn.transaction():
                workspace_row = await conn.fetchrow("SELECT workspace_id FROM workspaces WHERE workspace_id = $1", test_user.workspace_id)
                
                if not workspace_row:
                    await conn.execute(
                        "INSERT INTO workspaces (workspace_id, name, slug, status, created_at, updated_at) VALUES ($1, $2, $3, 'active', $4, $4)",
                        test_user.workspace_id,
                        f"{test_user.display_name}'s Workspace",
                        test_user.email_prefix,
                        now
                    )
                    print(f"  {Colors.GREEN}Created workspace{Colors.RESET}")
                else:
                    print(f"  {Colors.GREEN}Workspace exists{Colors.RESET}")

                membership_row = await conn.fetchrow(
                    "SELECT membership_id, status FROM workspace_memberships WHERE user_id = $1 AND workspace_id = $2",
                    test_user.user_id,
                    test_user.workspace_id,
                )

                if not membership_row:
                    membership_id = uuid4()
                    await conn.execute(
                        "INSERT INTO workspace_memberships (membership_id, workspace_id, user_id, status, accepted_at, created_at) VALUES ($1, $2, $3, 'active', $4, $4)",
                        membership_id,
                        test_user.workspace_id,
                        test_user.user_id,
                        now,
                    )
                    print(f"  {Colors.GREEN}Created membership{Colors.RESET}")
                elif membership_row['status'] != 'active':
                    await conn.execute(
                        "UPDATE workspace_memberships SET status = 'active', accepted_at = $1 WHERE user_id = $2 AND workspace_id = $3",
                        now,
                        test_user.user_id,
                        test_user.workspace_id,
                    )
                    print(f"  {Colors.GREEN}Activated membership{Colors.RESET}")
                    membership_id = membership_row['membership_id']
                else:
                    print(f"  {Colors.GREEN}Membership active{Colors.RESET}")
                    membership_id = membership_row['membership_id']

                subscription_row = await conn.fetchrow("SELECT subscription_id FROM workspace_subscriptions WHERE workspace_id = $1", test_user.workspace_id)

                if not subscription_row:
                    plan_code = test_user.role
                    plan_id = plan_map.get(plan_code, plan_map.get('free'))
                    
                    await conn.execute(
                        "INSERT INTO workspace_subscriptions (subscription_id, workspace_id, plan_id, status, trial_started_at, trial_expires_at, created_at, updated_at) VALUES ($1, $2, $3, 'trialing', $4, $5, $4, $4)",
                        uuid4(),
                        test_user.workspace_id,
                        plan_id,
                        now,
                        trial_end,
                    )
                    print(f"  {Colors.GREEN}Created subscription (plan: {plan_code}){Colors.RESET}")
                else:
                    print(f"  {Colors.GREEN}Subscription exists{Colors.RESET}")

                role_row = await conn.fetchrow(
                    "SELECT member_role_id FROM member_roles WHERE membership_id = $1 AND role_id = $2",
                    membership_id,
                    default_owner_role_id,
                )

                if not role_row:
                    await conn.execute(
                        "INSERT INTO member_roles (member_role_id, membership_id, role_id, assigned_at) VALUES ($1, $2, $3, $4)",
                        uuid4(),
                        membership_id,
                        default_owner_role_id,
                        now,
                    )
                    print(f"  {Colors.GREEN}Assigned owner role{Colors.RESET}")
                else:
                    print(f"  {Colors.GREEN}Owner role assigned{Colors.RESET}")

            print(f"  {Colors.GREEN}{Colors.BOLD}FIXED{Colors.RESET}\n")
            fixed_count += 1

        print(f"{Colors.BOLD}{'='*80}{Colors.RESET}")
        print(f"{Colors.BOLD}SUMMARY{Colors.RESET}")
        print(f"{Colors.BOLD}{'='*80}{Colors.RESET}\n")
        print(f"Fixed: {Colors.GREEN}{fixed_count}/{len(all_test_users)}{Colors.RESET}")
        print(f"\n{Colors.GREEN}{Colors.BOLD}Repair completed!{Colors.RESET}\n")

    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.RESET}")
        import traceback
        traceback.print_exc()

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(fix_test_users())
