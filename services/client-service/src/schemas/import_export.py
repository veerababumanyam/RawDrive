"""
Pydantic schemas for import/export operations.

Supports CSV import/export with:
- Duplicate detection
- Error reporting
- Field mapping
- Progress tracking
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ImportResult(BaseModel):
    """Result of client import operation."""

    total_rows: int = Field(..., description="Total rows in CSV")
    imported_count: int = Field(..., description="Successfully imported clients")
    skipped_count: int = Field(..., description="Skipped due to duplicates")
    error_count: int = Field(..., description="Rows with errors")
    errors: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="List of errors with row numbers and messages",
    )
    warnings: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="List of warnings (duplicates, etc.)",
    )


class ExportFormat(BaseModel):
    """Export format options."""

    format: str = Field(
        "csv", pattern="^(csv|json)$", description="Export format (csv or json)"
    )
    include_contacts: bool = Field(
        True, description="Include contact information"
    )
    include_addresses: bool = Field(True, description="Include address information")
    include_tags: bool = Field(True, description="Include tags")
    include_statistics: bool = Field(
        False, description="Include engagement statistics"
    )


class ClientImportRow(BaseModel):
    """Single row from CSV import."""

    full_name: str = Field(..., description="Client full name")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str = Field("active", description="Client status")
    tags: Optional[str] = Field(
        None, description="Comma-separated tag names"
    )
    notes: Optional[str] = None
    # Address fields
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
