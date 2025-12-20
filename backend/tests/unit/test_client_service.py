"""Unit tests for ClientService.

Task 34.1: ClientService Unit Tests
Tests CRUD operations, validation, error handling, and workspace isolation.
"""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, date

from app.services.client_service import (
    ClientService,
    _compute_initials,
    _compute_age,
    _format_client_row,
)
from app.services.client_exceptions import (
    ClientNotFoundError,
    ClientValidationError,
    ClientActiveProofingError,
    ContactNotFoundError,
    ContactDuplicateError,
    ContactInvalidFormatError,
    GalleryAlreadyLinkedError,
    GalleryLinkNotFoundError,
    GalleryNotFoundForLinkError,
    TagNotFoundError,
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
def sample_client_row():
    """Sample client database row for testing."""
    workspace_id = uuid4()
    client_id = uuid4()
    user_id = uuid4()
    now = datetime.now(timezone.utc)

    return {
        "client_id": client_id,
        "workspace_id": workspace_id,
        "full_name": "John Smith",
        "first_name": "John",
        "last_name": "Smith",
        "nickname": "Johnny",
        "avatar_asset_id": None,
        "avatar_crop_data": None,
        "job_title": "Photographer",
        "organization": "Smith Studios",
        "status": "active",
        "language": "en",
        "timezone": "America/New_York",
        "date_of_birth": date(1990, 5, 15),
        "anniversary_date": None,
        "internal_notes": "VIP client",
        "referred_by_client_id": None,
        "portal_access_enabled": False,
        "portal_user_id": None,
        "created_by_user_id": user_id,
        "created_at": now,
        "updated_at": now,
    }


# ---------------------------------------------------------------------------
# Helper Function Tests
# ---------------------------------------------------------------------------


class TestComputeInitials:
    """Tests for _compute_initials helper function."""

    def test_first_and_last_name(self):
        """Computes initials from first and last name."""
        assert _compute_initials("John", "Smith") == "JS"

    def test_first_name_only(self):
        """Computes single initial when only first name provided."""
        assert _compute_initials("John", None) == "J"

    def test_empty_first_name(self):
        """Returns empty string for empty first name."""
        assert _compute_initials("", "Smith") == "S"

    def test_lowercase_names(self):
        """Converts lowercase names to uppercase initials."""
        assert _compute_initials("john", "smith") == "JS"


class TestComputeAge:
    """Tests for _compute_age helper function."""

    def test_returns_none_for_none(self):
        """Returns None when date_of_birth is None."""
        assert _compute_age(None) is None

    def test_calculates_age(self):
        """Calculates correct age from date of birth."""
        # Birthday before today
        dob = date(1990, 1, 1)
        age = _compute_age(dob)
        expected_age = date.today().year - 1990
        if (date.today().month, date.today().day) < (1, 1):
            expected_age -= 1
        assert age == expected_age

    def test_birthday_not_yet_occurred(self):
        """Adjusts age when birthday hasn't occurred this year."""
        # Birthday in December
        dob = date(1990, 12, 31)
        age = _compute_age(dob)
        expected_age = date.today().year - 1990
        if (date.today().month, date.today().day) < (12, 31):
            expected_age -= 1
        assert age == expected_age


class TestFormatClientRow:
    """Tests for _format_client_row helper function."""

    def test_formats_basic_fields(self, sample_client_row):
        """Formats basic client fields correctly."""
        result = _format_client_row(sample_client_row)

        assert result["client_id"] == str(sample_client_row["client_id"])
        assert result["workspace_id"] == str(sample_client_row["workspace_id"])
        assert result["full_name"] == "John Smith"
        assert result["first_name"] == "John"
        assert result["last_name"] == "Smith"
        assert result["status"] == "active"

    def test_computes_initials(self, sample_client_row):
        """Includes computed initials."""
        result = _format_client_row(sample_client_row)
        assert result["initials"] == "JS"

    def test_computes_age(self, sample_client_row):
        """Includes computed age when date_of_birth present."""
        result = _format_client_row(sample_client_row)
        assert result["age"] is not None
        assert isinstance(result["age"], int)

    def test_includes_stats_when_provided(self, sample_client_row):
        """Merges stats into result when provided."""
        stats = {"linked_galleries_count": 5, "referrals_count": 2}
        result = _format_client_row(sample_client_row, stats)

        assert result["linked_galleries_count"] == 5
        assert result["referrals_count"] == 2


# ---------------------------------------------------------------------------
# ClientService.create_client Tests
# ---------------------------------------------------------------------------


class TestCreateClient:
    """Tests for ClientService.create_client."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_creates_client_successfully(self, mock_get_pool, mock_db_pool):
        """Successfully creates a client with required fields."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id = uuid4()
        user_id = uuid4()
        client_id = uuid4()
        now = datetime.now(timezone.utc)

        # Mock INSERT returning client_id
        conn.fetchval.side_effect = [client_id]

        # Mock get_client after creation
        conn.fetchrow.side_effect = [
            {
                "client_id": client_id,
                "workspace_id": workspace_id,
                "full_name": "John Smith",
                "first_name": "John",
                "last_name": "Smith",
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
                "portal_access_enabled": False,
                "portal_user_id": None,
                "created_by_user_id": user_id,
                "created_at": now,
                "updated_at": now,
            },
        ]

        # Mock stats: galleries_count, referrals_count, last_contact_date, activities_count, communications_count
        conn.fetchval.side_effect = [client_id, 0, 0, None, 0, 0]
        conn.fetch.return_value = []  # contacts, addresses, tags, galleries

        result = await service.create_client(
            workspace_id=workspace_id,
            user_id=user_id,
            full_name="John Smith",
            first_name="John",
            last_name="Smith",
        )

        assert result["client_id"] == str(client_id)
        assert result["workspace_id"] == str(workspace_id)
        assert result["full_name"] == "John Smith"
        assert result["status"] == "active"

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_validates_full_name_required(self, mock_get_pool, mock_db_pool):
        """Raises ClientValidationError when full_name is empty."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        with pytest.raises(ClientValidationError) as exc_info:
            await service.create_client(
                workspace_id=uuid4(),
                user_id=uuid4(),
                full_name="",
                first_name="John",
            )

        assert "Full name is required" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_validates_first_name_required(self, mock_get_pool, mock_db_pool):
        """Raises ClientValidationError when first_name is empty."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        with pytest.raises(ClientValidationError) as exc_info:
            await service.create_client(
                workspace_id=uuid4(),
                user_id=uuid4(),
                full_name="John Smith",
                first_name="",
            )

        assert "First name is required" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_validates_referrer_exists(self, mock_get_pool, mock_db_pool):
        """Validates referred_by_client_id exists in workspace."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        referrer_id = uuid4()

        # Mock referrer not found
        conn.fetchval.return_value = None

        with pytest.raises(ClientValidationError) as exc_info:
            await service.create_client(
                workspace_id=uuid4(),
                user_id=uuid4(),
                full_name="John Smith",
                first_name="John",
                referred_by_client_id=referrer_id,
            )

        assert "Referring client not found" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_workspace_scoping_in_insert(self, mock_get_pool, mock_db_pool):
        """Ensures workspace_id is included in INSERT query."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id = uuid4()
        user_id = uuid4()
        client_id = uuid4()
        now = datetime.now(timezone.utc)

        # Mock: insert returns client_id, then stats fetchvals (galleries=0, referrals=0, last_contact=None, activities=0, communications=0)
        conn.fetchval.side_effect = [client_id, 0, 0, None, 0, 0]
        conn.fetchrow.return_value = {
            "client_id": client_id,
            "workspace_id": workspace_id,
            "full_name": "John Smith",
            "first_name": "John",
            "last_name": None,
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
            "portal_access_enabled": False,
            "portal_user_id": None,
            "created_by_user_id": user_id,
            "created_at": now,
            "updated_at": now,
        }
        conn.fetch.return_value = []

        await service.create_client(
            workspace_id=workspace_id,
            user_id=user_id,
            full_name="John Smith",
            first_name="John",
        )

        # Verify INSERT was called with workspace_id as first parameter
        insert_call = conn.fetchval.call_args_list[0]
        sql = insert_call[0][0]
        params = insert_call[0][1:]

        assert "workspace_id" in sql
        assert params[0] == workspace_id


# ---------------------------------------------------------------------------
# ClientService.get_client Tests
# ---------------------------------------------------------------------------


class TestGetClient:
    """Tests for ClientService.get_client."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_returns_client_with_all_includes(self, mock_get_pool, mock_db_pool, sample_client_row):
        """Returns client with contacts, addresses, tags, and galleries."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id = sample_client_row["workspace_id"]
        client_id = sample_client_row["client_id"]

        # Mock client fetch
        conn.fetchrow.return_value = sample_client_row

        # Mock stats queries
        conn.fetchval.side_effect = [5, 2, None, 3, 10]  # galleries, referrals, last_contact, activities, communications

        # Mock related data
        conn.fetch.side_effect = [
            # Contacts
            [
                {
                    "contact_id": uuid4(),
                    "contact_type": "email",
                    "contact_subtype": "work",
                    "value": "john@example.com",
                    "is_primary": True,
                    "verified": True,
                    "created_at": datetime.now(timezone.utc),
                }
            ],
            # Addresses
            [
                {
                    "address_id": uuid4(),
                    "address_type": "home",
                    "address_line1": "123 Main St",
                    "address_line2": None,
                    "city": "New York",
                    "state": "NY",
                    "country": "USA",
                    "postal_code": "10001",
                    "is_primary": True,
                    "created_at": datetime.now(timezone.utc),
                }
            ],
            # Tags
            [
                {
                    "tag_id": uuid4(),
                    "name": "VIP",
                    "color": "#FF0000",
                }
            ],
            # Galleries
            [
                {
                    "link_id": uuid4(),
                    "gallery_id": uuid4(),
                    "role": "primary",
                    "created_at": datetime.now(timezone.utc),
                    "title": "Wedding 2024",
                    "status": "published",
                    "cover_asset_id": None,
                }
            ],
        ]

        result = await service.get_client(
            workspace_id=workspace_id,
            client_id=client_id,
            include_contacts=True,
            include_addresses=True,
            include_tags=True,
            include_galleries=True,
            include_stats=True,
        )

        assert result["client_id"] == str(client_id)
        assert "contacts" in result
        assert len(result["contacts"]) == 1
        assert result["contacts"][0]["value"] == "john@example.com"
        assert "addresses" in result
        assert len(result["addresses"]) == 1
        assert "tags" in result
        assert len(result["tags"]) == 1
        assert "linked_galleries" in result
        assert len(result["linked_galleries"]) == 1

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_raises_not_found_for_missing_client(self, mock_get_pool, mock_db_pool):
        """Raises ClientNotFoundError when client doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        # Mock client not found
        conn.fetchrow.return_value = None

        with pytest.raises(ClientNotFoundError):
            await service.get_client(
                workspace_id=uuid4(),
                client_id=uuid4(),
            )

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_workspace_isolation(self, mock_get_pool, mock_db_pool, sample_client_row):
        """Enforces workspace isolation when retrieving client."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id_1 = uuid4()
        workspace_id_2 = uuid4()
        client_id = sample_client_row["client_id"]

        # Client exists in workspace_1
        sample_client_row["workspace_id"] = workspace_id_1
        conn.fetchrow.side_effect = [
            sample_client_row,  # Found in workspace_1
            None,  # Not found in workspace_2
        ]
        conn.fetchval.side_effect = [0, 0, None, 0, 0]
        conn.fetch.return_value = []

        # Should work for workspace_1
        result = await service.get_client(workspace_id_1, client_id)
        assert result["workspace_id"] == str(workspace_id_1)

        # Should fail for workspace_2
        with pytest.raises(ClientNotFoundError):
            await service.get_client(workspace_id_2, client_id)


# ---------------------------------------------------------------------------
# ClientService.list_clients Tests
# ---------------------------------------------------------------------------


class TestListClients:
    """Tests for ClientService.list_clients."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_returns_paginated_list(self, mock_get_pool, mock_db_pool, sample_client_row):
        """Returns paginated list of clients."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id = uuid4()
        sample_client_row["workspace_id"] = workspace_id
        sample_client_row["primary_email"] = "john@example.com"
        sample_client_row["primary_phone"] = "+1234567890"
        sample_client_row["linked_galleries_count"] = 3

        # Mock total count
        conn.fetchval.return_value = 50

        # Mock client list
        conn.fetch.return_value = [sample_client_row]

        result = await service.list_clients(
            workspace_id=workspace_id,
            page=1,
            limit=20,
        )

        assert "clients" in result
        assert "meta" in result
        assert result["meta"]["page"] == 1
        assert result["meta"]["limit"] == 20
        assert result["meta"]["total"] == 50
        assert result["meta"]["total_pages"] == 3

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_filters_by_status(self, mock_get_pool, mock_db_pool):
        """Filters clients by status."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        conn.fetchval.return_value = 0
        conn.fetch.return_value = []

        await service.list_clients(
            workspace_id=uuid4(),
            status="active",
        )

        # Verify status filter in query
        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]
        params = fetch_call[0][1:]

        assert "status = $" in sql
        assert "active" in params

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_filters_by_tags(self, mock_get_pool, mock_db_pool):
        """Filters clients by tag IDs."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        tag_id = uuid4()
        conn.fetchval.return_value = 0
        conn.fetch.return_value = []

        await service.list_clients(
            workspace_id=uuid4(),
            tags=[tag_id],
        )

        # Verify tag filter in query
        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]

        assert "client_tag_assignments" in sql

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_search_by_name_or_email(self, mock_get_pool, mock_db_pool):
        """Searches clients by name, email, or organization."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        conn.fetchval.return_value = 0
        conn.fetch.return_value = []

        await service.list_clients(
            workspace_id=uuid4(),
            search="john",
        )

        # Verify search filter in query
        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]
        params = fetch_call[0][1:]

        assert "ILIKE" in sql
        assert "%john%" in params

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_limits_page_size(self, mock_get_pool, mock_db_pool):
        """Enforces maximum page size limit."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        conn.fetchval.return_value = 0
        conn.fetch.return_value = []

        result = await service.list_clients(
            workspace_id=uuid4(),
            limit=500,  # Exceeds max
        )

        # Should be capped at 100
        assert result["meta"]["limit"] == 100


