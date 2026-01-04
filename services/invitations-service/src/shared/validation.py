"""Generated validation helpers matching shared-validation"""
import re


PATTERNS = {
  "HEX_COLOR": re.compile(r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"),
  "UUID_V4": re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE),
  "EMAIL": re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$"),
  "PHONE": re.compile(r"^\+?[1-9]\d{1,14}$"),
  "URL": re.compile(r"^https?:\/\/[^\s/$.?#].[^\s]*$", re.IGNORECASE),
  "SLUG": re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
}


def is_valid_hex_color(value: str) -> bool:
  return bool(PATTERNS["HEX_COLOR"].match(value))


def is_valid_uuid(value: str) -> bool:
  return bool(PATTERNS["UUID_V4"].match(value))


def is_valid_email(value: str) -> bool:
  return bool(PATTERNS["EMAIL"].match(value))
