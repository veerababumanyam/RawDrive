"""
Invitation schemas adapter module.

Re-exports invitation schemas for API convenience.
"""

from src.schemas.invitation import (
    InvitationResponse,
    CreateInvitationRequest,
    UpdateInvitationRequest,
)

# Aliases for backward compatibility
InvitationCreate = CreateInvitationRequest
InvitationUpdate = UpdateInvitationRequest

__all__ = [
    "InvitationResponse",
    "InvitationCreate",
    "InvitationUpdate",
    "CreateInvitationRequest",
    "UpdateInvitationRequest",
]