# ---------------------------------------------------------------------------
# ClientService.search_clients Tests
# ---------------------------------------------------------------------------


class TestSearchClients:
    """Tests for ClientService.search_clients."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_returns_matching_clients(self, mock_get_pool, mock_db_pool, sample_client_row):
        """Returns clients matching search query."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        sample_client_row["primary_email"] = "john@example.com"
        sample_client_row["primary_phone"] = None

        conn.fetch.return_value = [sample_client_row]

        result = await service.search_clients(
            workspace_id=uuid4(),
            query="john",
        )

        assert len(result) == 1
        assert result[0]["full_name"] == "John Smith"

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_returns_empty_for_short_query(self, mock_get_pool, mock_db_pool):
        """Returns empty list for queries shorter than 2 characters."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        result = await service.search_clients(
            workspace_id=uuid4(),
            query="j",
        )

        assert result == []
        # Database should not be queried
        conn.fetch.assert_not_called()


# ---------------------------------------------------------------------------
# ClientService.update_client Tests
# ---------------------------------------------------------------------------


class TestUpdateClient:
    """Tests for ClientService.update_client."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_updates_client_fields(self, mock_get_pool, mock_db_pool, sample_client_row):
        """Successfully updates client fields."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id = sample_client_row["workspace_id"]
        client_id = sample_client_row["client_id"]

        # Mock client exists
        conn.fetchval.side_effect = [
            1,  # Client exists check
            0, 0, None, 0, 0,  # Stats queries for get_client
        ]

        # Mock updated client
        updated_row = {**sample_client_row, "organization": "New Organization"}
        conn.fetchrow.return_value = updated_row
        conn.fetch.return_value = []

        result = await service.update_client(
            workspace_id=workspace_id,
            client_id=client_id,
            organization="New Organization",
        )

        # Verify UPDATE was executed
        conn.execute.assert_called_once()

        # Verify result
        assert result["organization"] == "New Organization"

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_raises_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ClientNotFoundError when client doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        conn.fetchval.return_value = None

        with pytest.raises(ClientNotFoundError):
            await service.update_client(
                workspace_id=uuid4(),
                client_id=uuid4(),
                organization="New Org",
            )

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_validates_full_name_not_empty(self, mock_get_pool, mock_db_pool):
        """Validates full_name cannot be empty."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        conn.fetchval.return_value = 1  # Client exists

        with pytest.raises(ClientValidationError) as exc_info:
            await service.update_client(
                workspace_id=uuid4(),
                client_id=uuid4(),
                full_name="",
            )

        assert "Full name cannot be empty" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_validates_status_values(self, mock_get_pool, mock_db_pool):
        """Validates status must be active or inactive."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        conn.fetchval.return_value = 1

        with pytest.raises(ClientValidationError) as exc_info:
            await service.update_client(
                workspace_id=uuid4(),
                client_id=uuid4(),
                status="invalid",
            )

        assert "Status must be 'active' or 'inactive'" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_ignores_unknown_fields(self, mock_get_pool, mock_db_pool, sample_client_row):
        """Ignores fields not in allowed_fields list."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id = sample_client_row["workspace_id"]
        client_id = sample_client_row["client_id"]

        conn.fetchval.side_effect = [1, 0, 0, None, 0, 0]
        conn.fetchrow.return_value = sample_client_row
        conn.fetch.return_value = []

        # Should not raise even with unknown field
        await service.update_client(
            workspace_id=workspace_id,
            client_id=client_id,
            unknown_field="value",
        )


