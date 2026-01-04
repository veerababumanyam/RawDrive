# JSON Schema Contracts

**Feature**: 022-shared-packages
**Date**: 2026-01-04

## Overview

JSON Schema serves as the intermediate format between TypeScript and Python. These schemas are the canonical contract for cross-language type generation.

---

## InvitationStatus

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://rawdrive.in/schemas/invitation-status.json",
  "title": "InvitationStatus",
  "description": "Status of a digital invitation",
  "type": "string",
  "enum": ["draft", "published", "expired", "cancelled"]
}
```

---

## RSVPStatus

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://rawdrive.in/schemas/rsvp-status.json",
  "title": "RSVPStatus",
  "description": "RSVP response status from a guest",
  "type": "string",
  "enum": ["pending", "attending", "not_attending", "maybe"]
}
```

---

## EventType

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://rawdrive.in/schemas/event-type.json",
  "title": "EventType",
  "description": "Type of event within an invitation",
  "type": "string",
  "enum": [
    "ceremony",
    "reception",
    "after_party",
    "mehndi",
    "sangeet",
    "haldi",
    "cocktail",
    "rehearsal_dinner",
    "brunch",
    "other"
  ]
}
```

---

## GalleryStatus

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://rawdrive.in/schemas/gallery-status.json",
  "title": "GalleryStatus",
  "description": "Status of a gallery",
  "type": "string",
  "enum": ["draft", "published", "archived"]
}
```

---

## ColorStop

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://rawdrive.in/schemas/color-stop.json",
  "title": "ColorStop",
  "description": "A single color stop in a gradient",
  "type": "object",
  "properties": {
    "color": {
      "type": "string",
      "pattern": "^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$",
      "description": "Hex color value (e.g., '#FF5733')"
    },
    "position": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "description": "Position from 0 to 100"
    }
  },
  "required": ["color", "position"],
  "additionalProperties": false
}
```

---

## GradientConfiguration

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://rawdrive.in/schemas/gradient-configuration.json",
  "title": "GradientConfiguration",
  "description": "Configuration for gradient styling",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "enum": ["linear"],
      "description": "Type of gradient"
    },
    "preset_id": {
      "type": ["string", "null"],
      "description": "Reference to preset or null for custom"
    },
    "direction": {
      "type": "number",
      "minimum": 0,
      "maximum": 360,
      "description": "Direction in degrees (0-360)"
    },
    "colors": {
      "type": "array",
      "items": { "$ref": "color-stop.json" },
      "minItems": 2,
      "maxItems": 10,
      "description": "Color stops defining the gradient"
    }
  },
  "required": ["type", "preset_id", "direction", "colors"],
  "additionalProperties": false
}
```

---

## PaginationMeta

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://rawdrive.in/schemas/pagination-meta.json",
  "title": "PaginationMeta",
  "description": "Pagination metadata for list responses",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": 0,
      "description": "Total number of items"
    },
    "page": {
      "type": "integer",
      "minimum": 1,
      "description": "Current page number"
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "description": "Items per page"
    },
    "total_pages": {
      "type": "integer",
      "minimum": 0,
      "description": "Total number of pages"
    }
  },
  "required": ["total", "page", "limit", "total_pages"],
  "additionalProperties": false
}
```

---

## ErrorResponse

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://rawdrive.in/schemas/error-response.json",
  "title": "ErrorResponse",
  "description": "Standard error response format",
  "type": "object",
  "properties": {
    "error": {
      "type": "string",
      "description": "Error type identifier"
    },
    "message": {
      "type": "string",
      "description": "Human-readable error message"
    },
    "details": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "field": { "type": "string" },
          "message": { "type": "string" }
        },
        "required": ["field", "message"]
      },
      "description": "Field-specific error details"
    },
    "request_id": {
      "type": "string",
      "description": "Request ID for debugging"
    }
  },
  "required": ["error", "message"],
  "additionalProperties": false
}
```

---

## Schema Generation Pipeline

### TypeScript → JSON Schema

```bash
# Generate JSON schemas from TypeScript types
npx ts-json-schema-generator \
  --path "packages/shared-types/src/index.ts" \
  --type "*" \
  --out "packages/shared-types/schemas/"
```

### JSON Schema → Python

```bash
# Generate Pydantic models from JSON schemas
datamodel-codegen \
  --input packages/shared-types/schemas/ \
  --input-file-type jsonschema \
  --output-model-type pydantic_v2.BaseModel \
  --output packages/shared-types/generated/python/types.py \
  --use-standard-collections \
  --use-union-operator \
  --enum-field-as-literal one \
  --use-double-quotes
```

---

## Schema Validation

All JSON schemas are validated in CI:

1. **Schema Syntax**: Valid JSON Schema draft-07
2. **$id Uniqueness**: No duplicate schema IDs
3. **Reference Resolution**: All `$ref` pointers resolve
4. **Example Validation**: All examples pass schema validation

```bash
# Validate schemas
npx ajv validate --spec=draft7 packages/shared-types/schemas/*.json
```
