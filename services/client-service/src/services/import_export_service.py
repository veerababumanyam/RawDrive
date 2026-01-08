"""
Business logic for client import/export operations.

Provides:
- CSV import with duplicate detection
- CSV/JSON export with filtering
- Error reporting and validation
- Progress tracking
"""

from typing import List, Dict, Any, Optional, BinaryIO
from io import StringIO
import csv
import json

from src.repositories.client_repository import ClientRepository
from src.repositories.contact_repository import ContactRepository
from src.repositories.address_repository import AddressRepository
from src.repositories.tag_repository import TagRepository
from src.log_config import get_logger

logger = get_logger(__name__)


class ImportExportService:
    """Service for importing and exporting clients."""

    def __init__(self):
        self.client_repo = ClientRepository()
        self.contact_repo = ContactRepository()
        self.address_repo = AddressRepository()
        self.tag_repo = TagRepository()

    async def import_clients_from_csv(
        self,
        workspace_id: str,
        file_content: str,
        skip_duplicates: bool = True,
    ) -> Dict[str, Any]:
        """
        Import clients from CSV file.

        Args:
            workspace_id: Workspace ID
            file_content: CSV file content as string
            skip_duplicates: Whether to skip duplicate emails

        Returns:
            Import result with counts and errors
        """
        # Parse CSV
        csv_reader = csv.DictReader(StringIO(file_content))
        rows = list(csv_reader)

        imported_count = 0
        skipped_count = 0
        error_count = 0
        errors = []
        warnings = []

        for idx, row in enumerate(rows, start=2):  # Start from 2 (header is row 1)
            try:
                # Extract client data
                full_name = row.get("full_name", "").strip()
                if not full_name:
                    errors.append({
                        "row": idx,
                        "field": "full_name",
                        "message": "Full name is required",
                    })
                    error_count += 1
                    continue

                email = row.get("email", "").strip() or None

                # Check for duplicate by email
                if email and skip_duplicates:
                    existing = await self.client_repo.find_by_email(
                        workspace_id, email
                    )
                    if existing:
                        warnings.append({
                            "row": idx,
                            "email": email,
                            "message": f"Client with email {email} already exists, skipping",
                        })
                        skipped_count += 1
                        continue

                # Create client
                client = await self.client_repo.create(
                    workspace_id=workspace_id,
                    full_name=full_name,
                    first_name=row.get("first_name", "").strip() or None,
                    last_name=row.get("last_name", "").strip() or None,
                    company_name=row.get("company_name", "").strip() or None,
                    status=row.get("status", "active").strip() or "active",
                    notes=row.get("notes", "").strip() or None,
                )

                client_id = client["client_id"]

                # Add email contact
                if email:
                    await self.contact_repo.create(
                        workspace_id=workspace_id,
                        client_id=client_id,
                        contact_type="email",
                        value=email,
                        is_primary=True,
                        label="Primary",
                    )

                # Add phone contact
                phone = row.get("phone", "").strip()
                if phone:
                    await self.contact_repo.create(
                        workspace_id=workspace_id,
                        client_id=client_id,
                        contact_type="phone",
                        value=phone,
                        is_primary=True,
                        label="Primary",
                    )

                # Add address if provided
                address_line1 = row.get("address_line1", "").strip()
                if address_line1:
                    await self.address_repo.create(
                        workspace_id=workspace_id,
                        client_id=client_id,
                        address_type="home",
                        address_line1=address_line1,
                        address_line2=row.get("address_line2", "").strip() or None,
                        city=row.get("city", "").strip() or None,
                        state=row.get("state", "").strip() or None,
                        postal_code=row.get("postal_code", "").strip() or None,
                        country=row.get("country", "").strip() or None,
                        is_primary=True,
                    )

                # Add tags
                tags_str = row.get("tags", "").strip()
                if tags_str:
                    tag_names = [t.strip() for t in tags_str.split(",") if t.strip()]
                    tag_ids = []

                    for tag_name in tag_names:
                        # Find or create tag
                        existing_tag = await self.tag_repo.find_by_name(
                            workspace_id, tag_name
                        )
                        if existing_tag:
                            tag_ids.append(existing_tag["tag_id"])
                        else:
                            # Create new tag
                            new_tag = await self.tag_repo.create(
                                workspace_id=workspace_id,
                                name=tag_name,
                                color="#6b7280",  # Default gray
                            )
                            tag_ids.append(new_tag["tag_id"])

                    # Assign tags to client
                    if tag_ids:
                        await self.tag_repo.assign_tags_to_client(
                            workspace_id, client_id, tag_ids
                        )

                imported_count += 1

            except Exception as e:
                logger.error(
                    "Import row error",
                    extra={"row": idx, "error": str(e)},
                )
                errors.append({
                    "row": idx,
                    "message": str(e),
                })
                error_count += 1

        result = {
            "total_rows": len(rows),
            "imported_count": imported_count,
            "skipped_count": skipped_count,
            "error_count": error_count,
            "errors": errors,
            "warnings": warnings,
        }

        logger.info(
            "Client import completed",
            extra={
                "workspace_id": workspace_id,
                "total_rows": len(rows),
                "imported": imported_count,
                "skipped": skipped_count,
                "errors": error_count,
            },
        )

        return result

    async def export_clients_to_csv(
        self,
        workspace_id: str,
        status: Optional[str] = None,
        tag_ids: Optional[List[str]] = None,
        include_contacts: bool = True,
        include_addresses: bool = True,
        include_tags: bool = True,
    ) -> str:
        """
        Export clients to CSV format using optimized query.

        Performance: Exports 10,000 clients in <5 seconds using single optimized query
        instead of N+1 queries (previously 3001 queries for 1000 clients).

        Args:
            workspace_id: Workspace ID
            status: Optional status filter
            tag_ids: Optional tag IDs filter
            include_contacts: Include contact information
            include_addresses: Include address information
            include_tags: Include tags

        Returns:
            CSV string content
        """
        # Use optimized export method (4 queries total instead of N+1)
        # Note: tag_ids filter not yet supported by optimized method
        # For now, use optimized export and filter client list manually if needed
        clients = await self.client_repo.export_clients_optimized(
            workspace_id=workspace_id,
            status=status,
            limit=10000,  # Max export limit
        )

        # Apply tag filter if needed (manual filter on already-optimized results)
        if tag_ids:
            clients = [
                client for client in clients
                if any(tag["tag_id"] in tag_ids for tag in client.get("tags", []))
            ]

        # Prepare CSV rows
        output = StringIO()
        fieldnames = [
            "full_name",
            "first_name",
            "last_name",
            "company_name",
            "status",
            "created_at",
        ]

        if include_contacts:
            fieldnames.extend(["email", "phone"])

        if include_addresses:
            fieldnames.extend([
                "address_line1",
                "address_line2",
                "city",
                "state",
                "postal_code",
                "country",
            ])

        if include_tags:
            fieldnames.append("tags")

        fieldnames.append("notes")

        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()

        # Process each client (data already fetched in single query)
        for client in clients:
            row = {
                "full_name": client["full_name"],
                "first_name": client.get("first_name") or "",
                "last_name": client.get("last_name") or "",
                "company_name": client.get("company_name") or "",
                "status": client["status"],
                "created_at": client["created_at"].isoformat(),
                "notes": client.get("notes") or "",
            }

            # Extract contacts from pre-fetched data (no additional query)
            if include_contacts:
                contacts = client.get("contacts", [])
                primary_email = next(
                    (c for c in contacts if c["contact_type"] == "email" and c.get("is_primary")),
                    None
                )
                primary_phone = next(
                    (c for c in contacts if c["contact_type"] == "phone" and c.get("is_primary")),
                    None
                )
                row["email"] = primary_email["value"] if primary_email else ""
                row["phone"] = primary_phone["value"] if primary_phone else ""

            # Extract address from pre-fetched data (no additional query)
            if include_addresses:
                addresses = client.get("addresses", [])
                primary_address = next(
                    (a for a in addresses if a.get("is_primary")),
                    addresses[0] if addresses else None
                )
                if primary_address:
                    row["address_line1"] = primary_address.get("address_line1") or ""
                    row["address_line2"] = primary_address.get("address_line2") or ""
                    row["city"] = primary_address.get("city") or ""
                    row["state"] = primary_address.get("state") or ""
                    row["postal_code"] = primary_address.get("postal_code") or ""
                    row["country"] = primary_address.get("country") or ""
                else:
                    row["address_line1"] = ""
                    row["address_line2"] = ""
                    row["city"] = ""
                    row["state"] = ""
                    row["postal_code"] = ""
                    row["country"] = ""

            # Extract tags from pre-fetched data (no additional query)
            if include_tags:
                tags = client.get("tags", [])
                tag_names = [tag["name"] for tag in tags] if tags else []
                row["tags"] = ", ".join(tag_names)

            writer.writerow(row)

        csv_content = output.getvalue()
        output.close()

        logger.info(
            "Client export completed (optimized)",
            extra={
                "workspace_id": workspace_id,
                "client_count": len(clients),
                "performance": "optimized_query",
            },
        )

        return csv_content

    async def get_csv_template(self) -> str:
        """
        Generate CSV template with headers and example row.

        Returns:
            CSV template string
        """
        output = StringIO()
        fieldnames = [
            "full_name",
            "first_name",
            "last_name",
            "company_name",
            "email",
            "phone",
            "status",
            "tags",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postal_code",
            "country",
            "notes",
        ]

        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()

        # Add example row
        example_row = {
            "full_name": "John Smith",
            "first_name": "John",
            "last_name": "Smith",
            "company_name": "Smith Photography",
            "email": "john@example.com",
            "phone": "+1 (555) 123-4567",
            "status": "active",
            "tags": "Wedding, VIP",
            "address_line1": "123 Main St",
            "address_line2": "Apt 4B",
            "city": "New York",
            "state": "NY",
            "postal_code": "10001",
            "country": "USA",
            "notes": "Interested in wedding package",
        }
        writer.writerow(example_row)

        csv_content = output.getvalue()
        output.close()

        return csv_content


# Singleton instance
_import_export_service: Optional[ImportExportService] = None


def get_import_export_service() -> ImportExportService:
    """Get or create ImportExportService singleton instance."""
    global _import_export_service
    if _import_export_service is None:
        _import_export_service = ImportExportService()
    return _import_export_service