# ---------------------------------------------------------------------------
# ClientService.delete_client Tests
# ---------------------------------------------------------------------------


class TestDeleteClient:
    """Tests for ClientService.delete_client."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_deletes_client_and_related_records(self, mock_get_pool, mock_db_pool):
        """Deletes client and all related records."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id = uuid4()
        client_id = uuid4()

        # Mock client exists
        conn.fetchrow.return_value = {
            "client_id": client_id,
            "full_name": "John Smith",
        }

        # Mock no active galleries, 3 galleries to unlink
        conn.fetchval.side_effect = [0, 3]

        result = await service.delete_client(
            workspace_id=workspace_id,
            client_id=client_id,
        )

        assert "deleted successfully" in result["message"]
        assert result["galleries_unlinked"] == 3

        # Verify all DELETE queries executed
        execute_calls = conn.execute.call_args_list
        assert len(execute_calls) >= 8  # preferences, communications, activities, gallery_links, tags, addresses, contacts, clients

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_raises_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ClientNotFoundError when client doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        conn.fetchrow.return_value = None

        with pytest.raises(ClientNotFoundError):
            await service.delete_client(
                workspace_id=uuid4(),
                client_id=uuid4(),
            )

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_blocks_deletion_with_active_proofing(self, mock_get_pool, mock_db_pool):
        """Raises ClientActiveProofingError when client has active proofing sessions."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        client_id = uuid4()

        # Mock client exists
        conn.fetchrow.return_value = {
            "client_id": client_id,
            "full_name": "John Smith",
        }

        # Mock 2 active proofing sessions
        conn.fetchval.return_value = 2

        with pytest.raises(ClientActiveProofingError) as exc_info:
            await service.delete_client(
                workspace_id=uuid4(),
                client_id=client_id,
            )

        assert "2 active proofing" in str(exc_info.value)


# ---------------------------------------------------------------------------
# ClientService.add_contact Tests
# ---------------------------------------------------------------------------


class TestAddContact:
    """Tests for ClientService.add_contact."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_adds_contact_successfully(self, mock_get_pool, mock_db_pool):
        """Successfully adds a contact to a client."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        contact_id = uuid4()

        # Mock client exists, no duplicate, insert
        conn.fetchval.side_effect = [1, None, contact_id]

        result = await service.add_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_type="email",
            value="john@example.com",
            is_primary=True,
        )

        assert result["contact_id"] == str(contact_id)
        assert result["contact_type"] == "email"
        assert result["is_primary"] is True

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_validates_contact_type(self, mock_get_pool, mock_db_pool):
        """Raises error for invalid contact type."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        with pytest.raises(ContactInvalidFormatError):
            await service.add_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_type="fax",  # Invalid type
                value="12345",
            )

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_raises_duplicate_error(self, mock_get_pool, mock_db_pool):
        """Raises ContactDuplicateError for duplicate contact."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        # Mock client exists, duplicate found
        conn.fetchval.side_effect = [1, 1]

        with pytest.raises(ContactDuplicateError):
            await service.add_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_type="email",
                value="john@example.com",
            )

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_raises_client_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ClientNotFoundError when client doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        conn.fetchval.return_value = None

        with pytest.raises(ClientNotFoundError):
            await service.add_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_type="email",
                value="john@example.com",
            )


# ---------------------------------------------------------------------------
# ClientService.delete_contact Tests
# ---------------------------------------------------------------------------


class TestDeleteContact:
    """Tests for ClientService.delete_contact."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_deletes_contact_successfully(self, mock_get_pool, mock_db_pool):
        """Successfully deletes a contact."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        contact_id = uuid4()

        # Mock contact found
        conn.fetchrow.return_value = {
            "contact_id": contact_id,
            "contact_type": "email",
            "value": "john@example.com",
        }

        result = await service.delete_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_id=contact_id,
        )

        assert "deleted successfully" in result["message"]

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_raises_contact_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ContactNotFoundError when contact doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        conn.fetchrow.return_value = None

        with pytest.raises(ContactNotFoundError):
            await service.delete_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_id=uuid4(),
            )


# ---------------------------------------------------------------------------
# ClientService.link_gallery Tests
# ---------------------------------------------------------------------------


class TestLinkGallery:
    """Tests for ClientService.link_gallery."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_links_gallery_successfully(self, mock_get_pool, mock_db_pool):
        """Successfully links a gallery to a client."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        gallery_id = uuid4()
        link_id = uuid4()

        # Mock client exists, gallery exists, no existing link
        conn.fetchval.side_effect = [1, None, link_id]
        conn.fetchrow.return_value = {
            "gallery_id": gallery_id,
            "title": "Wedding 2024",
        }

        result = await service.link_gallery(
            workspace_id=uuid4(),
            client_id=uuid4(),
            gallery_id=gallery_id,
            role="primary",
        )

        assert result["link_id"] == str(link_id)
        assert result["gallery_title"] == "Wedding 2024"
        assert result["role"] == "primary"

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_validates_role(self, mock_get_pool, mock_db_pool):
        """Raises ClientValidationError for invalid role."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        with pytest.raises(ClientValidationError) as exc_info:
            await service.link_gallery(
                workspace_id=uuid4(),
                client_id=uuid4(),
                gallery_id=uuid4(),
                role="owner",  # Invalid role
            )

        assert "Role must be" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_raises_gallery_not_found(self, mock_get_pool, mock_db_pool):
        """Raises GalleryNotFoundForLinkError when gallery doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        # Client exists, gallery not found
        conn.fetchval.return_value = 1
        conn.fetchrow.return_value = None

        with pytest.raises(GalleryNotFoundForLinkError):
            await service.link_gallery(
                workspace_id=uuid4(),
                client_id=uuid4(),
                gallery_id=uuid4(),
            )

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_raises_already_linked(self, mock_get_pool, mock_db_pool):
        """Raises GalleryAlreadyLinkedError when already linked."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        # Client exists, gallery exists, already linked
        conn.fetchval.side_effect = [1, 1]
        conn.fetchrow.return_value = {
            "gallery_id": uuid4(),
            "title": "Wedding 2024",
        }

        with pytest.raises(GalleryAlreadyLinkedError):
            await service.link_gallery(
                workspace_id=uuid4(),
                client_id=uuid4(),
                gallery_id=uuid4(),
            )


