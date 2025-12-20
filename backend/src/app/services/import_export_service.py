"""ImportExportService: Client data import and export functionality.

Implements client data portability:
- Export clients to CSV or JSON format
- Import clients from CSV with validation
- Duplicate detection during import
- Error reporting and import summary

All operations are workspace-scoped for multi-tenant data isolation.

Requirements covered:
- Requirement 14: Data migration and portability
- Requirement 14.1: CSV import with field mapping
- Requirement 14.2: CSV/JSON export
- Requirement 14.3: Duplicate handling during import
- Requirement 14.4: Validation and error reporting
- Requirement 14.5: Import summary with results
"""

from __future__ import annotations

import csv
import io
import json
import logging
import re
from datetime import date, datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.client_service import get_client_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ImportExportError(Exception):
    """Base exception for import/export errors."""

    def __init__(self, message: str, code: str = "IMPORT_EXPORT_ERROR"):
        self.message = message
        self.code = code
        self.status_code = 400
        self.user_message = message
        super().__init__(message)


class ImportValidationError(ImportExportError):
    """Import validation failed."""

    def __init__(self, message: str, row: Optional[int] = None, field: Optional[str] = None):
        self.row = row
        self.field = field
        error_msg = message
        if row:
            error_msg = f"Row {row}: {message}"
        super().__init__(error_msg, code="IMPORT_VALIDATION_ERROR")


class ExportError(ImportExportError):
    """Export failed."""

    def __init__(self, message: str):
        super().__init__(message, code="EXPORT_ERROR")
        self.status_code = 500


class InvalidFileFormatError(ImportExportError):
    """Invalid file format."""

    def __init__(self, expected: str, received: str):
        super().__init__(
            f"Invalid file format. Expected {expected}, received {received}",
            code="INVALID_FILE_FORMAT",
        )
        self.status_code = 400


class EmptyFileError(ImportExportError):
    """Empty file provided."""

    def __init__(self):
        super().__init__(
            "The uploaded file is empty or contains no data",
            code="EMPTY_FILE",
        )
        self.status_code = 400


class MissingRequiredFieldsError(ImportExportError):
    """Required fields missing in import."""

    def __init__(self, fields: list[str]):
        super().__init__(
            f"Missing required fields: {', '.join(fields)}",
            code="MISSING_REQUIRED_FIELDS",
        )
        self.status_code = 400


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# CSV column mappings for import/export
CSV_COLUMNS = [
    "full_name",
    "first_name",
    "last_name",
    "nickname",
    "email",
    "phone",
    "job_title",
    "organization",
    "language",
    "timezone",
    "date_of_birth",
    "anniversary_date",
    "internal_notes",
    "status",
    "tags",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "country",
    "postal_code",
]

REQUIRED_IMPORT_FIELDS = ["first_name"]

# Email validation regex
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


# ---------------------------------------------------------------------------
# ImportExportService
# ---------------------------------------------------------------------------


