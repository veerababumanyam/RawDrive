# Client-Facing Features

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive provides a comprehensive suite of client-facing features that enable photographers to share galleries with clients in a professional, branded, and interactive environment. Clients can view photos, provide feedback, make selections, and download content—all within a customizable, secure interface.

## Purpose

The client-facing features serve to:
- **Professional Presentation**: Display photos in a branded, polished gallery experience
- **Client Engagement**: Enable clients to interact with photos through selections, ratings, and comments
- **Feedback Collection**: Gather client preferences and approvals through proofing workflows
- **Secure Access**: Protect galleries with passwords, access codes, and expiration dates
- **Seamless Sharing**: Provide multiple sharing methods (links, QR codes, social media)
- **Print Integration**: Allow clients to view and approve print album designs

## Gallery Access & Entry

### Lock Screen (Password Protection)

When a gallery is password-protected, clients see a branded lock screen before accessing content.

**Features:**
- Modern, branded entry interface
- Studio logo and name display
- Password input field with validation
- "Remember me" option for convenience
- Error messaging for incorrect passwords
- Responsive design for mobile and desktop

**Configuration:**
```typescript
interface GalleryLockScreen {
  isPasswordProtected: boolean;
  password: string; // Hashed on backend
  branding: BrandingSettings; // Logo, colors, fonts
  customMessage?: string; // Optional welcome message
}
```

**Accessibility:**
- Keyboard navigation (Tab, Enter)
- Screen reader support for form fields
- Clear error announcements
- High contrast password input
- 44x44px minimum touch targets

### Email Registration

Photographers can require clients to enter their email before viewing galleries.

**Features:**
- Email capture for lead generation
- Optional email verification
- Pre-filled email for returning visitors
- Email stored in client database
- Activity tracking by email

**Configuration:**
```typescript
interface EmailRegistration {
  required: boolean;
  verificationRequired: boolean;
  captureLeads: boolean;
}
```

### Access Codes

Individual photos can be protected with unique access codes, separate from gallery password.

**Features:**
- Per-photo access control
- Unique codes generated per photo
- Clients enter code to unlock photo
- Separate from gallery-level password
- Useful for private/sensitive photos

**Usage:**
```typescript
interface PhotoAccess {
  isPrivate: boolean;
  accessCode?: string; // Unique code for this photo
  accessedBy: string[]; // Email addresses that accessed
}
```

## Gallery Navigation & Layout

### Floating Navigation Header

Sticky header that remains visible while scrolling through gallery.

**Components:**
- Studio logo (clickable, links to photographer profile)
- Gallery title
- Sub-gallery tabs (if applicable)
- Search bar (if enabled)
- Action buttons (favorites, selections, downloads)
- Theme toggle (light/dark)
- Language selector

**Responsive Behavior:**
- Desktop: Full horizontal layout
- Tablet: Condensed layout with menu icon
- Mobile: Hamburger menu with collapsible navigation

### Sub-Gallery Tabs

Navigate between different categories/folders within a gallery.

**Features:**
- Tab-based navigation for organized galleries
- Click to switch between sub-galleries
- Visual indicator of current tab
- Smooth transitions
- Keyboard accessible (Arrow keys)

**Alternative: Continuous Scroll**
- Single scrollable view of all photos
- No tab switching required
- Better for smaller galleries
- Photographer configurable

### View Modes

#### Grid Layout
Uniform square cells arranged in responsive columns.

**Responsive Breakpoints:**
- Mobile (< 640px): 2 columns
- Tablet (640-1024px): 3 columns
- Desktop (1024-1536px): 4 columns
- Large (> 1536px): 5 columns

**Features:**
- Consistent sizing
- Fast rendering
- Predictable layout
- Best for uniform collections

#### Masonry Layout
Pinterest-style waterfall layout preserving image aspect ratios.

**Features:**
- Natural-looking arrangement
- Preserves image proportions
- Balanced column heights
- More engaging visual presentation
- Slightly slower rendering

### Search & Filtering

#### Text Search
Search photos by filename, title, or AI-generated tags.