# ---------------------------------------------------------------------------
# ClientService.unlink_gallery Tests
# ---------------------------------------------------------------------------


class TestUnlinkGallery:
    """Tests for ClientService.unlink_gallery."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_unlinks_gallery_successfully(self, mock_get_pool, mock_db_pool):
        """Successfully unlinks a gallery from a client."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        # Mock link found
        conn.fetchrow.return_value = {
            "link_id": uuid4(),
            "title": "Wedding 2024",
        }

        result = await service.unlink_gallery(
            workspace_id=uuid4(),
            client_id=uuid4(),
            gallery_id=uuid4(),
        )

        assert "Unlinked from gallery" in result["message"]

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_raises_link_not_found(self, mock_get_pool, mock_db_pool):
        """Raises GalleryLinkNotFoundError when link doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        conn.fetchrow.return_value = None

        with pytest.raises(GalleryLinkNotFoundError):
            await service.unlink_gallery(
                workspace_id=uuid4(),
                client_id=uuid4(),
                gallery_id=uuid4(),
            )


# ---------------------------------------------------------------------------
# ClientService.add_tags Tests
# ---------------------------------------------------------------------------


class TestAddTags:
    """Tests for ClientService.add_tags."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_adds_tags_successfully(self, mock_get_pool, mock_db_pool):
        """Successfully adds tags to a client."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        tag_id = uuid4()

        # Mock client exists, tags exist
        conn.fetchval.return_value = 1
        conn.fetch.return_value = [
            {"tag_id": tag_id, "name": "VIP", "color": "#FF0000"}
        ]

        result = await service.add_tags(
            workspace_id=uuid4(),
            client_id=uuid4(),
            tag_ids=[tag_id],
        )

        assert len(result) == 1
        assert result[0]["name"] == "VIP"

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_raises_tag_not_found(self, mock_get_pool, mock_db_pool):
        """Raises TagNotFoundError when tag doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        # Client exists, tags not found
        conn.fetchval.return_value = 1
        conn.fetch.return_value = []  # No tags found

        with pytest.raises(TagNotFoundError):
            await service.add_tags(
                workspace_id=uuid4(),
                client_id=uuid4(),
                tag_ids=[uuid4()],
            )


