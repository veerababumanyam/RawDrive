"""
Business logic service for credit ledger operations.

Handles:
- Credit balance management (AI credits & bill credits)
- Transaction creation with ACID compliance
- Integration with billing service for credit application
"""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Tuple
from uuid import UUID

from src.cache.redis_client import redis_client
from src.config import settings
from src.logging import get_logger
from src.observability.metrics import increment_credits_awarded
from src.repositories.credit_repository import credit_repository
from src.schemas.credit import (
    ApplyCreditRequest,
    ApplyCreditResponse,
    CreditBalanceResponse,
    CreditSummaryResponse,
    CreditTransactionListResponse,
    CreditTransactionResponse,
    CreditType,
    TransactionHistoryRequest,
    TransactionSource,
    TransactionType,
    UseCreditRequest,
    UseCreditResponse,
)

logger = get_logger(__name__)


class CreditLedgerService:
    """Service for credit ledger operations."""

    def __init__(self):
        self.repository = credit_repository

    # =========================================================================
    # Balance Operations
    # =========================================================================

    async def get_balance(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> CreditBalanceResponse:
        """Get all credit balances for a user."""
        # Check cache first
        cache_key = f"balance:{user_id}"
        cached = await redis_client.get_json(cache_key)
        if cached:
            return CreditBalanceResponse(**cached)

        # Get all balances
        balances = await self.repository.get_all_balances(user_id, workspace_id)

        # Build response
        response = CreditBalanceResponse(
            user_id=user_id,
            workspace_id=workspace_id,
        )

        for balance in balances:
            if balance["credit_type"] == "ai_credits":
                response.ai_credits_balance = balance["balance"]
                response.total_ai_credits_earned = balance.get("total_earned", Decimal("0.00"))
                response.total_ai_credits_used = balance.get("total_used", Decimal("0.00"))
            elif balance["credit_type"] == "bill_credits":
                response.bill_credits_balance = balance["balance"]
                response.bill_credits_currency = balance.get("currency", "INR")
                response.total_bill_credits_earned = balance.get("total_earned", Decimal("0.00"))
                response.total_bill_credits_used = balance.get("total_used", Decimal("0.00"))

        response.last_updated = datetime.utcnow()

        # Cache result
        await redis_client.set_json(
            cache_key,
            response.model_dump(mode="json"),
            ttl=settings.CACHE_TTL_CREDIT_BALANCE,
        )

        return response

    async def get_single_balance(
        self,
        user_id: UUID,
        workspace_id: UUID,
        credit_type: CreditType,
    ) -> Decimal:
        """Get balance for a specific credit type."""
        balance = await self.repository.get_balance(
            user_id, workspace_id, credit_type.value
        )
        return balance["balance"] if balance else Decimal("0.00")

    # =========================================================================
    # Credit Application Operations
    # =========================================================================

    async def add_credits(
        self,
        user_id: UUID,
        workspace_id: UUID,
        request: ApplyCreditRequest,
    ) -> ApplyCreditResponse:
        """Add credits to a user's balance."""
        # Validate amount
        if request.amount <= 0:
            return ApplyCreditResponse(
                success=False,
                message="Amount must be positive",
                new_balance=await self.get_single_balance(
                    user_id, workspace_id, request.credit_type
                ),
            )

        # Check max balance limit (fraud prevention)
        current_balance = await self.get_single_balance(
            user_id, workspace_id, request.credit_type
        )
        if current_balance + request.amount > settings.CREDIT_MAX_BALANCE:
            return ApplyCreditResponse(
                success=False,
                message=f"Credit balance would exceed maximum limit of {settings.CREDIT_MAX_BALANCE}",
                new_balance=current_balance,
            )

        # Determine currency based on credit type
        currency = "INR" if request.credit_type == CreditType.BILL_CREDITS else None

        # Add credits
        transaction = await self.repository.add_credit(
            user_id=user_id,
            workspace_id=workspace_id,
            credit_type=request.credit_type.value,
            amount=request.amount,
            source=request.source.value,
            description=request.description,
            currency=currency,
            reference_type=request.reference_type,
            reference_id=request.reference_id,
            idempotency_key=request.idempotency_key,
        )

        if not transaction:
            return ApplyCreditResponse(
                success=False,
                message="Failed to add credits",
                new_balance=current_balance,
            )

        # Invalidate cache
        cache_key = f"balance:{user_id}"
        await redis_client.delete(cache_key)

        # Track metric
        increment_credits_awarded(
            request.credit_type.value,
            request.source.value,
            float(request.amount),
        )

        logger.info(
            "Credits added",
            extra={
                "user_id": str(user_id),
                "credit_type": request.credit_type.value,
                "amount": str(request.amount),
                "source": request.source.value,
            },
        )

        return ApplyCreditResponse(
            success=True,
            transaction_id=transaction["transaction_id"],
            message=f"Added {request.amount} {request.credit_type.value}",
            new_balance=transaction["balance_after"],
        )

    async def use_credits(
        self,
        user_id: UUID,
        workspace_id: UUID,
        request: UseCreditRequest,
    ) -> UseCreditResponse:
        """Use (deduct) credits from a user's balance."""
        # Validate amount
        if request.amount <= 0:
            return UseCreditResponse(
                success=False,
                message="Amount must be positive",
                amount_deducted=Decimal("0.00"),
                new_balance=await self.get_single_balance(
                    user_id, workspace_id, request.credit_type
                ),
                insufficient_balance=False,
            )

        # Deduct credits
        transaction, insufficient = await self.repository.deduct_credit(
            user_id=user_id,
            workspace_id=workspace_id,
            credit_type=request.credit_type.value,
            amount=request.amount,
            description=request.description,
            reference_type=request.reference_type,
            reference_id=request.reference_id,
            idempotency_key=request.idempotency_key,
        )

        if insufficient:
            current_balance = await self.get_single_balance(
                user_id, workspace_id, request.credit_type
            )
            return UseCreditResponse(
                success=False,
                message="Insufficient credit balance",
                amount_deducted=Decimal("0.00"),
                new_balance=current_balance,
                insufficient_balance=True,
            )

        if not transaction:
            return UseCreditResponse(
                success=False,
                message="Failed to deduct credits",
                amount_deducted=Decimal("0.00"),
                new_balance=await self.get_single_balance(
                    user_id, workspace_id, request.credit_type
                ),
                insufficient_balance=False,
            )

        # Invalidate cache
        cache_key = f"balance:{user_id}"
        await redis_client.delete(cache_key)

        logger.info(
            "Credits used",
            extra={
                "user_id": str(user_id),
                "credit_type": request.credit_type.value,
                "amount": str(request.amount),
            },
        )

        return UseCreditResponse(
            success=True,
            transaction_id=transaction["transaction_id"],
            message=f"Used {request.amount} {request.credit_type.value}",
            amount_deducted=request.amount,
            new_balance=transaction["balance_after"],
            insufficient_balance=False,
        )

    # =========================================================================
    # Transaction History
    # =========================================================================

    async def get_transactions(
        self,
        user_id: UUID,
        workspace_id: UUID,
        request: TransactionHistoryRequest,
    ) -> CreditTransactionListResponse:
        """Get paginated transaction history."""
        transactions, total = await self.repository.get_transactions(
            user_id=user_id,
            workspace_id=workspace_id,
            credit_type=request.credit_type.value if request.credit_type else None,
            transaction_type=request.transaction_type.value if request.transaction_type else None,
            source=request.source.value if request.source else None,
            start_date=request.start_date,
            end_date=request.end_date,
            page=request.page,
            page_size=request.page_size,
        )

        items = [self._to_transaction_response(t) for t in transactions]

        return CreditTransactionListResponse(
            items=items,
            total=total,
            page=request.page,
            page_size=request.page_size,
            has_more=(request.page * request.page_size) < total,
        )

    async def get_summary(
        self,
        user_id: UUID,
        workspace_id: UUID,
        start_date: datetime,
        end_date: datetime,
    ) -> CreditSummaryResponse:
        """Get credit summary for a time period."""
        summary = await self.repository.get_summary(
            user_id, workspace_id, start_date, end_date
        )

        earnings_by_source = await self.repository.get_earnings_by_source(
            user_id, workspace_id, start_date, end_date
        )

        return CreditSummaryResponse(
            user_id=user_id,
            period_start=start_date,
            period_end=end_date,
            ai_credits_earned=summary.get("ai_credits_earned", Decimal("0.00")),
            ai_credits_used=summary.get("ai_credits_used", Decimal("0.00")),
            ai_credits_net=summary.get("ai_credits_net", Decimal("0.00")),
            bill_credits_earned=summary.get("bill_credits_earned", Decimal("0.00")),
            bill_credits_used=summary.get("bill_credits_used", Decimal("0.00")),
            bill_credits_net=summary.get("bill_credits_net", Decimal("0.00")),
            earnings_by_source=earnings_by_source,
        )

    # =========================================================================
    # Reward Distribution (used by other services)
    # =========================================================================

    async def award_referral_reward(
        self,
        user_id: UUID,
        workspace_id: UUID,
        amount: Decimal,
        conversion_id: UUID,
        is_referee: bool = False,
    ) -> bool:
        """Award referral reward credits.

        Args:
            is_referee: If True, award to the new user (referee), else to referrer
        """
        description = (
            "Referral reward - Welcome bonus"
            if is_referee
            else "Referral reward - Your referral converted!"
        )

        result = await self.add_credits(
            user_id=user_id,
            workspace_id=workspace_id,
            request=ApplyCreditRequest(
                credit_type=CreditType.BILL_CREDITS,
                amount=amount,
                source=TransactionSource.REFERRAL_REWARD,
                description=description,
                reference_type="referral_conversion",
                reference_id=conversion_id,
                idempotency_key=f"referral_{conversion_id}_{'referee' if is_referee else 'referrer'}",
            ),
        )

        return result.success

    async def award_goal_credits(
        self,
        user_id: UUID,
        workspace_id: UUID,
        goal_type: str,
        amount: int,
    ) -> bool:
        """Award credits for completing a setup goal."""
        result = await self.add_credits(
            user_id=user_id,
            workspace_id=workspace_id,
            request=ApplyCreditRequest(
                credit_type=CreditType.AI_CREDITS,
                amount=Decimal(str(amount)),
                source=TransactionSource.SETUP_GOAL,
                description=f"Setup goal completed: {goal_type}",
                reference_type="setup_goal",
                idempotency_key=f"goal_{user_id}_{goal_type}",
            ),
        )

        return result.success

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _to_transaction_response(self, data: dict) -> CreditTransactionResponse:
        """Convert database record to response schema."""
        return CreditTransactionResponse(
            transaction_id=data["transaction_id"],
            user_id=data["user_id"],
            workspace_id=data["workspace_id"],
            credit_type=CreditType(data["credit_type"]),
            transaction_type=TransactionType(data["transaction_type"]),
            amount=data["amount"],
            currency=data.get("currency"),
            source=TransactionSource(data["source"]),
            description=data.get("description"),
            reference_type=data.get("reference_type"),
            reference_id=data.get("reference_id"),
            balance_after=data["balance_after"],
            created_at=data["created_at"],
        )


# Global instance
credit_ledger_service = CreditLedgerService()