**Features:**
- Real-time search results
- Highlights matching terms
- Filters by metadata
- Case-insensitive matching
- Keyboard shortcut (Ctrl/Cmd + F)

**Accessibility:**
- Search input with clear label
- Results announced to screen readers
- Keyboard navigable results
- Clear search button

#### Filter Options

**Picks Only**
- Show only photos client has selected
- Useful for reviewing selections
- Reduces visual clutter

**Favorites Only**
- Show only photos marked as favorites
- Quick access to preferred images
- Photographer-curated selections

**Date Range**
- Filter by upload date
- Useful for multi-day events
- Calendar picker interface

## Photo Interaction

### Photo Card Display

Individual photo item in the gallery grid.

**Visual Elements:**
- Thumbnail image with lazy loading
- Photo title and metadata
- Selection checkbox (if enabled)
- Favorite heart icon
- Pick checkmark icon
- Privacy badge (if private)
- Hover actions

**Metadata Display:**
- Filename
- Dimensions (width × height)
- File size
- Upload date
- EXIF data (camera, ISO, aperture, shutter speed, focal length)
- AI-generated tags and captions

### Favorites (Heart Icon)

Mark photos as personal favorites.

**Features:**
- One-click heart icon toggle
- Visual feedback (filled/unfilled heart)
- Persistent storage
- Filter by favorites
- Count display
- Photographer can see client favorites

**Behavior:**
- Click to toggle favorite status
- Immediate visual feedback
- Saved to client profile
- Synced across devices

### Picks/Selections (Checkmark Icon)

Select photos for proofing or purchase.

**Features:**
- One-click selection toggle
- Visual checkmark indicator
- Selection counter
- Bulk selection options
- Photographer can see client picks
- Export selections

**Behavior:**
- Click to select/deselect
- Immediate visual feedback
- Selections persist
- Can be submitted for approval

### Ratings (Star System)

Rate photos on a 5-star scale (optional).

**Features:**
- 1-5 star rating system
- Hover preview of rating
- Click to set rating
- Photographer can see ratings
- Filter by rating
- Average rating display

**Accessibility:**
- Keyboard navigation (Arrow keys)
- Screen reader announcements
- Clear focus indicators
- ARIA labels for each star

## Media Viewing

### Media Viewer (Lightbox)

Full-screen photo/video viewer with navigation and controls.

**Features:**
- Full-screen display
- Previous/next navigation
- Keyboard shortcuts (Arrow keys, Escape)
- Zoom controls (pinch, scroll wheel)
- Download button (if enabled)
- Share button
- Favorite toggle
- Pick toggle
- Photo information panel
- Watermark display

**Navigation:**
- Arrow keys: Previous/next photo
- Escape: Close viewer
- Space: Play/pause video
- +/-: Zoom in/out
- Home/End: First/last photo

**Accessibility:**
- Keyboard fully navigable
- Screen reader support
- High contrast mode support
- Focus management
- Escape key to close
- ARIA labels for all controls

### Deep Zoom

Zoom into high-resolution images for detail inspection.

**Features:**
- Pinch-to-zoom on mobile
- Mouse wheel zoom on desktop
- Zoom controls (+/- buttons)
- Pan while zoomed
- Reset zoom button
- Smooth animations
- Maintains aspect ratio

**Keyboard Shortcuts:**
- +: Zoom in
- -: Zoom out
- 0: Reset zoom
- Arrow keys: Pan while zoomed

### Slideshow

Auto-play gallery in full-screen mode.

**Features:**
- Auto-advance between photos
- Configurable interval (3-10 seconds)
- Play/pause controls
- Manual navigation during slideshow
- Music/background audio (optional)
- Repeat options (loop, once)
- Keyboard controls

**Controls:**
- Space: Play/pause
- Arrow keys: Manual navigation
- Escape: Exit slideshow
- +/-: Adjust speed

### Video Playback

Play videos within the gallery.

**Features:**
- HTML5 video player
- Play/pause controls
- Volume control
- Playback speed adjustment (0.5x - 2x)
- Full-screen mode
- Progress bar with scrubbing
- Duration display
- Keyboard controls

