# SEO Best Practices (Public Profiles & Galleries)

A guide for optimizing RawDrive's public-facing pages for Search Engines (Google, Bing).

---

## 1. Technical SEO

### Server-Side Rendering (SSR)
Public pages (`/u/{slug}`, `/gallery/{id}`) must be indexable.
*   **Vite SSR / Next.js:** Ensure HTML payload includes metadata.
*   **Dynamic Rendering:** If using strict SPA (React), use a prerender service (Puppeteer) or serve static OpenGraph tags for bots.

### Meta Tags (Head)
Every public page needs:
*   `<title>`: "Gallery Name | Photographer Name"
*   `<meta name="description">`: "View the wedding gallery of..."
*   `<link rel="canonical">`: The authoritative URL.

### Sitemap
*   **Dynamic:** Generate `sitemap.xml` daily.
*   **Content:** Photographer Profiles, Public Galleries.
*   **Exclusion:** Do NOT include password-protected or private galleries.

---

## 2. Structured Data (JSON-LD)

Help Google understand the content entities.

### Photographer Profile (`/u/johndoe`)
Schema: `LocalBusiness` or `Person`.
```json
{
  "@context": "https://schema.org",
  "@type": "PhotographyBusiness",
  "name": "John Doe Photography",
  "image": "https://...",
  "priceRange": "$$$",
  "address": { ... }
}
```

### Gallery (`/gallery/{id}`)
Schema: `ImageGallery`.
```json
{
  "@type": "ImageGallery",
  "name": "Sarah & Mike Wedding",
  "author": "John Doe",
  "dateCreated": "2024-01-01"
}
```

---

## 3. Performance & Core Web Vitals

SEO ranking factor.
*   **LCP (Largest Contentful Paint):** Hero image must load fast. Preload it.
*   **CLS (Cumulative Layout Shift):** Reserve space for images (aspect-ratio CSS).
*   **Mobile Friendly:** Responsive design is mandatory.

---

## 4. Robots & Indexing

### Robots.txt
*   Allow `/u/`
*   Allow `/gallery/`
*   Disallow `/admin/`
*   Disallow `/api/`

### Directives
*   **Public:** `<meta name="robots" content="index, follow">`
*   **Private/Hidden:** `<meta name="robots" content="noindex, nofollow">`

---

## 5. Social Sharing (OpenGraph)

Optimize for sharing on WhatsApp/Instagram.
*   `og:title`: Engaging title.
*   `og:image`: High-quality cover photo (1200x630px).
*   `og:site_name`: "RawDrive".
