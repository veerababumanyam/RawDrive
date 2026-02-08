"""
Credit ledger API endpoints.

Provides endpoints for:
- Getting credit balance (T031)
- Transaction history
- Credit usage (internal)
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from src.api.v1.dependencies import AuthContext, get_auth_context
from src.logging import get_logger
from src.schemas.credit import (
    CreditBalanceResponse,
    CreditSummaryResponse,
    CreditTransactionListResponse,
    CreditType,
    TransactionSource,
    TransactionType,
)
from src.services.credit_ledger_service import credit_ledger_service

logger = get_logger(__name__)

router = APIRouter(prefix="/credits", tags=["credits"])


# =============================================================================
# Balance Queries
# =============================================================================


@router.get(
    "/balance",
    response_model=CreditBalanceResponse,
    summary="Get credit balance",
    description="Get the user's current credit balance for all credit types."
)
async def get_balance(
    auth: AuthContext = Depends(get_auth_context),
):
    """Get the current credit balance.

    Returns both AI credits and Bill credits balances,
    along with summary stats.
    """
    result = await credit_ledger_service.get_balance(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
    )

    return result


@router.get(
    "/balance/{credit_type}",
    response_model=CreditBalanceResponse,
    summary="Get specific credit type balance",
    description="Get balance for a specific credit type (ai_credits or bill_credits)."
)
async def get_balance_by_type(
    credit_type: CreditType,
    auth: AuthContext = Depends(get_auth_context),
):
    """Get balance for a specific credit type."""
    result = await credit_ledger_service.get_balance(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        credit_type=credit_type,
    )

    return result


# =============================================================================
# Transaction History
# =============================================================================


@router.get(
    "/transactions",
    response_model=CreditTransactionListResponse,
    summary="Get transaction history",
    description="Get paginated list of credit transactions."
)
async def get_transactions(
    credit_type: Optional[CreditType] = Query(None, description="Filter by credit type"),
    transaction_type: Optional[TransactionType] = Query(None, description="Filter by transaction type"),
    source: Optional[TransactionSource] = Query(None, description="Filter by source"),
    start_date: Optional[datetime] = Query(None, description="Filter from date"),
    end_date: Optional[datetime] = Query(None, description="Filter to date"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    auth: AuthContext = Depends(get_auth_context),
):
    """Get credit transaction history.

    Supports filtering by:
    - Credit type (ai_credits, bill_credits)
    - Transaction type (credit, debit)
    - Source (referral_reward, setup_goal, etc.)
    - Date range
    """
    result = await credit_ledger_service.get_transactions(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        credit_type=credit_type,
        transaction_type=transaction_type,
        source=source,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )

    return result


@router.get(
    "/transactions/{transaction_id}",
    response_model=CreditTransactionListResponse,
    summary="Get transaction details",
    description="Get details of a specific transaction."
)
async def get_transaction(
    transaction_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
):
    """Get details of a specific transaction."""
    result = await credit_ledger_service.get_transaction(
        transaction_id=transaction_id,
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
    )

    return result


# =============================================================================
# Summary & Analytics
# =============================================================================


@router.get(
    "/summary",
    response_model=CreditSummaryResponse,
    summary="Get credit summary",
    description="Get credit activity summary for a time period."
)
async def get_summary(
    start_date: Optional[datetime] = Query(None, description="Period start date"),
    end_date: Optional[datetime] = Query(None, description="Period end date"),
    auth: AuthContext = Depends(get_auth_context),
):
    """Get credit activity summary.

    Returns:
    - Total credits earned and used by type
    - Net credit change
    - Breakdown by source
    """
    result = await credit_ledger_service.get_summary(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        start_date=start_date,
        end_date=end_date,
    )

    return result


# =============================================================================
# Credit Check (for other services)
# =============================================================================


@router.get(
    "/check/{credit_type}",
    summary="Check if user has sufficient credits",
    description="Check if user has enough credits for an operation."
)
async def check_credits(
    credit_type: CreditType,
    amount: float = Query(..., gt=0, description="Amount to check"),
    auth: AuthContext = Depends(get_auth_context),
):
    """Check if user has sufficient credits.

    Used by other services before performing credit-consuming operations.
    """
    has_sufficient = await credit_ledger_service.has_sufficient_balance(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        credit_type=credit_type,
        amount=amount,
    )

    return {
        "credit_type": credit_type,
        "required_amount": amount,
        "has_sufficient": has_sufficient,
    }
