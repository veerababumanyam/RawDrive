> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

Digital Album(Design Studio) should feel like a modern, AI‑assisted digital album factory: fast, visual, collaborative, and “print‑safe” by default.

***

## 1. Smart Lab & Size Setup

- The system shall offer a searchable library of **Lab Presets** (popular Indian and global labs, sizes like 12x36, 10x10, 8x12) with built‑in page size, bleed, safe zones, color profile, and DPI.  
- Users shall be able to create **Custom Presets** (size, gutter, bleed, printable area), save them, and reuse across projects.  
- A live **Spec Panel** shall always show: trim size, spread size, bleed, gutter, and lab name, with warnings if any setting becomes non‑compliant.

***

## 2. Designer Workspace & Flow

- The Designer shall open in a dedicated full‑screen workspace with:
  - **Left rail**: photo browser (from gallery, AI‑selected favorites), filters, usage badges.  
  - **Center**: spread canvas (two facing pages) with zoom, page thumbnails, and page navigator.  
  - **Right rail**: layout templates, styling controls, and AI tools (auto‑layout, best‑shot suggestions).  
- Each photo thumbnail shall display:
  - A **usage counter** (0, 1, 2…) and a subtle indicator if used multiple times.  
  - Quick filters: “Used in album”, “Unused”, “Client favorites”, “AI recommendations”.

***

## 3. Layout, Templates & AI Assistance

- The system shall provide a library of **handcrafted layout templates** (1–12 photos per spread, asymmetric, full‑bleed, collage, text‑heavy) categorized by style (minimal, classic, editorial, cinematic).  
- An **Auto‑Layout / Smart Grouping** feature shall:
  - Take a selected set of photos, group them by scene/time/face, and auto‑build the entire album with appropriate layouts.  
  - Offer quick “Shuffle Layout” and “Try Variant” options per spread to cycle through alternative designs.  
- An **AI Curation Assist** option shall suggest the “best” photos based on sharpness, faces, expressions, and diversity, for users who want to start from a reduced set.

***

## 4. Photo & Element Controls

- Once on the canvas, each element (photo, text, shape) shall support:
  - **Crop & Pan** inside fixed frames with on‑canvas drag/zoom controls.  
  - Styling: borders (color/thickness), radius, drop shadows, opacity, blend overlays, background images.  
  - **Per‑spread themes**: quick presets that adjust background color, text style, and minor layout tweaks to keep consistency.  
- A **Fine Alignment Toolbar** shall offer:
  - Distribute horizontally/vertically, align edges/centers, equalize sizes.  
  - Lock/unlock aspect ratio; lock positions to avoid accidental drags.

***

## 5. Professional Guides & Safety

- The canvas shall show:
  - **Snap‑to‑Grid & Snap‑to‑Element** guides that magnetically align edges and centers.  
  - Persistent **Safe Zone** (inner line) and **Bleed Zone** (outer line), with optional color‑blind‑friendly patterns instead of color alone.  
- When a face or text enters the danger area, the system shall show a subtle **real‑time warning** (“Face near trim edge on page 4; drag inward for safety”).  
- A **Preflight Check** before export shall scan:
  - Resolution per image vs print size (flag low‑res/upsampled photos).  
  - Content crossing gutter/spine unsafely.  
  - Missing images, empty frames, or overset text.

***

## 6. Cover & Special Surfaces

- A dedicated **Cover Mode** shall:
  - Show a flattened wrap: front, spine, back, hinge areas, and safe zones per lab.  
  - Support background photo spill, solid colors, gradients, and patterns; plus logo/title placements.  
  - Warn if key text or faces overlap spine, hinges, or metal cutouts (for some labs).  
- For multi‑product workflows, users can quickly switch between **Main Album**, **Parent Album**, and **Mini Books** that share images but have different sizes and layouts.

***

## 7. Client Proofing & Collaboration

- A web‑based, read‑only **Proofing Viewer** shall show spreads in order with:
  - Zoom, full‑screen, and “View as flipbook” modes.  
  - **Comment pins**: clients click anywhere on a spread to add a comment tied to that location (“Swap this photo”, “Use B&W version”).  
- Comments shall support:
  - Threaded replies (client ↔ photographer), @mentions for team members.  
  - Status: Open, In Progress, Resolved; with filters “Show unresolved only”.  
- A **Proof Approval Flow** shall let clients:
  - Approve the whole album (“Approve to print”) with a confirmation step.  
  - Optionally download a low‑res, watermarked PDF preview for offline review.

***

## 8. Versioning & History

- Every significant change (auto‑layout, major reorder, theme change) shall create a **version snapshot** with a label (e.g., “V2 – After client comments”).  
- Users shall:
  - Compare versions (e.g., side‑by‑side difference of spreads).  
  - Duplicate versions to explore alternate designs without losing current state.  
  - Roll back to any previous version while preserving comments history.

