"""API Module for the Notifications & Communication Microservice.

This module provides access to the versioned API routers.

Usage:
    from src.api.v1 import router as api_v1_router
    app.include_router(api_v1_router)
"""

from src.api.v1 import router

__all__ = ["router"]