**Supported Formats:**
- MP4 (H.264)
- WebM (VP9)
- MOV (QuickTime)

**Accessibility:**
- Keyboard controls (Space, Arrow keys)
- Captions/subtitles support
- Audio descriptions (optional)
- Screen reader announcements
- High contrast controls

## Selection & Proofing

### Client Proofing View

Dedicated interface for clients to review and select photos.

**Features:**
- Grid layout optimized for selection
- Pick/favorite toggles
- Star ratings
- Comments with pin positioning
- Selection counter
- Bulk selection (Select All)
- Submit selections workflow
- Session tracking

**Workflow:**
1. Client views photos
2. Marks picks and favorites
3. Adds comments/feedback
4. Submits selections
5. Photographer receives notification

### Bulk Selection

Select multiple photos at once.

**Methods:**
- **Select All**: Select all visible photos
- **Ctrl/Cmd + Click**: Add/remove individual items
- **Shift + Click**: Select range between items
- **Checkbox**: Click checkbox on each photo

**Actions on Selection:**
- Download selected photos
- Add to favorites
- Add to picks
- Share selected photos
- Print selected photos

### Comments & Feedback

Leave comments on photos with pin positioning.

**Features:**
- Click on photo to add comment
- Pin shows comment location
- Comment text input
- Timestamp display
- Photographer can reply
- Comment threads
- Notification on replies
- Delete own comments

**Accessibility:**
- Keyboard accessible comment form
- Screen reader support
- Clear focus indicators
- ARIA labels for inputs

## Downloads

### Download Options

Multiple download methods for clients.

#### Single Download
Download individual photo.

**Features:**
- One-click download
- Format selection (Original/Web Optimized)
- Automatic filename
- Progress indicator
- Error handling

#### Bulk Download
Download multiple selected photos.

**Features:**
- Download as ZIP file
- Format selection
- Progress tracking
- Pause/resume capability
- Estimated time remaining
- File size preview

#### Format Selection

**Original Quality**
- Full resolution
- Original format (JPG, PNG, etc.)
- Largest file size
- Best for printing

**Web Optimized**
- Reduced resolution (2048px max)
- WebP format (with JPG fallback)
- Smaller file size
- Faster download
- Suitable for web/social media

### Download Permissions

Photographers control download capabilities.

**Configuration:**
```typescript
interface DownloadSettings {
  allowDownload: boolean; // Master toggle
  allowBulkDownload: boolean; // Multiple photos
  allowOriginalQuality: boolean; // Full resolution
  maxDownloadSize?: number; // Bytes limit
  dailyDownloadLimit?: number; // Per client
}
```

**Enforcement:**
- Backend validates permissions
- Frontend hides download buttons if disabled
- Rate limiting on bulk downloads
- Audit logging of downloads

## Sharing

### Share Links

Generate shareable links for galleries, sub-galleries, or individual photos.

**Features:**
- Unique URL per share
- QR code generation
- Copy to clipboard
- Social media shortcuts
- Email sharing
- Expiration date option
- Password protection option
- Access tracking

### QR Code

Auto-generated QR code for easy mobile access.

**Features:**
- Scannable QR code
- Download as image
- Print-friendly
- Customizable size
- Branded with logo (optional)
- Links to gallery

**Usage:**
- Print on business cards
- Display in studio
- Share on social media
- Include in emails

### Social Sharing

One-click share to social platforms.

**Platforms:**
- WhatsApp
- Facebook
- Twitter/X
- Instagram (copy link)
- Email
- LinkedIn
- Pinterest

**Features:**
- Pre-filled message
- Gallery link included
- Photographer branding
- Custom message option

### Email Sharing

Send gallery link via email.

**Features:**
- Email input field
- Custom message
- Photographer branding
- Recipient tracking
- Resend capability
- Email template customization

**Accessibility:**
- Email input with validation
- Clear error messages
- Keyboard navigable form
- Screen reader support

## Branding & Customization

### Photographer Branding

Galleries display photographer's branding throughout.

