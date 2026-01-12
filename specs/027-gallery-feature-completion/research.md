# Research: Gallery Feature Completion

**Feature Branch**: `027-gallery-feature-completion`
**Created**: 2026-01-10

## Research Summary

This document captures technology decisions and best practices research for implementing 10 gallery features across security, accessibility, and enhanced functionality domains.

---

## 1. Access Code Hashing Strategy

**Decision**: Use bcrypt with cost factor 10 (same as gallery passwords)

**Rationale**:
- Consistent with existing `password` field hashing in galleries table
- Cost factor 10 provides ~100ms verification time (meets <500ms target)
- bcrypt includes salt, preventing rainbow table attacks

**Alternatives Considered**:
- Argon2id: More memory-hard but overkill for 4-8 character codes
- SHA-256: Too fast, enables brute force attacks
- Plain comparison: Insecure, rejected

**Implementation**:
```python
from passlib.hash import bcrypt
code_hash = bcrypt.using(rounds=10).hash(access_code)
bcrypt.verify(submitted_code, stored_hash)
```

---

## 2. Download Quota Tracking (Redis)

**Decision**: Use Redis INCR with midnight UTC expiry

**Rationale**:
- Atomic increment prevents race conditions
- TTL-based expiry automatically resets at midnight
- Existing Redis infrastructure (no new dependencies)

**Alternatives Considered**:
- PostgreSQL row per client per day: High write volume, cleanup overhead
- In-memory counter: Lost on restart, not distributed
- Rate limiter middleware: Different use case (per-minute, not per-day)

**Implementation**:
```python
key = f"download_quota:{gallery_id}:{client_identifier}:{date_utc}"
current = redis.incr(key)
if current == 1:
    # First download today - set expiry to midnight UTC
    redis.expireat(key, next_midnight_utc)
```

**Client Identifier Strategy**:
- Use combination of: client email (if registered) OR session fingerprint
- Fingerprint: Hash of User-Agent + Accept-Language + screen dimensions

---

## 3. High Contrast CSS Variables

**Decision**: Create dedicated high-contrast theme with WCAG AAA (7:1) ratios

**Rationale**:
- WCAG AAA is stricter than AA (4.5:1), better for accessibility
- CSS custom properties enable instant theme switch
- Overrides gallery branding when enabled (accessibility > branding)

**Color Palette** (verified with WebAIM contrast checker):
```css
:root.high-contrast {
  --hc-background: #000000;
  --hc-surface: #1a1a1a;
  --hc-text-primary: #ffffff;
  --hc-text-secondary: #ffff00; /* Yellow for emphasis */
  --hc-border: #ffffff;
  --hc-focus-ring: #00ffff; /* Cyan for high visibility */
  --hc-link: #00ff00; /* Green for links */
  --hc-error: #ff6666; /* Light red for errors */
}
```

**Contrast Ratios** (all >7:1):
- Text on background: 21:1 (white on black)
- Yellow on black: 19.6:1
- Cyan on black: 16.7:1
- Green on black: 15.3:1

---

## 4. Skip Links Implementation

**Decision**: Visually hidden skip links that appear on focus

**Rationale**:
- WCAG 2.1 SC 2.4.1 requires bypass blocks mechanism
- Skip links are the most widely understood pattern
- Should be first focusable element on page

**Best Practices**:
1. Position: absolute, left off-screen (-9999px)
2. On focus: position back on-screen with high z-index
3. Multiple skip links for complex pages: "Skip to content", "Skip to navigation"
4. Use landmark IDs: `#main-content`, `#gallery-grid`, `#photo-actions`

**Implementation**:
```tsx
<a href="#main-content" className="skip-link">
  {t('accessibility.skipToContent')}
</a>
```

---

## 5. RTL CSS Strategy

**Decision**: Convert to CSS logical properties + `dir="rtl"` attribute

**Rationale**:
- Logical properties (margin-inline-start) automatically flip for RTL
- Single codebase supports both LTR and RTL
- Already have i18n config with `dir: 'rtl'` for Urdu

**Properties to Convert**:
| Physical | Logical |
|----------|---------|
| margin-left | margin-inline-start |
| margin-right | margin-inline-end |
| padding-left | padding-inline-start |
| text-align: left | text-align: start |
| left/right (position) | inset-inline-start/end |

**Navigation Arrows**:
- Use `transform: scaleX(-1)` for RTL contexts
- Or use CSS logical values: `left: auto; right: 0` becomes `inset-inline-end: 0`

**Testing Strategy**:
- Add Urdu (ur) to E2E test matrix
- Visual regression tests with RTL screenshots

---

## 6. Nested Sub-Galleries Schema

**Decision**: Add `parent_sub_gallery_id` with max depth constraint (3 levels)

