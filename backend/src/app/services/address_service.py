"""AddressService: Manages client addresses with timezone mapping.

Handles physical addresses (home, work, billing, shipping) with:
- Address validation
- Timezone inference from city/country
- Primary address management
- Address type enforcement

All operations are workspace-scoped for multi-tenant data isolation.
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.client_exceptions import (
    AddressNotFoundError,
    AddressValidationError,
    ClientNotFoundError,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Timezone Mapping by Country and Major Cities
# ---------------------------------------------------------------------------

# Country to default timezone mapping (ISO 3166-1 alpha-2)
COUNTRY_TIMEZONES = {
    # Asia
    "IN": "Asia/Kolkata",
    "PK": "Asia/Karachi",
    "BD": "Asia/Dhaka",
    "LK": "Asia/Colombo",
    "NP": "Asia/Kathmandu",
    "JP": "Asia/Tokyo",
    "KR": "Asia/Seoul",
    "CN": "Asia/Shanghai",
    "HK": "Asia/Hong_Kong",
    "SG": "Asia/Singapore",
    "MY": "Asia/Kuala_Lumpur",
    "TH": "Asia/Bangkok",
    "VN": "Asia/Ho_Chi_Minh",
    "PH": "Asia/Manila",
    "ID": "Asia/Jakarta",
    "AE": "Asia/Dubai",
    "SA": "Asia/Riyadh",
    "IL": "Asia/Jerusalem",
    "TR": "Europe/Istanbul",
    # Europe
    "GB": "Europe/London",
    "IE": "Europe/Dublin",
    "FR": "Europe/Paris",
    "DE": "Europe/Berlin",
    "IT": "Europe/Rome",
    "ES": "Europe/Madrid",
    "PT": "Europe/Lisbon",
    "NL": "Europe/Amsterdam",
    "BE": "Europe/Brussels",
    "CH": "Europe/Zurich",
    "AT": "Europe/Vienna",
    "PL": "Europe/Warsaw",
    "CZ": "Europe/Prague",
    "SE": "Europe/Stockholm",
    "NO": "Europe/Oslo",
    "DK": "Europe/Copenhagen",
    "FI": "Europe/Helsinki",
    "GR": "Europe/Athens",
    "RU": "Europe/Moscow",
    "UA": "Europe/Kiev",
    # Americas
    "US": "America/New_York",  # Default, will be overridden by city/state
    "CA": "America/Toronto",
    "MX": "America/Mexico_City",
    "BR": "America/Sao_Paulo",
    "AR": "America/Buenos_Aires",
    "CL": "America/Santiago",
    "CO": "America/Bogota",
    "PE": "America/Lima",
    # Oceania
    "AU": "Australia/Sydney",
    "NZ": "Pacific/Auckland",
    # Africa
    "ZA": "Africa/Johannesburg",
    "EG": "Africa/Cairo",
    "NG": "Africa/Lagos",
    "KE": "Africa/Nairobi",
}

# US state to timezone mapping
US_STATE_TIMEZONES = {
    # Eastern
    "CT": "America/New_York", "DE": "America/New_York", "FL": "America/New_York",
    "GA": "America/New_York", "IN": "America/Indiana/Indianapolis",
    "KY": "America/Kentucky/Louisville", "ME": "America/New_York",
    "MD": "America/New_York", "MA": "America/New_York", "MI": "America/Detroit",
    "NH": "America/New_York", "NJ": "America/New_York", "NY": "America/New_York",
    "NC": "America/New_York", "OH": "America/New_York", "PA": "America/New_York",
    "RI": "America/New_York", "SC": "America/New_York", "VT": "America/New_York",
    "VA": "America/New_York", "WV": "America/New_York", "DC": "America/New_York",
    # Central
    "AL": "America/Chicago", "AR": "America/Chicago", "IL": "America/Chicago",
    "IA": "America/Chicago", "KS": "America/Chicago", "LA": "America/Chicago",
    "MN": "America/Chicago", "MS": "America/Chicago", "MO": "America/Chicago",
    "NE": "America/Chicago", "ND": "America/Chicago", "OK": "America/Chicago",
    "SD": "America/Chicago", "TN": "America/Chicago", "TX": "America/Chicago",
    "WI": "America/Chicago",
    # Mountain
    "AZ": "America/Phoenix", "CO": "America/Denver", "ID": "America/Boise",
    "MT": "America/Denver", "NM": "America/Denver", "UT": "America/Denver",
    "WY": "America/Denver",
    # Pacific
    "CA": "America/Los_Angeles", "NV": "America/Los_Angeles",
    "OR": "America/Los_Angeles", "WA": "America/Los_Angeles",
    # Other
    "AK": "America/Anchorage", "HI": "Pacific/Honolulu",
}

# India state/city to timezone (India only has one timezone but included for completeness)
INDIA_CITIES = {
    "Mumbai": "Asia/Kolkata",
    "Delhi": "Asia/Kolkata",
    "Bangalore": "Asia/Kolkata",
    "Chennai": "Asia/Kolkata",
    "Kolkata": "Asia/Kolkata",
    "Hyderabad": "Asia/Kolkata",
    "Pune": "Asia/Kolkata",
}

# Major city timezone overrides (when city is more specific than country)
CITY_TIMEZONES = {
    # US cities
    "New York": "America/New_York",
    "Los Angeles": "America/Los_Angeles",
    "Chicago": "America/Chicago",
    "Houston": "America/Chicago",
    "Phoenix": "America/Phoenix",
    "San Francisco": "America/Los_Angeles",
    "Seattle": "America/Los_Angeles",
    "Miami": "America/New_York",
    "Denver": "America/Denver",
    "Boston": "America/New_York",
    "Atlanta": "America/New_York",
    "Dallas": "America/Chicago",
    # Canada cities
    "Toronto": "America/Toronto",
    "Vancouver": "America/Vancouver",
    "Montreal": "America/Montreal",
    "Calgary": "America/Edmonton",
    # Australia cities
    "Sydney": "Australia/Sydney",
    "Melbourne": "Australia/Melbourne",
    "Brisbane": "Australia/Brisbane",
    "Perth": "Australia/Perth",
    "Adelaide": "Australia/Adelaide",
    # UK cities
    "London": "Europe/London",
    "Manchester": "Europe/London",
    "Birmingham": "Europe/London",
    "Edinburgh": "Europe/London",
    # Other major cities
    "Dubai": "Asia/Dubai",
    "Singapore": "Asia/Singapore",
    "Hong Kong": "Asia/Hong_Kong",
    "Tokyo": "Asia/Tokyo",
    "Shanghai": "Asia/Shanghai",
    "Beijing": "Asia/Shanghai",
    **INDIA_CITIES,
}


def infer_timezone(
    city: Optional[str] = None,
    state: Optional[str] = None,
    country: Optional[str] = None,
) -> Optional[str]:
    """Infer timezone from address components.

    Priority:
    1. City-specific timezone
    2. US state-specific timezone
    3. Country default timezone

    Args:
        city: City name
        state: State/province code or name
        country: Country code (ISO 3166-1 alpha-2)

    Returns:
        IANA timezone string or None if cannot be determined
    """
    # Try city first (case-insensitive)
    if city:
        city_normalized = city.strip().title()
        if city_normalized in CITY_TIMEZONES:
            return CITY_TIMEZONES[city_normalized]

    # For US, try state
    if country and country.upper() == "US" and state:
        state_upper = state.strip().upper()
        # Handle full state names
        if len(state_upper) > 2:
            # Basic state name to code mapping (expandable)
            state_to_code = {
                "CALIFORNIA": "CA", "NEW YORK": "NY", "TEXAS": "TX",
                "FLORIDA": "FL", "ILLINOIS": "IL", "PENNSYLVANIA": "PA",
                "OHIO": "OH", "GEORGIA": "GA", "MICHIGAN": "MI",
                "NORTH CAROLINA": "NC", "NEW JERSEY": "NJ", "VIRGINIA": "VA",
                "WASHINGTON": "WA", "ARIZONA": "AZ", "MASSACHUSETTS": "MA",
                "TENNESSEE": "TN", "INDIANA": "IN", "MARYLAND": "MD",
                "MISSOURI": "MO", "WISCONSIN": "WI", "COLORADO": "CO",
            }
            state_upper = state_to_code.get(state_upper, state_upper[:2])

        if state_upper in US_STATE_TIMEZONES:
            return US_STATE_TIMEZONES[state_upper]

    # Fall back to country
    if country:
        country_upper = country.strip().upper()
        if country_upper in COUNTRY_TIMEZONES:
            return COUNTRY_TIMEZONES[country_upper]

    return None


# ---------------------------------------------------------------------------
# Address Validation
# ---------------------------------------------------------------------------

# Valid address types
VALID_ADDRESS_TYPES = {"home", "work", "billing", "shipping"}


def validate_address_type(address_type: str) -> str:
    """Validate address type."""
    address_type_lower = address_type.strip().lower()
    if address_type_lower not in VALID_ADDRESS_TYPES:
        raise AddressValidationError(
            f"Address type must be one of: {', '.join(VALID_ADDRESS_TYPES)}",
            "address_type"
        )
    return address_type_lower


def validate_address_fields(
    address_line1: Optional[str] = None,
    city: Optional[str] = None,
    country: Optional[str] = None,
) -> None:
    """Validate address has minimum required fields."""
    # At minimum, need either address_line1 OR city + country
    has_street = address_line1 and address_line1.strip()
    has_location = (city and city.strip()) or (country and country.strip())

    if not has_street and not has_location:
        raise AddressValidationError(
            "Address must have at least a street address or city/country",
            "address"
        )


def normalize_country_code(country: Optional[str]) -> Optional[str]:
    """Normalize country to ISO 3166-1 alpha-2 code."""
    if not country:
        return None

    country = country.strip().upper()

    # Common country name to code mappings
    country_names = {
        "INDIA": "IN",
        "UNITED STATES": "US",
        "USA": "US",
        "UNITED STATES OF AMERICA": "US",
        "UNITED KINGDOM": "GB",
        "UK": "GB",
        "GREAT BRITAIN": "GB",
        "AUSTRALIA": "AU",
        "CANADA": "CA",
        "GERMANY": "DE",
        "FRANCE": "FR",
        "JAPAN": "JP",
        "CHINA": "CN",
        "SINGAPORE": "SG",
        "UNITED ARAB EMIRATES": "AE",
        "UAE": "AE",
    }

    if len(country) == 2:
        return country
    return country_names.get(country, country[:2] if len(country) >= 2 else None)


# ---------------------------------------------------------------------------
# Address Service
# ---------------------------------------------------------------------------


class AddressService:
    """Service for managing client addresses."""

    async def add_address(
        self,
        workspace_id: UUID,
        client_id: UUID,
        address_type: str = "home",
        address_line1: Optional[str] = None,
        address_line2: Optional[str] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        country: Optional[str] = None,
        postal_code: Optional[str] = None,
        google_map_link: Optional[str] = None,
        is_primary: bool = False,
    ) -> dict:
        """Add an address to a client.

        Automatically infers timezone from address if possible.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to add address to
            address_type: Type of address (home, work, billing, shipping)
            address_line1: Street address line 1
            address_line2: Street address line 2
            city: City name
            state: State/province
            country: Country code (ISO 3166-1 alpha-2)
            postal_code: Postal/ZIP code
            is_primary: Whether this is the primary address

        Returns:
            Created address record with inferred timezone

        Raises:
            ClientNotFoundError: If client doesn't exist
            AddressValidationError: If address is invalid
        """
        # Validate address type
        validated_type = validate_address_type(address_type)

        # Validate minimum fields
        validate_address_fields(address_line1, city, country)

        # Normalize country code
        normalized_country = normalize_country_code(country)

        # Infer timezone
        inferred_timezone = infer_timezone(city, state, normalized_country)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            client_exists = await conn.fetchval(
                "SELECT 1 FROM clients WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                client_id,
            )
            if not client_exists:
                raise ClientNotFoundError(client_id)

            async with conn.transaction():
                # If setting as primary, unset existing primary
                if is_primary:
                    await conn.execute(
                        """
                        UPDATE client_addresses
                        SET is_primary = FALSE
                        WHERE workspace_id = $1 AND client_id = $2 AND is_primary = TRUE
                        """,
                        workspace_id,
                        client_id,
                    )

                # Create address
                row = await conn.fetchrow(
                    """
                    INSERT INTO client_addresses (
                        workspace_id, client_id, address_type,
                        address_line1, address_line2, city, state, country, postal_code,
                        google_map_link, is_primary
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING address_id, created_at
                    """,
                    workspace_id,
                    client_id,
                    validated_type,
                    address_line1.strip() if address_line1 else None,
                    address_line2.strip() if address_line2 else None,
                    city.strip() if city else None,
                    state.strip() if state else None,
                    normalized_country,
                    postal_code.strip() if postal_code else None,
                    google_map_link.strip() if google_map_link else None,
                    is_primary,
                )

                # Update client timezone if inferred and client doesn't have one
                if inferred_timezone:
                    await conn.execute(
                        """
                        UPDATE clients
                        SET timezone = $1
                        WHERE workspace_id = $2 AND client_id = $3 AND timezone IS NULL
                        """,
                        inferred_timezone,
                        workspace_id,
                        client_id,
                    )

                logger.info(
                    "Address added",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "address_id": str(row["address_id"]),
                        "address_type": validated_type,
                        "inferred_timezone": inferred_timezone,
                    },
                )

                return {
                    "address_id": str(row["address_id"]),
                    "address_type": validated_type,
                    "address_line1": address_line1.strip() if address_line1 else None,
                    "address_line2": address_line2.strip() if address_line2 else None,
                    "city": city.strip() if city else None,
                    "state": state.strip() if state else None,
                    "country": normalized_country,
                    "postal_code": postal_code.strip() if postal_code else None,
                    "google_map_link": google_map_link.strip() if google_map_link else None,
                    "is_primary": is_primary,
                    "inferred_timezone": inferred_timezone,
                    "created_at": row["created_at"].isoformat(),
                }

    async def update_address(
        self,
        workspace_id: UUID,
        client_id: UUID,
        address_id: UUID,
        address_type: Optional[str] = None,
        address_line1: Optional[str] = None,
        address_line2: Optional[str] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        country: Optional[str] = None,
        postal_code: Optional[str] = None,
        google_map_link: Optional[str] = None,
        is_primary: Optional[bool] = None,
    ) -> dict:
        """Update an address.

        Re-infers timezone if location fields change.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client owning the address
            address_id: Address to update
            address_type: New address type (optional)
            address_line1: New street address (optional)
            address_line2: New street address line 2 (optional)
            city: New city (optional)
            state: New state (optional)
            country: New country (optional)
            postal_code: New postal code (optional)
            is_primary: Set as primary (optional)

        Returns:
            Updated address record

        Raises:
            AddressNotFoundError: If address doesn't exist
            AddressValidationError: If updates are invalid
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get existing address
            address = await conn.fetchrow(
                """
                SELECT address_id, address_type, address_line1, address_line2,
                       city, state, country, postal_code, google_map_link, is_primary, created_at
                FROM client_addresses
                WHERE workspace_id = $1 AND client_id = $2 AND address_id = $3
                """,
                workspace_id,
                client_id,
                address_id,
            )
            if not address:
                raise AddressNotFoundError(address_id)

            # Prepare updates
            new_type = address["address_type"]
            new_line1 = address["address_line1"]
            new_line2 = address["address_line2"]
            new_city = address["city"]
            new_state = address["state"]
            new_country = address["country"]
            new_postal = address["postal_code"]
            new_map_link = address["google_map_link"]
            new_primary = address["is_primary"]

            if address_type is not None:
                new_type = validate_address_type(address_type)

            if address_line1 is not None:
                new_line1 = address_line1.strip() if address_line1 else None

            if address_line2 is not None:
                new_line2 = address_line2.strip() if address_line2 else None

            if city is not None:
                new_city = city.strip() if city else None

            if state is not None:
                new_state = state.strip() if state else None

            if country is not None:
                new_country = normalize_country_code(country)

            if postal_code is not None:
                new_postal = postal_code.strip() if postal_code else None

            if is_primary is not None:
                new_primary = is_primary

            if google_map_link is not None:
                new_map_link = google_map_link

            # Validate updated address has minimum fields
            validate_address_fields(new_line1, new_city, new_country)

            # Re-infer timezone if location changed
            location_changed = (
                city is not None or
                state is not None or
                country is not None
            )
            inferred_timezone = None
            if location_changed:
                inferred_timezone = infer_timezone(new_city, new_state, new_country)

            async with conn.transaction():
                # If setting as primary, unset existing primary
                if new_primary and not address["is_primary"]:
                    await conn.execute(
                        """
                        UPDATE client_addresses
                        SET is_primary = FALSE
                        WHERE workspace_id = $1 AND client_id = $2
                        AND is_primary = TRUE AND address_id != $3
                        """,
                        workspace_id,
                        client_id,
                        address_id,
                    )

                # Update address
                await conn.execute(
                    """
                    UPDATE client_addresses
                    SET address_type = $1, address_line1 = $2, address_line2 = $3,
                        city = $4, state = $5, country = $6, postal_code = $7,
                        google_map_link = $8, is_primary = $9
                    WHERE workspace_id = $10 AND address_id = $11
                    """,
                    new_type,
                    new_line1,
                    new_line2,
                    new_city,
                    new_state,
                    new_country,
                    new_postal,
                    new_map_link,
                    new_primary,
                    workspace_id,
                    address_id,
                )

                # Update client timezone if inferred
                if inferred_timezone:
                    await conn.execute(
                        """
                        UPDATE clients
                        SET timezone = $1
                        WHERE workspace_id = $2 AND client_id = $3
                        """,
                        inferred_timezone,
                        workspace_id,
                        client_id,
                    )

                logger.info(
                    "Address updated",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "address_id": str(address_id),
                        "inferred_timezone": inferred_timezone,
                    },
                )

                return {
                    "address_id": str(address_id),
                    "address_type": new_type,
                    "address_line1": new_line1,
                    "address_line2": new_line2,
                    "city": new_city,
                    "state": new_state,
                    "country": new_country,
                    "postal_code": new_postal,
                    "google_map_link": new_map_link,
                    "is_primary": new_primary,
                    "inferred_timezone": inferred_timezone,
                    "created_at": address["created_at"].isoformat(),
                }

    async def delete_address(
        self,
        workspace_id: UUID,
        client_id: UUID,
        address_id: UUID,
    ) -> dict:
        """Delete an address.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client owning the address
            address_id: Address to delete

        Returns:
            Success message

        Raises:
            AddressNotFoundError: If address doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify address exists
            address = await conn.fetchrow(
                """
                SELECT address_id, address_type, google_map_link, is_primary
                FROM client_addresses
                WHERE workspace_id = $1 AND client_id = $2 AND address_id = $3
                """,
                workspace_id,
                client_id,
                address_id,
            )
            if not address:
                raise AddressNotFoundError(address_id)

            async with conn.transaction():
                # Delete address
                await conn.execute(
                    "DELETE FROM client_addresses WHERE workspace_id = $1 AND address_id = $2",
                    workspace_id,
                    address_id,
                )

                # If this was primary, set another address as primary
                if address["is_primary"]:
                    await conn.execute(
                        """
                        UPDATE client_addresses
                        SET is_primary = TRUE
                        WHERE address_id = (
                            SELECT address_id FROM client_addresses
                            WHERE workspace_id = $1 AND client_id = $2
                            ORDER BY created_at ASC
                            LIMIT 1
                        )
                        """,
                        workspace_id,
                        client_id,
                    )

                logger.info(
                    "Address deleted",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "address_id": str(address_id),
                        "address_type": address["address_type"],
                    },
                )

                return {"message": "Address deleted successfully"}

    async def list_addresses(
        self,
        workspace_id: UUID,
        client_id: UUID,
        address_type: Optional[str] = None,
    ) -> list[dict]:
        """List all addresses for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to list addresses for
            address_type: Optional filter by type

        Returns:
            List of addresses
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if address_type:
                addresses = await conn.fetch(
                    """
                    SELECT address_id, address_type, address_line1, address_line2,
                           city, state, country, postal_code, google_map_link, is_primary, created_at
                    FROM client_addresses
                    WHERE workspace_id = $1 AND client_id = $2 AND address_type = $3
                    ORDER BY is_primary DESC, created_at ASC
                    """,
                    workspace_id,
                    client_id,
                    address_type.lower(),
                )
            else:
                addresses = await conn.fetch(
                    """
                    SELECT address_id, address_type, address_line1, address_line2,
                           city, state, country, postal_code, google_map_link, is_primary, created_at
                    FROM client_addresses
                    WHERE workspace_id = $1 AND client_id = $2
                    ORDER BY is_primary DESC, created_at ASC
                    """,
                    workspace_id,
                    client_id,
                )

            return [
                {
                    "address_id": str(a["address_id"]),
                    "address_type": a["address_type"],
                    "address_line1": a["address_line1"],
                    "address_line2": a["address_line2"],
                    "city": a["city"],
                    "state": a["state"],
                    "country": a["country"],
                    "postal_code": a["postal_code"],
                    "google_map_link": a["google_map_link"],
                    "is_primary": a["is_primary"],
                    "created_at": a["created_at"].isoformat(),
                }
                for a in addresses
            ]

    async def get_primary_address(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> Optional[dict]:
        """Get the primary address for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get primary address for

        Returns:
            Primary address or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            address = await conn.fetchrow(
                """
                SELECT address_id, address_type, address_line1, address_line2,
                       city, state, country, postal_code, google_map_link, is_primary, created_at
                FROM client_addresses
                WHERE workspace_id = $1 AND client_id = $2 AND is_primary = TRUE
                LIMIT 1
                """,
                workspace_id,
                client_id,
            )
            if not address:
                return None

            return {
                "address_id": str(address["address_id"]),
                "address_type": address["address_type"],
                "address_line1": address["address_line1"],
                "address_line2": address["address_line2"],
                "city": address["city"],
                "state": address["state"],
                "country": address["country"],
                "postal_code": address["postal_code"],
                "google_map_link": address["google_map_link"],
                "is_primary": True,
                "created_at": address["created_at"].isoformat(),
            }

    async def set_primary_address(
        self,
        workspace_id: UUID,
        client_id: UUID,
        address_id: UUID,
    ) -> dict:
        """Set an address as primary.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client owning the address
            address_id: Address to set as primary

        Returns:
            Updated address record

        Raises:
            AddressNotFoundError: If address doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify address exists
            address = await conn.fetchrow(
                """
                SELECT address_id, address_type, address_line1, address_line2,
                       city, state, country, postal_code, is_primary, created_at
                FROM client_addresses
                WHERE workspace_id = $1 AND client_id = $2 AND address_id = $3
                """,
                workspace_id,
                client_id,
                address_id,
            )
            if not address:
                raise AddressNotFoundError(address_id)

            if address["is_primary"]:
                # Already primary
                return {
                    "address_id": str(address_id),
                    "address_type": address["address_type"],
                    "address_line1": address["address_line1"],
                    "address_line2": address["address_line2"],
                    "city": address["city"],
                    "state": address["state"],
                    "country": address["country"],
                    "postal_code": address["postal_code"],
                    "is_primary": True,
                    "created_at": address["created_at"].isoformat(),
                }

            async with conn.transaction():
                # Unset existing primary
                await conn.execute(
                    """
                    UPDATE client_addresses
                    SET is_primary = FALSE
                    WHERE workspace_id = $1 AND client_id = $2 AND is_primary = TRUE
                    """,
                    workspace_id,
                    client_id,
                )

                # Set new primary
                await conn.execute(
                    """
                    UPDATE client_addresses
                    SET is_primary = TRUE
                    WHERE workspace_id = $1 AND address_id = $2
                    """,
                    workspace_id,
                    address_id,
                )

                logger.info(
                    "Primary address set",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "address_id": str(address_id),
                    },
                )

                return {
                    "address_id": str(address_id),
                    "address_type": address["address_type"],
                    "address_line1": address["address_line1"],
                    "address_line2": address["address_line2"],
                    "city": address["city"],
                    "state": address["state"],
                    "country": address["country"],
                    "postal_code": address["postal_code"],
                    "is_primary": True,
                    "created_at": address["created_at"].isoformat(),
                }


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_address_service: Optional[AddressService] = None


def get_address_service() -> AddressService:
    """Get singleton address service instance."""
    global _address_service
    if _address_service is None:
        _address_service = AddressService()
    return _address_service
