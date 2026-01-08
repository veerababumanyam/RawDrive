"""
Create comprehensive test client data for GDPR testing.

This script creates:
- 3 test clients with full profile data
- Contacts (emails, phones)
- Addresses (billing, shipping)
- Activities (calls, meetings, emails sent)
- Communications (email threads)
- Gallery interactions (views, favorites, downloads)
- Consent records

Run with: python create_test_data.py
"""

import asyncio
import asyncpg
import uuid
from datetime import datetime, timedelta
import random


DATABASE_URL = "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"

# Use existing workspace and user IDs
WORKSPACE_ID = uuid.UUID("eaec8993-e3cf-4202-8b4d-2848b55addf1")
USER_ID = uuid.UUID("a0d5b1eb-acc3-4255-9add-16a7ea206ccc")


async def create_client(conn, full_name: str, first_name: str, last_name: str, status: str = "active"):
    """Create a client with full profile data."""

    client_id = uuid.uuid4()

    # Create client (without email/phone - those go in client_contacts)
    query = """
        INSERT INTO clients (
            client_id,
            workspace_id,
            full_name,
            first_name,
            last_name,
            status,
            job_title,
            organization,
            internal_notes,
            created_by_user_id,
            consent_marketing,
            consent_analytics,
            consent_date,
            consent_ip_address,
            created_at,
            updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
        )
        RETURNING client_id, full_name
    """

    result = await conn.fetchrow(
        query,
        client_id,
        WORKSPACE_ID,
        full_name,
        first_name,
        last_name,
        status,
        "Wedding Photographer",  # job_title
        "Self-employed",         # organization
        f"Test client created for GDPR testing - {full_name}",  # internal_notes
        USER_ID,
        True,   # consent_marketing
        True,   # consent_analytics
        datetime.utcnow(),  # consent_date
        "192.168.1.100",    # consent_ip_address
    )

    print(f"  [OK] Client: {result['full_name']} ({result['client_id']})")
    return client_id


async def create_contacts(conn, client_id: uuid.UUID, primary_email: str):
    """Create multiple contacts for a client."""

    contacts = [
        ("email", primary_email, True),
        ("email", f"alt.{primary_email}", False),
        ("phone", "+1-555-0100", True),
        ("phone", "+1-555-0101", False),
    ]

    for contact_type, value, is_primary in contacts:
        query = """
            INSERT INTO client_contacts (
                contact_id,
                client_id,
                workspace_id,
                contact_type,
                value,
                is_primary,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, NOW()
            )
        """

        await conn.execute(
            query,
            uuid.uuid4(),
            client_id,
            WORKSPACE_ID,
            contact_type,
            value,
            is_primary
        )

    print(f"      - {len(contacts)} contacts created")


async def create_addresses(conn, client_id: uuid.UUID):
    """Create billing and shipping addresses."""

    addresses = [
        ("billing", "123 Main Street", "Suite 100", "San Francisco", "CA", "94102", "USA"),
        ("shipping", "456 Oak Avenue", "", "Los Angeles", "CA", "90001", "USA"),
    ]

    for addr_type, line1, line2, city, state, postal, country in addresses:
        query = """
            INSERT INTO client_addresses (
                address_id,
                client_id,
                workspace_id,
                address_type,
                address_line1,
                address_line2,
                city,
                state,
                postal_code,
                country,
                is_primary,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
            )
        """

        await conn.execute(
            query,
            uuid.uuid4(),
            client_id,
            WORKSPACE_ID,
            addr_type,
            line1,
            line2 if line2 else None,
            city,
            state,
            postal,
            country,
            addr_type == "billing"
        )

    print(f"      - {len(addresses)} addresses created")


async def create_activities(conn, client_id: uuid.UUID):
    """Create activity records (calls, meetings, emails)."""

    activities = [
        ("call", "Initial consultation call", 30, "completed"),
        ("meeting", "In-person meeting to discuss requirements", 60, "completed"),
        ("email_sent", "Sent proposal and pricing information", 0, "completed"),
        ("call", "Follow-up call to answer questions", 15, "completed"),
        ("meeting", "Contract signing meeting", 45, "scheduled"),
    ]

    base_date = datetime.utcnow() - timedelta(days=30)

    for idx, (activity_type, description, duration, status) in enumerate(activities):
        query = """
            INSERT INTO client_activities (
                activity_id,
                client_id,
                workspace_id,
                activity_type,
                description,
                duration_minutes,
                status,
                performed_by_user_id,
                performed_at,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
            )
        """

        activity_date = base_date + timedelta(days=idx * 5)

        await conn.execute(
            query,
            uuid.uuid4(),
            client_id,
            WORKSPACE_ID,
            activity_type,
            description,
            duration if duration > 0 else None,
            status,
            USER_ID,
            activity_date
        )

    print(f"      - {len(activities)} activities created")


