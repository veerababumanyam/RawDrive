"""
Pydantic schemas for smart lists (dynamic client segmentation).

Smart lists use filter criteria DSL to dynamically segment clients:
- Status filters
- Date range filters
- Tag filters
- Activity filters
- Engagement filters (favorites, selections, communications)
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID

from pydantic import BaseModel, Field


class FilterCriterion(BaseModel):
    """Single filter criterion for smart list."""

    field: str = Field(
        ...,
        description="Field to filter on (status, created_at, tag_ids, etc.)",
    )
    operator: str = Field(
        ...,
        description="Operator (equals, not_equals, contains, greater_than, less_than, in, not_in, between)",
    )
    value: Any = Field(..., description="Value to compare against")


class SmartListFilters(BaseModel):
    """Smart list filter criteria DSL."""

    criteria: List[FilterCriterion] = Field(
        ..., min_length=1, description="List of filter criteria"
    )
    match_type: str = Field(
        "all",
        pattern="^(all|any)$",
        description="Whether to match all criteria (AND) or any criteria (OR)",
    )


class SmartListCreate(BaseModel):
    """Schema for creating a smart list."""

    name: str = Field(..., min_length=1, max_length=200, description="List name")
    description: Optional[str] = Field(
        None, max_length=1000, description="List description"
    )
    filters: SmartListFilters = Field(..., description="Filter criteria")
    color: Optional[str] = Field(
        None, pattern="^#[0-9A-Fa-f]{6}$", description="Hex color code"
    )


class SmartListUpdate(BaseModel):
    """Schema for updating a smart list."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    filters: Optional[SmartListFilters] = None
    color: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")


class SmartListResponse(BaseModel):
    """Schema for smart list response."""

    list_id: UUID
    workspace_id: UUID
    name: str
    description: Optional[str] = None
    filters: Dict[str, Any]  # Stored as JSONB in database
    color: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SmartListListResponse(BaseModel):
    """Schema for paginated smart list list."""

    lists: List[SmartListResponse]
    total: int = Field(..., description="Total number of smart lists")


class SmartListEvaluationResponse(BaseModel):
    """Schema for smart list evaluation results."""

    list_id: UUID
    list_name: str
    clients: List[Dict[str, Any]]  # Client list items
    total: int = Field(..., description="Total matching clients")
    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Items per page")
    filters: Dict[str, Any] = Field(..., description="Applied filter criteria")


# Pre-built system smart list filters
SYSTEM_SMART_LISTS = {
    "active_clients": {
        "name": "Active Clients",
        "description": "All clients with active status",
        "filters": {
            "criteria": [{"field": "status", "operator": "equals", "value": "active"}],
            "match_type": "all",
        },
        "color": "#22c55e",
    },
    "recent_clients": {
        "name": "Recent Clients",
        "description": "Clients added in the last 30 days",
        "filters": {
            "criteria": [
                {
                    "field": "created_at",
                    "operator": "greater_than",
                    "value": "now-30d",  # Relative date
                }
            ],
            "match_type": "all",
        },
        "color": "#3b82f6",
    },
    "vip_clients": {
        "name": "VIP Clients",
        "description": "Clients with VIP tag",
        "filters": {
            "criteria": [
                {"field": "tag_names", "operator": "contains", "value": "VIP"}
            ],
            "match_type": "all",
        },
        "color": "#f59e0b",
    },
    "engaged_clients": {
        "name": "Engaged Clients",
        "description": "Clients with gallery engagement (favorites/selections)",
        "filters": {
            "criteria": [
                {
                    "field": "total_engagement",
                    "operator": "greater_than",
                    "value": 5,
                }
            ],
            "match_type": "all",
        },
        "color": "#8b5cf6",
    },
    "inactive_clients": {
        "name": "Inactive Clients",
        "description": "No communication in the last 60 days",
        "filters": {
            "criteria": [
                {
                    "field": "last_communication_date",
                    "operator": "less_than",
                    "value": "now-60d",
                }
            ],
            "match_type": "all",
        },
        "color": "#ef4444",
    },
}