***

## 9. Short‑Form Video & Hybrid Content (Future‑ready)

- The system shall support layouts where spreads can embed:
  - **QR codes** linking to short vertical videos/reels hosted on external platforms (YouTube, Drive, etc.).  
  - An “Add Reel QR” tool that auto‑generates a code and a caption (e.g., “Scan to watch the sangeet highlights”).  
- For digital‑only albums, a **Reel Mode** shall:
  - Export a short animated flip‑through (MP4) with page turns or pan/zoom animations for use on social media, while keeping print exports separate.

***

## 10. Export & Lab Handoff

- Export options shall include:
  - Multi‑page print‑ready PDFs per lab profile (size, bleed, color profile).  
  - Per‑spread high‑res JPEG/TIFF with naming conventions compatible with major labs.  
- A final **Print Summary** shall show:
  - Page count, size, lab profile, any remaining warnings, and file size.  
  - Checklist the user must confirm (“I have reviewed all pages and understand crop/bleed”).

***

## 11. UX, Performance & Safety Nets

- The Designer shall:
  - Autosave frequently with offline tolerance for short disconnects.  
  - Offer undo/redo with a clear history stack.  
  - Use skeleton loaders and progressive thumbnails for large galleries.  
- “Escape hatch” features:
  - **Guided Tour** overlay for new users (step‑by‑step explanation of spreads, safe zones, comments).  
  - **Template‑only mode** for non‑designers where they just choose photos per spread and the system locks layout.


# Album Design and Print Features

## Overview

RawDrive provides a comprehensive Digital Albumdesigner that enables photographers to create professional photo albums with drag-and-drop simplicity. The system includes design tools, templates, proofing workflows, and print integration.

## Purpose

Album design features serve to:
- **Professional Design**: Create print-ready album designs
- **Template Library**: Access pre-designed templates
- **Drag-and-Drop**: Intuitive design interface
- **Client Proofing**: Get client approval before printing
- **Print Integration**: Connect with print providers
- **Version Control**: Track design changes
- **Collaboration**: Work with clients on designs

## Album Designer Interface

### Main Design Canvas

Central workspace for album design.

**Canvas Features:**
- Spread-by-spread editing
- Drag-and-drop photo placement
- Text editing
- Element manipulation
- Zoom controls
- Undo/redo
- Auto-save

**Canvas Toolbar:**
```typescript
interface DesignToolbar {
  // View controls
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: () => void;
  
  // Edit controls
  undo: () => void;
  redo: () => void;
  
  // Page controls
  addPage: () => void;
  deletePage: () => void;
  duplicatePage: () => void;
  
  // Export
  exportPDF: () => void;
  exportImages: () => void;
  
  // Sharing
  share: () => void;
  requestProof: () => void;
}
```

### Spread Navigation

Navigate between album spreads.

**Navigation Features:**
- Thumbnail strip
- Page numbers
- Previous/next buttons
- Jump to page
- Spread preview
- Page count display

**Spread Information:**
```typescript
interface Spread {
  id: string;
  pageNumber: number;
  leftPage: Page;
  rightPage: Page;
  layout: LayoutTemplate;
  backgroundColor: string;
  elements: DesignElement[];
}

interface Page {
  id: string;
  width: number;
  height: number;
  bleedArea: number;
  safeArea: number;
  elements: DesignElement[];
}
```

## Design Elements

### Photo Placement

Add and arrange photos on spreads.

**Photo Features:**
- Drag-and-drop placement
- Resize with handles
- Rotate
- Crop
- Opacity adjustment
- Border/frame options
- Shadow effects

**Photo Element:**
```typescript
interface PhotoElement {
  id: string;
  photoId: string;
  photoUrl: string;
  
  // Position and size
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  
  // Styling
  opacity: number;
  border?: {
    width: number;
    color: string;
    style: 'solid' | 'dashed' | 'dotted';
  };
  shadow?: {
    blur: number;
    offset: number;
    color: string;
  };
  
  // Cropping
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}
```

### Text Elements

Add and format text.

**Text Features:**
- Text input
- Font selection
- Font size
- Color
- Alignment
- Bold/italic/underline
- Letter spacing
- Line height

**Text Element:**
```typescript
interface TextElement {
  id: string;
  content: string;
  
  // Position and size
  x: number;
  y: number;
  width: number;
  height: number;
  
  // Styling
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  alignment: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  
  // Effects
  opacity: number;
  shadow?: ShadowEffect;
}
```

### Shapes and Graphics

Add shapes and decorative elements.

**Shape Types:**
- Rectangles
- Circles
- Lines
- Polygons
- Custom shapes

