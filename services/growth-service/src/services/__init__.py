"""
Growth & Referrals services.

Exports:
- ReferralService: Referral code and conversion management
- CreditLedgerService: Credit balance and transaction management
- PartnerService: Partner/affiliate program management
- GoalsService: Setup goals gamification
"""

from src.services.referral_service import ReferralService, referral_service
from src.services.credit_ledger_service import CreditLedgerService, credit_ledger_service
from src.services.partner_service import PartnerService, partner_service
from src.services.goals_service import GoalsService, goals_service

__all__ = [
    # Classes
    "ReferralService",
    "CreditLedgerService",
    "PartnerService",
    "GoalsService",
    # Instances
    "referral_service",
    "credit_ledger_service",
    "partner_service",
    "goals_service",
]
