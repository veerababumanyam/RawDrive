# Landing Page Image Credits

Cover photography from the RawDrive internal library.

These images were originally captured as test fixtures for the RawDrive
integration, E2E, and UI test suites (see `tests/photos/`) and are used
on the marketing landing page with owner permission.

## Image map

| File          | Section                            | Notes                              |
| ------------- | ---------------------------------- | ---------------------------------- |
| `11.webp`     | §4.1 Cinematic Hero                | Wedding send-off, family moment    |
| `13.webp`     | §4.3 Gallery Experience            | Mandap ritual                      |
| `16.webp`     | §4.5 AI Moment                     | Joyful multi-person ritual         |
| `21.webp`     | *Unused on landing*                | Has baked-in typography overlay    |

## Format and size

All source images are stored as WebP (quality 82, method 6) for optimal
LCP performance. The originals were 2048×1363 JPEGs totaling ~2.7 MB;
the WebP conversions total ~1.1 MB — a 58% reduction with imperceptible
quality loss on photographic content.

| File        | Dimensions | Size   |
| ----------- | ---------- | ------ |
| `11.webp`   | 2048×1363  | 302 KB |
| `13.webp`   | 2048×1363  | 391 KB |
| `16.webp`   | 2048×1363  | 308 KB |
| `21.webp`   | 1616×1080  | 126 KB |

Shipped via `next/image` with `priority` on the hero for LCP. Next.js
will further optimize by serving AVIF variants to browsers that support
it (see `frontend/next.config.ts` `images.formats`).

## License

Internal use only. Do not redistribute these images outside the RawDrive
landing page, marketing materials, or test fixtures without explicit
owner approval.
