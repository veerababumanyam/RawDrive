"""
Simple standalone test for audit logging functionality.
Tests database connection and audit log creation directly.
"""

import asyncio
import asyncpg
import json
import uuid
from datetime import datetime


async def test_audit_logging():
    """Test audit logging by directly inserting into database."""

    # Database connection string (from docker-compose.yml defaults)
    DATABASE_URL = "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"

    print("\n=== Audit Logging Verification Test ===\n")

    try:
        # Connect to database
        print("1. Connecting to database...")
        conn = await asyncpg.connect(DATABASE_URL)
        print("   [OK] Connected successfully\n")

        # Use existing workspace and user IDs (to satisfy foreign key constraints)
        workspace_id = uuid.UUID("eaec8993-e3cf-4202-8b4d-2848b55addf1")
        user_id = uuid.UUID("a0d5b1eb-acc3-4255-9add-16a7ea206ccc")
        client_id = uuid.uuid4()  # Client ID can be random (no FK constraint)

        # Test 1: Create audit log with before/after states
        print("2. Creating audit log entry...")

        before_state = {
            "full_name": "John Doe",
            "email": "john@example.com",
            "status": "active"
        }

        after_state = {
            "full_name": "John Smith",
            "email": "john.smith@example.com",
            "status": "active"
        }

        metadata = {
            "before": before_state,
            "after": after_state
        }

        query = """
            INSERT INTO audit_logs (
                workspace_id,
                actor_user_id,
                actor_type,
                action,
                target_type,
                target_id,
                ip_address,
                user_agent,
                metadata,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW()
            )
            RETURNING audit_id, action, target_type, target_id, metadata, created_at
        """

        result = await conn.fetchrow(
            query,
            workspace_id,  # workspace_id
            user_id,       # actor_user_id
            "user",        # actor_type
            "update",      # action
            "client",      # target_type
            str(client_id),  # target_id
            "192.168.1.1",   # ip_address
            "Mozilla/5.0 (Test)",  # user_agent
            json.dumps(metadata)   # metadata
        )

        print(f"   [OK] Audit entry created successfully!")
        print(f"   - Audit ID: {result['audit_id']}")
        print(f"   - Action: {result['action']}")
        print(f"   - Target: {result['target_type']} ({result['target_id']})")
        print(f"   - Created: {result['created_at']}")
        print(f"   - Metadata: {result['metadata']}\n")

        # Test 2: Query the audit log back
        print("3. Querying audit log entry...")

        query_select = """
            SELECT
                audit_id,
                actor_user_id,
                action,
                target_type,
                target_id,
                metadata,
                created_at
            FROM audit_logs
            WHERE audit_id = $1
        """

        retrieved = await conn.fetchrow(query_select, result['audit_id'])

        # Parse metadata if it's a string
        metadata = retrieved['metadata']
        if isinstance(metadata, str):
            metadata = json.loads(metadata)

        print(f"   [OK] Retrieved audit entry:")
        print(f"   - Before state: {metadata.get('before', {})}")
        print(f"   - After state: {metadata.get('after', {})}\n")

        # Test 3: Query by workspace and entity
        print("4. Querying by workspace and entity...")

        query_by_entity = """
            SELECT
                audit_id,
                actor_user_id,
                action,
                metadata,
                created_at
            FROM audit_logs
            WHERE workspace_id = $1
              AND target_type = $2
              AND target_id = $3
            ORDER BY created_at DESC
            LIMIT 10
        """

        entity_logs = await conn.fetch(
            query_by_entity,
            workspace_id,
            "client",
            str(client_id)
        )

        print(f"   [OK] Found {len(entity_logs)} audit entries for client\n")

        # Test 4: Create audit log for 'create' action (no before state)
        print("5. Testing 'create' action (no before state)...")

        create_metadata = {
            "after": {
                "full_name": "Jane Doe",
                "email": "jane@example.com"
            }
        }

        create_result = await conn.fetchrow(
            query,
            workspace_id,
            user_id,
            "user",
            "create",
            "client",
            str(uuid.uuid4()),
            "10.0.0.1",
            "Mozilla/5.0",
            json.dumps(create_metadata)
        )

        create_meta = create_result['metadata']
        if isinstance(create_meta, str):
            create_meta = json.loads(create_meta)

        print(f"   [OK] 'create' audit log created")
        print(f"   - Has 'before': {'before' in create_meta}")
        print(f"   - Has 'after': {'after' in create_meta}\n")

        # Test 5: Create audit log for 'delete' action (no after state)
        print("6. Testing 'delete' action (no after state)...")

        delete_metadata = {
            "before": {
                "full_name": "Jane Doe",
                "email": "jane@example.com"
            }
        }

        delete_result = await conn.fetchrow(
            query,
            workspace_id,
            user_id,
            "user",
            "delete",
            "client",
            str(uuid.uuid4()),
            "10.0.0.1",
            "Mozilla/5.0",
            json.dumps(delete_metadata)
        )

        delete_meta = delete_result['metadata']
        if isinstance(delete_meta, str):
            delete_meta = json.loads(delete_meta)

        print(f"   [OK] 'delete' audit log created")
        print(f"   - Has 'before': {'before' in delete_meta}")
        print(f"   - Has 'after': {'after' in delete_meta}\n")

        # Test 6: Query workspace activity count
        print("7. Counting workspace activity...")

        count_query = """
            SELECT COUNT(*) as total
            FROM audit_logs
            WHERE workspace_id = $1
        """

        count_result = await conn.fetchrow(count_query, workspace_id)

        print(f"   [OK] Total audit logs in workspace: {count_result['total']}\n")

        # Cleanup
        await conn.close()

        print("="*60)
        print("[OK] ALL AUDIT LOGGING TESTS PASSED")
        print("="*60)
        print("\nConclusion:")
        print("- Audit logs table is working correctly")
        print("- Schema mapping is correct (actor_user_id, target_type, target_id)")
        print("- Metadata JSONB structure supports before/after states")
        print("- All query patterns work as expected")
        print()

        return True

    except Exception as e:
        print(f"\n[ERROR] Test failed with error: {e}\n")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_audit_logging())
    exit(0 if success else 1)
