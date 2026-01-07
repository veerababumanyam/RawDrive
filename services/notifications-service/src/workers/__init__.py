"""
Background Workers for the Notifications & Communication Microservice.

This module contains background workers for processing notification tasks:
- EmailWorker: Processes email notifications with retry logic
- DigestWorker: Aggregates notifications into digest summaries

Workers integrate with the TaskQueueService for Redis-backed task processing
and provide:
- Configurable concurrency
- Retry with exponential backoff
- Dead letter queue integration
- Prometheus metrics for monitoring
- Graceful shutdown handling

Feature: Notifications & Communication Microservice
"""

from src.workers.email_worker import (
    EmailWorker,
    EmailErrorCategory,
    EmailProcessingResult,
    get_email_worker,
    handle_send_email,
    handle_send_email_batch,
    handle_retry_email,
    run_email_worker,
)

from src.workers.digest_worker import (
    DigestWorker,
    DigestContent,
    DigestCategoryGroup,
    DigestNotificationItem,
    DigestProcessingResult,
    get_digest_worker,
    handle_process_daily_digest,
    handle_process_weekly_digest,
    handle_aggregate_digest,
    handle_send_digest,
    run_digest_worker,
)

__all__ = [
    # Email Worker
    "EmailWorker",
    "EmailErrorCategory",
    "EmailProcessingResult",
    "get_email_worker",
    "handle_send_email",
    "handle_send_email_batch",
    "handle_retry_email",
    "run_email_worker",
    # Digest Worker
    "DigestWorker",
    "DigestContent",
    "DigestCategoryGroup",
    "DigestNotificationItem",
    "DigestProcessingResult",
    "get_digest_worker",
    "handle_process_daily_digest",
    "handle_process_weekly_digest",
    "handle_aggregate_digest",
    "handle_send_digest",
    "run_digest_worker",
]
