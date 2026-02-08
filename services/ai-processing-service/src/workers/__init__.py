"""Workers package for AI Processing Service.

Contains Celery workers for background processing tasks:
- Face detection and embedding extraction
- (Future) Batch image processing
- (Future) Scheduled cleanup tasks

Feature: Face Detection and Identification
"""

from workers.celery_app import celery_app

__all__ = ["celery_app"]
