"""
Webhook signature service using HMAC-SHA256.

Follows the pattern from billing-service and notifications-service.
"""

import hmac
import hashlib
import secrets
import time
import logging
from typing import Tuple, Optional
from datetime import datetime, timedelta, timezone

from src.config import settings

logger = logging.getLogger(__name__)


class SignatureService:
    """
    HMAC-SHA256 webhook signature generation and verification.

    Signature format: t={timestamp},v1={signature}
    """

    SIGNATURE_HEADER = "X-RawDrive-Signature"
    TIMESTAMP_HEADER = "X-RawDrive-Timestamp"
    EVENT_TYPE_HEADER = "X-RawDrive-Event-Type"
    DELIVERY_ID_HEADER = "X-RawDrive-Delivery-Id"

    def __init__(self):
        self.max_timestamp_age = settings.SIGNATURE_MAX_TIMESTAMP_AGE

    def generate_secret(self) -> str:
        """
        Generate a new webhook secret key.

        Returns:
            64-character hex string (32 bytes of entropy)
        """
        return secrets.token_hex(32)

    def generate_signature(
        self,
        payload: bytes,
        secret: str,
        timestamp: Optional[int] = None,
    ) -> Tuple[str, int]:
        """
        Generate HMAC-SHA256 signature for webhook payload.

        Args:
            payload: Raw request body bytes
            secret: Webhook secret key
            timestamp: Unix timestamp (defaults to current time)

        Returns:
            Tuple of (signature_header_value, timestamp_used)
        """
        if timestamp is None:
            timestamp = int(time.time())

        # Build signed payload: {timestamp}.{payload}
        signed_payload = f"{timestamp}.{payload.decode('utf-8')}"

        # Calculate HMAC-SHA256
        signature = hmac.new(
            secret.encode('utf-8'),
            signed_payload.encode('utf-8'),
            hashlib.sha256,
        ).hexdigest()

        # Return signature in format: t={timestamp},v1={signature}
        signature_header = f"t={timestamp},v1={signature}"

        return signature_header, timestamp

    def verify_signature(
        self,
        payload: bytes,
        signature_header: str,
        secret: str,
    ) -> Tuple[bool, str]:
        """
        Verify webhook signature.

        Args:
            payload: Raw request body bytes
            signature_header: Value of X-RawDrive-Signature header
            secret: Webhook secret key

        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            # Parse signature header
            parts = {}
            for part in signature_header.split(","):
                if "=" in part:
                    key, value = part.split("=", 1)
                    parts[key.strip()] = value.strip()

            timestamp_str = parts.get("t")
            received_sig = parts.get("v1")

            if not timestamp_str or not received_sig:
                return False, "Invalid signature format"

            timestamp = int(timestamp_str)

            # Check timestamp freshness (prevent replay attacks)
            current_time = int(time.time())
            age = abs(current_time - timestamp)

            if age > self.max_timestamp_age:
                return False, f"Timestamp too old ({age}s > {self.max_timestamp_age}s)"

            # Calculate expected signature
            signed_payload = f"{timestamp}.{payload.decode('utf-8')}"
            expected_sig = hmac.new(
                secret.encode('utf-8'),
                signed_payload.encode('utf-8'),
                hashlib.sha256,
            ).hexdigest()

            # Constant-time comparison (prevents timing attacks)
            if hmac.compare_digest(received_sig, expected_sig):
                return True, ""
            else:
                return False, "Signature mismatch"

        except ValueError as e:
            return False, f"Invalid timestamp: {e}"
        except Exception as e:
            logger.error(f"Signature verification error: {e}")
            return False, f"Verification failed: {str(e)}"

    def generate_headers(
        self,
        payload: bytes,
        secret: str,
        event_type: str,
        delivery_id: str,
        custom_headers: Optional[dict] = None,
    ) -> dict:
        """
        Generate all headers for a webhook request.

        Args:
            payload: Raw request body bytes
            secret: Webhook secret key
            event_type: Type of event being sent
            delivery_id: Unique delivery ID
            custom_headers: Additional custom headers

        Returns:
            Dict of headers to include in request
        """
        signature, timestamp = self.generate_signature(payload, secret)

        headers = {
            "Content-Type": "application/json",
            self.SIGNATURE_HEADER: signature,
            self.TIMESTAMP_HEADER: str(timestamp),
            self.EVENT_TYPE_HEADER: event_type,
            self.DELIVERY_ID_HEADER: delivery_id,
            "User-Agent": f"RawDrive-Webhooks/{settings.SERVICE_VERSION}",
        }

        # Add custom headers (but don't allow overriding security headers)
        if custom_headers:
            for key, value in custom_headers.items():
                if key.lower() not in (
                    "content-type",
                    self.SIGNATURE_HEADER.lower(),
                    self.TIMESTAMP_HEADER.lower(),
                ):
                    headers[key] = value

        return headers


# Global singleton
signature_service = SignatureService()
