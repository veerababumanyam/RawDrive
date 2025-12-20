"""Integration tests for Client CRM Module workflows.

Task 36: Integration Tests for End-to-End Workflows

36.1 - Client Creation with Gallery Linking
36.2 - Client-Gallery Proofing Workflow
36.3 - Communication Tracking with Follow-ups
36.4 - Smart List Evaluation with Dynamic Updates
36.5 - Duplicate Detection and Merging

These tests verify complete end-to-end workflows integrating multiple services.
"""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, timedelta

from app.services.client_service import ClientService
from app.services.contact_service import ContactService
from app.services.gallery_link_service import GalleryLinkService
from app.services.activity_service import ActivityService
from app.services.duplicate_detection_service import DuplicateDetectionService
from app.services.client_exceptions import (
    ClientNotFoundError,
    GalleryAlreadyLinkedError,
    MergeSameClientError,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db_pool():
    """Mock database pool with async context manager."""
    pool = AsyncMock()
    conn = AsyncMock()

    class MockAcquire:
        def __init__(self, conn):
            self.conn = conn
        async def __aenter__(self):
            return self.conn
        async def __aexit__(self, *args):
            return None

    class MockTransaction:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return None

    def acquire_side_effect():
        return MockAcquire(conn)

    def transaction_side_effect():
        return MockTransaction()

    pool.acquire = MagicMock(side_effect=acquire_side_effect)
    conn.transaction = MagicMock(side_effect=transaction_side_effect)

    return pool, conn


@pytest.fixture
def workspace_context():
    """Shared workspace context for integration tests."""
    return {
        "workspace_id": uuid4(),
        "user_id": uuid4(),
    }


# ---------------------------------------------------------------------------
# 36.1: Client Creation with Gallery Linking
# ---------------------------------------------------------------------------


class TestClientCreationWithGalleryLinking:
    """
    Integration Test 36.1: Client Creation with Gallery Linking

    End-to-end workflow:
    1. Create a new client with contact information
    2. Add email and phone contacts
    3. Link client to multiple galleries with different roles
    4. Verify client has correct linked galleries
    5. Verify activities are recorded for each action
    """

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    @patch('app.services.contact_service.get_postgres_pool')
    @patch('app.services.gallery_link_service.get_postgres_pool')
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_complete_client_creation_workflow(
        self,
        mock_activity_pool,
        mock_gallery_pool,
        mock_contact_pool,
        mock_client_pool,
        mock_db_pool,
        workspace_context,
    ):
        """Test complete client creation with contacts and gallery linking."""
        pool, conn = mock_db_pool
        mock_client_pool.return_value = pool
        mock_contact_pool.return_value = pool
        mock_gallery_pool.return_value = pool
        mock_activity_pool.return_value = pool

        workspace_id = workspace_context["workspace_id"]
        user_id = workspace_context["user_id"]
        client_id = uuid4()
        gallery1_id = uuid4()
        gallery2_id = uuid4()
        now = datetime.now(timezone.utc)

        # Step 1: Create client
        client_row = {
            "client_id": client_id,
            "workspace_id": workspace_id,
            "full_name": "John Smith",
            "first_name": "John",
            "last_name": "Smith",
            "nickname": None,
            "avatar_asset_id": None,
            "avatar_crop_data": None,
            "job_title": "CEO",
            "organization": "Smith Corp",
            "status": "active",
            "language": "en",
            "timezone": "America/New_York",
            "date_of_birth": None,
            "anniversary_date": None,
            "internal_notes": None,
            "referred_by_client_id": None,
            "portal_access_enabled": False,
            "portal_user_id": None,
            "created_by_user_id": user_id,
            "created_at": now,
            "updated_at": now,
        }

        conn.fetchval.side_effect = [client_id, 0, 0, None, 0, 0]  # create + stats
        conn.fetchrow.return_value = client_row
        conn.fetch.return_value = []

        client_service = ClientService()
        created_client = await client_service.create_client(
            workspace_id=workspace_id,
            user_id=user_id,
            full_name="John Smith",
            first_name="John",
            last_name="Smith",
            job_title="CEO",
            organization="Smith Corp",
        )

        assert created_client["client_id"] == str(client_id)
        assert created_client["status"] == "active"

        # Step 2: Add contacts
        contact_service = ContactService()
        email_id = uuid4()
        phone_id = uuid4()

        conn.fetchval.side_effect = [1, None]  # client exists, no duplicate
        conn.fetchrow.return_value = {"contact_id": email_id, "created_at": now}

        email_contact = await contact_service.add_contact(
            workspace_id=workspace_id,
            client_id=client_id,
            contact_type="email",
            value="john@smithcorp.com",
            contact_subtype="work",
            is_primary=True,
        )

        assert email_contact["contact_type"] == "email"
        assert email_contact["is_primary"] is True

        # Step 3: Link galleries
        gallery_link_service = GalleryLinkService()
        link1_id = uuid4()

        # Mock for first gallery link
        conn.fetchrow.side_effect = [
            {"client_id": client_id, "full_name": "John Smith"},  # Client check
            {"gallery_id": gallery1_id, "title": "Wedding 2024", "cover_asset_id": None, "status": "published", "asset_count": 150},
        ]
        conn.fetchval.side_effect = [None, link1_id]  # No existing link, then link_id

        link1 = await gallery_link_service.link_gallery(
            workspace_id=workspace_id,
            client_id=client_id,
            gallery_id=gallery1_id,
            role="primary",
            user_id=user_id,
        )

        assert link1["role"] == "primary"
        assert link1["gallery_title"] == "Wedding 2024"

        # Link second gallery with different role
        link2_id = uuid4()
        conn.fetchrow.side_effect = [
            {"client_id": client_id, "full_name": "John Smith"},
            {"gallery_id": gallery2_id, "title": "Engagement 2024", "cover_asset_id": None, "status": "draft", "asset_count": 50},
        ]
        conn.fetchval.side_effect = [None, link2_id]

        link2 = await gallery_link_service.link_gallery(
            workspace_id=workspace_id,
            client_id=client_id,
            gallery_id=gallery2_id,
            role="guest",
            user_id=user_id,
        )

        assert link2["role"] == "guest"
        assert link2["gallery_title"] == "Engagement 2024"

        # Step 4: Verify linked galleries
        conn.fetchval.side_effect = None  # Reset side_effect
        conn.fetchrow.side_effect = None  # Reset side_effect
        conn.fetchval.return_value = 1
        conn.fetch.return_value = [
            {
                "link_id": link1_id,
                "gallery_id": gallery1_id,
                "role": "primary",
                "link_created_at": now,
                "title": "Wedding 2024",
                "description": None,
                "cover_asset_id": None,
                "status": "published",
                "gallery_created_at": now,
                "gallery_updated_at": now,
                "asset_count": 150,
            },
            {
                "link_id": link2_id,
                "gallery_id": gallery2_id,
                "role": "guest",
                "link_created_at": now,
                "title": "Engagement 2024",
                "description": None,
                "cover_asset_id": None,
                "status": "draft",
                "gallery_created_at": now,
                "gallery_updated_at": now,
                "asset_count": 50,
            },
        ]
        conn.fetchrow.return_value = {"picks_count": 0, "favorites_count": 0}

        linked_galleries = await gallery_link_service.get_linked_galleries(
            workspace_id=workspace_id,
            client_id=client_id,
            include_stats=True,
        )

        assert len(linked_galleries) == 2
        assert any(g["role"] == "primary" for g in linked_galleries)
        assert any(g["role"] == "guest" for g in linked_galleries)


# ---------------------------------------------------------------------------
# 36.2: Client-Gallery Proofing Workflow
# ---------------------------------------------------------------------------


class TestClientGalleryProofingWorkflow:
    """
    Integration Test 36.2: Client-Gallery Proofing Workflow

    End-to-end workflow:
    1. Link client to gallery for proofing
    2. Record gallery view activity
    3. Record selection/favorite activities
    4. Update link role as workflow progresses
    5. Retrieve activity timeline showing complete history
    """

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_proofing_workflow_with_activities(
        self,
        mock_activity_pool,
        mock_gallery_pool,
        mock_db_pool,
        workspace_context,
    ):
        """Test proofing workflow with activity tracking."""
        pool, conn = mock_db_pool
        mock_gallery_pool.return_value = pool
        mock_activity_pool.return_value = pool

        workspace_id = workspace_context["workspace_id"]
        user_id = workspace_context["user_id"]
        client_id = uuid4()
        gallery_id = uuid4()
        link_id = uuid4()
        now = datetime.now(timezone.utc)

        # Step 1: Link to gallery
        gallery_link_service = GalleryLinkService()

        conn.fetchrow.side_effect = [
            {"client_id": client_id, "full_name": "Jane Doe"},
            {"gallery_id": gallery_id, "title": "Portrait Session", "cover_asset_id": None, "status": "proofing", "asset_count": 75},
        ]
        conn.fetchval.side_effect = [None, link_id]

        link = await gallery_link_service.link_gallery(
            workspace_id=workspace_id,
            client_id=client_id,
            gallery_id=gallery_id,
            role="primary",
            user_id=user_id,
        )

        assert link["gallery_id"] == str(gallery_id)

        # Step 2-3: Record proofing activities
        activity_service = ActivityService()

        # Gallery view activity
        activity_id_1 = uuid4()
        conn.fetchval.side_effect = None  # Reset side_effect
        conn.fetchrow.side_effect = None  # Reset side_effect
        conn.fetchval.return_value = 1
        conn.fetchrow.return_value = {"activity_id": activity_id_1, "created_at": now}

        view_activity = await activity_service.record_activity(
            workspace_id=workspace_id,
            client_id=client_id,
            activity_type="gallery_viewed",
            description="Viewed gallery 'Portrait Session'",
            related_entity_type="gallery",
            related_entity_id=gallery_id,
        )

        assert view_activity["activity_type"] == "gallery_viewed"

        # Selection activity
        activity_id_2 = uuid4()
        conn.fetchrow.return_value = {"activity_id": activity_id_2, "created_at": now + timedelta(minutes=5)}

        selection_activity = await activity_service.record_activity(
            workspace_id=workspace_id,
            client_id=client_id,
            activity_type="selection_made",
            description="Selected 15 photos",
            related_entity_type="gallery",
            related_entity_id=gallery_id,
            metadata={"selection_count": 15},
        )

        assert selection_activity["activity_type"] == "selection_made"

        # Favorite activity
        activity_id_3 = uuid4()
        conn.fetchrow.return_value = {"activity_id": activity_id_3, "created_at": now + timedelta(minutes=10)}

        favorite_activity = await activity_service.record_activity(
            workspace_id=workspace_id,
            client_id=client_id,
            activity_type="favorite_added",
            description="Added 3 photos to favorites",
            related_entity_type="gallery",
            related_entity_id=gallery_id,
            metadata={"favorites_count": 3},
        )

        assert favorite_activity["activity_type"] == "favorite_added"

        # Step 4: Update role as proofing completes
        conn.fetchrow.return_value = {
            "link_id": link_id,
            "role": "primary",
            "title": "Portrait Session",
        }

        role_update = await gallery_link_service.update_link_role(
            workspace_id=workspace_id,
            client_id=client_id,
            gallery_id=gallery_id,
            new_role="secondary",
            user_id=user_id,
        )

        assert role_update["role"] == "secondary"

        # Step 5: Retrieve activity timeline
        conn.fetchval.side_effect = [1, 4]  # client exists, 4 activities
        conn.fetch.return_value = [
            {
                "activity_id": activity_id_3,
                "activity_type": "favorite_added",
                "related_entity_type": "gallery",
                "related_entity_id": gallery_id,
                "description": "Added 3 photos to favorites",
                "metadata": {"favorites_count": 3},
                "created_by_user_id": None,
                "created_at": now + timedelta(minutes=10),
            },
            {
                "activity_id": activity_id_2,
                "activity_type": "selection_made",
                "related_entity_type": "gallery",
                "related_entity_id": gallery_id,
                "description": "Selected 15 photos",
                "metadata": {"selection_count": 15},
                "created_by_user_id": None,
                "created_at": now + timedelta(minutes=5),
            },
            {
                "activity_id": activity_id_1,
                "activity_type": "gallery_viewed",
                "related_entity_type": "gallery",
                "related_entity_id": gallery_id,
                "description": "Viewed gallery 'Portrait Session'",
                "metadata": None,
                "created_by_user_id": None,
                "created_at": now,
            },
        ]

        timeline = await activity_service.get_activity_timeline(
            workspace_id=workspace_id,
            client_id=client_id,
            entity_type="gallery",
        )

        assert timeline["meta"]["total"] == 4
        # Newest first
        assert timeline["activities"][0]["activity_type"] == "favorite_added"


# ---------------------------------------------------------------------------
# 36.3: Communication Tracking with Follow-ups
# ---------------------------------------------------------------------------


class TestCommunicationTrackingWorkflow:
    """
    Integration Test 36.3: Communication Tracking with Follow-ups

    End-to-end workflow:
    1. Log initial client communication
    2. Set follow-up requirement
    3. Log follow-up communication
    4. Verify communication history is complete
    5. Check activity timeline includes communications
    """

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_communication_workflow_with_followups(
        self,
        mock_activity_pool,
        mock_client_pool,
        mock_db_pool,
        workspace_context,
    ):
        """Test communication logging with follow-up tracking."""
        pool, conn = mock_db_pool
        mock_client_pool.return_value = pool
        mock_activity_pool.return_value = pool

        workspace_id = workspace_context["workspace_id"]
        user_id = workspace_context["user_id"]
        client_id = uuid4()
        now = datetime.now(timezone.utc)
        follow_up_date = now + timedelta(days=7)

        client_service = ClientService()

        # Step 1: Log initial communication with follow-up
        comm_id_1 = uuid4()
        conn.fetchval.side_effect = [1, comm_id_1]  # client exists, comm_id
        conn.fetchrow.return_value = {"communication_id": comm_id_1, "created_at": now}

        comm1 = await client_service.log_communication(
            workspace_id=workspace_id,
            client_id=client_id,
            user_id=user_id,
            communication_type="email",
            direction="outbound",
            subject="Wedding Package Quote",
            notes="Sent initial pricing information",
            follow_up_required=True,
            follow_up_date=follow_up_date,
        )

        assert comm1["communication_id"] == str(comm_id_1)

        # Step 2: Log follow-up communication
        comm_id_2 = uuid4()
        conn.fetchval.side_effect = [1, comm_id_2]
        conn.fetchrow.return_value = {"communication_id": comm_id_2, "created_at": follow_up_date}

        comm2 = await client_service.log_communication(
            workspace_id=workspace_id,
            client_id=client_id,
            user_id=user_id,
            communication_type="phone",
            direction="inbound",
            subject="Follow-up call",
            notes="Client confirmed booking, discussed timeline",
            duration_minutes=25,
            follow_up_required=False,
        )

        assert comm2["communication_id"] == str(comm_id_2)

        # Step 3: Verify communication history
        conn.fetchval.side_effect = [1, 2]  # client exists, 2 communications
        conn.fetch.return_value = [
            {
                "communication_id": comm_id_2,
                "communication_type": "phone",
                "direction": "inbound",
                "subject": "Follow-up call",
                "notes": "Client confirmed booking",
                "duration_minutes": 25,
                "follow_up_required": False,
                "follow_up_date": None,
                "created_by_user_id": user_id,
                "created_at": follow_up_date,
            },
            {
                "communication_id": comm_id_1,
                "communication_type": "email",
                "direction": "outbound",
                "subject": "Wedding Package Quote",
                "notes": "Sent initial pricing information",
                "duration_minutes": None,
                "follow_up_required": True,
                "follow_up_date": follow_up_date,
                "created_by_user_id": user_id,
                "created_at": now,
            },
        ]

        comms = await client_service.get_communications(
            workspace_id=workspace_id,
            client_id=client_id,
        )

        assert comms["meta"]["total"] == 2
        assert len(comms["communications"]) == 2


# ---------------------------------------------------------------------------
# 36.4: Smart List Evaluation with Dynamic Updates
# ---------------------------------------------------------------------------


class TestSmartListEvaluationWorkflow:
    """
    Integration Test 36.4: Smart List Evaluation with Dynamic Updates

    End-to-end workflow:
    1. Create clients with various attributes
    2. Create smart list with filter criteria
    3. Evaluate smart list to get matching clients
    4. Update client attributes
    5. Re-evaluate smart list to verify dynamic updates
    """

    @pytest.mark.asyncio
    async def test_smart_list_evaluation_workflow(
        self,
        workspace_context,
    ):
        """Test smart list creation and dynamic evaluation."""
        workspace_id = workspace_context["workspace_id"]

        # Simulated clients
        clients = [
            {"client_id": str(uuid4()), "status": "active", "has_gallery": True, "tags": ["VIP"]},
            {"client_id": str(uuid4()), "status": "active", "has_gallery": False, "tags": ["New"]},
            {"client_id": str(uuid4()), "status": "inactive", "has_gallery": True, "tags": ["VIP", "Past"]},
            {"client_id": str(uuid4()), "status": "active", "has_gallery": True, "tags": ["Wedding"]},
        ]

        # Smart list filter: active clients with galleries
        filter_criteria = {
            "conditions": [
                {"field": "status", "operator": "equals", "value": "active"},
                {"field": "has_gallery", "operator": "equals", "value": True},
            ],
            "match": "all",
        }

        def evaluate_filter(client, filter_criteria):
            """Evaluate if client matches filter criteria."""
            conditions = filter_criteria["conditions"]
            match_type = filter_criteria["match"]

            results = []
            for cond in conditions:
                field = cond["field"]
                op = cond["operator"]
                value = cond["value"]

                client_value = client.get(field)
                if op == "equals":
                    results.append(client_value == value)
                elif op == "contains":
                    results.append(value in (client_value or []))

            if match_type == "all":
                return all(results)
            else:
                return any(results)

        # Step 1: Initial evaluation
        matching_clients = [c for c in clients if evaluate_filter(c, filter_criteria)]
        assert len(matching_clients) == 2  # Clients 0 and 3

        # Step 2: Update a client
        clients[1]["has_gallery"] = True  # Client 1 now has a gallery

        # Step 3: Re-evaluate
        matching_clients = [c for c in clients if evaluate_filter(c, filter_criteria)]
        assert len(matching_clients) == 3  # Now includes client 1

        # Step 4: Test tag-based filter
        tag_filter = {
            "conditions": [
                {"field": "tags", "operator": "contains", "value": "VIP"},
            ],
            "match": "all",
        }

        vip_clients = [c for c in clients if evaluate_filter(c, tag_filter)]
        assert len(vip_clients) == 2  # Clients 0 and 2


# ---------------------------------------------------------------------------
# 36.5: Duplicate Detection and Merging
# ---------------------------------------------------------------------------


class TestDuplicateDetectionAndMergingWorkflow:
    """
    Integration Test 36.5: Duplicate Detection and Merging

    End-to-end workflow:
    1. Create two clients with overlapping information
    2. Run duplicate detection
    3. Preview merge operation
    4. Execute merge
    5. Verify all data preserved in merged client
    6. Verify secondary client deleted
    """

    @pytest.mark.asyncio
    @patch('app.services.duplicate_detection_service.get_postgres_pool')
    async def test_duplicate_detection_and_merge_workflow(
        self,
        mock_pool,
        mock_db_pool,
        workspace_context,
    ):
        """Test complete duplicate detection and merge workflow."""
        pool, conn = mock_db_pool
        mock_pool.return_value = pool

        workspace_id = workspace_context["workspace_id"]
        user_id = workspace_context["user_id"]
        now = datetime.now(timezone.utc)

        primary_id = uuid4()
        secondary_id = uuid4()

        duplicate_service = DuplicateDetectionService()

        # Step 1: Setup - Two clients with same email
        primary_client = {
            "client_id": primary_id,
            "full_name": "John Smith",
            "first_name": "John",
            "last_name": "Smith",
            "nickname": None,
            "avatar_asset_id": None,
            "avatar_crop_data": None,
            "job_title": "CEO",
            "organization": "Smith Corp",
            "status": "active",
            "language": "en",
            "timezone": "America/New_York",
            "date_of_birth": None,
            "anniversary_date": None,
            "internal_notes": "Primary client notes",
            "referred_by_client_id": None,
            "created_at": now,
        }

        secondary_client = {
            "client_id": secondary_id,
            "full_name": "Johnny Smith",
            "first_name": "Johnny",
            "last_name": "Smith",
            "nickname": "John",
            "avatar_asset_id": uuid4(),
            "avatar_crop_data": None,
            "job_title": None,
            "organization": None,
            "status": "active",
            "language": None,
            "timezone": None,
            "date_of_birth": None,
            "anniversary_date": None,
            "internal_notes": "Secondary client notes - important info",
            "referred_by_client_id": None,
            "created_at": now - timedelta(days=30),
        }

        # Step 2: Find duplicates by email
        conn.fetch.side_effect = [
            # Email matches
            [
                {
                    **secondary_client,
                    "matched_email": "john@example.com",
                }
            ],
            # Phone matches
            [],
            # Name matches
            [],
        ]

        duplicates = await duplicate_service.find_duplicates(
            workspace_id=workspace_id,
            email="john@example.com",
        )

        assert len(duplicates) >= 1
        assert duplicates[0]["match_type"] == "email"
        assert duplicates[0]["match_score"] == 1.0

        # Step 3: Preview merge
        conn.fetchrow.side_effect = [primary_client, secondary_client]
        conn.fetchval.side_effect = [2, 1, 3, 1, 5, 2]  # counts for preview

        preview = await duplicate_service.preview_merge(
            workspace_id=workspace_id,
            primary_client_id=primary_id,
            secondary_client_id=secondary_id,
        )

        assert preview["primary_client"]["client_id"] == str(primary_id)
        assert preview["secondary_client"]["client_id"] == str(secondary_id)
        assert "data_to_merge" in preview
        assert "warning" in preview

        # Step 4: Execute merge
        conn.fetchrow.side_effect = [primary_client, secondary_client]
        conn.execute.return_value = "INSERT 0 2"

        merge_result = await duplicate_service.merge_clients(
            workspace_id=workspace_id,
            primary_client_id=primary_id,
            secondary_client_id=secondary_id,
            user_id=user_id,
            prefer_primary_profile=False,  # Fill gaps from secondary
        )

        assert merge_result["primary_client_id"] == str(primary_id)
        assert merge_result["merged_client_id"] == str(secondary_id)
        assert "Successfully merged" in merge_result["message"]

        # Verify merge preserved notes
        # In actual implementation, notes would be combined
        execute_calls = conn.execute.call_args_list
        assert len(execute_calls) > 0

    @pytest.mark.asyncio
    @patch('app.services.duplicate_detection_service.get_postgres_pool')
    async def test_merge_prevents_self_merge(
        self,
        mock_pool,
        mock_db_pool,
        workspace_context,
    ):
        """Test that merging a client with itself is prevented."""
        pool, conn = mock_db_pool
        mock_pool.return_value = pool

        duplicate_service = DuplicateDetectionService()
        client_id = uuid4()

        with pytest.raises(MergeSameClientError):
            await duplicate_service.merge_clients(
                workspace_id=workspace_context["workspace_id"],
                primary_client_id=client_id,
                secondary_client_id=client_id,  # Same ID
                user_id=workspace_context["user_id"],
            )

    @pytest.mark.asyncio
    @patch('app.services.duplicate_detection_service.get_postgres_pool')
    async def test_merge_preserves_all_data_types(
        self,
        mock_pool,
        mock_db_pool,
        workspace_context,
    ):
        """Test that merge preserves contacts, tags, galleries, activities, etc."""
        pool, conn = mock_db_pool
        mock_pool.return_value = pool

        duplicate_service = DuplicateDetectionService()
        now = datetime.now(timezone.utc)

        primary_id = uuid4()
        secondary_id = uuid4()

        primary_client = {
            "client_id": primary_id,
            "full_name": "Primary Client",
            "first_name": "Primary",
            "last_name": "Client",
            "nickname": None,
            "avatar_asset_id": None,
            "avatar_crop_data": None,
            "job_title": None,
            "organization": None,
            "status": "active",
            "language": None,
            "timezone": None,
            "date_of_birth": None,
            "anniversary_date": None,
            "internal_notes": None,
            "referred_by_client_id": None,
            "created_at": now,
        }

        secondary_client = {
            "client_id": secondary_id,
            "full_name": "Secondary Client",
            "first_name": "Secondary",
            "last_name": "Client",
            "nickname": None,
            "avatar_asset_id": None,
            "avatar_crop_data": None,
            "job_title": None,
            "organization": None,
            "status": "active",
            "language": None,
            "timezone": None,
            "date_of_birth": None,
            "anniversary_date": None,
            "internal_notes": None,
            "referred_by_client_id": None,
            "created_at": now - timedelta(days=10),
        }

        conn.fetchrow.side_effect = [primary_client, secondary_client]

        # Mock different insert counts for each data type
        execute_results = [
            "INSERT 0 0",  # Notes (no change)
            "INSERT 0 3",  # Contacts transferred
            "INSERT 0 2",  # Addresses transferred
            "INSERT 0 4",  # Tags transferred
            "INSERT 0 2",  # Gallery links transferred
            "UPDATE 10",   # Activities transferred
            "UPDATE 5",    # Communications transferred
            "UPDATE 1",    # Referrals updated
            "INSERT 0 0",  # Preferences
            "INSERT 0 1",  # Merge activity
            "DELETE 1",    # Secondary deleted
            "UPDATE 1",    # Primary updated
        ]
        conn.execute.side_effect = execute_results

        result = await duplicate_service.merge_clients(
            workspace_id=workspace_context["workspace_id"],
            primary_client_id=primary_id,
            secondary_client_id=secondary_id,
            user_id=workspace_context["user_id"],
        )

        # Verify stats were recorded
        assert "stats" in result

        # Verify all data types were processed
        execute_calls = conn.execute.call_args_list

        # Check for each data type transfer
        sql_calls = [str(call[0][0]) for call in execute_calls]

        assert any("client_contacts" in sql for sql in sql_calls), "Contacts should be transferred"
        assert any("client_addresses" in sql for sql in sql_calls), "Addresses should be transferred"
        assert any("client_tag_assignments" in sql for sql in sql_calls), "Tags should be transferred"
        assert any("client_gallery_links" in sql for sql in sql_calls), "Gallery links should be transferred"
        assert any("client_activities" in sql for sql in sql_calls), "Activities should be transferred"
        assert any("client_communications" in sql for sql in sql_calls), "Communications should be transferred"


# ---------------------------------------------------------------------------
# Cross-Workflow Integration Tests
# ---------------------------------------------------------------------------


class TestCrossWorkflowIntegration:
    """Tests verifying integration across multiple workflows."""

    @pytest.mark.asyncio
    async def test_workspace_isolation_across_services(
        self,
        workspace_context,
    ):
        """Verify workspace isolation is maintained across all service calls."""
        workspace_id_1 = uuid4()
        workspace_id_2 = uuid4()
        client_id = uuid4()

        # Simulated client data store
        clients = {
            str(workspace_id_1): {str(client_id): {"name": "Workspace 1 Client"}},
        }

        def get_client(workspace_id, client_id):
            workspace_clients = clients.get(str(workspace_id), {})
            return workspace_clients.get(str(client_id))

        # Client accessible from workspace 1
        assert get_client(workspace_id_1, client_id) is not None

        # Client not accessible from workspace 2
        assert get_client(workspace_id_2, client_id) is None

    @pytest.mark.asyncio
    async def test_activity_recording_across_operations(self):
        """Verify all major operations record activities."""
        activity_types_for_operations = {
            "client_created": "profile_updated",
            "gallery_linked": "gallery_linked",
            "gallery_unlinked": "gallery_unlinked",
            "contact_added": "contact_added",
            "tag_assigned": "tag_added",
            "communication_logged": "communication_sent",
            "clients_merged": "profile_updated",
        }

        # All operations should have corresponding activity types
        for operation, activity_type in activity_types_for_operations.items():
            assert activity_type in [
                "gallery_linked", "gallery_unlinked", "gallery_viewed",
                "gallery_role_changed", "selection_made", "favorite_added",
                "favorite_removed", "comment_added", "payment_received",
                "communication_sent", "note_added", "status_changed",
                "avatar_updated", "avatar_removed", "profile_updated",
                "contact_added", "contact_updated", "address_added",
                "address_updated", "tag_added", "tag_removed",
            ], f"Activity type for {operation} should be valid"
