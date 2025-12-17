"""SubscriptionService: Tier limits, trial management, subscription status.

Implements Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 21.2
Enforces Property 11: Tier Limit Enforcement
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from typing import Optional

import asyncpg

from app.config.settings import AppSettings, get_settings
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class SubscriptionError(Exception):
    """Base subscription error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class SubscriptionNotFoundError(SubscriptionError):
    """Subscription not found."""

    def __init__(self, workspace_id: uuid.UUID) -> None:
        super().__init__(
            f"Subscription not found for workspace {workspace_id}",
            "SUBSCRIPTION_NOT_FOUND",
            404,
        )


class TierLimitExceededError(SubscriptionError):
    """Tier limit exceeded."""

    def __init__(self, limit_type: str, current: int, maximum: int) -> None:
        super().__init__(
            f"{limit_type} limit exceeded: {current}/{maximum}",
            "TIER_LIMIT_EXCEEDED",
            402,  # Payment Required
        )
        self.limit_type = limit_type
        self.current = current
        self.maximum = maximum


class TrialExpiredError(SubscriptionError):
    """Trial has expired."""

    def __init__(self) -> None:
        super().__init__(
            "Trial period has expired. Please upgrade to continue.",
            "TRIAL_EXPIRED",
            402,
        )


# ---------------------------------------------------------------------------
# Enums and Data classes
# ---------------------------------------------------------------------------


class SubscriptionStatus(str, Enum):
    """Subscription status values."""

    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    EXPIRED = "expired"


class LimitType(str, Enum):
    """Types of tier limits."""

    STORAGE = "storage_bytes"
    GALLERIES = "max_galleries"
    CLIENTS = "max_clients"
    TEAM_MEMBERS = "max_team_members"
    AI_CREDITS = "ai_credits_monthly"


@dataclass
class Plan:
    """Subscription plan details."""

    plan_id: uuid.UUID
    code: str
    name: str
    price_monthly: Decimal
    price_annual: Optional[Decimal]
    currency: str
    storage_bytes: int
    max_galleries: int
    max_clients: int
    max_team_members: int
    ai_credits_monthly: int
    features: dict


@dataclass
class SubscriptionStatus_:
    """Full subscription status response."""

    workspace_id: uuid.UUID
    plan: Plan
    status: SubscriptionStatus
    is_trial: bool
    trial_days_remaining: Optional[int]
    current_period_start: Optional[datetime]
    current_period_end: Optional[datetime]
    cancel_at_period_end: bool
    # Usage
    storage_used_bytes: int
    galleries_count: int
    clients_count: int
    team_members_count: int
    ai_credits_used: int


@dataclass
class UsageStats:
    """Current workspace usage statistics."""

    storage_used_bytes: int
    galleries_count: int
    clients_count: int
    team_members_count: int
    ai_credits_used: int


@dataclass
class LimitCheckResult:
    """Result of a tier limit check."""

    allowed: bool
    limit_type: str
    current: int
    maximum: int
    message: Optional[str] = None


# ---------------------------------------------------------------------------
# SubscriptionService class
# ---------------------------------------------------------------------------


