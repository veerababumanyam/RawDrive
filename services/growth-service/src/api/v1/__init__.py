"""
API v1 router aggregation for the Growth & Referrals service.

This module aggregates all v1 API routers:
- referrals: Referral code generation, validation, conversions
- credits: Credit balance and transaction history
- partners: Partner program application, dashboard, payouts
- goals: Setup goals progress and completion
"""

from fastapi import APIRouter

from src.api.v1.referrals import router as referrals_router
from src.api.v1.credits import router as credits_router
from src.api.v1.partners import router as partners_router
from src.api.v1.goals import router as goals_router

# Create the main v1 router
router = APIRouter(prefix="/api/v1", tags=["v1"])

# Include all feature routers
router.include_router(referrals_router)
router.include_router(credits_router)
router.include_router(partners_router)
router.include_router(goals_router)


@router.get("/", tags=["info"])
async def api_info():
    """API v1 information endpoint."""
    return {
        "api_version": "v1",
        "service": "growth-service",
        "description": "Growth & Referrals service for viral growth engine",
        "endpoints": {
            "referrals": {
                "base": "/api/v1/referrals",
                "features": [
                    "Create referral codes",
                    "Validate codes",
                    "Track conversions",
                    "Dashboard with stats",
                ],
            },
            "credits": {
                "base": "/api/v1/credits",
                "features": [
                    "Credit balance (AI & Bill)",
                    "Transaction history",
                    "Credit summary",
                ],
            },
            "partners": {
                "base": "/api/v1/partners",
                "features": [
                    "Partner application",
                    "Affiliate dashboard",
                    "Payout requests",
                ],
            },
            "goals": {
                "base": "/api/v1/goals",
                "features": [
                    "Goal definitions",
                    "Progress tracking",
                    "Goal completion & rewards",
                ],
            },
        },
        "status": "active",
    }


__all__ = ["router"]