# ---------------------------------------------------------------------------
# ClientService.get_activity_timeline Tests
# ---------------------------------------------------------------------------


class TestGetActivityTimeline:
    """Tests for ClientService.get_activity_timeline."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_returns_paginated_activities(self, mock_get_pool, mock_db_pool):
        """Returns paginated activity timeline."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        activity_id = uuid4()
        now = datetime.now(timezone.utc)

        # Mock client exists
        conn.fetchval.side_effect = [1, 25]  # exists, total count

        # Mock activities
        conn.fetch.return_value = [
            {
                "activity_id": activity_id,
                "activity_type": "gallery_linked",
                "related_entity_type": "gallery",
                "related_entity_id": uuid4(),
                "description": "Linked to gallery",
                "metadata": None,
                "created_by_user_id": uuid4(),
                "created_at": now,
            }
        ]

        result = await service.get_activity_timeline(
            workspace_id=uuid4(),
            client_id=uuid4(),
            page=1,
            limit=20,
        )

        assert "activities" in result
        assert "meta" in result
        assert len(result["activities"]) == 1
        assert result["meta"]["total"] == 25


# ---------------------------------------------------------------------------
# ClientService.log_communication Tests
# ---------------------------------------------------------------------------


class TestLogCommunication:
    """Tests for ClientService.log_communication."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_logs_communication_successfully(self, mock_get_pool, mock_db_pool):
        """Successfully logs a communication."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        comm_id = uuid4()
        now = datetime.now(timezone.utc)

        # Mock client exists
        conn.fetchval.side_effect = [1, comm_id]
        conn.fetchrow.return_value = {
            "communication_id": comm_id,
            "created_at": now,
        }

        result = await service.log_communication(
            workspace_id=uuid4(),
            client_id=uuid4(),
            user_id=uuid4(),
            communication_type="email",
            direction="outbound",
            subject="Follow up",
        )

        assert result["communication_id"] == str(comm_id)

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_validates_communication_type(self, mock_get_pool, mock_db_pool):
        """Raises error for invalid communication type."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        with pytest.raises(ClientValidationError) as exc_info:
            await service.log_communication(
                workspace_id=uuid4(),
                client_id=uuid4(),
                user_id=uuid4(),
                communication_type="fax",  # Invalid
                direction="outbound",
            )

        assert "Communication type must be" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_validates_direction(self, mock_get_pool, mock_db_pool):
        """Raises error for invalid direction."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        with pytest.raises(ClientValidationError) as exc_info:
            await service.log_communication(
                workspace_id=uuid4(),
                client_id=uuid4(),
                user_id=uuid4(),
                communication_type="email",
                direction="both",  # Invalid
            )

        assert "Direction must be" in str(exc_info.value)