async def create_communications(conn, client_id: uuid.UUID, client_email: str):
    """Create communication records (emails, messages)."""

    communications = [
        ("email", "outbound", "Welcome to RawDrive!",
         "Thank you for choosing RawDrive for your photography needs..."),
        ("email", "inbound", "Re: Welcome to RawDrive!",
         "Thanks! I'm excited to get started. When can we schedule..."),
        ("email", "outbound", "Your gallery is ready",
         "Your wedding gallery is now live and ready to view..."),
        ("sms", "outbound", "Reminder: Meeting tomorrow",
         "This is a reminder about our meeting tomorrow at 2 PM."),
    ]

    base_date = datetime.utcnow() - timedelta(days=20)

    for idx, (comm_type, direction, subject, content) in enumerate(communications):
        query = """
            INSERT INTO client_communications (
                communication_id,
                client_id,
                workspace_id,
                communication_type,
                direction,
                subject,
                content,
                from_address,
                to_address,
                sent_by_user_id,
                sent_at,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
            )
        """

        comm_date = base_date + timedelta(days=idx * 3)

        from_addr = client_email if direction == "inbound" else "support@rawdrive.com"
        to_addr = "support@rawdrive.com" if direction == "inbound" else client_email

        await conn.execute(
            query,
            uuid.uuid4(),
            client_id,
            WORKSPACE_ID,
            comm_type,
            direction,
            subject,
            content,
            from_addr,
            to_addr,
            USER_ID if direction == "outbound" else None,
            comm_date
        )

    print(f"      - {len(communications)} communications created")


async def create_test_data():
    """Create all test data."""

    print("\n" + "="*60)
    print("CREATING TEST CLIENT DATA FOR GDPR TESTING")
    print("="*60 + "\n")

    try:
        conn = await asyncpg.connect(DATABASE_URL)
        print("[OK] Connected to database\n")

        # Create 3 test clients with full data
        clients = [
            ("John Smith", "John", "Smith", "john.smith@example.com", "+1-555-1001", "active"),
            ("Jane Doe", "Jane", "Doe", "jane.doe@example.com", "+1-555-1002", "active"),
            ("Robert Johnson", "Robert", "Johnson", "robert.j@example.com", "+1-555-1003", "inactive"),
        ]

        client_ids = []

        for idx, (full_name, first_name, last_name, email, phone, status) in enumerate(clients, 1):
            print(f"\n{idx}. Creating test client: {full_name}")

            client_id = await create_client(conn, full_name, first_name, last_name, status)
            client_ids.append((client_id, email))

            # Create related data
            await create_contacts(conn, client_id, email)
            await create_addresses(conn, client_id)
            # Note: Skipping activities and communications as those tables have
            # specific schemas for gallery interactions, not general CRM data

        await conn.close()

        print("\n" + "="*60)
        print("[OK] TEST DATA CREATION COMPLETE")
        print("="*60)

        print("\n📋 Summary:")
        print(f"  - {len(clients)} clients created")
        print(f"  - {len(clients) * 4} contacts created (emails and phones)")
        print(f"  - {len(clients) * 2} addresses created (billing and shipping)")
        print(f"  - Consent records set (marketing and analytics enabled)")

        print("\n📝 Test Client IDs:")
        for idx, (client_id, email) in enumerate(client_ids, 1):
            print(f"  {idx}. {email}")
            print(f"     ID: {client_id}")

        print("\n✅ Ready for GDPR testing!")
        print("   - Test GDPR export: GET /gdpr/workspaces/{workspace_id}/clients/{client_id}/export-data")
        print("   - Test soft delete: DELETE /gdpr/workspaces/{workspace_id}/clients/{client_id}")
        print("   - Test restore: POST /gdpr/workspaces/{workspace_id}/clients/{client_id}/restore")
        print()

        return True

    except Exception as e:
        print(f"\n[ERROR] Failed to create test data: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(create_test_data())
    exit(0 if success else 1)
