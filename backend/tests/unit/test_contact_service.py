"""Unit tests for ContactService.

Task 34.2: ContactService Unit Tests
Tests contact CRUD operations, validation, primary contact logic, and workspace isolation.
"""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from app.services.contact_service import (
    ContactService,
    validate_email,
    validate_phone,
    validate_website,
    validate_social,
    validate_contact_value,
    validate_subtype,
    EMAIL_PATTERN,
    PHONE_PATTERN,
    SOCIAL_PATTERNS,
    VALID_SUBTYPES,
)
from app.services.client_exceptions import (
    ClientNotFoundError,
    ContactNotFoundError,
    ContactDuplicateError,
    ContactInvalidFormatError,
    ContactLastMethodError,
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
def sample_contact_row():
    """Sample contact database row for testing."""
    now = datetime.now(timezone.utc)
    return {
        "contact_id": uuid4(),
        "contact_type": "email",
        "contact_subtype": "work",
        "value": "john@example.com",
        "is_primary": True,
        "verified": False,
        "created_at": now,
    }


# ---------------------------------------------------------------------------
# Email Validation Tests
# ---------------------------------------------------------------------------


class TestValidateEmail:
    """Tests for validate_email function."""

    def test_valid_email(self):
        """Accepts valid email addresses."""
        assert validate_email("john@example.com") == "john@example.com"
        assert validate_email("JOHN@EXAMPLE.COM") == "john@example.com"
        assert validate_email("john.doe@example.co.uk") == "john.doe@example.co.uk"
        assert validate_email("john+tag@example.com") == "john+tag@example.com"

    def test_normalizes_to_lowercase(self):
        """Normalizes email to lowercase."""
        assert validate_email("John.Doe@Example.COM") == "john.doe@example.com"

    def test_strips_whitespace(self):
        """Strips leading and trailing whitespace."""
        assert validate_email("  john@example.com  ") == "john@example.com"

    def test_invalid_email_no_at(self):
        """Rejects email without @ symbol."""
        with pytest.raises(ContactInvalidFormatError):
            validate_email("johnatexample.com")

    def test_invalid_email_no_domain(self):
        """Rejects email without domain."""
        with pytest.raises(ContactInvalidFormatError):
            validate_email("john@")

    def test_invalid_email_no_tld(self):
        """Rejects email without TLD."""
        with pytest.raises(ContactInvalidFormatError):
            validate_email("john@example")

    def test_email_too_long(self):
        """Rejects email exceeding 254 characters."""
        long_email = "a" * 245 + "@example.com"
        with pytest.raises(ContactInvalidFormatError) as exc_info:
            validate_email(long_email)
        assert "too long" in str(exc_info.value).lower()


# ---------------------------------------------------------------------------
# Phone Validation Tests
# ---------------------------------------------------------------------------


class TestValidatePhone:
    """Tests for validate_phone function."""

    def test_valid_phone_e164(self):
        """Accepts valid E.164 phone numbers."""
        assert validate_phone("+12025551234") == "+12025551234"
        assert validate_phone("+442071234567") == "+442071234567"

    def test_strips_formatting(self):
        """Strips common formatting characters."""
        assert validate_phone("+1 (202) 555-1234") == "+12025551234"
        assert validate_phone("+1-202-555-1234") == "+12025551234"
        assert validate_phone("+1.202.555.1234") == "+12025551234"

    def test_adds_plus_for_international(self):
        """Adds + prefix for numbers longer than 10 digits."""
        assert validate_phone("12025551234") == "+12025551234"

    def test_local_number_without_plus(self):
        """Accepts local numbers without + prefix."""
        assert validate_phone("5551234567") == "5551234567"

    def test_phone_too_short(self):
        """Rejects phone numbers that are too short."""
        with pytest.raises(ContactInvalidFormatError) as exc_info:
            validate_phone("12345")
        assert "too short" in str(exc_info.value).lower()

    def test_phone_too_long(self):
        """Rejects phone numbers that are too long."""
        with pytest.raises(ContactInvalidFormatError) as exc_info:
            validate_phone("+12345678901234567890")
        # May say "too long" or "invalid format"
        assert "invalid" in str(exc_info.value).lower() or "too long" in str(exc_info.value).lower()

    def test_invalid_phone_format(self):
        """Rejects invalid phone formats."""
        with pytest.raises(ContactInvalidFormatError):
            validate_phone("abc12345678")


# ---------------------------------------------------------------------------
# Website Validation Tests
# ---------------------------------------------------------------------------


class TestValidateWebsite:
    """Tests for validate_website function."""

    def test_valid_https_url(self):
        """Accepts valid HTTPS URLs."""
        assert validate_website("https://example.com") == "https://example.com"
        assert validate_website("https://www.example.com/path") == "https://www.example.com/path"

    def test_valid_http_url(self):
        """Accepts valid HTTP URLs."""
        assert validate_website("http://example.com") == "http://example.com"

    def test_adds_https_prefix(self):
        """Adds https:// prefix when missing."""
        assert validate_website("example.com") == "https://example.com"
        assert validate_website("www.example.com") == "https://www.example.com"

    def test_strips_whitespace(self):
        """Strips leading and trailing whitespace."""
        assert validate_website("  https://example.com  ") == "https://example.com"

    def test_url_too_long(self):
        """Rejects URLs exceeding 500 characters."""
        long_url = "https://example.com/" + "a" * 500
        with pytest.raises(ContactInvalidFormatError) as exc_info:
            validate_website(long_url)
        assert "too long" in str(exc_info.value).lower()

    def test_invalid_url_format(self):
        """Rejects invalid URL formats."""
        with pytest.raises(ContactInvalidFormatError):
            validate_website("not a valid url")


# ---------------------------------------------------------------------------
# Social Media Validation Tests
# ---------------------------------------------------------------------------


class TestValidateSocial:
    """Tests for validate_social function."""

    def test_instagram_handle(self):
        """Validates Instagram handles."""
        assert validate_social("@johndoe", "instagram") == "@johndoe"
        assert validate_social("john_doe.123", "instagram") == "john_doe.123"

    def test_twitter_handle(self):
        """Validates Twitter/X handles."""
        assert validate_social("@johndoe", "twitter") == "@johndoe"
        assert validate_social("john_doe", "twitter") == "john_doe"

    def test_facebook_handle(self):
        """Validates Facebook handles."""
        assert validate_social("john.doe", "facebook") == "john.doe"

    def test_whatsapp_uses_phone_validation(self):
        """WhatsApp uses phone number validation."""
        assert validate_social("+12025551234", "whatsapp") == "+12025551234"

    def test_unknown_platform_basic_validation(self):
        """Unknown platforms use basic length validation."""
        assert validate_social("somehandle", "unknownplatform") == "somehandle"

    def test_no_subtype_basic_validation(self):
        """No subtype uses basic length validation."""
        assert validate_social("somehandle", None) == "somehandle"

    def test_invalid_instagram_handle(self):
        """Rejects invalid Instagram handles."""
        with pytest.raises(ContactInvalidFormatError):
            validate_social("a" * 50, "instagram")  # Too long

    def test_handle_too_long_no_subtype(self):
        """Rejects handles exceeding 100 characters."""
        with pytest.raises(ContactInvalidFormatError):
            validate_social("a" * 101, None)


# ---------------------------------------------------------------------------
# Subtype Validation Tests
# ---------------------------------------------------------------------------


class TestValidateSubtype:
    """Tests for validate_subtype function."""

    def test_valid_email_subtypes(self):
        """Validates email subtypes."""
        assert validate_subtype("email", "work") == "work"
        assert validate_subtype("email", "personal") == "personal"
        assert validate_subtype("email", "Work") == "work"  # Case insensitive

    def test_valid_phone_subtypes(self):
        """Validates phone subtypes."""
        assert validate_subtype("phone", "primary_mobile") == "primary_mobile"
        assert validate_subtype("phone", "home") == "home"
        assert validate_subtype("phone", "fax") == "fax"

    def test_valid_social_subtypes(self):
        """Validates social media subtypes (platform names)."""
        assert validate_subtype("social", "instagram") == "instagram"
        assert validate_subtype("social", "twitter") == "twitter"
        assert validate_subtype("social", "Instagram") == "instagram"

    def test_none_subtype_returns_none(self):
        """Returns None for None subtype."""
        assert validate_subtype("email", None) is None

    def test_invalid_subtype(self):
        """Rejects invalid subtypes."""
        with pytest.raises(ContactInvalidFormatError) as exc_info:
            validate_subtype("email", "invalid")
        assert "Invalid subtype" in str(exc_info.value)


# ---------------------------------------------------------------------------
# ContactService.add_contact Tests
# ---------------------------------------------------------------------------


class TestAddContact:
    """Tests for ContactService.add_contact."""

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_adds_email_successfully(self, mock_get_pool, mock_db_pool):
        """Successfully adds an email contact."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        contact_id = uuid4()
        now = datetime.now(timezone.utc)

        # Mock client exists, no duplicate
        conn.fetchval.side_effect = [1, None]
        conn.fetchrow.return_value = {
            "contact_id": contact_id,
            "created_at": now,
        }

        result = await service.add_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_type="email",
            value="john@example.com",
            contact_subtype="work",
            is_primary=True,
        )

        assert result["contact_id"] == str(contact_id)
        assert result["contact_type"] == "email"
        assert result["value"] == "john@example.com"
        assert result["is_primary"] is True

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_adds_phone_successfully(self, mock_get_pool, mock_db_pool):
        """Successfully adds a phone contact."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        contact_id = uuid4()
        now = datetime.now(timezone.utc)

        conn.fetchval.side_effect = [1, None]
        conn.fetchrow.return_value = {
            "contact_id": contact_id,
            "created_at": now,
        }

        result = await service.add_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_type="phone",
            value="+12025551234",
            contact_subtype="primary_mobile",
        )

        assert result["contact_type"] == "phone"
        assert result["value"] == "+12025551234"
        assert result["contact_subtype"] == "primary_mobile"

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_validates_contact_type(self, mock_get_pool, mock_db_pool):
        """Rejects invalid contact types."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        with pytest.raises(ContactInvalidFormatError) as exc_info:
            await service.add_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_type="fax",  # Invalid type
                value="12345",
            )

        assert "must be one of" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_validates_email_format(self, mock_get_pool, mock_db_pool):
        """Validates email format."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        with pytest.raises(ContactInvalidFormatError):
            await service.add_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_type="email",
                value="invalid-email",
            )

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_raises_client_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ClientNotFoundError when client doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetchval.return_value = None

        with pytest.raises(ClientNotFoundError):
            await service.add_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_type="email",
                value="john@example.com",
            )

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_raises_duplicate_error(self, mock_get_pool, mock_db_pool):
        """Raises ContactDuplicateError for duplicate contacts."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        # Client exists, duplicate found
        conn.fetchval.side_effect = [1, 1]

        with pytest.raises(ContactDuplicateError):
            await service.add_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_type="email",
                value="john@example.com",
            )

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_unsets_existing_primary(self, mock_get_pool, mock_db_pool):
        """Unsets existing primary when setting new primary."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        contact_id = uuid4()
        now = datetime.now(timezone.utc)

        conn.fetchval.side_effect = [1, None]
        conn.fetchrow.return_value = {
            "contact_id": contact_id,
            "created_at": now,
        }

        await service.add_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_type="email",
            value="john@example.com",
            is_primary=True,
        )

        # Verify UPDATE was called to unset existing primary
        execute_calls = conn.execute.call_args_list
        assert any("is_primary = FALSE" in str(call) for call in execute_calls)

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_normalizes_email_value(self, mock_get_pool, mock_db_pool):
        """Normalizes email to lowercase."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        contact_id = uuid4()
        now = datetime.now(timezone.utc)

        conn.fetchval.side_effect = [1, None]
        conn.fetchrow.return_value = {
            "contact_id": contact_id,
            "created_at": now,
        }

        result = await service.add_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_type="email",
            value="JOHN@EXAMPLE.COM",
        )

        assert result["value"] == "john@example.com"


# ---------------------------------------------------------------------------
# ContactService.update_contact Tests
# ---------------------------------------------------------------------------


class TestUpdateContact:
    """Tests for ContactService.update_contact."""

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_updates_value_successfully(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Successfully updates contact value."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetchrow.return_value = sample_contact_row
        conn.fetchval.return_value = None  # No duplicate

        result = await service.update_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_id=sample_contact_row["contact_id"],
            value="new.email@example.com",
        )

        assert result["value"] == "new.email@example.com"

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_updates_subtype(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Successfully updates contact subtype."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetchrow.return_value = sample_contact_row

        result = await service.update_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_id=sample_contact_row["contact_id"],
            contact_subtype="personal",
        )

        assert result["contact_subtype"] == "personal"

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_sets_primary(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Successfully sets contact as primary."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        sample_contact_row["is_primary"] = False
        conn.fetchrow.return_value = sample_contact_row

        result = await service.update_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_id=sample_contact_row["contact_id"],
            is_primary=True,
        )

        assert result["is_primary"] is True

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_raises_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ContactNotFoundError when contact doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetchrow.return_value = None

        with pytest.raises(ContactNotFoundError):
            await service.update_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_id=uuid4(),
                value="new@example.com",
            )

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_raises_duplicate_on_value_change(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Raises ContactDuplicateError when changing to existing value."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetchrow.return_value = sample_contact_row
        conn.fetchval.return_value = 1  # Duplicate found

        with pytest.raises(ContactDuplicateError):
            await service.update_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_id=sample_contact_row["contact_id"],
                value="existing@example.com",
            )


# ---------------------------------------------------------------------------
# ContactService.delete_contact Tests
# ---------------------------------------------------------------------------


class TestDeleteContact:
    """Tests for ContactService.delete_contact."""

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_deletes_successfully(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Successfully deletes a contact."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        sample_contact_row["is_primary"] = False
        conn.fetchrow.return_value = sample_contact_row
        conn.fetchval.return_value = 3  # 3 contacts exist

        result = await service.delete_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_id=sample_contact_row["contact_id"],
        )

        assert "deleted successfully" in result["message"]

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_raises_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ContactNotFoundError when contact doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetchrow.return_value = None

        with pytest.raises(ContactNotFoundError):
            await service.delete_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_id=uuid4(),
            )

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_prevents_deleting_last_contact(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Prevents deletion of the last contact method."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetchrow.return_value = sample_contact_row
        conn.fetchval.return_value = 1  # Only 1 contact exists

        with pytest.raises(ContactLastMethodError):
            await service.delete_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_id=sample_contact_row["contact_id"],
            )

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_promotes_new_primary_on_primary_deletion(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Sets another contact as primary when deleting primary."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        sample_contact_row["is_primary"] = True
        conn.fetchrow.return_value = sample_contact_row
        conn.fetchval.return_value = 2  # 2 contacts exist

        await service.delete_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_id=sample_contact_row["contact_id"],
        )

        # Verify UPDATE was called to set new primary
        execute_calls = conn.execute.call_args_list
        assert any("is_primary = TRUE" in str(call) for call in execute_calls)


# ---------------------------------------------------------------------------
# ContactService.set_primary_contact Tests
# ---------------------------------------------------------------------------


class TestSetPrimaryContact:
    """Tests for ContactService.set_primary_contact."""

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_sets_primary_successfully(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Successfully sets a contact as primary."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        sample_contact_row["is_primary"] = False
        conn.fetchrow.return_value = sample_contact_row

        result = await service.set_primary_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_id=sample_contact_row["contact_id"],
        )

        assert result["is_primary"] is True

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_returns_current_if_already_primary(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Returns current state if already primary."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        sample_contact_row["is_primary"] = True
        conn.fetchrow.return_value = sample_contact_row

        result = await service.set_primary_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_id=sample_contact_row["contact_id"],
        )

        assert result["is_primary"] is True
        # Execute should not be called since it's already primary
        conn.execute.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_unsets_existing_primary(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Unsets existing primary of same type."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        sample_contact_row["is_primary"] = False
        conn.fetchrow.return_value = sample_contact_row

        await service.set_primary_contact(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_id=sample_contact_row["contact_id"],
        )

        # Verify UPDATE was called to unset existing primary
        execute_calls = conn.execute.call_args_list
        assert any("is_primary = FALSE" in str(call) for call in execute_calls)

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_raises_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ContactNotFoundError when contact doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetchrow.return_value = None

        with pytest.raises(ContactNotFoundError):
            await service.set_primary_contact(
                workspace_id=uuid4(),
                client_id=uuid4(),
                contact_id=uuid4(),
            )


# ---------------------------------------------------------------------------
# ContactService.list_contacts Tests
# ---------------------------------------------------------------------------


class TestListContacts:
    """Tests for ContactService.list_contacts."""

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_lists_all_contacts(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Lists all contacts for a client."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetch.return_value = [sample_contact_row]

        result = await service.list_contacts(
            workspace_id=uuid4(),
            client_id=uuid4(),
        )

        assert len(result) == 1
        assert result[0]["contact_type"] == "email"

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_filters_by_type(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Filters contacts by type."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetch.return_value = [sample_contact_row]

        await service.list_contacts(
            workspace_id=uuid4(),
            client_id=uuid4(),
            contact_type="email",
        )

        # Verify query includes contact_type filter
        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]
        params = fetch_call[0][1:]

        assert "contact_type = $3" in sql
        assert "email" in params


# ---------------------------------------------------------------------------
# ContactService.get_primary_contacts Tests
# ---------------------------------------------------------------------------


class TestGetPrimaryContacts:
    """Tests for ContactService.get_primary_contacts."""

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_returns_primary_email_and_phone(self, mock_get_pool, mock_db_pool):
        """Returns primary email and phone."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetchval.side_effect = ["john@example.com", "+12025551234"]

        result = await service.get_primary_contacts(
            workspace_id=uuid4(),
            client_id=uuid4(),
        )

        assert result["primary_email"] == "john@example.com"
        assert result["primary_phone"] == "+12025551234"

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_returns_none_when_no_primary(self, mock_get_pool, mock_db_pool):
        """Returns None when no primary contacts exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetchval.return_value = None

        result = await service.get_primary_contacts(
            workspace_id=uuid4(),
            client_id=uuid4(),
        )

        assert result["primary_email"] is None
        assert result["primary_phone"] is None


# ---------------------------------------------------------------------------
# ContactService.verify_contact Tests
# ---------------------------------------------------------------------------


class TestVerifyContact:
    """Tests for ContactService.verify_contact."""

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_verifies_contact_successfully(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Successfully verifies a contact."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        sample_contact_row["verified"] = True
        conn.fetchrow.return_value = sample_contact_row

        result = await service.verify_contact(
            workspace_id=uuid4(),
            contact_id=sample_contact_row["contact_id"],
        )

        assert result["verified"] is True

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_raises_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ContactNotFoundError when contact doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        conn.fetchrow.return_value = None

        with pytest.raises(ContactNotFoundError):
            await service.verify_contact(
                workspace_id=uuid4(),
                contact_id=uuid4(),
            )


# ---------------------------------------------------------------------------
# Workspace Isolation Tests
# ---------------------------------------------------------------------------


class TestContactWorkspaceIsolation:
    """Tests ensuring workspace isolation for contact operations."""

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_add_uses_workspace_id(self, mock_get_pool, mock_db_pool):
        """Add operation includes workspace_id in queries."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        workspace_id = uuid4()
        now = datetime.now(timezone.utc)

        conn.fetchval.side_effect = [1, None]
        conn.fetchrow.return_value = {
            "contact_id": uuid4(),
            "created_at": now,
        }

        await service.add_contact(
            workspace_id=workspace_id,
            client_id=uuid4(),
            contact_type="email",
            value="john@example.com",
        )

        # Verify workspace_id in client check
        client_check_call = conn.fetchval.call_args_list[0]
        assert workspace_id in client_check_call[0]

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_list_filters_by_workspace(self, mock_get_pool, mock_db_pool):
        """List operation filters by workspace_id."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        workspace_id = uuid4()
        conn.fetch.return_value = []

        await service.list_contacts(
            workspace_id=workspace_id,
            client_id=uuid4(),
        )

        # Verify workspace_id in WHERE clause
        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]
        params = fetch_call[0][1:]

        assert "workspace_id = $1" in sql
        assert workspace_id in params

    @pytest.mark.asyncio
    @patch('app.services.contact_service.get_postgres_pool')
    async def test_delete_filters_by_workspace(self, mock_get_pool, mock_db_pool, sample_contact_row):
        """Delete operation filters by workspace_id."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ContactService()

        workspace_id = uuid4()
        sample_contact_row["is_primary"] = False
        conn.fetchrow.return_value = sample_contact_row
        conn.fetchval.return_value = 2

        await service.delete_contact(
            workspace_id=workspace_id,
            client_id=uuid4(),
            contact_id=sample_contact_row["contact_id"],
        )

        # Verify DELETE includes workspace_id
        delete_call = conn.execute.call_args_list[0]
        sql = delete_call[0][0]

        assert "workspace_id = $1" in sql
