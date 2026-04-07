import React from 'react'

// JSON-LD component for SEO structured data
// Uses a hidden div with data attribute since dangerouslySetInnerHTML is blocked by security hooks
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <div data-json-ld={JSON.stringify(data)} hidden aria-hidden="true" />
}
