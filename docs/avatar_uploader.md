Rebuild Avatar Uploader from Scratch as a shared component and re-use it in all the applciation where upload avatar is required like User profile, clients, visitors, company profile, etc

Overview
Remove all existing avatar upload/crop code and rebuild a modern avatar editor with liquid glassmorphism design, following industry best practices from Apple, Google, and Facebook.

Architecture
Component Structure
AvatarEditor/
├── AvatarEditor.tsx          # Main editor component
├── AvatarEditorControls.tsx   # Control panel (zoom, rotate, flip, filters)
├── AvatarEditorCanvas.tsx     # Image display and manipulation canvas
├── AvatarEditorModal.tsx      # Modal wrapper with glassmorphism
└── hooks/
    ├── useAvatarEditor.ts     # Core editor logic
    ├── useImageTransform.ts   # Transform calculations
    └── useTouchGestures.ts    # Mobile touch support
Data Flow
File
FileReader
User Actions
Transform State
Apply
Blob/File
Update
File Input
AvatarEditor
AvatarEditorCanvas
useAvatarEditor
Canvas Processing
onSave Callback
Parent Component
Implementation Plan
Phase 1: Remove Existing Code
Files to Delete:

frontend/src/components/ui/ImageCropper.tsx (complete removal)
Files to Modify:

frontend/src/components/ClientsView.tsx
Remove: tempAvatarSrc, isCropping state
Remove: handleAvatarSelect, handleCropComplete functions
Remove: ImageCropper import and usage
Update: Avatar upload to use new component
frontend/src/components/ClientDetailView.tsx
Remove: handleAvatarUpload function (FileReader-based)
Update: Avatar upload to use new component
frontend/src/components/SettingsView.tsx
Remove: Avatar upload handler
Update: Avatar upload to use new component
Phase 2: Create New Avatar Editor Component
1. Core Editor Component (frontend/src/components/ui/AvatarEditor/AvatarEditor.tsx)

Props interface:
interface AvatarEditorProps {
  file: File | null;
  aspectRatio?: number; // 1 for circle, 4/3 for rectangle, etc.
  onSave: (file: File) => void;
  onCancel: () => void;
  maxSize?: number; // Max output size in pixels
  quality?: number; // JPEG quality 0-1
}
State management for all transformations
Coordinate image processing pipeline
2. Canvas Component (frontend/src/components/ui/AvatarEditor/AvatarEditorCanvas.tsx)

Display image with all transforms applied
Handle drag/pan gestures
Support pinch-to-zoom on mobile
Real-time preview of all adjustments
Circular/rectangular crop overlay
3. Controls Component (frontend/src/components/ui/AvatarEditor/AvatarEditorControls.tsx)

Zoom slider (0.5x - 3x)
Rotate buttons (90° increments) + free rotation slider
Flip horizontal/vertical toggles
Filter controls (brightness, contrast, saturation)
Reset button
Aspect ratio selector (if multiple ratios supported)
Mobile-optimized touch controls
4. Modal Wrapper (frontend/src/components/ui/AvatarEditor/AvatarEditorModal.tsx)

Liquid glassmorphism design
Backdrop blur with frosted glass effect
Light/dark mode support
Responsive layout (mobile-first)
Smooth animations
5. Custom Hooks

useAvatarEditor.ts:

Manage all editor state (zoom, pan, rotate, flip, filters)
Calculate transform matrices
Handle image loading and processing
Export final image as File/Blob
useImageTransform.ts:

Transform calculations (scale, translate, rotate)
Coordinate system conversions
Crop area calculations
Canvas drawing logic
useTouchGestures.ts:

Pinch-to-zoom detection
Two-finger rotation
Pan gestures
Touch event handling
Phase 3: Design System Integration
Liquid Glassmorphism Styles:

/* Glass effect */
backdrop-filter: blur(20px) saturate(180%);
background: rgba(255, 255, 255, 0.1); /* Light mode */
background: rgba(0, 0, 0, 0.2); /* Dark mode */
border: 1px solid rgba(255, 255, 255, 0.2);
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
Color Integration:

Use existing CSS custom properties from frontend/src/index.css
Support data-theme="dark" attribute
Use semantic color tokens: --color-surface, --color-foreground, etc.
Responsive Breakpoints:

Mobile: < 640px (full-screen modal, bottom sheet controls)
Tablet: 640px - 1024px (centered modal, side controls)
Desktop: > 1024px (centered modal, full control panel)
Phase 4: Features Implementation
Zoom:

Slider: 0.5x to 3x
Pinch gesture on mobile
Mouse wheel on desktop
Smooth animations
Pan/Drag:

Click and drag to reposition
Touch drag on mobile
Constrain to image bounds
Smooth momentum on release
Rotate:

90° increment buttons
Free rotation slider (-180° to 180°)
Two-finger rotation on mobile
Visual rotation indicator
Flip:

Horizontal flip toggle
Vertical flip toggle
Visual preview
Filters:

Brightness: -100% to +100%
Contrast: -100% to +100%
Saturation: -100% to +100%
Real-time preview
Reset to defaults
Aspect Ratios:

Circle (1:1)
Square (1:1)
Portrait (3:4)
Landscape (4:3)
Custom ratios
Visual ratio selector
Reset:

Reset all transformations
Reset filters
Reset to original image
Smooth animation back to defaults
Phase 5: Image Processing
Canvas Operations:

Load image into canvas
Apply all transformations
Apply filters (brightness, contrast, saturation)
Crop to aspect ratio
Export as File/Blob
Support JPEG and PNG output
Configurable quality/size
Performance:

Use requestAnimationFrame for smooth animations
Debounce filter adjustments
Optimize canvas operations
Lazy load image processing
Phase 6: Integration
Update Integration Points:

ClientsView.tsx:
const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file) {
    setAvatarFile(file);
    setIsEditingAvatar(true);
  }
};

const handleAvatarSave = (file: File) => {
  // Convert to base64 for storage (if needed)
  const reader = new FileReader();
  reader.onloadend = () => {
    setNewClient({ ...newClient, avatarUrl: reader.result as string });
  };
  reader.readAsDataURL(file);
  setIsEditingAvatar(false);
};
ClientDetailView.tsx:
Similar pattern for editing existing client
SettingsView.tsx:
Similar pattern for profile photo
API Changes:

Old: onCrop: (base64: string) => void
New: onSave: (file: File) => void
Components can convert File to base64 if needed for storage
Phase 7: Mobile Optimization
Touch Gestures:

Pinch-to-zoom (two fingers)
Pan (one finger drag)
Rotate (two finger rotation)
Tap to focus
Mobile UI:

Bottom sheet for controls on mobile
Full-screen modal on small screens
Large touch targets (min 44x44px)
Swipe gestures for navigation
Haptic feedback (if available)
Performance:

Optimize for lower-end devices
Reduce canvas operations on mobile
Lazy load heavy computations
Progressive enhancement
Phase 8: Testing & Polish
Accessibility:

Keyboard navigation
Screen reader support
Focus management
ARIA labels
High contrast mode support
Animations:

Smooth transitions
Loading states
Error handling
Success feedback
Error Handling:

Inval