**Rationale**:
- Self-referential foreign key enables arbitrary nesting
- Depth limit prevents UI complexity and performance issues
- Matches existing sub-gallery pattern

**Schema Change**:
```sql
ALTER TABLE sub_galleries
ADD COLUMN parent_sub_gallery_id UUID REFERENCES sub_galleries(sub_gallery_id),
ADD COLUMN depth INTEGER DEFAULT 0;

-- Constraint: max 3 levels (0=root, 1=child, 2=grandchild)
ALTER TABLE sub_galleries
ADD CONSTRAINT max_nesting_depth CHECK (depth <= 2);
```

**Hierarchy Query**:
```python
# Get ancestors for breadcrumbs (recursive CTE)
WITH RECURSIVE ancestors AS (
    SELECT * FROM sub_galleries WHERE sub_gallery_id = :target_id
    UNION ALL
    SELECT sg.* FROM sub_galleries sg
    JOIN ancestors a ON sg.sub_gallery_id = a.parent_sub_gallery_id
)
SELECT * FROM ancestors ORDER BY depth;
```

---

## 7. UTM Parameter Tracking

**Decision**: Store as JSONB field on magic_links, preserve in analytics

**Rationale**:
- JSONB allows flexible UTM parameters (source, medium, campaign, content, term)
- Query by parameter for analytics
- Industry standard naming matches Google Analytics

**Schema**:
```json
{
  "utm_source": "instagram",
  "utm_medium": "social",
  "utm_campaign": "wedding_showcase_2026",
  "utm_content": "gallery_share_button",
  "utm_term": null
}
```

**URL Generation**:
```typescript
const baseUrl = `https://gallery.rawdrive.in/g/${linkId}`;
const utmParams = new URLSearchParams(utmConfig).toString();
const fullUrl = utmParams ? `${baseUrl}?${utmParams}` : baseUrl;
```

---

## 8. Password Reset Email Flow

**Decision**: Use notifications-service with magic link pattern

**Rationale**:
- Consistent with existing magic link infrastructure
- 1-hour expiry for security
- No password change required - grants session access

**Flow**:
1. Client clicks "Forgot password" on gallery
2. Client enters email (must match previous registration)
3. Backend generates reset token (UUID, hashed in DB)
4. notifications-service sends email with link
5. Link grants 24-hour session access to gallery
6. Token is single-use (deleted after first access)

**Email Template**:
```text
Subject: Access your gallery: {gallery_title}

You requested access to {photographer_name}'s gallery.

Click here to access: {reset_link}

This link expires in 1 hour.
```

---

## 9. Slideshow Audio Implementation

**Decision**: HTML5 Audio API with user gesture requirement handling

**Rationale**:
- Native HTML5 Audio works across all browsers
- Autoplay policy requires user gesture
- Fallback "Play music" button for mobile browsers

**Browser Autoplay Policies**:
- Chrome: Blocked unless user has interacted with domain
- Safari: Blocked on mobile, requires user gesture
- Firefox: Blocked for audible media

**Implementation**:
```typescript
const audioRef = useRef<HTMLAudioElement>(null);

useEffect(() => {
  if (slideshowActive && audioUrl) {
    audioRef.current?.play().catch(() => {
      // Autoplay blocked - show play button
      setShowPlayButton(true);
    });
  }
}, [slideshowActive, audioUrl]);
```

**Storage**:
- Audio files stored in R2: `workspaces/{workspace_id}/galleries/{gallery_id}/audio/`
- Max size: 10MB (configured in upload validation)
- Supported formats: MP3, M4A, OGG

---

## 10. Breadcrumb Navigation Pattern

**Decision**: React component with current location state

**Rationale**:
- Breadcrumbs require full path from root to current
- Use recursive CTE query for efficient ancestor lookup
- Component updates on sub-gallery navigation

**API Response**:
```json
{
  "breadcrumbs": [
    { "id": "gallery-uuid", "name": "Wedding Gallery", "type": "gallery" },
    { "id": "sub-1-uuid", "name": "Day 1", "type": "sub_gallery" },
    { "id": "sub-2-uuid", "name": "Ceremony", "type": "sub_gallery" }
  ]
}
```

**Component Design**:
```tsx
<nav aria-label="Breadcrumb">
  <ol className="breadcrumb">
    {items.map((item, index) => (
      <li key={item.id}>
        {index < items.length - 1 ? (
          <Link to={`/g/${galleryId}/${item.id}`}>{item.name}</Link>
        ) : (
          <span aria-current="page">{item.name}</span>
        )}
      </li>
    ))}
  </ol>
</nav>
```

---

## References

- WCAG 2.1 Guidelines: https://www.w3.org/WAI/WCAG21/quickref/
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- CSS Logical Properties: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values
- Redis INCR: https://redis.io/commands/incr/
- Autoplay Policy: https://developer.chrome.com/blog/autoplay/