**Branding Elements:**
- Studio logo
- Studio name
- Tagline
- Primary color (accent)
- Secondary color
- Font family
- Contact information
- Social media links
- Custom menu links

### Header Branding

Top of gallery displays photographer branding.

**Components:**
- Logo (clickable, links to profile)
- Studio name
- Gallery title
- Navigation tabs
- Search bar
- Action buttons

### Footer Branding

Bottom of gallery displays contact and social info.

**Components:**
- Contact email
- Phone number
- Address/region
- Social media links
- Copyright notice
- Custom links
- "Powered by RawDrive" (optional)

### Watermarking

Optional watermark overlay on images.

**Configuration:**
```typescript
interface WatermarkSettings {
  enabled: boolean;
  logo?: string; // Image URL
  opacity: number; // 10-100%
  position: 'center' | 'tl' | 'tr' | 'bl' | 'br' | 'tiled';
  scale: number; // 0.5-2.0
}
```

**Positions:**
- **Center**: Centered on image
- **TL/TR/BL/BR**: Corners (Top-Left, Top-Right, Bottom-Left, Bottom-Right)
- **Tiled**: Repeated pattern across image

**Accessibility:**
- Watermark doesn't obscure important content
- Sufficient contrast with image
- Doesn't interfere with zoom/pan

### Theme Support

Light and dark theme support.

**Features:**
- System default detection
- Manual toggle
- Photographer can force theme
- Persistent user preference
- Smooth transitions
- High contrast mode support

**Accessibility:**
- Sufficient contrast in both themes
- No color-only information
- Clear focus indicators
- Readable text in all themes

## Print Album Features

### Album Preview

View print album designs before ordering.

**Features:**
- Spread-by-spread preview
- Full-page view
- Zoom in/out
- Page navigation
- Cover preview
- Back cover preview
- Spine preview

### Album Proofing

Client approval workflow for print albums.

**Features:**
- Photographer shares album design
- Client reviews spreads
- Client adds comments/feedback
- Photographer makes revisions
- Version history tracking
- Approval workflow
- Print-ready export

### Album Customization

Clients can customize album designs.

**Features:**
- Photo selection
- Layout templates
- Text editing
- Color customization
- Cover design
- Page ordering
- Add/remove pages

**Limitations:**
- Photographer controls customization level
- Template restrictions
- Photo selection limits
- Text field limits

## Activity & Notifications

### Client Activity Tracking

Photographers can see what clients do in galleries.

**Tracked Actions:**
- Gallery views
- Photo views
- Favorites marked
- Picks selected
- Comments added
- Downloads
- Time spent
- Device/browser info

**Display:**
- Activity timeline
- Last viewed date
- Total views
- Engagement metrics
- Export activity report

### Notifications

Clients receive notifications for important events.

**Notification Types:**
- Gallery shared
- New photos added
- Comment replies
- Album ready for review
- Download ready
- Gallery expiring soon

**Delivery Methods:**
- In-app notifications
- Email notifications
- SMS (optional)
- Push notifications (web app)

## Accessibility Features

### WCAG 2.1 AA Compliance

All client-facing features meet WCAG 2.1 Level AA standards.

**Keyboard Navigation:**
- Tab through all interactive elements
- Enter/Space to activate buttons
- Arrow keys for navigation
- Escape to close modals
- Keyboard shortcuts for common actions

**Screen Reader Support:**
- Semantic HTML structure
- Proper heading hierarchy
- ARIA labels and descriptions
- Live regions for dynamic content
- Image alt text
- Form labels

**Visual Accessibility:**
- Minimum 4.5:1 contrast ratio
- Focus indicators visible
- No color-only information
- Resizable text support
- High contrast mode support
- Zoom support up to 200%

**Mobile Accessibility:**
- 44x44px minimum touch targets
- Adequate spacing between targets
- Responsive design
- Touch-friendly controls
- Landscape/portrait support

### Language Support

Multi-language interface for international clients.

**Supported Languages:**
- English (default)

