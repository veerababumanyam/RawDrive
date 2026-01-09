"""
Test constants for webhooks-service tests.

Centralizes magic numbers and test configuration values.
"""

# Minimum number of event types as per spec
MIN_EVENT_TYPES = 40

# Expected event categories
EXPECTED_CATEGORIES = [
    "workspace",
    "subscription",
    "user",
    "asset",
    "gallery",
    "invitation",
    "client",
]

# Minimum subscription events count
MIN_SUBSCRIPTION_EVENTS = 8

# Circuit breaker test defaults
DEFAULT_FAILURE_THRESHOLD = 5
DEFAULT_RECOVERY_TIMEOUT = 60
DEFAULT_HALF_OPEN_SUCCESSES = 2

# Signature test defaults
SIGNATURE_MAX_TIMESTAMP_AGE = 300  # 5 minutes
