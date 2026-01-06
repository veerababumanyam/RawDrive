"""Repository for subscription plan data operations.

This module provides the PlanRepository class that handles all CRUD
operations for subscription plans, supporting the automated onboarding
system where users select plans on the pricing page.

Note: Plans are system-wide resources, not workspace-specific.
They are shared across all workspaces and do not require workspace
isolation like other repositories.

Feature: Automated Onboarding System
Task: T009 - Create PlanRepository for subscription plan queries
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class PlanRepository:
    """Data access layer for subscription plan records.

    This repository handles all CRUD operations for subscription plans,
    which define pricing, limits, and features for each tier.

    Plans are system-wide and NOT workspace-scoped, as they define
    the available subscription options for all customers.
    """

    # =========================================================================
    # PLAN READ OPERATIONS
    # =========================================================================

    async def get_by_id(
        self,
        plan_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single plan by ID.

        Args:
            plan_id: Plan ID to retrieve

        Returns:
            Plan record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM plans
                WHERE plan_id = $1
                """,
                plan_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_code(
        self,
        code: str,
    ) -> Optional[dict[str, Any]]:
        """Get a plan by its unique code.

        Args:
            code: Plan code (e.g., 'starter', 'professional', 'studio', 'enterprise')

        Returns:
            Plan record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM plans
                WHERE code = $1
                """,
                code.lower(),
            )
            return self._row_to_dict(row) if row else None

    async def get_by_stripe_product_id(
        self,
        stripe_product_id: str,
    ) -> Optional[dict[str, Any]]:
        """Get a plan by its Stripe product ID.

        Used for webhook handling when Stripe sends product-related events.

        Args:
            stripe_product_id: Stripe product ID (prod_xxx)

        Returns:
            Plan record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM plans
                WHERE stripe_product_id = $1
                """,
                stripe_product_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_stripe_price_id(
        self,
        stripe_price_id: str,
    ) -> Optional[dict[str, Any]]:
        """Get a plan by any of its Stripe price IDs.

        Used for webhook handling when Stripe sends price-related events.
        Searches across all price ID fields (monthly/annual, INR/USD).

        Args:
            stripe_price_id: Stripe price ID (price_xxx)

        Returns:
            Plan record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM plans
                WHERE stripe_price_id_monthly = $1
                   OR stripe_price_id_annual = $1
                   OR stripe_price_id_monthly_usd = $1
                   OR stripe_price_id_annual_usd = $1
                """,
                stripe_price_id,
            )
            return self._row_to_dict(row) if row else None

    async def list_active(
        self,
        currency: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """List all active and visible plans for the pricing page.

        Returns plans ordered by display_order for proper presentation
        on the pricing page. Only includes plans that are:
        - status = 'active'
        - is_visible = true

        Args:
            currency: Optional currency filter ('INR' or 'USD')

        Returns:
            List of plan records ordered by display_order
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM plans
                WHERE status = 'active'
                  AND is_visible = TRUE
                ORDER BY display_order ASC
                """,
            )
            plans = [self._row_to_dict(row) for row in rows]

            # If currency specified, adjust pricing display
            if currency and currency.upper() == "USD":
                for plan in plans:
                    # Swap USD prices to primary fields for easier frontend consumption
                    plan["display_price_monthly"] = plan.get("price_monthly_usd")
                    plan["display_price_annual"] = plan.get("price_annual_usd")
                    plan["display_currency"] = "USD"
            else:
                for plan in plans:
                    plan["display_price_monthly"] = plan.get("price_monthly")
                    plan["display_price_annual"] = plan.get("price_annual")
                    plan["display_currency"] = "INR"

            return plans

    async def list_all(
        self,
        include_archived: bool = False,
    ) -> list[dict[str, Any]]:
        """List all plans (for admin purposes).

        Args:
            include_archived: Whether to include archived plans

        Returns:
            List of all plan records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if include_archived:
                rows = await conn.fetch(
                    """
                    SELECT * FROM plans
                    ORDER BY display_order ASC, created_at ASC
                    """,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM plans
                    WHERE status != 'archived'
                    ORDER BY display_order ASC, created_at ASC
                    """,
                )
            return [self._row_to_dict(row) for row in rows]

    async def list_by_status(
        self,
        status: str,
    ) -> list[dict[str, Any]]:
        """List plans filtered by status.

        Args:
            status: Plan status ('active', 'deprecated', 'archived')

        Returns:
            List of plan records with the specified status
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM plans
                WHERE status = $1
                ORDER BY display_order ASC
                """,
                status,
            )
            return [self._row_to_dict(row) for row in rows]

    # =========================================================================
    # PLAN CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        code: str,
        name: str,
        price_monthly: Decimal,
        storage_bytes: int,
        max_galleries: int,
        max_clients: int,
        max_team_members: int,
        ai_credits_monthly: int,
        description: Optional[str] = None,
        price_annual: Optional[Decimal] = None,
        currency: str = "INR",
        price_monthly_usd: Optional[Decimal] = None,
        price_annual_usd: Optional[Decimal] = None,
        max_photos_per_gallery: Optional[int] = None,
        max_downloads_monthly: Optional[int] = None,
        features: Optional[dict[str, Any]] = None,
        watermark_enabled: bool = True,
        custom_branding_enabled: bool = False,
        priority_support: bool = False,
        is_visible: bool = True,
        display_order: int = 0,
        highlight_label: Optional[str] = None,
        feature_bullets: Optional[list[str]] = None,
        status: str = "active",
        trial_days: int = 0,
        is_trial_eligible: bool = False,
        stripe_product_id: Optional[str] = None,
        stripe_price_id_monthly: Optional[str] = None,
        stripe_price_id_annual: Optional[str] = None,
        stripe_price_id_monthly_usd: Optional[str] = None,
        stripe_price_id_annual_usd: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new subscription plan.

        Args:
            code: Unique plan code (lowercase, e.g., 'starter')
            name: Display name for the plan
            price_monthly: Monthly price in primary currency (INR)
            storage_bytes: Storage quota in bytes
            max_galleries: Max galleries (-1 = unlimited)
            max_clients: Max clients (-1 = unlimited)
            max_team_members: Max team members (-1 = unlimited)
            ai_credits_monthly: AI credits per month
            description: Marketing description
            price_annual: Annual price (usually discounted)
            currency: Primary currency code
            price_monthly_usd: Monthly price in USD
            price_annual_usd: Annual price in USD
            max_photos_per_gallery: Max photos per gallery
            max_downloads_monthly: Max downloads per month
            features: Feature flags dict
            watermark_enabled: Whether watermarks are shown
            custom_branding_enabled: Custom branding capability
            priority_support: Priority support access
            is_visible: Whether plan appears on pricing page
            display_order: Order for displaying plans
            highlight_label: Badge text ('Most Popular', etc.)
            feature_bullets: List of feature descriptions
            status: Plan status (active, deprecated, archived)
            trial_days: Default trial period
            is_trial_eligible: Whether plan offers trial
            stripe_product_id: Stripe Product ID
            stripe_price_id_monthly: Stripe Price ID for monthly INR
            stripe_price_id_annual: Stripe Price ID for annual INR
            stripe_price_id_monthly_usd: Stripe Price ID for monthly USD
            stripe_price_id_annual_usd: Stripe Price ID for annual USD

        Returns:
            Created plan record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            plan_id = uuid4()
            row = await conn.fetchrow(
                """
                INSERT INTO plans (
                    plan_id, code, name, description,
                    price_monthly, price_annual, currency,
                    price_monthly_usd, price_annual_usd,
                    storage_bytes, max_galleries, max_clients, max_team_members,
                    ai_credits_monthly, max_photos_per_gallery, max_downloads_monthly,
                    features, watermark_enabled, custom_branding_enabled, priority_support,
                    is_visible, display_order, highlight_label, feature_bullets,
                    status, trial_days, is_trial_eligible,
                    stripe_product_id, stripe_price_id_monthly, stripe_price_id_annual,
                    stripe_price_id_monthly_usd, stripe_price_id_annual_usd
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                    $31, $32
                )
                RETURNING *
                """,
                plan_id,
                code.lower(),
                name,
                description,
                price_monthly,
                price_annual,
                currency,
                price_monthly_usd,
                price_annual_usd,
                storage_bytes,
                max_galleries,
                max_clients,
                max_team_members,
                ai_credits_monthly,
                max_photos_per_gallery,
                max_downloads_monthly,
                features or {},
                watermark_enabled,
                custom_branding_enabled,
                priority_support,
                is_visible,
                display_order,
                highlight_label,
                feature_bullets or [],
                status,
                trial_days,
                is_trial_eligible,
                stripe_product_id,
                stripe_price_id_monthly,
                stripe_price_id_annual,
                stripe_price_id_monthly_usd,
                stripe_price_id_annual_usd,
            )

            logger.info(
                "Plan created",
                extra={
                    "plan_id": str(plan_id),
                    "code": code,
                    "name": name,
                },
            )

            return self._row_to_dict(row)

    # =========================================================================
    # PLAN UPDATE OPERATIONS
    # =========================================================================

    async def update(
        self,
        plan_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        price_monthly: Optional[Decimal] = None,
        price_annual: Optional[Decimal] = None,
        price_monthly_usd: Optional[Decimal] = None,
        price_annual_usd: Optional[Decimal] = None,
        storage_bytes: Optional[int] = None,
        max_galleries: Optional[int] = None,
        max_clients: Optional[int] = None,
        max_team_members: Optional[int] = None,
        ai_credits_monthly: Optional[int] = None,
        max_photos_per_gallery: Optional[int] = None,
        max_downloads_monthly: Optional[int] = None,
        features: Optional[dict[str, Any]] = None,
        watermark_enabled: Optional[bool] = None,
        custom_branding_enabled: Optional[bool] = None,
        priority_support: Optional[bool] = None,
        is_visible: Optional[bool] = None,
        display_order: Optional[int] = None,
        highlight_label: Optional[str] = None,
        feature_bullets: Optional[list[str]] = None,
        status: Optional[str] = None,
        trial_days: Optional[int] = None,
        is_trial_eligible: Optional[bool] = None,
        stripe_product_id: Optional[str] = None,
        stripe_price_id_monthly: Optional[str] = None,
        stripe_price_id_annual: Optional[str] = None,
        stripe_price_id_monthly_usd: Optional[str] = None,
        stripe_price_id_annual_usd: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update an existing plan.

        Only updates fields that are explicitly provided (not None).
        The updated_at timestamp is automatically set by database trigger.

        Args:
            plan_id: Plan ID to update
            (other args): Fields to update (see create() for descriptions)

        Returns:
            Updated plan record or None if not found
        """
        # Build dynamic update query based on provided fields
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        # Map field names to their values
        field_updates = {
            "name": name,
            "description": description,
            "price_monthly": price_monthly,
            "price_annual": price_annual,
            "price_monthly_usd": price_monthly_usd,
            "price_annual_usd": price_annual_usd,
            "storage_bytes": storage_bytes,
            "max_galleries": max_galleries,
            "max_clients": max_clients,
            "max_team_members": max_team_members,
            "ai_credits_monthly": ai_credits_monthly,
            "max_photos_per_gallery": max_photos_per_gallery,
            "max_downloads_monthly": max_downloads_monthly,
            "features": features,
            "watermark_enabled": watermark_enabled,
            "custom_branding_enabled": custom_branding_enabled,
            "priority_support": priority_support,
            "is_visible": is_visible,
            "display_order": display_order,
            "highlight_label": highlight_label,
            "feature_bullets": feature_bullets,
            "status": status,
            "trial_days": trial_days,
            "is_trial_eligible": is_trial_eligible,
            "stripe_product_id": stripe_product_id,
            "stripe_price_id_monthly": stripe_price_id_monthly,
            "stripe_price_id_annual": stripe_price_id_annual,
            "stripe_price_id_monthly_usd": stripe_price_id_monthly_usd,
            "stripe_price_id_annual_usd": stripe_price_id_annual_usd,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            # No fields to update, just return current record
            return await self.get_by_id(plan_id)

        # Add plan_id as final parameter
        params.append(plan_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE plans
                SET {", ".join(updates)}
                WHERE plan_id = ${param_index}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)

            if row:
                logger.info(
                    "Plan updated",
                    extra={
                        "plan_id": str(plan_id),
                        "updated_fields": list(field_updates.keys()),
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_status(
        self,
        plan_id: UUID,
        status: str,
    ) -> Optional[dict[str, Any]]:
        """Update plan status.

        Convenience method for changing plan lifecycle status.

        Args:
            plan_id: Plan ID to update
            status: New status ('active', 'deprecated', 'archived')

        Returns:
            Updated plan record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE plans
                SET status = $2
                WHERE plan_id = $1
                RETURNING *
                """,
                plan_id,
                status,
            )

            if row:
                logger.info(
                    "Plan status updated",
                    extra={
                        "plan_id": str(plan_id),
                        "new_status": status,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_stripe_ids(
        self,
        plan_id: UUID,
        stripe_product_id: Optional[str] = None,
        stripe_price_id_monthly: Optional[str] = None,
        stripe_price_id_annual: Optional[str] = None,
        stripe_price_id_monthly_usd: Optional[str] = None,
        stripe_price_id_annual_usd: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update Stripe integration IDs for a plan.

        Convenience method for setting up Stripe product/price associations.

        Args:
            plan_id: Plan ID to update
            stripe_product_id: Stripe Product ID
            stripe_price_id_monthly: Stripe Price ID for monthly INR
            stripe_price_id_annual: Stripe Price ID for annual INR
            stripe_price_id_monthly_usd: Stripe Price ID for monthly USD
            stripe_price_id_annual_usd: Stripe Price ID for annual USD

        Returns:
            Updated plan record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE plans
                SET stripe_product_id = COALESCE($2, stripe_product_id),
                    stripe_price_id_monthly = COALESCE($3, stripe_price_id_monthly),
                    stripe_price_id_annual = COALESCE($4, stripe_price_id_annual),
                    stripe_price_id_monthly_usd = COALESCE($5, stripe_price_id_monthly_usd),
                    stripe_price_id_annual_usd = COALESCE($6, stripe_price_id_annual_usd)
                WHERE plan_id = $1
                RETURNING *
                """,
                plan_id,
                stripe_product_id,
                stripe_price_id_monthly,
                stripe_price_id_annual,
                stripe_price_id_monthly_usd,
                stripe_price_id_annual_usd,
            )

            if row:
                logger.info(
                    "Plan Stripe IDs updated",
                    extra={
                        "plan_id": str(plan_id),
                        "stripe_product_id": stripe_product_id,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_visibility(
        self,
        plan_id: UUID,
        is_visible: bool,
        display_order: Optional[int] = None,
    ) -> Optional[dict[str, Any]]:
        """Update plan visibility settings.

        Convenience method for showing/hiding plans on pricing page.

        Args:
            plan_id: Plan ID to update
            is_visible: Whether plan should appear on pricing page
            display_order: Optional new display order

        Returns:
            Updated plan record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if display_order is not None:
                row = await conn.fetchrow(
                    """
                    UPDATE plans
                    SET is_visible = $2, display_order = $3
                    WHERE plan_id = $1
                    RETURNING *
                    """,
                    plan_id,
                    is_visible,
                    display_order,
                )
            else:
                row = await conn.fetchrow(
                    """
                    UPDATE plans
                    SET is_visible = $2
                    WHERE plan_id = $1
                    RETURNING *
                    """,
                    plan_id,
                    is_visible,
                )

            return self._row_to_dict(row) if row else None

    # =========================================================================
    # PLAN DELETE OPERATIONS
    # =========================================================================

    async def delete(
        self,
        plan_id: UUID,
    ) -> bool:
        """Delete a plan.

        Warning: This performs a hard delete. Consider using update_status()
        to archive the plan instead, which preserves historical data.

        Args:
            plan_id: Plan ID to delete

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM plans
                WHERE plan_id = $1
                """,
                plan_id,
            )

            deleted = result == "DELETE 1"
            if deleted:
                logger.warning(
                    "Plan deleted",
                    extra={"plan_id": str(plan_id)},
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

        # Convert UUID to string
        if "plan_id" in result and result["plan_id"] is not None:
            result["plan_id"] = str(result["plan_id"])

        # Convert datetimes to ISO format strings
        datetime_fields = ["created_at", "updated_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Decimal fields are kept as-is (Decimal) for precision
        # The API layer can convert to float/string as needed

        return result


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_plan_repository: Optional[PlanRepository] = None


def get_plan_repository() -> PlanRepository:
    """Get the singleton PlanRepository instance.

    Returns:
        PlanRepository singleton instance
    """
    global _plan_repository
    if _plan_repository is None:
        _plan_repository = PlanRepository()
    return _plan_repository
