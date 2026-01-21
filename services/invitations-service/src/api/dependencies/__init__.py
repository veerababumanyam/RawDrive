"""
API dependencies package.

Re-exports authentication dependencies for convenience.
"""

from src.api.dependencies.auth import (
    CurrentUser,
    get_current_user,
    get_optional_user,
    AUTH_ERROR_MESSAGE,
    security,
)

# Type alias for dependency injection
from typing import Annotated
from fastapi import Depends

CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
OptionalUserDep = Annotated[CurrentUser | None, Depends(get_optional_user)]

__all__ = [
    "CurrentUser",
    "CurrentUserDep",
    "OptionalUserDep",
    "get_current_user",
    "get_optional_user",
    "AUTH_ERROR_MESSAGE",
    "security",
]
