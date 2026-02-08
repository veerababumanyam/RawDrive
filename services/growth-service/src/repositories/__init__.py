"""
Repository layer for the Growth & Referrals service.

Provides data access for:
- Referral codes and conversions
- Credit ledger
- Partner applications and payouts
- Setup goals
"""

from src.repositories.referral_repository import referral_repository, ReferralRepository
from src.repositories.credit_repository import credit_repository, CreditRepository
from src.repositories.partner_repository import partner_repository, PartnerRepository
from src.repositories.goals_repository import goals_repository, GoalsRepository

__all__ = [
    "referral_repository",
    "ReferralRepository",
    "credit_repository",
    "CreditRepository",
    "partner_repository",
    "PartnerRepository",
    "goals_repository",
    "GoalsRepository",
]
