# Quickstart: Avatar Editor Component

**Feature**: 030-avatar-editor
**Date**: 2026-01-23

## Overview

The Avatar Editor is a reusable React component for uploading, cropping, and editing avatar images. It features glassmorphism design, touch gesture support, and comprehensive image manipulation tools.

---

## Installation

No additional dependencies required - uses existing project packages:

- `react-easy-crop` - Crop functionality
- `@use-gesture/react` - Touch gestures
- `framer-motion` - Animations
- `lucide-react` - Icons

---

## Basic Usage

### Simple Avatar Upload

```tsx
import { AvatarEditorModal } from '@/components/ui/AvatarEditor';
import { useState } from 'react';

function ProfilePage() {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setIsEditorOpen(true);
    }
  };

  const handleSave = async (file: File) => {
    // Upload to server
    const formData = new FormData();
    formData.append('avatar', file);
    await fetch('/api/profile/avatar', { method: 'POST', body: formData });
    setIsEditorOpen(false);
  };

  return (
    <>
      <input type="file" accept="image/*" onChange={handleFileSelect} />

      <AvatarEditorModal
        isOpen={isEditorOpen}
        file={selectedFile}
        onSave={handleSave}
        onCancel={() => setIsEditorOpen(false)}
      />
    </>
  );
}
```

### With All Features

```tsx
<AvatarEditorModal
  isOpen={isOpen}
  file={selectedFile}
  aspectRatio={1}
  cropShape="round"
  maxOutputSize={512}
  quality={0.9}
  outputFormat="image/webp"
  enableFilters={true}
  enableRotation={true}
  enableFlip={true}
  title="Edit Profile Photo"
  confirmOnClose={true}
  onSave={(file, cropData) => {
    console.log('Saved:', file, cropData);
  }}
  onCancel={() => setIsOpen(false)}
/>
```

---

## Integration Examples

### Replace Existing AvatarUploader

**Before (old pattern):**

```tsx
import { AvatarCropModal } from '@/components/ui/AvatarCropModal';

<AvatarCropModal
  imageSrc={previewUrl}
  isOpen={cropModalOpen}
  onCropComplete={handleCropComplete}
  onCancel={() => setCropModalOpen(false)}
  isLoading={isUploading}
/>
```

**After (new pattern):**

```tsx
import { AvatarEditorModal } from '@/components/ui/AvatarEditor';

<AvatarEditorModal
  isOpen={isEditorOpen}
  file={selectedFile}
  onSave={handleSave}
  onCancel={() => setIsEditorOpen(false)}
  isLoading={isUploading}
/>
```

### Client Form Integration

```tsx
// In ClientFormPage.tsx

const [avatarFile, setAvatarFile] = useState<File | null>(null);
const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);

const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file) {
    setAvatarFile(file);
    setIsAvatarEditorOpen(true);
  }
};

const handleAvatarSave = async (file: File, cropData?: CropData) => {
  if (isEditMode && clientId) {
    // Direct upload for existing client
    await clientService.uploadAvatar(workspaceId, clientId, file, cropData);
  } else {
    // Store for later upload when client is created
    setPendingAvatarFile(file);
  }
  setIsAvatarEditorOpen(false);
};

// In JSX:
<AvatarEditorModal
  isOpen={isAvatarEditorOpen}
  file={avatarFile}
  cropShape="round"
  maxOutputSize={256}
  onSave={handleAvatarSave}
  onCancel={() => setIsAvatarEditorOpen(false)}
  isLoading={isUploadingAvatar}
/>
```

---

## Props Reference

### AvatarEditorProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `file` | `File \| null` | - | Image file to edit |
| `imageSrc` | `string` | - | Image URL (alternative to file) |
| `aspectRatio` | `number` | `1` | Crop aspect ratio |
| `cropShape` | `'round' \| 'rect'` | `'round'` | Shape of crop area |
| `onSave` | `(file, cropData?) => void` | **required** | Save callback |
| `onCancel` | `() => void` | **required** | Cancel callback |
| `maxOutputSize` | `number` | `512` | Max output dimension (px) |
| `quality` | `number` | `0.9` | JPEG/WebP quality (0-1) |
| `outputFormat` | `'image/webp' \| 'image/jpeg' \| 'image/png'` | `'image/webp'` | Output format |
| `isLoading` | `boolean` | `false` | External loading state |
| `enableFilters` | `boolean` | `true` | Show filter controls |
| `enableRotation` | `boolean` | `true` | Show rotation controls |
| `enableFlip` | `boolean` | `true` | Show flip controls |