# ---------------------------------------------------------------------------
# ClientService.get_communications Tests
# ---------------------------------------------------------------------------


class TestGetCommunications:
    """Tests for ClientService.get_communications."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_returns_paginated_communications(self, mock_get_pool, mock_db_pool):
        """Returns paginated communication history."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        now = datetime.now(timezone.utc)

        # Mock client exists, total count
        conn.fetchval.side_effect = [1, 15]

        # Mock communications
        conn.fetch.return_value = [
            {
                "communication_id": uuid4(),
                "communication_type": "email",
                "direction": "outbound",
                "subject": "Follow up",
                "notes": "Discussed project",
                "duration_minutes": None,
                "follow_up_required": True,
                "follow_up_date": now,
                "created_by_user_id": uuid4(),
                "created_at": now,
            }
        ]

        result = await service.get_communications(
            workspace_id=uuid4(),
            client_id=uuid4(),
            page=1,
            limit=20,
        )

        assert "communications" in result
        assert "meta" in result
        assert len(result["communications"]) == 1
        assert result["meta"]["total"] == 15


# ---------------------------------------------------------------------------
# Workspace Isolation Tests
# ---------------------------------------------------------------------------


class TestWorkspaceIsolation:
    """Tests ensuring workspace isolation across all operations."""

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_create_uses_workspace_id(self, mock_get_pool, mock_db_pool, sample_client_row):
        """Create operation includes workspace_id in INSERT."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id = uuid4()
        client_id = uuid4()
        # Mock: insert returns client_id, then stats fetchvals (galleries=0, referrals=0, last_contact=None, activities=0, communications=0)
        conn.fetchval.side_effect = [client_id, 0, 0, None, 0, 0]
        conn.fetchrow.return_value = {**sample_client_row, "workspace_id": workspace_id, "client_id": client_id}
        conn.fetch.return_value = []

        await service.create_client(
            workspace_id=workspace_id,
            user_id=uuid4(),
            full_name="Test",
            first_name="Test",
        )

        # First call is INSERT, workspace_id should be in params
        insert_call = conn.fetchval.call_args_list[0]
        assert workspace_id in insert_call[0]

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_list_filters_by_workspace(self, mock_get_pool, mock_db_pool):
        """List operation filters by workspace_id."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id = uuid4()
        conn.fetchval.return_value = 0
        conn.fetch.return_value = []

        await service.list_clients(workspace_id=workspace_id)

        # Verify workspace_id in WHERE clause
        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]
        params = fetch_call[0][1:]

        assert "workspace_id = $1" in sql
        assert workspace_id in params

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_update_filters_by_workspace(self, mock_get_pool, mock_db_pool, sample_client_row):
        """Update operation filters by workspace_id."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id = uuid4()
        client_id = uuid4()

        conn.fetchval.side_effect = [1, 0, 0, None, 0, 0]
        conn.fetchrow.return_value = {**sample_client_row, "workspace_id": workspace_id, "client_id": client_id}
        conn.fetch.return_value = []

        await service.update_client(
            workspace_id=workspace_id,
            client_id=client_id,
            organization="Updated",
        )

        # Verify workspace_id in UPDATE WHERE clause
        execute_call = conn.execute.call_args
        sql = execute_call[0][0]

        assert "workspace_id = $" in sql

    @pytest.mark.asyncio
    @patch('app.services.client_service.get_postgres_pool')
    async def test_delete_filters_by_workspace(self, mock_get_pool, mock_db_pool):
        """Delete operation filters by workspace_id."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ClientService()

        workspace_id = uuid4()
        client_id = uuid4()

        conn.fetchrow.return_value = {"client_id": client_id, "full_name": "Test"}
        conn.fetchval.side_effect = [0, 0]

        await service.delete_client(workspace_id=workspace_id, client_id=client_id)

        # Verify all DELETE queries include workspace_id
        for call in conn.execute.call_args_list:
            sql = call[0][0]
            assert "workspace_id = $1" in sql
