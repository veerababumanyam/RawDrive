"""
Pydantic schemas for setup goals (gamification) endpoints.

Defines request/response models for:
- Setup goals progress tracking
- Goal completion rewards
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class GoalType(str, Enum):
    """Types of setup goals available."""
    UPLOAD_PROFILE_LOGO = "upload_profile_logo"
    CREATE_FIRST_GALLERY = "create_first_gallery"
    SHARE_GALLERY_WITH_CLIENT = "share_gallery_with_client"
    ENABLE_2FA = "enable_2fa"
    CONNECT_PAYMENT_METHOD = "connect_payment_method"


class GoalStatus(str, Enum):
    """Status of a goal."""
    PENDING = "pending"
    COMPLETED = "completed"
    EXPIRED = "expired"


# =============================================================================
# Goal Definition Schemas
# =============================================================================


class GoalDefinition(BaseModel):
    """Definition of a setup goal."""

    goal_type: GoalType
    title: str
    description: str
    credits_reward: int
    icon: str  # Icon name/key for UI
    order: int  # Display order


class GoalDefinitionListResponse(BaseModel):
    """List of all available goals with definitions."""

    goals: List[GoalDefinition]
    total_possible_credits: int


# =============================================================================
# Goal Progress Schemas
# =============================================================================


class GoalProgress(BaseModel):
    """Progress on a single goal."""

    goal_type: GoalType
    title: str
    description: str
    credits_reward: int
    icon: str

    # Status
    status: GoalStatus
    completed_at: Optional[datetime] = None
    credits_awarded: bool = False

    # For multi-step goals (future)
    current_step: int = 0
    total_steps: int = 1
    progress_percentage: int = 0


class GoalsProgressResponse(BaseModel):
    """Overall progress on setup goals."""

    user_id: UUID
    workspace_id: UUID

    # Summary
    total_goals: int
    completed_goals: int
    pending_goals: int
    expired_goals: int = 0

    # Credits
    total_possible_credits: int
    credits_earned: int
    credits_remaining: int

    # Progress percentage
    progress_percentage: int = 0

    # Deadline (goals must be completed within X days of registration)
    goals_deadline: Optional[datetime] = None
    days_remaining: Optional[int] = None
    is_expired: bool = False

    # Individual goal progress
    goals: List[GoalProgress]

    # Registration date (for deadline calculation)
    registered_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =============================================================================
# Goal Completion Schemas
# =============================================================================


class GoalCompleteRequest(BaseModel):
    """Request to mark a goal as complete."""

    goal_type: GoalType

    # Verification data (optional, for backend validation)
    verification_data: Optional[dict] = Field(
        None,
        description="Data to verify goal completion (e.g., gallery_id for create_first_gallery)"
    )


class GoalCompleteResponse(BaseModel):
    """Response from completing a goal."""

    success: bool
    message: str

    # Goal info
    goal_type: GoalType
    goal_title: str

    # Reward
    credits_awarded: int = 0
    new_credit_balance: Optional[int] = None

    # Already completed case
    already_completed: bool = False
    completed_at: Optional[datetime] = None

    # Expired case
    is_expired: bool = False

    # Updated overall progress
    total_completed: int = 0
    total_goals: int = 5
    progress_percentage: int = 0

    # Bonus for completing all goals
    all_goals_completed: bool = False
    bonus_message: Optional[str] = None


# =============================================================================
# Goal Verification Schemas (Internal)
# =============================================================================


class GoalVerificationResult(BaseModel):
    """Result of verifying a goal completion (internal use)."""

    goal_type: GoalType
    is_verified: bool
    verification_method: str  # "backend_check", "event_trigger", "manual"
    verification_timestamp: datetime
    verification_details: Optional[dict] = None
    error_message: Optional[str] = None


# =============================================================================
# Leaderboard Schemas (Future/Optional)
# =============================================================================


class LeaderboardEntry(BaseModel):
    """Entry in the goals leaderboard."""

    rank: int
    user_id: UUID
    display_name: str
    avatar_url: Optional[str] = None
    goals_completed: int
    credits_earned: int
    completed_at: datetime  # Time when they completed all goals


class LeaderboardResponse(BaseModel):
    """Leaderboard of fastest goal completers."""

    period: str  # "weekly", "monthly", "all_time"
    entries: List[LeaderboardEntry]
    user_rank: Optional[int] = None
    total_participants: int


# =============================================================================
# Goals Stats Schemas
# =============================================================================


class GoalsStatsResponse(BaseModel):
    """Statistics about goals across all users (admin view)."""

    total_users_with_goals: int
    users_completed_all: int
    users_completed_none: int

    # Per-goal completion rates
    completion_rates: dict = Field(
        default_factory=lambda: {
            "upload_profile_logo": 0,
            "create_first_gallery": 0,
            "share_gallery_with_client": 0,
            "enable_2fa": 0,
            "connect_payment_method": 0,
        }
    )

    # Total credits distributed
    total_credits_distributed: int = 0

    # Average completion rate
    average_completion_percentage: float = 0.0

    # Time to completion
    average_days_to_complete_all: Optional[float] = None
