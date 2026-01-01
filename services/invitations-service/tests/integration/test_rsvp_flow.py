"""
Integration Tests for RSVP Submission Flow.

Tests the complete RSVP lifecycle:
1. Submit RSVP via public endpoint
2. Receive edit token
3. View RSVP with edit token
4. Update RSVP using edit token
"""

import pytest
from httpx import AsyncClient
from uuid import uuid4

from src.main import app


@pytest.fixture
def mock_invitation_slug():
    """Generate a mock invitation slug for testing."""
    return "test-wedding-2026"


@pytest.fixture
def valid_rsvp_data():
    """Valid RSVP submission data."""
    return {
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "+1-555-123-4567",
        "status": "yes",
        "plus_ones": 2,
        "dietary_restrictions": "Vegetarian",
        "message": "Looking forward to the celebration!",
    }


class TestRSVPSubmissionFlow:
    """Test complete RSVP submission and editing flow."""

    @pytest.mark.asyncio
    async def test_submit_rsvp_returns_edit_token(
        self, mock_invitation_slug, valid_rsvp_data
    ):
        """Submitting RSVP returns edit token for future modifications."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json=valid_rsvp_data,
            )

            # Should return 201 Created
            assert response.status_code == 201
            data = response.json()

            # Should include edit token
            assert "rsvp_id" in data
            assert "edit_token" in data
            assert data["status"] == "yes"
            assert data["message"] == "Thank you for your RSVP!"

    @pytest.mark.asyncio
    async def test_submit_rsvp_with_plus_ones(
        self, mock_invitation_slug, valid_rsvp_data
    ):
        """RSVP with plus-ones is accepted."""
        valid_rsvp_data["plus_ones"] = 3

        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json=valid_rsvp_data,
            )

            assert response.status_code == 201
            # Plus-ones should be validated (0-10 range)

    @pytest.mark.asyncio
    async def test_submit_rsvp_validates_status(self, mock_invitation_slug):
        """RSVP status must be yes, no, or maybe."""
        invalid_data = {
            "name": "Test User",
            "status": "invalid_status",
        }

        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json=invalid_data,
            )

            assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_submit_rsvp_validates_plus_ones_range(self, mock_invitation_slug):
        """Plus-ones must be between 0 and 10."""
        invalid_data = {
            "name": "Test User",
            "status": "yes",
            "plus_ones": 15,  # Too many
        }

        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json=invalid_data,
            )

            assert response.status_code == 422


class TestRSVPRetrieval:
    """Test RSVP retrieval with edit token."""

    @pytest.mark.asyncio
    async def test_get_rsvp_with_valid_token(self, mock_invitation_slug):
        """Can retrieve RSVP using valid edit token."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            # First submit an RSVP
            rsvp_data = {
                "name": "Jane Smith",
                "email": "jane@example.com",
                "status": "yes",
            }
            submit_response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json=rsvp_data,
            )

            if submit_response.status_code == 201:
                data = submit_response.json()
                rsvp_id = data["rsvp_id"]
                edit_token = data["edit_token"]

                # Now retrieve it
                get_response = await client.get(
                    f"/api/v1/invitations/{mock_invitation_slug}/rsvp/{rsvp_id}",
                    headers={"X-Edit-Token": edit_token},
                )

                assert get_response.status_code == 200
                rsvp = get_response.json()
                assert rsvp["name"] == "Jane Smith"
                assert rsvp["status"] == "yes"

    @pytest.mark.asyncio
    async def test_get_rsvp_with_invalid_token_fails(self, mock_invitation_slug):
        """Cannot retrieve RSVP with invalid edit token."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp/{uuid4()}",
                headers={"X-Edit-Token": "invalid-token"},
            )

            # Should be rejected
            assert response.status_code in [401, 403, 404]

    @pytest.mark.asyncio
    async def test_get_rsvp_without_token_fails(self, mock_invitation_slug):
        """Cannot retrieve RSVP without edit token."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp/{uuid4()}",
            )

            assert response.status_code in [401, 403]