class ImportExportService:
    """Service for importing and exporting client data."""

    # =========================================================================
    # Export (Requirement 14.2)
    # =========================================================================

    async def export_clients(
        self,
        workspace_id: UUID,
        format: str = "csv",
        status: Optional[str] = None,
        tags: Optional[list[str]] = None,
        include_contacts: bool = True,
        include_addresses: bool = True,
        include_tags: bool = True,
    ) -> dict:
        """Export clients to CSV or JSON format.

        Args:
            workspace_id: Workspace for tenant isolation
            format: Export format ('csv' or 'json')
            status: Filter by client status
            tags: Filter by tag names
            include_contacts: Include contact information
            include_addresses: Include addresses
            include_tags: Include tags

        Returns:
            Dict with 'content' (string), 'content_type', 'filename'

        Raises:
            ExportError: If export fails
        """
        if format not in ("csv", "json"):
            raise ExportError(f"Invalid export format: {format}. Use 'csv' or 'json'")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build query with filters
            where_clauses = ["c.workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if status:
                where_clauses.append(f"c.status = ${param_idx}")
                params.append(status)
                param_idx += 1

            if tags:
                where_clauses.append(f"""
                    EXISTS (
                        SELECT 1 FROM client_tag_assignments cta
                        JOIN client_tags ct ON cta.tag_id = ct.tag_id
                        WHERE cta.client_id = c.client_id
                        AND cta.workspace_id = c.workspace_id
                        AND ct.name = ANY(${param_idx}::text[])
                    )
                """)
                params.append(tags)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Get clients
            clients = await conn.fetch(
                f"""
                SELECT
                    c.client_id, c.full_name, c.first_name, c.last_name,
                    c.nickname, c.job_title, c.organization, c.status,
                    c.language, c.timezone, c.date_of_birth, c.anniversary_date,
                    c.internal_notes, c.created_at, c.updated_at
                FROM clients c
                WHERE {where_sql}
                ORDER BY c.full_name ASC
                """,
                *params,
            )

            # Build export data
            export_data = []
            for client in clients:
                client_data = {
                    "client_id": str(client["client_id"]),
                    "full_name": client["full_name"],
                    "first_name": client["first_name"],
                    "last_name": client["last_name"],
                    "nickname": client["nickname"],
                    "job_title": client["job_title"],
                    "organization": client["organization"],
                    "status": client["status"],
                    "language": client["language"],
                    "timezone": client["timezone"],
                    "date_of_birth": client["date_of_birth"].isoformat() if client["date_of_birth"] else None,
                    "anniversary_date": client["anniversary_date"].isoformat() if client["anniversary_date"] else None,
                    "internal_notes": client["internal_notes"],
                    "created_at": client["created_at"].isoformat() if client["created_at"] else None,
                    "updated_at": client["updated_at"].isoformat() if client["updated_at"] else None,
                }

                # Get contacts
                if include_contacts:
                    contacts = await conn.fetch(
                        """
                        SELECT contact_type, contact_subtype, value, is_primary
                        FROM client_contacts
                        WHERE workspace_id = $1 AND client_id = $2
                        ORDER BY is_primary DESC, created_at ASC
                        """,
                        workspace_id,
                        client["client_id"],
                    )

                    # For CSV, flatten primary email/phone
                    primary_email = next(
                        (c["value"] for c in contacts if c["contact_type"] == "email" and c["is_primary"]),
                        None,
                    )
                    primary_phone = next(
                        (c["value"] for c in contacts if c["contact_type"] == "phone" and c["is_primary"]),
                        None,
                    )

                    client_data["email"] = primary_email
                    client_data["phone"] = primary_phone

                    if format == "json":
                        client_data["contacts"] = [
                            {
                                "type": c["contact_type"],
                                "subtype": c["contact_subtype"],
                                "value": c["value"],
                                "is_primary": c["is_primary"],
                            }
                            for c in contacts
                        ]

                # Get addresses
                if include_addresses:
                    addresses = await conn.fetch(
                        """
                        SELECT address_type, address_line1, address_line2,
                               city, state, country, postal_code, is_primary
                        FROM client_addresses
                        WHERE workspace_id = $1 AND client_id = $2
                        ORDER BY is_primary DESC, created_at ASC
                        """,
                        workspace_id,
                        client["client_id"],
                    )

                    # For CSV, use primary address
                    primary_addr = next((a for a in addresses if a["is_primary"]), None)
                    if primary_addr:
                        client_data["address_line1"] = primary_addr["address_line1"]
                        client_data["address_line2"] = primary_addr["address_line2"]
                        client_data["city"] = primary_addr["city"]
                        client_data["state"] = primary_addr["state"]
                        client_data["country"] = primary_addr["country"]
                        client_data["postal_code"] = primary_addr["postal_code"]
                    else:
                        client_data["address_line1"] = None
                        client_data["address_line2"] = None
                        client_data["city"] = None
                        client_data["state"] = None
                        client_data["country"] = None
                        client_data["postal_code"] = None

                    if format == "json":
                        client_data["addresses"] = [
                            {
                                "type": a["address_type"],
                                "line1": a["address_line1"],
                                "line2": a["address_line2"],
                                "city": a["city"],
                                "state": a["state"],
                                "country": a["country"],
                                "postal_code": a["postal_code"],
                                "is_primary": a["is_primary"],
                            }
                            for a in addresses
                        ]

                # Get tags
                if include_tags:
                    tags_data = await conn.fetch(
                        """
                        SELECT ct.name
                        FROM client_tag_assignments cta
                        JOIN client_tags ct ON cta.tag_id = ct.tag_id
                        WHERE cta.workspace_id = $1 AND cta.client_id = $2
                        ORDER BY ct.name ASC
                        """,
                        workspace_id,
                        client["client_id"],
                    )

                    tag_names = [t["name"] for t in tags_data]
                    client_data["tags"] = ", ".join(tag_names) if format == "csv" else tag_names

                export_data.append(client_data)

            # Generate output
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

            if format == "json":
                content = json.dumps({"clients": export_data}, indent=2, ensure_ascii=False)
                content_type = "application/json"
                filename = f"clients_export_{timestamp}.json"
            else:
                # CSV format
                output = io.StringIO()
                writer = csv.DictWriter(output, fieldnames=CSV_COLUMNS, extrasaction="ignore")
                writer.writeheader()
                for client in export_data:
                    writer.writerow(client)
                content = output.getvalue()
                content_type = "text/csv"
                filename = f"clients_export_{timestamp}.csv"

            logger.info(
                "Clients exported",
                extra={
                    "workspace_id": str(workspace_id),
                    "format": format,
                    "count": len(export_data),
                },
            )

            return {
                "content": content,
                "content_type": content_type,
                "filename": filename,
                "count": len(export_data),
            }

    # =========================================================================
    # Import (Requirements 14.1, 14.3, 14.4, 14.5)
    # =========================================================================

    async def import_clients(
        self,
        workspace_id: UUID,
        user_id: UUID,
        file_content: bytes,
        content_type: str,
        skip_duplicates: bool = True,
        update_existing: bool = False,
    ) -> dict:
        """Import clients from CSV file.

        Args:
            workspace_id: Workspace for tenant isolation
            user_id: User performing the import
            file_content: File content as bytes
            content_type: MIME type of the file
            skip_duplicates: Skip rows with duplicate email
            update_existing: Update existing clients instead of skipping

        Returns:
            Import summary with counts and errors

        Raises:
            InvalidFileFormatError: If file format is not supported
            EmptyFileError: If file is empty
            MissingRequiredFieldsError: If required columns are missing
        """
        # Validate content type
        if content_type not in ("text/csv", "application/csv", "text/plain"):
            raise InvalidFileFormatError("CSV", content_type or "unknown")

        # Decode file content
        try:
            content = file_content.decode("utf-8-sig")  # Handle BOM
        except UnicodeDecodeError:
            try:
                content = file_content.decode("latin-1")
            except Exception:
                raise ImportValidationError("Unable to decode file. Please use UTF-8 encoding")

        if not content.strip():
            raise EmptyFileError()

        # Parse CSV
        reader = csv.DictReader(io.StringIO(content))

        if not reader.fieldnames:
            raise EmptyFileError()

        # Normalize field names (lowercase, strip whitespace)
        fieldnames = [f.lower().strip() for f in reader.fieldnames]

        # Check for required fields
        missing_required = [f for f in REQUIRED_IMPORT_FIELDS if f not in fieldnames]
        if missing_required:
            raise MissingRequiredFieldsError(missing_required)

        # Process rows
        imported = 0
        skipped = 0
        updated = 0
        errors: list[dict] = []
        row_num = 1  # Header is row 0

        pool = await get_postgres_pool()
        client_service = get_client_service()

        async with pool.acquire() as conn:
            for row in reader:
                row_num += 1

                # Normalize row keys
                normalized_row = {k.lower().strip(): v.strip() if v else None for k, v in row.items()}

                try:
                    # Validate required fields
                    first_name = normalized_row.get("first_name")
                    if not first_name:
                        errors.append({
                            "row": row_num,
                            "field": "first_name",
                            "error": "First name is required",
                            "data": normalized_row,
                        })
                        continue

                    # Build full_name if not provided
                    full_name = normalized_row.get("full_name")
                    last_name = normalized_row.get("last_name")
                    if not full_name:
                        full_name = first_name
                        if last_name:
                            full_name = f"{first_name} {last_name}"

                    # Check for duplicate by email
                    email = normalized_row.get("email")
                    existing_client_id = None

                    if email:
                        # Validate email format
                        if not EMAIL_REGEX.match(email):
                            errors.append({
                                "row": row_num,
                                "field": "email",
                                "error": f"Invalid email format: {email}",
                                "data": normalized_row,
                            })
                            continue

                        # Check if email exists
                        existing = await conn.fetchrow(
                            """
                            SELECT c.client_id
                            FROM client_contacts cc
                            JOIN clients c ON cc.client_id = c.client_id
                            WHERE cc.workspace_id = $1
                            AND cc.contact_type = 'email'
                            AND LOWER(cc.value) = LOWER($2)
                            """,
                            workspace_id,
                            email,
                        )

                        if existing:
                            if skip_duplicates and not update_existing:
                                skipped += 1
                                continue
                            elif update_existing:
                                existing_client_id = existing["client_id"]

                    # Parse dates
                    date_of_birth = self._parse_date(normalized_row.get("date_of_birth"))
                    anniversary_date = self._parse_date(normalized_row.get("anniversary_date"))

                    # Validate status
                    status = normalized_row.get("status", "active")
                    if status and status not in ("active", "inactive"):
                        status = "active"

                    if existing_client_id and update_existing:
                        # Update existing client
                        await client_service.update_client(
                            workspace_id=workspace_id,
                            client_id=existing_client_id,
                            full_name=full_name,
                            first_name=first_name,
                            last_name=last_name,
                            nickname=normalized_row.get("nickname"),
                            job_title=normalized_row.get("job_title"),
                            organization=normalized_row.get("organization"),
                            language=normalized_row.get("language"),
                            timezone=normalized_row.get("timezone"),
                            date_of_birth=date_of_birth,
                            anniversary_date=anniversary_date,
                            internal_notes=normalized_row.get("internal_notes"),
                            status=status,
                        )
                        updated += 1
                    else:
                        # Create new client
                        result = await client_service.create_client(
                            workspace_id=workspace_id,
                            user_id=user_id,
                            full_name=full_name,
                            first_name=first_name,
                            last_name=last_name,
                            nickname=normalized_row.get("nickname"),
                            job_title=normalized_row.get("job_title"),
                            organization=normalized_row.get("organization"),
                            language=normalized_row.get("language"),
                            timezone=normalized_row.get("timezone"),
                            date_of_birth=date_of_birth,
                            anniversary_date=anniversary_date,
                            internal_notes=normalized_row.get("internal_notes"),
                        )

                        client_id = UUID(result["client_id"])

                        # Add contacts
                        if email:
                            await client_service.add_contact(
                                workspace_id=workspace_id,
                                client_id=client_id,
                                contact_type="email",
                                value=email,
                                is_primary=True,
                            )

                        phone = normalized_row.get("phone")
                        if phone:
                            await client_service.add_contact(
                                workspace_id=workspace_id,
                                client_id=client_id,
                                contact_type="phone",
                                value=phone,
                                is_primary=True,
                            )

                        # Add address if provided
                        address_line1 = normalized_row.get("address_line1")
                        if address_line1:
                            await conn.execute(
                                """
                                INSERT INTO client_addresses (
                                    workspace_id, client_id, address_type,
                                    address_line1, address_line2, city, state,
                                    country, postal_code, is_primary
                                )
                                VALUES ($1, $2, 'home', $3, $4, $5, $6, $7, $8, TRUE)
                                """,
                                workspace_id,
                                client_id,
                                address_line1,
                                normalized_row.get("address_line2"),
                                normalized_row.get("city"),
                                normalized_row.get("state"),
                                normalized_row.get("country"),
                                normalized_row.get("postal_code"),
                            )

                        # Add tags if provided
                        tags_str = normalized_row.get("tags")
                        if tags_str:
                            tag_names = [t.strip() for t in tags_str.split(",") if t.strip()]
                            for tag_name in tag_names:
                                # Find or create tag
                                tag = await conn.fetchrow(
                                    """
                                    INSERT INTO client_tags (workspace_id, name, created_by_user_id)
                                    VALUES ($1, $2, $3)
                                    ON CONFLICT (workspace_id, name) DO UPDATE SET name = EXCLUDED.name
                                    RETURNING tag_id
                                    """,
                                    workspace_id,
                                    tag_name,
                                    user_id,
                                )

                                # Assign tag to client
                                await conn.execute(
                                    """
                                    INSERT INTO client_tag_assignments (workspace_id, client_id, tag_id)
                                    VALUES ($1, $2, $3)
                                    ON CONFLICT (workspace_id, client_id, tag_id) DO NOTHING
                                    """,
                                    workspace_id,
                                    client_id,
                                    tag["tag_id"],
                                )

                        imported += 1

                except Exception as e:
                    logger.warning(
                        "Import row failed",
                        extra={
                            "row": row_num,
                            "error": str(e),
                            "workspace_id": str(workspace_id),
                        },
                    )
                    errors.append({
                        "row": row_num,
                        "error": str(e),
                        "data": normalized_row,
                    })

        logger.info(
            "Client import completed",
            extra={
                "workspace_id": str(workspace_id),
                "imported": imported,
                "updated": updated,
                "skipped": skipped,
                "errors": len(errors),
            },
        )

        return {
            "imported": imported,
            "updated": updated,
            "skipped": skipped,
            "errors_count": len(errors),
            "errors": errors[:50] if errors else [],  # Limit error details
            "total_rows": row_num - 1,  # Exclude header
        }

    async def get_import_template(self) -> dict:
        """Get a blank CSV template for import.

        Returns:
            Dict with 'content', 'content_type', 'filename'
        """
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(CSV_COLUMNS)

        # Add example row
        writer.writerow([
            "John Doe",  # full_name
            "John",  # first_name
            "Doe",  # last_name
            "Johnny",  # nickname
            "john@example.com",  # email
            "+1234567890",  # phone
            "Photographer",  # job_title
            "Photo Studio",  # organization
            "en",  # language
            "America/New_York",  # timezone
            "1990-01-15",  # date_of_birth
            "2020-06-20",  # anniversary_date
            "VIP client",  # internal_notes
            "active",  # status
            "Wedding, VIP",  # tags
            "123 Main St",  # address_line1
            "Apt 4",  # address_line2
            "New York",  # city
            "NY",  # state
            "USA",  # country
            "10001",  # postal_code
        ])

        return {
            "content": output.getvalue(),
            "content_type": "text/csv",
            "filename": "client_import_template.csv",
        }

    def _parse_date(self, date_str: Optional[str]) -> Optional[date]:
        """Parse date string in various formats."""
        if not date_str:
            return None

        # Try common date formats
        formats = [
            "%Y-%m-%d",
            "%m/%d/%Y",
            "%d/%m/%Y",
            "%Y/%m/%d",
            "%m-%d-%Y",
            "%d-%m-%Y",
        ]

        for fmt in formats:
            try:
                return datetime.strptime(date_str.strip(), fmt).date()
            except ValueError:
                continue

        return None


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_import_export_service: Optional[ImportExportService] = None


def get_import_export_service() -> ImportExportService:
    """Get singleton import/export service instance."""
    global _import_export_service
    if _import_export_service is None:
        _import_export_service = ImportExportService()
    return _import_export_service
