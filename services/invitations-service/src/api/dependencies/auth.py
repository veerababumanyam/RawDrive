"""
API dependencies adapter module.

Re-exports from v1 dependencies for backward compatibility.
"""

from typing import Annotated
from fastapi import Depends

from src.api.v1.dependencies import (
    CurrentUser,
    get_current_user,
    get_optional_user,
    AUTH_ERROR_MESSAGE,
    security,
)

# Type alias for dependency injection
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
