"""
Tests for CSV import functionality.

These tests verify proper handling of CSV files including
edge cases like unicode, malformed data, and large files.
"""

import pytest

pytestmark = pytest.mark.asyncio


class TestCSVPreview:
    """Test CSV preview functionality."""

    async def test_preview_valid_csv(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        sample_csv_content,
    ):
        """Preview a valid CSV file."""
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import/preview",
            files={"file": ("guests.csv", sample_csv_content, "text/csv")},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        assert data["total_rows"] == 3
        assert data["valid_rows"] == 3
        assert "Name" in data["columns"]
        assert "Email" in data["columns"]
        assert len(data["sample_data"]) <= 5

    async def test_preview_detects_columns(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
    ):
        """Preview correctly identifies column names."""
        csv_content = "Full Name,Contact Email,Mobile Phone\nJohn,john@test.com,555-1234"

        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import/preview",
            files={"file": ("guests.csv", csv_content, "text/csv")},
            headers=auth_headers,
        )

        assert response.status_code == 200
        columns = response.json()["columns"]
        assert "Full Name" in columns
        assert "Contact Email" in columns
        assert "Mobile Phone" in columns

    async def test_preview_identifies_invalid_rows(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        malformed_csv_content,
    ):
        """Preview identifies rows without names."""
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import/preview",
            files={"file": ("guests.csv", malformed_csv_content, "text/csv")},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        assert data["invalid_rows"] >= 2  # Two rows missing names
        assert len(data["errors"]) > 0

    async def test_preview_rejects_non_csv(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
    ):
        """Reject non-CSV files."""
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import/preview",
            files={"file": ("data.xlsx", b"not a csv", "application/vnd.ms-excel")},
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "CSV" in response.json()["detail"]


class TestCSVImport:
    """Test CSV import functionality."""

    async def test_import_valid_csv(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        sample_csv_content,
        clean_test_data,
    ):
        """Import guests from a valid CSV."""
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import",
            files={"file": ("guests.csv", sample_csv_content, "text/csv")},
            params={
                "name_column": "Name",
                "email_column": "Email",
                "phone_column": "Phone",
                "plus_ones_column": "Plus Ones",
                "dietary_column": "Dietary",
                "group_column": "Group",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        result = response.json()

        assert result["successfully_imported"] == 3
        assert result["failed"] == 0
        assert "batch_id" in result

    async def test_import_with_missing_names(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        malformed_csv_content,
        clean_test_data,
    ):
        """Import CSV with some invalid rows."""
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import",
            files={"file": ("guests.csv", malformed_csv_content, "text/csv")},
            params={"name_column": "Name", "email_column": "Email"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        result = response.json()

        # Only 1 valid row (Valid Name)
        assert result["successfully_imported"] == 1
        assert result["failed"] == 2
        assert len(result["errors"]) == 2

    async def test_import_unicode_names(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        clean_test_data,
    ):
        """Import CSV with unicode characters."""
        csv_content = """Name,Email
José García,jose@example.com
中文名字,chinese@example.com
Müller,muller@example.com
Владимир,vladimir@example.com
"""
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import",
            files={"file": ("guests.csv", csv_content, "text/csv")},
            params={"name_column": "Name", "email_column": "Email"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["successfully_imported"] == 4

        # Verify unicode names were preserved
        list_response = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            headers=auth_headers,
        )
        names = [g["name"] for g in list_response.json()["guests"]]
        assert "José García" in names
        assert "中文名字" in names

    async def test_import_with_empty_optional_fields(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        clean_test_data,
    ):
        """Import CSV where optional fields are empty."""
        csv_content = """Name,Email,Phone
John Doe,,
Jane Smith,jane@example.com,
Bob Wilson,,555-1234
"""
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import",
            files={"file": ("guests.csv", csv_content, "text/csv")},
            params={
                "name_column": "Name",
                "email_column": "Email",
                "phone_column": "Phone",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["successfully_imported"] == 3

    async def test_import_latin1_encoding(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        clean_test_data,
    ):
        """Import CSV with Latin-1 encoding."""
        # Latin-1 encoded content with special characters
        csv_content = "Name,Email\nFrançois,francois@example.com\n"
        latin1_bytes = csv_content.encode("latin-1")

        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import",
            files={"file": ("guests.csv", latin1_bytes, "text/csv")},
            params={"name_column": "Name", "email_column": "Email"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["successfully_imported"] == 1


class TestCSVEdgeCases:
    """Test edge cases in CSV handling."""

    async def test_empty_csv(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
    ):
        """Handle empty CSV file."""
        csv_content = "Name,Email\n"

        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import/preview",
            files={"file": ("empty.csv", csv_content, "text/csv")},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["total_rows"] == 0

    async def test_csv_with_quotes(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        clean_test_data,
    ):
        """Handle CSV with quoted fields containing commas."""
        csv_content = '''Name,Notes
"Smith, John","Allergic to nuts, dairy"
"Wilson, Bob","Table 5, near window"
'''
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import",
            files={"file": ("guests.csv", csv_content, "text/csv")},
            params={"name_column": "Name", "notes_column": "Notes"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["successfully_imported"] == 2

    async def test_csv_with_extra_whitespace(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        clean_test_data,
    ):
        """Handle CSV with extra whitespace."""
        csv_content = """Name,Email
  John Doe  ,  john@example.com
Jane Smith,jane@example.com
"""
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import",
            files={"file": ("guests.csv", csv_content, "text/csv")},
            params={"name_column": "Name", "email_column": "Email"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        # Names and emails should be trimmed
        assert response.json()["successfully_imported"] == 2