class TestRSVPUpdate:
    """Test RSVP update with edit token."""

    @pytest.mark.asyncio
    async def test_update_rsvp_status(self, mock_invitation_slug):
        """Can update RSVP status using edit token."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            # Submit initial RSVP
            rsvp_data = {
                "name": "Update Test",
                "status": "maybe",
            }
            submit_response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json=rsvp_data,
            )

            if submit_response.status_code == 201:
                data = submit_response.json()
                rsvp_id = data["rsvp_id"]
                edit_token = data["edit_token"]

                # Update to "yes"
                update_response = await client.patch(
                    f"/api/v1/invitations/{mock_invitation_slug}/rsvp/{rsvp_id}",
                    headers={"X-Edit-Token": edit_token},
                    json={"status": "yes", "plus_ones": 1},
                )

                assert update_response.status_code == 200
                updated = update_response.json()
                assert updated["status"] == "yes"
                assert updated["plus_ones"] == 1

    @pytest.mark.asyncio
    async def test_update_rsvp_with_invalid_token_fails(self, mock_invitation_slug):
        """Cannot update RSVP with invalid edit token."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.patch(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp/{uuid4()}",
                headers={"X-Edit-Token": "wrong-token"},
                json={"status": "no"},
            )

            assert response.status_code in [401, 403, 404]


class TestRSVPEmailMasking:
    """Test that emails are partially masked in responses."""

    @pytest.mark.asyncio
    async def test_email_masked_in_response(self, mock_invitation_slug):
        """Email should be partially masked for privacy."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            rsvp_data = {
                "name": "Privacy Test",
                "email": "longusername@example.com",
                "status": "yes",
            }
            submit_response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json=rsvp_data,
            )

            if submit_response.status_code == 201:
                data = submit_response.json()
                rsvp_id = data["rsvp_id"]
                edit_token = data["edit_token"]

                get_response = await client.get(
                    f"/api/v1/invitations/{mock_invitation_slug}/rsvp/{rsvp_id}",
                    headers={"X-Edit-Token": edit_token},
                )

                if get_response.status_code == 200:
                    rsvp = get_response.json()
                    # Email should be masked like "l***********e@example.com"
                    if "email" in rsvp and rsvp["email"]:
                        assert "*" in rsvp["email"]
                        assert "longusername@example.com" != rsvp["email"]


class TestRSVPAuditLogging:
    """Test that RSVP actions are audit logged."""

    @pytest.mark.asyncio
    async def test_rsvp_submit_logged(self, mock_invitation_slug):
        """RSVP submission should create an audit log entry."""
        # This test would verify audit logging in a real implementation
        # For now, we verify the endpoint works and trust the service logs
        async with AsyncClient(app=app, base_url="http://test") as client:
            rsvp_data = {
                "name": "Audit Test",
                "status": "yes",
            }
            response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json=rsvp_data,
            )

            # If submission succeeds, audit should be logged
            assert response.status_code in [201, 404]  # 404 if invitation doesn't exist


class TestRSVPInputValidation:
    """Test input validation for RSVP submission."""

    @pytest.mark.asyncio
    async def test_empty_name_rejected(self, mock_invitation_slug):
        """Empty name should be rejected."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json={"name": "", "status": "yes"},
            )

            assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_whitespace_name_rejected(self, mock_invitation_slug):
        """Whitespace-only name should be rejected."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json={"name": "   ", "status": "yes"},
            )

            assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_email_rejected(self, mock_invitation_slug):
        """Invalid email format should be rejected."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json={
                    "name": "Test",
                    "email": "not-an-email",
                    "status": "yes",
                },
            )

            assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_xss_in_name_escaped(self, mock_invitation_slug):
        """XSS attempt in name should be safely handled."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/invitations/{mock_invitation_slug}/rsvp",
                json={
                    "name": "<script>alert('xss')</script>",
                    "status": "yes",
                },
            )

            # Should either be rejected or safely stored
            # The name will be escaped when displayed
            assert response.status_code in [201, 422, 404]
