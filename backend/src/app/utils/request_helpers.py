"""Request helper utilities for extracting client information.

Handles proxy headers (Traefik, X-Forwarded-For) and client IP extraction.
"""
from __future__ import annotations

from fastapi import Request


def get_client_ip(request: Request) -> str | None:
    """Extract client IP address from request, handling proxies.

    Checks headers in order of preference:
    1. X-Forwarded-For (Traefik/proxy, first IP in chain)
    2. X-Real-IP (alternative proxy header)
    3. request.client.host (direct connection)

    Args:
        request: FastAPI Request object

    Returns:
        Client IP address as string, or None if cannot be determined
    """
    # Check X-Forwarded-For header (Traefik sets this)
    # Format: "client, proxy1, proxy2"
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Get the first IP (original client)
        client_ip = forwarded_for.split(",")[0].strip()
        return client_ip

    # Check X-Real-IP header (alternative proxy header)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    # Fallback to direct connection IP
    if request.client and request.client.host:
        return request.client.host

    return None


def get_user_agent(request: Request) -> str | None:
    """Extract User-Agent header from request.

    Args:
        request: FastAPI Request object

    Returns:
        User-Agent string, or None if not present
    """
    return request.headers.get("User-Agent")


def get_device_info_from_headers(request: Request) -> dict[str, str]:
    """Extract device information from request headers.

    Args:
        request: FastAPI Request object

    Returns:
        Dictionary with device info (user_agent, ip_address)
    """
    return {
        "user_agent": get_user_agent(request) or "Unknown",
        "ip_address": get_client_ip(request) or "Unknown",
    }
