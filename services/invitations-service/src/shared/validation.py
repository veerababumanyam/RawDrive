"""Generated validation helpers matching shared-validation.

Task: T017 - Add phone number validation for India (+91 format)
Feature: Digital Invitation Service - Enhanced RSVP System
"""
import re


PATTERNS = {
  "HEX_COLOR": re.compile(r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"),
  "UUID_V4": re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE),
  "EMAIL": re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$"),
  "PHONE": re.compile(r"^\+?[1-9]\d{1,14}$"),
  # India phone patterns (T017)
  "PHONE_INDIA": re.compile(r"^(?:\+91[\s-]?)?[6-9]\d{9}$"),
  "PHONE_INDIA_STRICT": re.compile(r"^\+91[6-9]\d{9}$"),  # Requires +91 prefix
  "URL": re.compile(r"^https?:\/\/[^\s/$.?#].[^\s]*$", re.IGNORECASE),
  "SLUG": re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
}


def is_valid_hex_color(value: str) -> bool:
  return bool(PATTERNS["HEX_COLOR"].match(value))


def is_valid_uuid(value: str) -> bool:
  return bool(PATTERNS["UUID_V4"].match(value))


def is_valid_email(value: str) -> bool:
  return bool(PATTERNS["EMAIL"].match(value))


def is_valid_india_phone(value: str, strict: bool = False) -> bool:
  """Validate India phone number format.

  Valid formats (non-strict):
  - 9876543210 (10 digits starting with 6-9)
  - +91 9876543210
  - +91-9876543210
  - +919876543210

  Valid formats (strict):
  - +919876543210 (must have +91 prefix, no separators)

  Args:
      value: Phone number string to validate
      strict: If True, requires +91 prefix with no separators

  Returns:
      True if the phone number is valid for India
  """
  if not value:
    return False

  # Remove common separators for non-strict validation
  cleaned = value.replace(" ", "").replace("-", "")

  if strict:
    return bool(PATTERNS["PHONE_INDIA_STRICT"].match(cleaned))
  return bool(PATTERNS["PHONE_INDIA"].match(cleaned))


def normalize_india_phone(value: str) -> str:
  """Normalize an India phone number to +91XXXXXXXXXX format.

  Args:
      value: Phone number string to normalize

  Returns:
      Normalized phone number with +91 prefix

  Raises:
      ValueError: If the phone number is invalid
  """
  if not value:
    raise ValueError("Phone number cannot be empty")

  # Remove all non-digit characters except leading +
  cleaned = value.strip()
  if cleaned.startswith("+"):
    digits = "+" + re.sub(r"[^\d]", "", cleaned[1:])
  else:
    digits = re.sub(r"[^\d]", "", cleaned)

  # Handle different formats
  if digits.startswith("+91") and len(digits) == 13:
    # Already in correct format
    if is_valid_india_phone(digits, strict=True):
      return digits
  elif digits.startswith("91") and len(digits) == 12:
    # Missing + prefix
    normalized = "+" + digits
    if is_valid_india_phone(normalized, strict=True):
      return normalized
  elif len(digits) == 10 and digits[0] in "6789":
    # 10-digit local format
    return "+91" + digits
  elif digits.startswith("0") and len(digits) == 11:
    # 0-prefixed local format (011XXXXXXXX -> +91XXXXXXXXX)
    normalized = "+91" + digits[1:]
    if is_valid_india_phone(normalized, strict=True):
      return normalized

  raise ValueError(f"Invalid India phone number format: {value}")
