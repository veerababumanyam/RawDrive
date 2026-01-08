"""
Test script for AuditService to verify audit logging functionality.

This script tests:
1. Creating audit log entries with before/after states
2. Querying entity history
3. Querying user activity
4. Querying workspace activity

Run with: python -m pytest services/client-service/tests/test_audit_service.py -v
"""

import asyncio
import sys
import uuid
from pathlib import Path
from datetime import datetime

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from services.audit_service import get_audit_service


async def test_audit_logging():
    """Test basic audit logging functionality."""
    audit_service = get_audit_service()

    # Generate test IDs
    workspace_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    client_id = str(uuid.uuid4())

    print("\n=== Testing Audit Service ===\n")

    # Test 1: Create audit log entry
    print("Test 1: Creating audit log entry...")
    try:
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

        audit_entry = await audit_service.log_change(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_type="client",
            entity_id=client_id,
            action="update",
            before=before_state,
            after=after_state,
            ip_address="192.168.1.1",
            user_agent="Mozilla/5.0 (Test Browser)",
        )

        print(f"✅ Audit entry created: {audit_entry['audit_id']}")
        print(f"   - Action: {audit_entry['action']}")
        print(f"   - Target: {audit_entry['target_type']} ({audit_entry['target_id']})")
        print(f"   - Metadata: {audit_entry['metadata']}")

    except Exception as e:
        print(f"❌ Failed to create audit entry: {e}")
        return False

    # Test 2: Query entity history
    print("\nTest 2: Querying entity history...")
    try:
        history = await audit_service.get_entity_history(
            workspace_id=workspace_id,
            entity_type="client",
            entity_id=client_id,
            limit=10
        )

        print(f"✅ Found {len(history)} audit entries for client {client_id}")
        if history:
            print(f"   - Most recent action: {history[0]['action']}")
            print(f"   - Timestamp: {history[0]['created_at']}")

    except Exception as e:
        print(f"❌ Failed to query entity history: {e}")
        return False

    # Test 3: Query user activity
    print("\nTest 3: Querying user activity...")
    try:
        activity = await audit_service.get_user_activity(
            workspace_id=workspace_id,
            user_id=user_id,
            limit=10
        )

        print(f"✅ Found {len(activity)} activities for user {user_id}")
        if activity:
            print(f"   - Most recent action: {activity[0]['action']} on {activity[0]['entity_type']}")

    except Exception as e:
        print(f"❌ Failed to query user activity: {e}")
        return False

    # Test 4: Query workspace activity
    print("\nTest 4: Querying workspace activity...")
    try:
        workspace_activity = await audit_service.get_workspace_activity(
            workspace_id=workspace_id,
            action="update",
            limit=10
        )

        print(f"✅ Found {len(workspace_activity)} 'update' activities in workspace")

    except Exception as e:
        print(f"❌ Failed to query workspace activity: {e}")
        return False

    # Test 5: Count workspace activity
    print("\nTest 5: Counting workspace activity...")
    try:
        count = await audit_service.count_workspace_activity(
            workspace_id=workspace_id
        )

        print(f"✅ Total audit logs in workspace: {count}")

    except Exception as e:
        print(f"❌ Failed to count workspace activity: {e}")
        return False

    print("\n=== All Tests Passed! ===\n")
    return True


async def test_create_delete_audit():
    """Test audit logging for create and delete actions."""
    audit_service = get_audit_service()

    workspace_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    client_id = str(uuid.uuid4())

    print("\n=== Testing Create/Delete Audit Logs ===\n")

    # Test create action (no before state)
    print("Test: Creating 'create' audit log...")
    try:
        create_entry = await audit_service.log_change(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_type="client",
            entity_id=client_id,
            action="create",
            before=None,  # No before state for creates
            after={"full_name": "Jane Doe", "email": "jane@example.com"},
            ip_address="10.0.0.1",
        )

        print(f"✅ Create audit log: {create_entry['audit_id']}")
        print(f"   - Before: {create_entry['metadata'].get('before', 'None')}")
        print(f"   - After: {create_entry['metadata']['after']}")

    except Exception as e:
        print(f"❌ Failed: {e}")
        return False

    # Test delete action (no after state)
    print("\nTest: Creating 'delete' audit log...")
    try:
        delete_entry = await audit_service.log_change(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_type="client",
            entity_id=client_id,
            action="delete",
            before={"full_name": "Jane Doe", "email": "jane@example.com"},
            after=None,  # No after state for deletes
        )

        print(f"✅ Delete audit log: {delete_entry['audit_id']}")
        print(f"   - Before: {delete_entry['metadata']['before']}")
        print(f"   - After: {delete_entry['metadata'].get('after', 'None')}")

    except Exception as e:
        print(f"❌ Failed: {e}")
        return False

    print("\n=== Create/Delete Tests Passed! ===\n")
    return True


async def main():
    """Run all audit service tests."""
    print("\n" + "="*60)
    print("AUDIT SERVICE VERIFICATION TESTS")
    print("="*60)

    # Run basic tests
    success1 = await test_audit_logging()

    # Run create/delete tests
    success2 = await test_create_delete_audit()

    if success1 and success2:
        print("\n" + "="*60)
        print("✅ ALL AUDIT SERVICE TESTS PASSED")
        print("="*60 + "\n")
    else:
        print("\n" + "="*60)
        print("❌ SOME TESTS FAILED")
        print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