**Shape Element:**
```typescript
interface ShapeElement {
  id: string;
  type: 'rectangle' | 'circle' | 'line' | 'polygon';
  
  // Position and size
  x: number;
  y: number;
  width: number;
  height: number;
  
  // Styling
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  
  // Effects
  shadow?: ShadowEffect;
  rotation: number;
}
```

### QR Codes

Add QR codes to album.

**QR Code Features:**
- Generate QR code
- Link to gallery
- Link to website
- Link to social media
- Customize size
- Customize color

**QR Code Element:**
```typescript
interface QRCodeElement {
  id: string;
  content: string; // URL or text
  
  // Position and size
  x: number;
  y: number;
  size: number;
  
  // Styling
  foregroundColor: string;
  backgroundColor: string;
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
}
```

## Layout Templates

### Template Library

Pre-designed layout templates.

**Template Categories:**
- Blank layouts
- Photo grids (2x2, 3x3, etc.)
- Photo collages
- Full-page photos
- Text-heavy layouts
- Mixed layouts

**Template Features:**
```typescript
interface LayoutTemplate {
  id: string;
  name: string;
  category: string;
  thumbnail: string;
  
  // Layout
  photoCount: number;
  textAreas: number;
  
  // Dimensions
  width: number;
  height: number;
  
  // Elements
  elements: DesignElement[];
  
  // Metadata
  createdAt: Date;
  popularity: number;
  rating: number;
}
```

### Custom Templates

Create and save custom templates.

**Template Creation:**
1. Design spread
2. Save as template
3. Name template
4. Add description
5. Set category
6. Make available for reuse

**Saved Templates:**
- Personal templates
- Team templates
- Shared templates
- Public templates

## Cover Design

### Cover Designer

Design album cover and back cover.

**Cover Elements:**
- Front cover
- Back cover
- Spine
- Inside front cover
- Inside back cover

**Cover Features:**
- Photo placement
- Text overlay
- Title and subtitle
- Author name
- Date
- Custom graphics

**Cover Design:**
```typescript
interface CoverDesign {
  frontCover: CoverPage;
  backCover: CoverPage;
  spine: CoverPage;
  insideFrontCover?: CoverPage;
  insideBackCover?: CoverPage;
}

interface CoverPage {
  width: number;
  height: number;
  elements: DesignElement[];
  backgroundColor: string;
}
```

## Print Specifications

### Print Settings

Configure print specifications.

**Print Options:**
```typescript
interface PrintSettings {
  // Size
  pageSize: 'letter' | 'a4' | 'custom';
  width: number;
  height: number;
  
  // Binding
  bindingType: 'perfect' | 'spiral' | 'saddle' | 'comb';
  bindingMargin: number;
  
  // Paper
  paperType: 'glossy' | 'matte' | 'luster';
  paperWeight: number; // gsm
  
  // Bleed
  bleedArea: number; // mm
  
  // Color
  colorMode: 'rgb' | 'cmyk';
  colorProfile: string;
}
```

### Bleed and Safe Area

Define print-safe areas.

**Bleed Area:**
- Extra margin for cutting
- Typically 3-5mm
- Prevents white edges
- Extends background colors

**Safe Area:**
- Content should stay within
- Typically 5-10mm from edge
- Prevents text/photos being cut

**Visualization:**
```typescript
interface SafeAreaVisualization {
  showBleedArea: boolean;
  showSafeArea: boolean;
  bleedColor: string; // Visual indicator
  safeAreaColor: string; // Visual indicator
}
```

## Proofing Workflow

### Client Proofing

Get client approval before printing.

**Proofing Process:**
1. Designer creates album
2. Shares with client
3. Client reviews spreads
4. Client adds comments
5. Designer makes revisions
6. Client approves
7. Ready for print

**Proofing Status:**
```typescript
interface ProofingStatus {
  status: 'draft' | 'pending_review' | 'in_review' | 'approved' | 'rejected';
  sharedWith: string[]; // Client emails
  sharedAt: Date;
  reviewDeadline?: Date;
  comments: ProofingComment[];
  approvedAt?: Date;
  approvedBy?: string;
}
```

### Comments and Feedback

Add comments to specific areas.

**Comment Features:**
- Pin comments to location
- Reply to comments
- Resolve comments
- Comment threads
- Mention users
- Notifications

**Comment System:**
```typescript
interface ProofingComment {
  id: string;
  pageNumber: number;
  x: number; // Position on page
  y: number;
  content: string;
  author: string;
  createdAt: Date;
  replies: ProofingComment[];
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}
```

### Version History

Track design changes.

**Version Control:**
- Auto-save versions
- Manual save points
- Version comparison
- Revert to previous version
- Version notes
- Timestamp tracking

