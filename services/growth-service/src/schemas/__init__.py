"""
Pydantic schemas for the Growth & Referrals service.

Exports all schemas for:
- Referral codes and conversions
- Credit ledger
- Partner program
- Setup goals
"""

from src.schemas.referral import (
    # Enums
    CodeType,
    RewardType,
    CodeStatus,
    ConversionType,
    RewardStatus,
    # Referral Code schemas
    ReferralCodeCreate,
    ReferralCodeResponse,
    ReferralCodeListResponse,
    ReferralCodeValidateRequest,
    ReferralCodeValidateResponse,
    ReferralStatsResponse,
    # Conversion schemas
    ConversionCreate,
    ConversionResponse,
    ConversionListResponse,
    RecordClickRequest,
    RecordClickResponse,
)

from src.schemas.credit import (
    # Enums
    CreditType,
    TransactionType,
    TransactionSource,
    # Balance schemas
    CreditBalanceResponse,
    SingleCreditBalance,
    # Transaction schemas
    CreditTransactionCreate,
    CreditTransactionResponse,
    CreditTransactionListResponse,
    TransactionHistoryRequest,
    # Application schemas
    ApplyCreditRequest,
    ApplyCreditResponse,
    UseCreditRequest,
    UseCreditResponse,
    # Summary schemas
    CreditSummaryResponse,
)

from src.schemas.partner import (
    # Enums
    PartnerStatus,
    PayoutStatus,
    PayoutMethod,
    # Application schemas
    PartnerApplicationCreate,
    PartnerApplicationResponse,
    # Dashboard schemas
    PartnerDashboardResponse,
    PartnerStatsResponse,
    PartnerConversionResponse,
    PartnerConversionListResponse,
    # Payout schemas
    PayoutRequestCreate,
    PayoutResponse,
    PayoutListResponse,
    PayoutSummaryResponse,
    # Assets schemas
    PartnerAsset,
    PartnerAssetsResponse,
)

from src.schemas.goals import (
    # Enums
    GoalType,
    GoalStatus,
    # Definition schemas
    GoalDefinition,
    GoalDefinitionListResponse,
    # Progress schemas
    GoalProgress,
    GoalsProgressResponse,
    # Completion schemas
    GoalCompleteRequest,
    GoalCompleteResponse,
    GoalVerificationResult,
    # Stats schemas
    GoalsStatsResponse,
)

__all__ = [
    # Referral enums
    "CodeType",
    "RewardType",
    "CodeStatus",
    "ConversionType",
    "RewardStatus",
    # Referral schemas
    "ReferralCodeCreate",
    "ReferralCodeResponse",
    "ReferralCodeListResponse",
    "ReferralCodeValidateRequest",
    "ReferralCodeValidateResponse",
    "ReferralStatsResponse",
    "ConversionCreate",
    "ConversionResponse",
    "ConversionListResponse",
    "RecordClickRequest",
    "RecordClickResponse",
    # Credit enums
    "CreditType",
    "TransactionType",
    "TransactionSource",
    # Credit schemas
    "CreditBalanceResponse",
    "SingleCreditBalance",
    "CreditTransactionCreate",
    "CreditTransactionResponse",
    "CreditTransactionListResponse",
    "TransactionHistoryRequest",
    "ApplyCreditRequest",
    "ApplyCreditResponse",
    "UseCreditRequest",
    "UseCreditResponse",
    "CreditSummaryResponse",
    # Partner enums
    "PartnerStatus",
    "PayoutStatus",
    "PayoutMethod",
    # Partner schemas
    "PartnerApplicationCreate",
    "PartnerApplicationResponse",
    "PartnerDashboardResponse",
    "PartnerStatsResponse",
    "PartnerConversionResponse",
    "PartnerConversionListResponse",
    "PayoutRequestCreate",
    "PayoutResponse",
    "PayoutListResponse",
    "PayoutSummaryResponse",
    "PartnerAsset",
    "PartnerAssetsResponse",
    # Goal enums
    "GoalType",
    "GoalStatus",
    # Goal schemas
    "GoalDefinition",
    "GoalDefinitionListResponse",
    "GoalProgress",
    "GoalsProgressResponse",
    "GoalCompleteRequest",
    "GoalCompleteResponse",
    "GoalVerificationResult",
    "GoalsStatsResponse",
]
