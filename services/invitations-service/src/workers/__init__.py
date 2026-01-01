"""
Background workers for the Invitations Microservice.
"""

from .celery_app import celery_app

__all__ = ["celery_app"]
