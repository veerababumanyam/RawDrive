"""PII Field Registry for SOC2 CC6.3 Compliance.

Defines which fields are considered Personally Identifiable Information (PII)
for audit logging purposes. Access to these fields is logged for compliance.
"""

from typing import FrozenSet

# PII fields by entity type
# These fields require access logging for SOC2 CC6.3 compliance
PII_FIELDS: dict[str, FrozenSet[str]] = {
    "client": frozenset({
        "email",
        "phone",
        "mobile_phone",
        "date_of_birth",
        "tax_id",
    }),
    "contact": frozenset({
        "name",
        "email",
        "phone",
        "relationship",
    }),
    "address": frozenset({
        "street_address",
        "city",
        "postal_code",
        "country",
    }),
    "communication": frozenset({
        "recipient_email",
        "recipient_phone",
        "message_content",
    }),
}

# All PII field names across all entities (for quick lookup)
ALL_PII_FIELDS: FrozenSet[str] = frozenset().union(*PII_FIELDS.values())


def get_pii_fields_for_entity(entity_type: str) -> FrozenSet[str]:
    """
    Get PII fields for a specific entity type.

    Args:
        entity_type: The entity type (client, contact, address, communication)

    Returns:
        FrozenSet of field names considered PII for this entity
    """
    return PII_FIELDS.get(entity_type.lower(), frozenset())


def is_pii_field(field_name: str, entity_type: str | None = None) -> bool:
    """
    Check if a field is considered PII.

    Args:
        field_name: The field name to check
        entity_type: Optional entity type to restrict check to

    Returns:
        True if the field is PII
    """
    if entity_type:
        return field_name in PII_FIELDS.get(entity_type.lower(), frozenset())
    return field_name in ALL_PII_FIELDS


def filter_pii_fields(fields: list[str], entity_type: str) -> list[str]:
    """
    Filter a list of fields to only include PII fields.

    Args:
        fields: List of field names
        entity_type: The entity type

    Returns:
        List of field names that are considered PII
    """
    pii_for_entity = get_pii_fields_for_entity(entity_type)
    return [f for f in fields if f in pii_for_entity]