**India-first languages (initial set):**
- Hindi (हिन्दी)
- Bengali (বাংলা)
- Telugu (తెలుగు)
- Marathi (मराठी)
- Tamil (தமிழ்)
- Gujarati (ગુજરાતી)
- Kannada (ಕನ್ನಡ)
- Malayalam (മലയാളം)
- Punjabi (ਪੰਜਾਬੀ)
- Urdu (اردو)

**Future expansion:** additional global languages can be added via the same i18n framework (translation keys + locale packs).

**Features:**
- Language selector (Client Portal header)
- Persistent language preference (per user; optionally per share link/per client)
- RTL language support (Urdu)
- Translated UI elements
- Translated error messages
- Translated notifications

## Security & Privacy

### Password Protection

Gallery-level password protection.

**Features:**
- Hashed password storage
- Brute-force protection
- Rate limiting
- Session management
- "Remember me" option
- Password reset capability

### Access Control

Fine-grained access control.

**Features:**
- Per-photo access codes
- Expiration dates
- Email-based access
- IP whitelisting (Enterprise)
- Revoke access anytime
- Audit logging

### Data Privacy

Client data protection.

**Features:**
- GDPR compliance
- Data encryption in transit (HTTPS)
- Data encryption at rest
- No third-party tracking
- Privacy policy display
- Data deletion on request
- Activity logs

### Watermarking

Protect photos from unauthorized use.

**Features:**
- Visible watermark overlay
- Photographer branding
- Prevents screenshot abuse
- Customizable opacity
- Multiple positioning options

## Performance Optimization

### Image Optimization

Fast image loading and display.

**Techniques:**
- Lazy loading (load on scroll)
- Responsive images (srcset)
- Format optimization (WebP with JPG fallback)
- Progressive image loading (thumbnail → full)
- CDN delivery
- Browser caching

**Performance Targets:**
- Largest Contentful Paint (LCP): < 2.5s
- First Input Delay (FID): < 100ms
- Cumulative Layout Shift (CLS): < 0.1

### Virtual Scrolling

Efficient rendering of large galleries.

**Features:**
- Render only visible items
- Smooth scrolling
- Handles 1000+ photos
- Maintains 60fps
- Reduced memory usage

### Caching

Smart caching strategies.

**Strategies:**
- Browser cache for images
- Service worker caching
- CDN caching
- API response caching
- Stale-while-revalidate pattern

## Mobile Experience

### Responsive Design

Optimized for all screen sizes.

**Breakpoints:**
- Mobile (< 640px): 2-column grid
- Tablet (640-1024px): 3-column grid
- Desktop (1024-1536px): 4-column grid
- Large (> 1536px): 5-column grid

**Features:**
- Touch-friendly controls
- Hamburger menu on mobile
- Collapsible navigation
- Optimized modals
- Readable text sizes
- Adequate spacing

### Touch Interactions

Optimized for touch devices.

**Gestures:**
- Tap: Select/activate
- Double-tap: Zoom
- Pinch: Zoom in/out
- Swipe: Navigate between photos
- Long-press: Context menu
- Drag: Pan while zoomed

**Features:**
- 44x44px minimum touch targets
- Adequate spacing between targets
- No hover-dependent features
- Haptic feedback (optional)

## Related Files

- `frontend/src/components/gallery/ClientProofingView.tsx` - Client proofing interface
- `frontend/src/components/MediaViewer.tsx` - Full-screen photo viewer
- `frontend/src/components/ShareModal.tsx` - Sharing interface
- `frontend/src/components/Branding.tsx` - Branding components
- `frontend/src/components/ClientDownloadModal.tsx` - Download interface
- `frontend/src/components/AccessCodeModal.tsx` - Access code entry
- `frontend/src/components/gallery/EnhancedLockScreen.tsx` - Password protection
- `frontend/src/components/gallery/InlineComments.tsx` - Comments system
- `frontend/src/components/album-design/ProofingViewer.tsx` - Album proofing
- `docs/GALLERY_CANVAS.md` - Gallery canvas documentation
- `docs/RBAC_AND_USER_MANAGEMENT.md` - Access control documentation

## Last Updated

2025-12-17