### AvatarEditorModalProps

Extends `AvatarEditorProps` with:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | **required** | Modal visibility |
| `title` | `string` | `"Edit Photo"` | Modal title |
| `confirmOnClose` | `boolean` | `true` | Confirm before closing with changes |

### CropData Output

```typescript
interface CropData {
  crop_x: number;      // X offset (0-100)
  crop_y: number;      // Y offset (0-100)
  crop_scale: number;  // Zoom level
  rotation?: number;   // Rotation degrees
  flip_h?: boolean;    // Horizontal flip
  flip_v?: boolean;    // Vertical flip
}
```

---

## Using the Hook Directly

For custom UI or advanced use cases:

```tsx
import { useAvatarEditor } from '@/hooks/useAvatarEditor';

function CustomEditor({ file }: { file: File }) {
  const editor = useAvatarEditor();

  useEffect(() => {
    if (file) {
      editor.loadImage(file);
    }
  }, [file]);

  const handleExport = async () => {
    const { file, cropData } = await editor.exportImage({
      maxSize: 512,
      quality: 0.9,
      format: 'image/webp',
    });
    // Use the file
  };

  return (
    <div>
      {/* Custom canvas implementation */}
      <img
        src={editor.imageSrc}
        style={{
          transform: `scale(${editor.zoom}) rotate(${editor.rotation}deg)`,
          filter: editor.cssFilters
        }}
      />

      {/* Custom controls */}
      <input
        type="range"
        min={0.5}
        max={3}
        step={0.01}
        value={editor.zoom}
        onChange={(e) => editor.setZoom(parseFloat(e.target.value))}
      />

      <button onClick={() => editor.rotate90('cw')}>Rotate</button>
      <button onClick={() => editor.toggleFlipH()}>Flip H</button>
      <button onClick={editor.resetAll}>Reset</button>
      <button onClick={handleExport} disabled={!editor.canSave}>
        Save
      </button>
    </div>
  );
}
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Navigate controls |
| `↑/↓` | Adjust slider values |
| `R` | Rotate 90° clockwise |
| `Shift+R` | Rotate 90° counter-clockwise |
| `H` | Flip horizontal |
| `V` | Flip vertical |
| `0` | Reset all |
| `Escape` | Cancel (with confirmation) |
| `Enter` | Save |

---

## Mobile Touch Gestures

| Gesture | Action |
|---------|--------|
| Single finger drag | Pan image |
| Pinch | Zoom in/out |
| Two-finger rotate | Rotate image |

---

## Accessibility

- Full keyboard navigation
- ARIA labels on all controls
- Focus trap in modal
- Screen reader announcements
- Respects `prefers-reduced-motion`

---

## Testing

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { AvatarEditorModal } from '@/components/ui/AvatarEditor';

describe('AvatarEditorModal', () => {
  it('renders when open', () => {
    const mockFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
    render(
      <AvatarEditorModal
        isOpen={true}
        file={mockFile}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('calls onSave when save button clicked', async () => {
    const onSave = jest.fn();
    // ... test implementation
  });
});
```

---

## Migration Checklist

When replacing existing avatar upload code:

- [ ] Remove `AvatarCropModal` import
- [ ] Add `AvatarEditorModal` import from new location
- [ ] Update state: `imageSrc` → `file` (use File object instead of data URL)
- [ ] Update callback: `onCropComplete(blob, cropData)` → `onSave(file, cropData)`
- [ ] Remove manual FileReader usage (component handles this)
- [ ] Remove manual blob URL creation/cleanup (component handles this)
- [ ] Test on desktop and mobile devices
- [ ] Verify upload to backend still works

---

## Troubleshooting

### Image not loading

- Verify file is valid image type (JPEG, PNG, WebP, GIF)
- Check file size is under 10MB
- Check browser console for CORS errors if using URL

### Touch gestures not working

- Ensure `enableRotation` is true for rotation gestures
- Test on real device (simulators may not support multi-touch)
- Check for CSS `touch-action` conflicts

### Output quality issues

- Increase `maxOutputSize` for higher resolution
- Use `quality={1}` for maximum quality
- Use `outputFormat="image/png"` for lossless output

### Modal not closing

- Ensure `onCancel` is implemented
- Check if `confirmOnClose` is blocking (user must confirm)
- Verify `isOpen` state is being updated
