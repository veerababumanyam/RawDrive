# Landing Page Image Credits

Cover photography from the RawDrive internal library.

These images were originally captured as test fixtures for the RawDrive
integration, E2E, and UI test suites (see `tests/photos/`) and are used
on the marketing landing page with owner permission.

## Image map

| File          | Section                            | Notes                              |
| ------------- | ---------------------------------- | ---------------------------------- |
| `hero-couple.avif` | §4.1 Cinematic Hero          | Wedding couple, outdoor portrait   |
| `gallery-baby.avif` | §4.3 Gallery Experience     | Beach birthday client moment       |
| `ai-couple.avif` | §4.5 AI Moment                 | Wedding couple, intelligence layer |

## Format and size

All shipped landing images are stored as AVIF for optimal LCP
performance. The public folder keeps only the lightweight delivery
formats used by the app.

| File        | Dimensions | Size   |
| ----------- | ---------- | ------ |
| `hero-couple.avif` | 1600×1067 | 77 KB |
| `gallery-baby.avif` | 1600×1067 | 39 KB |
| `ai-couple.avif` | 1600×1067 | 47 KB |

Shipped via `next/image` with `preload` on the hero for LCP. Next.js
will further optimize by serving AVIF variants to browsers that support
it (see `frontend/next.config.ts` `images.formats`).

## License

Internal use only. Do not redistribute these images outside the RawDrive
landing page, marketing materials, or test fixtures without explicit
owner approval.