class SubscriptionService:
    """Stateless service for subscription and tier limit operations."""

    def __init__(self, settings: AppSettings | None = None):
        self._settings = settings or get_settings()

    # -----------------------------------------------------------------------
    # Get subscription status
    # -----------------------------------------------------------------------

    async def get_subscription_status(
        self,
        workspace_id: uuid.UUID,
    ) -> SubscriptionStatus_:
        """Get full subscription status with usage stats.

        Args:
            workspace_id: Workspace UUID

        Returns:
            SubscriptionStatus with plan details, status, and usage.
        """
        pool = await get_postgres_pool()

        # Get subscription with plan
        row = await pool.fetchrow(
            """
            SELECT 
                ws.subscription_id, ws.status, ws.trial_started_at, ws.trial_expires_at,
                ws.current_period_start, ws.current_period_end, ws.cancel_at_period_end,
                p.plan_id, p.code, p.name, p.price_monthly, p.price_annual, p.currency,
                p.storage_bytes, p.max_galleries, p.max_clients, p.max_team_members,
                p.ai_credits_monthly, p.features
            FROM workspace_subscriptions ws
            JOIN plans p ON p.plan_id = ws.plan_id
            WHERE ws.workspace_id = $1
            """,
            workspace_id,
        )

        if not row:
            raise SubscriptionNotFoundError(workspace_id)

        # Get usage stats
        usage = await self._get_usage_stats(pool, workspace_id)

        # Calculate trial days remaining
        trial_days_remaining = None
        is_trial = row["status"] == "trialing"
        
        if is_trial and row["trial_expires_at"]:
            now = datetime.now(timezone.utc)
            delta = row["trial_expires_at"] - now
            trial_days_remaining = max(0, delta.days)

        plan = Plan(
            plan_id=row["plan_id"],
            code=row["code"],
            name=row["name"],
            price_monthly=row["price_monthly"],
            price_annual=row["price_annual"],
            currency=row["currency"],
            storage_bytes=row["storage_bytes"],
            max_galleries=row["max_galleries"],
            max_clients=row["max_clients"],
            max_team_members=row["max_team_members"],
            ai_credits_monthly=row["ai_credits_monthly"],
            features=row["features"] or {},
        )

        return SubscriptionStatus_(
            workspace_id=workspace_id,
            plan=plan,
            status=SubscriptionStatus(row["status"]),
            is_trial=is_trial,
            trial_days_remaining=trial_days_remaining,
            current_period_start=row["current_period_start"],
            current_period_end=row["current_period_end"],
            cancel_at_period_end=row["cancel_at_period_end"],
            storage_used_bytes=usage.storage_used_bytes,
            galleries_count=usage.galleries_count,
            clients_count=usage.clients_count,
            team_members_count=usage.team_members_count,
            ai_credits_used=usage.ai_credits_used,
        )

    # -----------------------------------------------------------------------
    # Check tier limit
    # -----------------------------------------------------------------------

    async def check_tier_limit(
        self,
        workspace_id: uuid.UUID,
        limit_type: LimitType,
        increment: int = 1,
    ) -> LimitCheckResult:
        """Check if an action would exceed tier limits.

        Does NOT block - just returns whether the action is allowed.
        Use enforce_limit() to block and raise exception.

        Args:
            workspace_id: Workspace UUID
            limit_type: Type of limit to check
            increment: How many units to add (default: 1)

        Returns:
            LimitCheckResult with allowed status
        """
        pool = await get_postgres_pool()

        # Get plan limits
        row = await pool.fetchrow(
            """
            SELECT 
                ws.status, ws.trial_expires_at,
                p.storage_bytes, p.max_galleries, p.max_clients, 
                p.max_team_members, p.ai_credits_monthly
            FROM workspace_subscriptions ws
            JOIN plans p ON p.plan_id = ws.plan_id
            WHERE ws.workspace_id = $1
            """,
            workspace_id,
        )

        if not row:
            raise SubscriptionNotFoundError(workspace_id)

        # Check if trial expired
        if row["status"] == "trialing" and row["trial_expires_at"]:
            if datetime.now(timezone.utc) > row["trial_expires_at"]:
                return LimitCheckResult(
                    allowed=False,
                    limit_type="trial",
                    current=0,
                    maximum=0,
                    message="Trial period has expired",
                )

        # Get current usage
        usage = await self._get_usage_stats(pool, workspace_id)

        # Map limit type to values
        limit_map = {
            LimitType.STORAGE: (usage.storage_used_bytes, row["storage_bytes"]),
            LimitType.GALLERIES: (usage.galleries_count, row["max_galleries"]),
            LimitType.CLIENTS: (usage.clients_count, row["max_clients"]),
            LimitType.TEAM_MEMBERS: (usage.team_members_count, row["max_team_members"]),
            LimitType.AI_CREDITS: (usage.ai_credits_used, row["ai_credits_monthly"]),
        }

        current, maximum = limit_map[limit_type]
        new_total = current + increment
        allowed = new_total <= maximum

        return LimitCheckResult(
            allowed=allowed,
            limit_type=limit_type.value,
            current=current,
            maximum=maximum,
            message=None if allowed else f"{limit_type.value} limit would be exceeded",
        )

    # -----------------------------------------------------------------------
    # Enforce tier limit
    # -----------------------------------------------------------------------

    async def enforce_limit(
        self,
        workspace_id: uuid.UUID,
        limit_type: LimitType,
        increment: int = 1,
    ) -> None:
        """Enforce tier limit - raises exception if limit exceeded.

        Property 11: Tier Limit Enforcement

        Args:
            workspace_id: Workspace UUID
            limit_type: Type of limit to check
            increment: How many units to add

        Raises:
            TierLimitExceededError: If action would exceed limit
            TrialExpiredError: If trial has expired
        """
        result = await self.check_tier_limit(workspace_id, limit_type, increment)

        if not result.allowed:
            if result.limit_type == "trial":
                raise TrialExpiredError()
            raise TierLimitExceededError(
                result.limit_type,
                result.current,
                result.maximum,
            )

    # -----------------------------------------------------------------------
    # List available plans
    # -----------------------------------------------------------------------

    async def list_plans(self) -> list[Plan]:
        """List all available subscription plans.

        Returns:
            List of Plan objects ordered by price.
        """
        pool = await get_postgres_pool()

        rows = await pool.fetch(
            """
            SELECT 
                plan_id, code, name, price_monthly, price_annual, currency,
                storage_bytes, max_galleries, max_clients, max_team_members,
                ai_credits_monthly, features
            FROM plans
            ORDER BY price_monthly ASC
            """
        )

        return [
            Plan(
                plan_id=row["plan_id"],
                code=row["code"],
                name=row["name"],
                price_monthly=row["price_monthly"],
                price_annual=row["price_annual"],
                currency=row["currency"],
                storage_bytes=row["storage_bytes"],
                max_galleries=row["max_galleries"],
                max_clients=row["max_clients"],
                max_team_members=row["max_team_members"],
                ai_credits_monthly=row["ai_credits_monthly"],
                features=row["features"] or {},
            )
            for row in rows
        ]

    async def get_plan_by_code(self, code: str) -> Plan:
        """Get plan by code.

        Args:
            code: Plan code (free, starter, professional, business, enterprise)

        Returns:
            Plan object
        """
        pool = await get_postgres_pool()

        row = await pool.fetchrow(
            """
            SELECT 
                plan_id, code, name, price_monthly, price_annual, currency,
                storage_bytes, max_galleries, max_clients, max_team_members,
                ai_credits_monthly, features
            FROM plans WHERE code = $1
            """,
            code.lower(),
        )

        if not row:
            raise SubscriptionError(
                f"Plan '{code}' not found",
                "PLAN_NOT_FOUND",
                404,
            )

        return Plan(
            plan_id=row["plan_id"],
            code=row["code"],
            name=row["name"],
            price_monthly=row["price_monthly"],
            price_annual=row["price_annual"],
            currency=row["currency"],
            storage_bytes=row["storage_bytes"],
            max_galleries=row["max_galleries"],
            max_clients=row["max_clients"],
            max_team_members=row["max_team_members"],
            ai_credits_monthly=row["ai_credits_monthly"],
            features=row["features"] or {},
        )

    # -----------------------------------------------------------------------
    # Upgrade / Change plan
    # -----------------------------------------------------------------------

    async def change_plan(
        self,
        workspace_id: uuid.UUID,
        new_plan_code: str,
        billing_provider: Optional[str] = None,
        billing_subscription_id: Optional[str] = None,
    ) -> SubscriptionStatus_:
        """Change workspace subscription plan.

        For upgrades during trial, trial status is converted to active.
        
        Args:
            workspace_id: Workspace UUID
            new_plan_code: New plan code
            billing_provider: Payment provider (stripe, razorpay)
            billing_subscription_id: External subscription ID

        Returns:
            Updated SubscriptionStatus
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        # Get new plan
        new_plan = await self.get_plan_by_code(new_plan_code)

        async with pool.acquire() as conn:
            async with conn.transaction():
                # Update subscription
                await conn.execute(
                    """
                    UPDATE workspace_subscriptions SET
                        plan_id = $2,
                        status = 'active',
                        current_period_start = $3,
                        current_period_end = $4,
                        billing_provider = $5,
                        billing_subscription_id = $6,
                        updated_at = $3
                    WHERE workspace_id = $1
                    """,
                    workspace_id,
                    new_plan.plan_id,
                    now,
                    now + timedelta(days=30),  # Monthly billing cycle
                    billing_provider,
                    billing_subscription_id,
                )

        logger.info(
            "Subscription plan changed",
            extra={
                "workspace_id": str(workspace_id),
                "new_plan": new_plan_code,
            },
        )

        return await self.get_subscription_status(workspace_id)

    # -----------------------------------------------------------------------
    # Cancel subscription
    # -----------------------------------------------------------------------

    async def cancel_subscription(
        self,
        workspace_id: uuid.UUID,
        at_period_end: bool = True,
    ) -> SubscriptionStatus_:
        """Cancel subscription.

        Args:
            workspace_id: Workspace UUID
            at_period_end: If True, subscription remains active until period end

        Returns:
            Updated SubscriptionStatus
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        if at_period_end:
            # Cancel at period end
            await pool.execute(
                """
                UPDATE workspace_subscriptions SET
                    cancel_at_period_end = TRUE,
                    updated_at = $2
                WHERE workspace_id = $1
                """,
                workspace_id, now,
            )
        else:
            # Immediate cancellation
            await pool.execute(
                """
                UPDATE workspace_subscriptions SET
                    status = 'canceled',
                    updated_at = $2
                WHERE workspace_id = $1
                """,
                workspace_id, now,
            )

        logger.info(
            "Subscription canceled",
            extra={
                "workspace_id": str(workspace_id),
                "at_period_end": at_period_end,
            },
        )

        return await self.get_subscription_status(workspace_id)

    # -----------------------------------------------------------------------
    # Usage tracking (for AI credits)
    # -----------------------------------------------------------------------

    async def consume_ai_credits(
        self,
        workspace_id: uuid.UUID,
        credits: int,
    ) -> int:
        """Consume AI credits from workspace allocation.

        Args:
            workspace_id: Workspace UUID
            credits: Number of credits to consume

        Returns:
            Remaining credits

        Raises:
            TierLimitExceededError: If not enough credits available
        """
        # Check limit first
        await self.enforce_limit(workspace_id, LimitType.AI_CREDITS, credits)

        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        # Get current month's usage
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # In a real implementation, we'd have an ai_usage table
        # For now, we'll simulate with audit logs or a dedicated counter
        # This is a placeholder for the actual implementation

        # Get subscription with plan limits
        row = await pool.fetchrow(
            """
            SELECT p.ai_credits_monthly
            FROM workspace_subscriptions ws
            JOIN plans p ON p.plan_id = ws.plan_id
            WHERE ws.workspace_id = $1
            """,
            workspace_id,
        )

        if not row:
            raise SubscriptionNotFoundError(workspace_id)

        # Return remaining (would need actual usage tracking)
        return row["ai_credits_monthly"] - credits

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    async def _get_usage_stats(
        self,
        pool: asyncpg.Pool,
        workspace_id: uuid.UUID,
    ) -> UsageStats:
        """Get current usage statistics for workspace.

        Note: Some stats require additional tables (galleries, photos, etc.)
        that may not exist yet. We return 0 for those.
        """
        # Team members count
        members_row = await pool.fetchrow(
            """
            SELECT COUNT(*) as count
            FROM workspace_memberships
            WHERE workspace_id = $1 AND status = 'active'
            """,
            workspace_id,
        )
        team_members = members_row["count"] if members_row else 0

        # Galleries count (table may not exist yet)
        galleries_count = 0
        try:
            galleries_row = await pool.fetchrow(
                """
                SELECT COUNT(*) as count
                FROM galleries
                WHERE workspace_id = $1
                """,
                workspace_id,
            )
            galleries_count = galleries_row["count"] if galleries_row else 0
        except asyncpg.UndefinedTableError:
            pass

        # Clients count (table may not exist yet)
        clients_count = 0
        try:
            clients_row = await pool.fetchrow(
                """
                SELECT COUNT(*) as count
                FROM clients
                WHERE workspace_id = $1
                """,
                workspace_id,
            )
            clients_count = clients_row["count"] if clients_row else 0
        except asyncpg.UndefinedTableError:
            pass

        # Storage used (would need to aggregate from photos/files table)
        storage_used = 0

        # AI credits used (would need dedicated tracking table)
        ai_credits_used = 0

        return UsageStats(
            storage_used_bytes=storage_used,
            galleries_count=galleries_count,
            clients_count=clients_count,
            team_members_count=team_members,
            ai_credits_used=ai_credits_used,
        )


# ---------------------------------------------------------------------------
# Background job: Expire trials
# ---------------------------------------------------------------------------


async def expire_trials_job() -> int:
    """Background job to expire trial subscriptions.

    Should be run daily.

    Returns:
        Number of subscriptions expired.
    """
    pool = await get_postgres_pool()
    now = datetime.now(timezone.utc)

    result = await pool.execute(
        """
        UPDATE workspace_subscriptions SET
            status = 'expired',
            updated_at = $1
        WHERE status = 'trialing' AND trial_expires_at < $1
        """,
        now,
    )

    count = int(result.split()[-1]) if result else 0
    
    if count > 0:
        logger.info(
            "Expired trial subscriptions",
            extra={"count": count},
        )

    return count
