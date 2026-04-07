# Technical Requirements: Client Galleries & PWA

**Document Status:** Draft v1.1 (Market Aligned)  
**Ownership:** Frontend / UX  
**Technology:** React (Vite/PWA), Cloudflare Workers (Edge Caching), HTML5 Web Storage

---

## 1. Product Mission
Deliver a high-performance, mobile-first gallery experience that feels like a native app. Focus on **instant loading (LCP < 1.2s)**, offline accessibility, and professional-grade security (Sensitive Photo Locking).

## 2. Progressive Web App (PWA) Implementation

### 2.1 Native Experience Benchmarks
- **Install-to-Home:** One-click prompt to add the gallery as an app icon.
- **Offline Mode:**
    *   **Metadata Caching:** IndexedDB stores gallery structure and favorite lists.
    *   **Thumbnail Service:** Service Worker pre-caches low-res thumbnails for the landing grid.
- **Push Notifications:** Alert clients when "New Photos Added" or "Gallery Expiring" (using Web Push API).

### 2.2 Performance Targets (Core Web Vitals)
- **Largest Contentful Paint (LCP):** < 1.2s on 4G/LTE.
- **First Input Delay (FID):** < 100ms.
- **Cumulative Layout Shift (CLS):** 0 (ensure masonry grid placeholders are stable).

---

## 3. The "Magic Link Grid" (Pic-Time Benchmark)

### 3.1 Adaptive Layouts
- **Smart Masonry:** Responsive logic that adjusts column count and item aspect ratios based on viewport.
- **"View as Client" Mode:** Photographers can toggle a persistent "Client Preview" overlay to verify branding/layout before sharing.

### 3.2 Interaction Layers
- **Social Sharing:** Deep-links to specific photos with OpenGraph tags (shows the actual photo in WhatsApp/Instagram previews).
- **Favorites & Selection:** Clients can mark favorites and create "Selection Lists" for album design (Ash Framework handles selection state).

---

## 4. Professional Security & Privacy

### 4.1 Sensitive Photo Locking
- **The "Vault" Feature:** Ability to mark specific photos/collections as "Sensitive" (e.g., boudoir, intimate ceremony).
- **Secondary PIN:** These photos are blurred in the main grid and require a separate 4-6 digit PIN to view.

### 4.2 Gallery Access Controls
- **Password Protection:** Standard gallery-level passwords.
- **Global Search Protection:** Ability to hide specific galleries from "Client Profile" searches.
- **Right-Click Protection:** (Optional/Soft) Disable context menu to discourage unauthorized downloads.

---

## 5. Mobile In-App Experience
- **Smooth Gestures:** Swipe-to-next, pinch-to-zoom (high-res on demand).
- **Download Management:** Clients can choose to download "Original High Res" (requires credit/permission) or "Web Optimized".

---

## 6. Integration with AI
- **FaceID Entry:** The PWA launcher integrates with **AI_Intelligence_Search.md** to offer "Find My Photos" as a primary action.
