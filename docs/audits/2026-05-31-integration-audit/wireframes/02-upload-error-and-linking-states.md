# Wireframe — Upload Error + Server-Side Linking States (S3-G4 / S3-G5)

Low-fidelity wireframes for the in-gallery upload panel after the server-side
gallery-binding change. Frontend wiring: `frontend/src/hooks/use-upload.ts`,
`frontend/src/app/(dashboard)/galleries/[id]/page.tsx` (upload panel +
upload-link effect).

## Backend contract recap

`POST /api/v1/uploads` (CreateSession) now accepts optional `gallery_id`
(+ `album_id`). It validates both belong to the caller's workspace BEFORE
reserving credit/storage:
- bad/foreign gallery → `404 {"error":"gallery not found"}`
- bad/foreign album   → `404 {"error":"album not found"}`

`finalizeUpload` links the finalized asset into the gallery server-side —
idempotent (`ON CONFLICT DO NOTHING`), deterministic `sort_order = MAX+1`. The
former client `addAssetToGallery` call is therefore removed (dead/redundant).
Album *membership* is still pushed client-side (`addAlbumAssets`) because the
backend validates `album_id` but does not add the asset to the album table.

Upload lives INSIDE the gallery (no `/upload` nav route). Tests use
`tests/photos/` assets, including filenames with spaces/parens.

## Three-theme + a11y notes

- Tokens only: `surface-panel`, `bg-surface-sunken`, `bg-accent`,
  `text-text-primary/secondary/tertiary`, `text-success`, `text-error`,
  `text-feedback-warning`. Identical across all three themes; no overrides.
- Status text uses tone tokens (success / error / warning), never raw colors.
- Action affordances (Retry / Dismiss / Retry All) are real buttons; the panel
  is keyboard-reachable. Aggregate progress bar uses `bg-accent` on
  `bg-surface-sunken`.

---

## State 1 — Uploading (bound to gallery; server will link on finalize)

`CreateSession` body carries `gallery_id` (+ `album_id` when a sub-album is the
active target). No client link call fires after finalize.

```
┌──────────────────────────────────────────────────────────┐
│  Uploading 2 of 3 files                  Pause All · Cancel All │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 24.1 MB of 61.0 MB                              40%   │ │  aggregate
│  │ ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    │ │  bg-accent
│  └──────────────────────────────────────────────────────┘ │
│  Wedding (42).jpg        8.0 MB      Done     ✓ (success)  │
│  veera.jpg               9.1 MB      Uploading…            │
│  reception-104.jpg      12.0 MB      Queued               │
└──────────────────────────────────────────────────────────┘
```

## State 2 — Upload failure (chunk/network) — surfaced, retryable

A transient chunk/transport failure marks the row `error` (tone `text-error`)
with a per-row **Retry** and a panel-level **Retry All (N)**. Panel persists
until retried or dismissed (no silent drop).

```
┌──────────────────────────────────────────────────────────┐
│  1 upload failed                 Retry All (1) · Dismiss   │
│  Wedding (42).jpg        8.0 MB      Done     ✓           │
│  veera.jpg               9.1 MB      Failed   [Retry] [×]  │  text-error
└──────────────────────────────────────────────────────────┘
```

## State 3 — Link rejection (NEW) — destination gallery/album not found

`CreateSession` 404 `gallery not found` / `album not found` (e.g. the gallery
or sub-album was deleted, or a stale id). Previously this would land the upload
UNLINKED with only a bare status code; now it is an explicit `error` row with a
human sentence — the photographer learns the link target was rejected.

```
┌──────────────────────────────────────────────────────────┐
│  1 upload failed                       Retry All (1) · Dismiss │
│  reception-104.jpg      12.0 MB      Failed   [Retry] [×]  │
│    └ "Couldn't link this upload to this gallery (it may    │  text-error,
│       have been deleted). Try again."                      │  inline row error
│  (album variant: "…to the selected sub-gallery…")          │
└──────────────────────────────────────────────────────────┘
```

## State 4 — Blocked (pre-flight screening / quota) — not retryable

Local screening block, `needs_desktop`, or `403 storage_quota_exceeded`. Tone
`text-feedback-warning`; dismissible, not retryable (same file blocks again).

```
┌──────────────────────────────────────────────────────────┐
│  1 upload blocked                                Dismiss  │
│  huge-raw.dng          1.8 GB     Blocked  [×]            │  warning tone
│    └ "Your workspace has exceeded its storage quota…"      │
└──────────────────────────────────────────────────────────┘
```

## State 5 — Batch complete (panel auto-unmounts → toast)

When active count hits 0 with ≥1 complete, the panel hides and a right-side
toast (`role="status"`) reports the success/fail count. Assets are already
linked server-side; the page reloads the asset list + (if a sub-album was
active) pushes album membership and refreshes the chip count.

```
                                  ┌───────────────────────────┐
                                  │ ✓ 3 photos uploaded        │  toast
                                  │   (1 failed)               │  surface-raised
                                  └───────────────────────────┘
```

## Flow (server-side linking)

```
addFiles → screen → CreateSession{gallery_id, album_id?}
   ├─ 404 gallery/album not found → row=error "couldn't link…" (STOP)
   ├─ 403 storage_quota_exceeded  → row=blocked (STOP)
   └─ 201 → PATCH chunks → finalize
              └─ server LinkFinalizedAsset(gallery) [idempotent, sort_order=MAX+1]
   on complete → (client) addAlbumAssets(activeAlbum) → reload assets + albums
```
