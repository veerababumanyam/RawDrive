"""Repository for subscription data operations.

This module provides the SubscriptionRepository class that handles all CRUD
operations for workspace subscriptions, with proper workspace isolation
for multi-tenant security.

All queries enforce workspace_id filtering to ensure data isolation
between tenants. The repository supports Stripe integration for webhook
handling through lookups by Stripe customer and subscription IDs.

Feature: Automated Onboarding System
Task: T010 - Create SubscriptionRepository for subscription CRUD
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID, uuid4

from src.database import get_pool


logger = logging.getLogger(__name__)


class SubscriptionRepository:
    """Data access layer for workspace subscription records.

    This repository handles all CRUD operations for subscriptions, ensuring
    proper workspace isolation for multi-tenant security.

    All methods that access data require workspace_id to enforce
    tenant isolation at the data layer.

    Key Features:
    - Workspace isolation for all operations
    - Stripe integration support (customer ID, subscription ID lookups)
    - Full subscription lifecycle management
    - Trial period and billing cycle tracking
    """

    # =========================================================================
    # SUBSCRIPTION CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        workspace_id: UUID,
        plan_id: UUID,
        status: str = "trialing",
        billing_interval: str = "monthly",
        currency: str = "INR",
        amount_per_period: Optional[Decimal] = None,
        trial_started_at: Optional[datetime] = None,
        trial_expires_at: Optional[datetime] = None,
        current_period_start: Optional[datetime] = None,
        current_period_end: Optional[datetime] = None,
        stripe_customer_id: Optional[str] = None,
        stripe_subscription_id: Optional[str] = None,
        stripe_payment_method_id: Optional[str] = None,
        billing_provider: Optional[str] = None,
        billing_customer_id: Optional[str] = None,
        billing_subscription_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new subscription record.

        Args:
            workspace_id: Workspace ID for tenant isolation
            plan_id: Associated subscription plan ID
            status: Subscription status (default: trialing)
            billing_interval: Billing frequency (monthly/annual)
            currency: Billing currency code (default: INR)
            amount_per_period: Amount billed per period
            trial_started_at: When trial started
            trial_expires_at: When trial expires
            current_period_start: Start of current billing period
            current_period_end: End of current billing period
            stripe_customer_id: Stripe Customer ID (cus_xxx)
            stripe_subscription_id: Stripe Subscription ID (sub_xxx)
            stripe_payment_method_id: Stripe Payment Method ID (pm_xxx)
            billing_provider: Legacy payment provider field
            billing_customer_id: Legacy customer ID field
            billing_subscription_id: Legacy subscription ID field
            metadata: Additional data (onboarding source, promo codes, etc.)

        Returns:
            Created subscription record as dict
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            subscription_id = uuid4()
            row = await conn.fetchrow(
                """
                INSERT INTO workspace_subscriptions (
                    subscription_id, workspace_id, plan_id, status,
                    billing_interval, currency, amount_per_period,
                    trial_started_at, trial_expires_at,
                    current_period_start, current_period_end,
                    stripe_customer_id, stripe_subscription_id, stripe_payment_method_id,
                    billing_provider, billing_customer_id, billing_subscription_id,
                    metadata
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18
                )
                RETURNING *
                """,
                subscription_id,
                workspace_id,
                plan_id,
                status,
                billing_interval,
                currency,
                amount_per_period,
                trial_started_at,
                trial_expires_at,
                current_period_start,
                current_period_end,
                stripe_customer_id,
                stripe_subscription_id,
                stripe_payment_method_id,
                billing_provider,
                billing_customer_id,
                billing_subscription_id,
                metadata or {},
            )

            logger.info(
                "Subscription created",
                extra={
                    "subscription_id": str(subscription_id),
                    "workspace_id": str(workspace_id),
                    "plan_id": str(plan_id),
                    "status": status,
                },
            )

            return self._row_to_dict(row)

    async def create_trial(
        self,
        workspace_id: UUID,
        plan_id: UUID,
        trial_days: int,
        billing_interval: str = "monthly",
        currency: str = "INR",
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new subscription with a trial period.

        Convenience method that automatically sets trial dates based on
        the specified trial period.

        Args:
            workspace_id: Workspace ID for tenant isolation
            plan_id: Associated subscription plan ID
            trial_days: Number of days for the trial period
            billing_interval: Billing frequency after trial (monthly/annual)
            currency: Billing currency code (default: INR)
            metadata: Additional data

        Returns:
            Created subscription record as dict
        """
        now = datetime.now(timezone.utc)
        trial_expires_at = datetime.fromtimestamp(
            now.timestamp() + (trial_days * 24 * 60 * 60),
            tz=timezone.utc,
        )

        return await self.create(
            workspace_id=workspace_id,
            plan_id=plan_id,
            status="trialing",
            billing_interval=billing_interval,
            currency=currency,
            trial_started_at=now,
            trial_expires_at=trial_expires_at,
            metadata=metadata,
        )

    # =========================================================================
    # SUBSCRIPTION READ OPERATIONS
    # =========================================================================

    async def get_by_id(
        self,
        workspace_id: UUID,
        subscription_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single subscription by ID with workspace isolation.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subscription_id: Subscription ID to retrieve

        Returns:
            Subscription record as dict or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM workspace_subscriptions
                WHERE subscription_id = $1 AND workspace_id = $2
                """,
                subscription_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_workspace(
        self,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get the active or most recent subscription for a workspace.

        Returns the subscription with priority: active > trialing > others.
        Useful for getting the "current" subscription for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Subscription record as dict or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM workspace_subscriptions
                WHERE workspace_id = $1
                ORDER BY
                    CASE status
                        WHEN 'active' THEN 1
                        WHEN 'trialing' THEN 2
                        WHEN 'past_due' THEN 3
                        WHEN 'paused' THEN 4
                        WHEN 'canceled' THEN 5
                        ELSE 6
                    END,
                    created_at DESC
                LIMIT 1
                """,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_active_by_workspace(
        self,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get the active subscription for a workspace.

        Returns subscription only if status is 'active' or 'trialing'.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Subscription record as dict or None if no active subscription
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM workspace_subscriptions
                WHERE workspace_id = $1
                  AND status IN ('active', 'trialing')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_stripe_customer_id(
        self,
        stripe_customer_id: str,
    ) -> Optional[dict[str, Any]]:
        """Get subscription by Stripe Customer ID.

        Used for webhook handling when Stripe sends customer-related events.
        Note: Does not require workspace_id as Stripe IDs are globally unique.

        Args:
            stripe_customer_id: Stripe Customer ID (cus_xxx)

        Returns:
            Subscription record as dict or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM workspace_subscriptions
                WHERE stripe_customer_id = $1
                ORDER BY created_at DESC
                LIMIT 1
                """,
                stripe_customer_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_stripe_subscription_id(
        self,
        stripe_subscription_id: str,
    ) -> Optional[dict[str, Any]]:
        """Get subscription by Stripe Subscription ID.

        Used for webhook handling when Stripe sends subscription-related events.
        Note: Does not require workspace_id as Stripe IDs are globally unique.

        Args:
            stripe_subscription_id: Stripe Subscription ID (sub_xxx)

        Returns:
            Subscription record as dict or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM workspace_subscriptions
                WHERE stripe_subscription_id = $1
                """,
                stripe_subscription_id,
            )
            return self._row_to_dict(row) if row else None

    async def list_by_workspace(
        self,
        workspace_id: UUID,
        include_canceled: bool = False,
    ) -> list[dict[str, Any]]:
        """List all subscriptions for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            include_canceled: Whether to include canceled/expired subscriptions

        Returns:
            List of subscription records
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            if include_canceled:
                rows = await conn.fetch(
                    """
                    SELECT * FROM workspace_subscriptions
                    WHERE workspace_id = $1
                    ORDER BY created_at DESC
                    """,
                    workspace_id,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM workspace_subscriptions
                    WHERE workspace_id = $1
                      AND status NOT IN ('canceled', 'expired')
                    ORDER BY created_at DESC
                    """,
                    workspace_id,
                )
            return [self._row_to_dict(row) for row in rows]

    async def list_by_status(
        self,
        status: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List subscriptions filtered by status.

        Admin/system method for monitoring subscriptions across workspaces.

        Args:
            status: Subscription status to filter by
            limit: Maximum number of records to return
            offset: Number of records to skip

        Returns:
            List of subscription records with the specified status
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM workspace_subscriptions
                WHERE status = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                status,
                limit,
                offset,
            )
            return [self._row_to_dict(row) for row in rows]

    async def list_expiring_soon(
        self,
        days: int = 7,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """List subscriptions expiring within the specified number of days.

        Used for sending renewal reminders and handling upcoming expirations.
        Returns both trialing subscriptions about to expire and subscriptions
        set to cancel at period end.

        Args:
            days: Number of days to look ahead
            limit: Maximum number of records to return

        Returns:
            List of subscription records expiring soon
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM workspace_subscriptions
                WHERE (
                    -- Trials expiring soon
                    (status = 'trialing' AND trial_expires_at <= NOW() + INTERVAL '1 day' * $1)
                    OR
                    -- Subscriptions set to cancel at period end
                    (cancel_at_period_end = TRUE AND current_period_end <= NOW() + INTERVAL '1 day' * $1)
                    OR
                    -- Subscriptions with explicit expiry
                    (expires_at IS NOT NULL AND expires_at <= NOW() + INTERVAL '1 day' * $1)
                )
                AND status NOT IN ('canceled', 'expired')
                ORDER BY COALESCE(trial_expires_at, expires_at, current_period_end) ASC
                LIMIT $2
                """,
                days,
                limit,
            )
            return [self._row_to_dict(row) for row in rows]

    async def list_past_due(
        self,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """List all past due subscriptions.

        Used for dunning workflows and payment retry logic.

        Args:
            limit: Maximum number of records to return

        Returns:
            List of past due subscription records
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM workspace_subscriptions
                WHERE status = 'past_due'
                ORDER BY failed_payment_count DESC, updated_at ASC
                LIMIT $1
                """,
                limit,
            )
            return [self._row_to_dict(row) for row in rows]

    async def list_by_plan(
        self,
        plan_id: UUID,
        active_only: bool = True,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List subscriptions for a specific plan.

        Useful for plan migration or understanding plan usage.

        Args:
            plan_id: Plan ID to filter by
            active_only: Whether to only include active/trialing subscriptions
            limit: Maximum number of records to return
            offset: Number of records to skip

        Returns:
            List of subscription records for the plan
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            if active_only:
                rows = await conn.fetch(
                    """
                    SELECT * FROM workspace_subscriptions
                    WHERE plan_id = $1
                      AND status IN ('active', 'trialing')
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                    """,
                    plan_id,
                    limit,
                    offset,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM workspace_subscriptions
                    WHERE plan_id = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                    """,
                    plan_id,
                    limit,
                    offset,
                )
            return [self._row_to_dict(row) for row in rows]

    # =========================================================================
    # SUBSCRIPTION UPDATE OPERATIONS
    # =========================================================================

    async def update(
        self,
        workspace_id: UUID,
        subscription_id: UUID,
        plan_id: Optional[UUID] = None,
        status: Optional[str] = None,
        billing_interval: Optional[str] = None,
        currency: Optional[str] = None,
        amount_per_period: Optional[Decimal] = None,
        trial_started_at: Optional[datetime] = None,
        trial_expires_at: Optional[datetime] = None,
        current_period_start: Optional[datetime] = None,
        current_period_end: Optional[datetime] = None,
        stripe_customer_id: Optional[str] = None,
        stripe_subscription_id: Optional[str] = None,
        stripe_payment_method_id: Optional[str] = None,
        billing_provider: Optional[str] = None,
        billing_customer_id: Optional[str] = None,
        billing_subscription_id: Optional[str] = None,
        activated_at: Optional[datetime] = None,
        canceled_at: Optional[datetime] = None,
        cancellation_reason: Optional[str] = None,
        cancel_at_period_end: Optional[bool] = None,
        expires_at: Optional[datetime] = None,
        payment_status: Optional[str] = None,
        last_payment_at: Optional[datetime] = None,
        next_payment_at: Optional[datetime] = None,
        failed_payment_count: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        """Update an existing subscription.

        Only updates fields that are explicitly provided (not None).
        The updated_at timestamp is automatically set by database trigger.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subscription_id: Subscription ID to update
            (other args): Fields to update (see create() for descriptions)

        Returns:
            Updated subscription record or None if not found
        """
        # Build dynamic update query based on provided fields
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        # Map field names to their values
        field_updates = {
            "plan_id": plan_id,
            "status": status,
            "billing_interval": billing_interval,
            "currency": currency,
            "amount_per_period": amount_per_period,
            "trial_started_at": trial_started_at,
            "trial_expires_at": trial_expires_at,
            "current_period_start": current_period_start,
            "current_period_end": current_period_end,
            "stripe_customer_id": stripe_customer_id,
            "stripe_subscription_id": stripe_subscription_id,
            "stripe_payment_method_id": stripe_payment_method_id,
            "billing_provider": billing_provider,
            "billing_customer_id": billing_customer_id,
            "billing_subscription_id": billing_subscription_id,
            "activated_at": activated_at,
            "canceled_at": canceled_at,
            "cancellation_reason": cancellation_reason,
            "cancel_at_period_end": cancel_at_period_end,
            "expires_at": expires_at,
            "payment_status": payment_status,
            "last_payment_at": last_payment_at,
            "next_payment_at": next_payment_at,
            "failed_payment_count": failed_payment_count,
            "metadata": metadata,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            # No fields to update, just return current record
            return await self.get_by_id(workspace_id, subscription_id)

        # Add subscription_id and workspace_id as final parameters
        params.append(subscription_id)
        params.append(workspace_id)

        pool = await get_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE workspace_subscriptions
                SET {", ".join(updates)}
                WHERE subscription_id = ${param_index} AND workspace_id = ${param_index + 1}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)

            if row:
                logger.info(
                    "Subscription updated",
                    extra={
                        "subscription_id": str(subscription_id),
                        "workspace_id": str(workspace_id),
                        "updated_fields": [k for k, v in field_updates.items() if v is not None],
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_status(
        self,
        workspace_id: UUID,
        subscription_id: UUID,
        status: str,
    ) -> Optional[dict[str, Any]]:
        """Update subscription status.

        Convenience method for changing subscription lifecycle status.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subscription_id: Subscription ID to update
            status: New status (trialing, active, past_due, canceled, expired, paused)

        Returns:
            Updated subscription record or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE workspace_subscriptions
                SET status = $3
                WHERE subscription_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                subscription_id,
                workspace_id,
                status,
            )

            if row:
                logger.info(
                    "Subscription status updated",
                    extra={
                        "subscription_id": str(subscription_id),
                        "workspace_id": str(workspace_id),
                        "new_status": status,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_payment_status(
        self,
        workspace_id: UUID,
        subscription_id: UUID,
        payment_status: str,
        last_payment_at: Optional[datetime] = None,
        next_payment_at: Optional[datetime] = None,
        failed_payment_count: Optional[int] = None,
    ) -> Optional[dict[str, Any]]:
        """Update subscription payment status.

        Convenience method for updating payment-related fields.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subscription_id: Subscription ID to update
            payment_status: New payment status (none, succeeded, pending, failed, requires_action)
            last_payment_at: Optional last successful payment timestamp
            next_payment_at: Optional next scheduled payment timestamp
            failed_payment_count: Optional failed payment count

        Returns:
            Updated subscription record or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE workspace_subscriptions
                SET payment_status = $3,
                    last_payment_at = COALESCE($4, last_payment_at),
                    next_payment_at = COALESCE($5, next_payment_at),
                    failed_payment_count = COALESCE($6, failed_payment_count)
                WHERE subscription_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                subscription_id,
                workspace_id,
                payment_status,
                last_payment_at,
                next_payment_at,
                failed_payment_count,
            )

            if row:
                logger.info(
                    "Subscription payment status updated",
                    extra={
                        "subscription_id": str(subscription_id),
                        "workspace_id": str(workspace_id),
                        "payment_status": payment_status,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_stripe_ids(
        self,
        workspace_id: UUID,
        subscription_id: UUID,
        stripe_customer_id: Optional[str] = None,
        stripe_subscription_id: Optional[str] = None,
        stripe_payment_method_id: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update Stripe integration IDs for a subscription.

        Convenience method for setting up Stripe associations.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subscription_id: Subscription ID to update
            stripe_customer_id: Stripe Customer ID (cus_xxx)
            stripe_subscription_id: Stripe Subscription ID (sub_xxx)
            stripe_payment_method_id: Stripe Payment Method ID (pm_xxx)

        Returns:
            Updated subscription record or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE workspace_subscriptions
                SET stripe_customer_id = COALESCE($3, stripe_customer_id),
                    stripe_subscription_id = COALESCE($4, stripe_subscription_id),
                    stripe_payment_method_id = COALESCE($5, stripe_payment_method_id)
                WHERE subscription_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                subscription_id,
                workspace_id,
                stripe_customer_id,
                stripe_subscription_id,
                stripe_payment_method_id,
            )

            if row:
                logger.info(
                    "Subscription Stripe IDs updated",
                    extra={
                        "subscription_id": str(subscription_id),
                        "workspace_id": str(workspace_id),
                        "stripe_customer_id": stripe_customer_id,
                        "stripe_subscription_id": stripe_subscription_id,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def activate(
        self,
        workspace_id: UUID,
        subscription_id: UUID,
        current_period_start: Optional[datetime] = None,
        current_period_end: Optional[datetime] = None,
        amount_per_period: Optional[Decimal] = None,
    ) -> Optional[dict[str, Any]]:
        """Activate a subscription (convert from trial or set as active).

        Convenience method for transitioning a subscription to active status.
        Sets activated_at timestamp and updates billing period.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subscription_id: Subscription ID to activate
            current_period_start: Start of first billing period
            current_period_end: End of first billing period
            amount_per_period: Amount billed per period

        Returns:
            Updated subscription record or None if not found
        """
        now = datetime.now(timezone.utc)
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE workspace_subscriptions
                SET status = 'active',
                    activated_at = $3,
                    current_period_start = COALESCE($4, $3),
                    current_period_end = $5,
                    amount_per_period = COALESCE($6, amount_per_period),
                    payment_status = 'succeeded'
                WHERE subscription_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                subscription_id,
                workspace_id,
                now,
                current_period_start,
                current_period_end,
                amount_per_period,
            )

            if row:
                logger.info(
                    "Subscription activated",
                    extra={
                        "subscription_id": str(subscription_id),
                        "workspace_id": str(workspace_id),
                        "activated_at": now.isoformat(),
                    },
                )

            return self._row_to_dict(row) if row else None

    async def cancel(
        self,
        workspace_id: UUID,
        subscription_id: UUID,
        cancel_at_period_end: bool = True,
        cancellation_reason: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Cancel a subscription.

        Convenience method for canceling a subscription with optional reason.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subscription_id: Subscription ID to cancel
            cancel_at_period_end: If True, subscription remains active until period end
            cancellation_reason: Optional reason for cancellation

        Returns:
            Updated subscription record or None if not found
        """
        now = datetime.now(timezone.utc)
        pool = await get_pool()
        async with pool.acquire() as conn:
            if cancel_at_period_end:
                # Mark for cancellation at end of period, keep active
                row = await conn.fetchrow(
                    """
                    UPDATE workspace_subscriptions
                    SET canceled_at = $3,
                        cancel_at_period_end = TRUE,
                        cancellation_reason = $4,
                        expires_at = current_period_end
                    WHERE subscription_id = $1 AND workspace_id = $2
                    RETURNING *
                    """,
                    subscription_id,
                    workspace_id,
                    now,
                    cancellation_reason,
                )
            else:
                # Cancel immediately
                row = await conn.fetchrow(
                    """
                    UPDATE workspace_subscriptions
                    SET status = 'canceled',
                        canceled_at = $3,
                        cancel_at_period_end = FALSE,
                        cancellation_reason = $4,
                        expires_at = $3
                    WHERE subscription_id = $1 AND workspace_id = $2
                    RETURNING *
                    """,
                    subscription_id,
                    workspace_id,
                    now,
                    cancellation_reason,
                )

            if row:
                logger.info(
                    "Subscription canceled",
                    extra={
                        "subscription_id": str(subscription_id),
                        "workspace_id": str(workspace_id),
                        "cancel_at_period_end": cancel_at_period_end,
                        "cancellation_reason": cancellation_reason,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def reactivate(
        self,
        workspace_id: UUID,
        subscription_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Reactivate a canceled subscription.

        Clears cancellation flags to allow subscription to continue.
        Only works if subscription hasn't fully expired yet.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subscription_id: Subscription ID to reactivate

        Returns:
            Updated subscription record or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE workspace_subscriptions
                SET canceled_at = NULL,
                    cancel_at_period_end = FALSE,
                    cancellation_reason = NULL,
                    expires_at = NULL,
                    status = CASE
                        WHEN status = 'canceled' AND current_period_end > NOW() THEN 'active'
                        ELSE status
                    END
                WHERE subscription_id = $1
                  AND workspace_id = $2
                  AND (status = 'canceled' OR cancel_at_period_end = TRUE)
                  AND (current_period_end > NOW() OR trial_expires_at > NOW())
                RETURNING *
                """,
                subscription_id,
                workspace_id,
            )

            if row:
                logger.info(
                    "Subscription reactivated",
                    extra={
                        "subscription_id": str(subscription_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return self._row_to_dict(row) if row else None

    async def increment_failed_payment(
        self,
        workspace_id: UUID,
        subscription_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Increment failed payment counter for a subscription.

        Used when a payment attempt fails. Also updates status to past_due
        if not already set.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subscription_id: Subscription ID to update

        Returns:
            Updated subscription record or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE workspace_subscriptions
                SET failed_payment_count = failed_payment_count + 1,
                    payment_status = 'failed',
                    status = CASE
                        WHEN status = 'active' THEN 'past_due'
                        ELSE status
                    END
                WHERE subscription_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                subscription_id,
                workspace_id,
            )

            if row:
                logger.warning(
                    "Subscription payment failed",
                    extra={
                        "subscription_id": str(subscription_id),
                        "workspace_id": str(workspace_id),
                        "failed_payment_count": row["failed_payment_count"],
                    },
                )

            return self._row_to_dict(row) if row else None

    # =========================================================================
    # SUBSCRIPTION DELETE OPERATIONS
    # =========================================================================

    async def delete(
        self,
        workspace_id: UUID,
        subscription_id: UUID,
    ) -> bool:
        """Delete a subscription.

        Warning: This performs a hard delete. Consider using cancel()
        instead, which preserves historical data.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subscription_id: Subscription ID to delete

        Returns:
            True if deleted, False if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM workspace_subscriptions
                WHERE subscription_id = $1 AND workspace_id = $2
                """,
                subscription_id,
                workspace_id,
            )

            deleted = result == "DELETE 1"
            if deleted:
                logger.warning(
                    "Subscription deleted",
                    extra={
                        "subscription_id": str(subscription_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary.

        Handles type conversions for UUIDs, datetimes, and Decimals.

        Args:
            row: asyncpg Record object

        Returns:
            Dictionary representation of the row
        """
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = ["subscription_id", "workspace_id", "plan_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert datetimes to ISO format strings
        datetime_fields = [
            "created_at",
            "updated_at",
            "activated_at",
            "canceled_at",
            "trial_started_at",
            "trial_expires_at",
            "current_period_start",
            "current_period_end",
            "expires_at",
            "last_payment_at",
            "next_payment_at",
        ]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Decimal fields are kept as-is (Decimal) for precision
        # The API layer can convert to float/string as needed

        return result


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_subscription_repository: Optional[SubscriptionRepository] = None


def get_subscription_repository() -> SubscriptionRepository:
    """Get the singleton SubscriptionRepository instance.

    Returns:
        SubscriptionRepository singleton instance
    """
    global _subscription_repository
    if _subscription_repository is None:
        _subscription_repository = SubscriptionRepository()
    return _subscription_repository
