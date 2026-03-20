# Lightbox Image Fitting

**When to use this skill:** When implementing or fixing image display in lightbox/viewer components, ensuring photos auto-fit regardless of size, resolution, and orientation.

## Industry Standard Pattern

Google Photos, Apple Photos, Adobe Lightroom, and all professional photo viewers use the same pattern:

**Absolute positioning + object-fit contain**

```tsx
// Image element (no wrapper div!)
<img
  className="absolute inset-0 w-full h-full"
  style={{ objectFit: 'contain' }}
  src={imageUrl}
  alt={alt}
/>
```

## Why This Works

- **Browser's native algorithm**: `object-fit: contain` automatically handles ALL aspect ratios (portrait, landscape, square)
- **No wrapper divs**: Wrappers create constraint chain problems and circular dependencies
- **Absolute positioning**: `absolute inset-0` makes the image fill its positioned parent exactly
- **Positioning context**: Parent must have `position: relative` (or absolute/fixed) and explicit width/height

## Complete Implementation

### Transform Wrapper (Parent Container)

```tsx
<div
  style={{
    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px) rotate(${rotation}deg)`,
    transition: isPanning ? 'none' : 'transform 0.2s ease-out',
    position: 'relative',  // ← Positioning context for absolute images
    width: '100%',         // ← MUST have explicit dimensions
    height: '100%',
  }}
>
  {/* Images go here */}
</div>
```

### LQIP Blur-Up Pattern

```tsx
return (
  <>
    {/* LQIP placeholder - blurred low-res version */}
    <AnimatePresence>
      {showLqip && lqip && (
        <motion.img
          src={lqip}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            objectFit: 'contain',
            willChange: 'opacity, filter',
          }}
          initial={{ opacity: 1, filter: 'blur(20px)', scale: 1.05 }}
          animate={imageLoaded ? { opacity: 0 } : { opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}
    </AnimatePresence>

    {/* Main high-res image */}
    <motion.img
      src={src}
      alt={alt}
      className="absolute inset-0 w-full h-full select-none"
      style={{
        objectFit: 'contain',
        imageRendering: 'auto',
        willChange: 'opacity',
      }}
      initial={{ opacity: 0 }}
      animate={imageLoaded ? { opacity: 1 } : { opacity: 0 }}
      onLoad={() => setImageLoaded(true)}
      draggable={false}
    />
  </>
);
```

### Constraint Chain (Top to Bottom)

```
Viewport Container (fixed/absolute positioning)
  ↓
Outer Container (absolute inset-0 with padding)
  className="absolute inset-0 flex items-center justify-center p-4 pb-24"
  ↓
Transform Wrapper (relative positioning with explicit size)
  style={{ position: 'relative', width: '100%', height: '100%' }}
  ↓
Images (absolute inset-0 with object-fit contain)
  className="absolute inset-0"
  style={{ objectFit: 'contain' }}
```

## Common Pitfalls to Avoid

### ❌ WRONG: Wrapper div with no size constraints

```tsx
// This breaks because wrapper has no width/height
<div className="relative overflow-hidden">
  <img className="w-full h-full object-contain" />
</div>
```

### ❌ WRONG: Using max-w/max-h on images

```tsx
// This references parent size, creates circular dependency
<img className="max-w-full max-h-full object-contain" />
```

### ❌ WRONG: Flex container with auto sizing

```tsx
// Flex items size to content, not available space
<div className="flex items-center justify-center">
  <img className="object-contain" />
</div>
```

### ✅ CORRECT: Absolute positioning pattern

```tsx
// Parent provides positioning context and size
<div style={{ position: 'relative', width: '100%', height: '100%' }}>
  {/* Image fills parent exactly */}
  <img className="absolute inset-0" style={{ objectFit: 'contain' }} />
</div>
```

## Real-World Example: RawDrive Lightbox

**File**: `frontend/src/components/features/gallery/LightboxImage.tsx`

Key points:
- No wrapper div around images
- Both LQIP and main image use `absolute inset-0`
- Parent transform wrapper has `position: relative, width: 100%, height: 100%`
- Container handles filmstrip padding: `p-4 pb-24` (96px bottom padding)
- All aspect ratios (portrait, landscape, square) auto-fit perfectly

**File**: `frontend/src/components/features/gallery/Lightbox.tsx` (lines 605-616)

Transform wrapper configuration:
```tsx
<div
  style={{
    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px) rotate(${rotation}deg)`,
    transition: isPanning ? 'none' : 'transform 0.2s ease-out',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',   // Critical: explicit width
    height: '100%',  // Critical: explicit height
  }}
>
  <LightboxImage ... />
</div>
```

## Filmstrip Thumbnails

**File**: `frontend/src/components/features/gallery/LightboxFilmstrip.tsx`

Thumbnails also use the same pattern:
- `react-window` Grid for virtualization (5000+ images)
- Each thumbnail cell: `relative` wrapper with explicit size
- Image inside: `w-full h-full object-cover` (cover for thumbnails, contain for main view)
- Opacity: 80% unselected, 100% selected (changed from 60% for better visibility)

```tsx
<button
  className={`
    relative w-full h-full rounded overflow-hidden
    ${isSelected
      ? 'ring-2 ring-white scale-100 opacity-100'
      : 'opacity-80 hover:opacity-100'  // ← 80% for visibility
    }
  `}
>
  <img
    src={thumbnailUrl}
    className="w-full h-full object-cover"  // ← cover for thumbnails
    loading="lazy"
  />
</button>
```

## Testing Checklist

When implementing or fixing lightbox image fitting:

- [ ] Horizontal photos fill width, maintain aspect ratio
- [ ] Vertical photos fill height, maintain aspect ratio
- [ ] Square photos maintain aspect ratio
- [ ] Images never crop (full photo always visible)
- [ ] Images never stretch or distort
- [ ] Works with zoom/pan/rotation transforms
- [ ] Works with different viewport sizes (mobile, tablet, desktop)
- [ ] Filmstrip thumbnails visible (opacity not too low)
- [ ] LQIP blur-up smooth (if implemented)
- [ ] No layout shift during image load

## References

- **object-fit MDN**: https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit
- **Positioning MDN**: https://developer.mozilla.org/en-US/docs/Web/CSS/position
- **React Window v2**: For virtualized thumbnail grids
- **Framer Motion**: For smooth LQIP transitions