**Version Information:**
```typescript
interface DesignVersion {
  id: string;
  versionNumber: number;
  createdAt: Date;
  createdBy: string;
  notes?: string;
  thumbnail: string;
  changesSummary: string;
}
```

## Export and Print

### Export Options

Export album for printing.

**Export Formats:**
- PDF (print-ready)
- JPEG (preview)
- PNG (preview)
- TIFF (high-quality)

**Export Settings:**
```typescript
interface ExportSettings {
  format: 'pdf' | 'jpeg' | 'png' | 'tiff';
  quality: 'draft' | 'standard' | 'high' | 'maximum';
  colorMode: 'rgb' | 'cmyk';
  resolution: number; // DPI
  includeBleed: boolean;
  includeMarks: boolean; // Crop marks, color bars
}
```

### Print Integration

Connect with print providers.

**Print Providers:**
- Local print shops
- Online print services
- Professional labs
- Custom integrations

**Print Order:**
```typescript
interface PrintOrder {
  id: string;
  albumId: string;
  provider: string;
  quantity: number;
  
  // Specifications
  pageSize: string;
  bindingType: string;
  paperType: string;
  
  // Pricing
  unitPrice: number;
  totalPrice: number;
  
  // Status
  status: 'pending' | 'submitted' | 'processing' | 'shipped' | 'delivered';
  orderDate: Date;
  estimatedDelivery?: Date;
  trackingNumber?: string;
}
```

### Digital Export

Export as digital album.

**Digital Export Options:**
- PDF for email
- Web-viewable format
- Mobile app format
- Social media format

**Digital Album:**
```typescript
interface DigitalAlbum {
  id: string;
  format: 'pdf' | 'web' | 'mobile' | 'social';
  url: string;
  password?: string;
  expiresAt?: Date;
  viewCount: number;
  downloadCount: number;
}
```

## Collaboration

### Team Collaboration

Work with team members on designs.

**Collaboration Features:**
- Share album with team
- Assign roles (editor, viewer, commenter)
- Real-time updates
- Comment threads
- Version history
- Conflict resolution

**Collaboration Permissions:**
```typescript
type CollaborationRole = 'owner' | 'editor' | 'commenter' | 'viewer';

interface CollaborationPermissions {
  owner: {
    edit: true,
    comment: true,
    share: true,
    delete: true,
    export: true,
  },
  editor: {
    edit: true,
    comment: true,
    share: false,
    delete: false,
    export: true,
  },
  commenter: {
    edit: false,
    comment: true,
    share: false,
    delete: false,
    export: false,
  },
  viewer: {
    edit: false,
    comment: false,
    share: false,
    delete: false,
    export: false,
  },
}
```

## Guided Tour

### Interactive Tutorial

Guide new users through album designer.

**Tour Steps:**
1. Welcome and overview
2. Adding photos
3. Arranging elements
4. Adding text
5. Using templates
6. Proofing workflow
7. Exporting

**Tour Features:**
- Step-by-step instructions
- Highlight relevant UI
- Interactive examples
- Skip option
- Restart option

## Accessibility

### Designer Accessibility

Ensure album designer is accessible.

**Requirements:**
- Keyboard navigation for all tools
- Screen reader support for elements
- High contrast mode support
- Zoom support up to 200%
- Clear focus indicators
- Accessible color picker
- Keyboard shortcuts documented

**Keyboard Shortcuts:**
- Ctrl/Cmd + Z: Undo
- Ctrl/Cmd + Y: Redo
- Ctrl/Cmd + S: Save
- Ctrl/Cmd + E: Export
- Delete: Delete selected element
- Arrow keys: Move selected element
- Shift + Arrow: Resize element

## Performance Optimization

### Canvas Performance

Optimize design canvas performance.

**Optimizations:**
- Virtual rendering (render only visible elements)
- Debounced updates
- Lazy loading of images
- Caching of rendered spreads
- Web Workers for heavy operations

### File Size Management

Manage design file sizes.

**Optimization:**
- Compress images
- Remove unused elements
- Optimize fonts
- Minimize metadata
- Archive old versions

## Related Files

- `frontend/src/components/album-design/AlbumDesigner.tsx` - Main designer
- `frontend/src/components/album-design/SpreadCanvas.tsx` - Canvas component
- `frontend/src/components/album-design/CoverDesigner.tsx` - Cover design
- `frontend/src/components/album-design/TemplateLibrary.tsx` - Templates
- `frontend/src/components/album-design/ProofingViewer.tsx` - Proofing
- `frontend/src/components/album-design/CommentThread.tsx` - Comments
- `frontend/src/components/album-design/VersionHistory.tsx` - Version control
- `frontend/src/components/album-design/ExportDialog.tsx` - Export options
- `frontend/src/components/album-design/GuidedTour.tsx` - Tutorial

## Last Updated

2025-12-17
