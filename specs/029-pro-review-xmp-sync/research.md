# Research: Pro Review Mode & Desktop Sync

**Feature**: 029-pro-review-xmp-sync | **Date**: 2026-01-22 | **Phase**: 0

## Executive Summary

This document captures technology decisions and research findings for implementing the Pro Review Mode with XMP sync and native desktop applications. Three major areas were evaluated:

1. **XMP Parsing Libraries** - For reading/writing Adobe XMP sidecar files
2. **Desktop App Framework** - For cross-platform native applications
3. **File System Watching** - For real-time folder synchronization

## 1. XMP Parsing Libraries

### Requirements
- Read/write XMP sidecar files (.xmp)
- Support Adobe Lightroom rating fields (`xmp:Rating`, `xmp:Label`, `photoshop:Urgency`)
- Handle embedded XMP in RAW files (read-only for initial release)
- Python backend implementation

### Options Evaluated

| Library | License | Pros | Cons |
|---------|---------|------|------|
| **python-xmp-toolkit** | BSD | Full XMP SDK wrapper, Adobe-compatible | Requires Exempi C library, complex installation |
| **lxml** | BSD | Pure Python, no C deps, XML manipulation | Manual XMP schema handling required |
| **defusedxml + lxml** | PSF | Secure XML parsing, prevents XXE attacks | Same as lxml |
| **py3exiv2** | GPL-3.0 | Full EXIF/XMP support | GPL license, external deps |

### Decision: **lxml with custom XMP handler**

**Rationale**:
1. XMP is RDF/XML - lxml handles this natively
2. No C library dependencies simplifies Docker deployment
3. We only need a subset of XMP fields (ratings, flags, labels)
4. defusedxml integration prevents XML External Entity (XXE) attacks
5. BSD license compatible with commercial use

**Implementation Approach**:
```python
# XMP namespace mapping
XMP_NAMESPACES = {
    'x': 'adobe:ns:meta/',
    'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    'xmp': 'http://ns.adobe.com/xap/1.0/',
    'photoshop': 'http://ns.adobe.com/photoshop/1.0/',
    'xmpMM': 'http://ns.adobe.com/xap/1.0/mm/',
}

# Fields we read/write
SUPPORTED_FIELDS = {
    'rating': 'xmp:Rating',        # 0-5 star rating
    'label': 'xmp:Label',          # Color label (Red, Yellow, Green, Blue, Purple)
    'flag': 'photoshop:Urgency',   # 1=Pick, 5=Reject (Lightroom convention)
}
```

**Risk Mitigation**:
- Golden master tests with real Lightroom-generated XMP files
- Validate against Adobe XMP specification
- Preserve unknown fields when writing (round-trip safety)

---

## 2. Desktop Application Framework

### Requirements
- Windows 10/11 and macOS 12+ support
- System tray integration
- Native file system access
- Secure credential storage (OS keychain)
- Small binary size (<50MB)
- No admin privileges for installation
- Auto-update capability

### Options Evaluated

| Framework | Languages | Bundle Size | Pros | Cons |
|-----------|-----------|-------------|------|------|
| **Electron** | JS/TS | 150-250MB | Mature ecosystem, chromium-based | Large binary, high memory |
| **Tauri 2.x** | Rust + JS/TS | 5-15MB | Small size, native APIs, secure | Younger ecosystem, Rust learning curve |
| **Flutter** | Dart | 20-50MB | Single codebase, good UI | Desktop support newer, larger bundle |
| **NW.js** | JS/TS | 100-150MB | Node.js access, chromium | Similar issues to Electron |
| **.NET MAUI** | C# | 30-80MB | Microsoft ecosystem | macOS support weaker |

### Decision: **Tauri 2.x**

**Rationale**:
1. **Bundle size**: 5-15MB vs 200MB+ for Electron - critical for user adoption
2. **Security**: Rust backend, no Node.js attack surface, allowlist-based IPC
3. **Native APIs**: Direct access to OS keychain, file system watching, system tray
4. **Performance**: Rust backend is memory-efficient (<200MB for our use case)
5. **Modern stack**: React frontend familiar to our team, Rust is increasingly adopted
6. **Auto-updater**: Built-in updater with signature verification

**Architecture**:
```
┌─────────────────────────────────────────────────┐
│                 Desktop App                      │
├─────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐   │
│  │           React Frontend                 │   │
│  │  (SetupWizard, FolderList, SyncStatus)  │   │
│  └─────────────────────────────────────────┘   │
│                      │ Tauri IPC                 │
│  ┌─────────────────────────────────────────┐   │
│  │           Rust Backend                   │   │
│  │  ┌─────────┐ ┌─────────┐ ┌───────────┐ │   │
│  │  │ File    │ │ Sync    │ │ API       │ │   │
│  │  │ Watcher │ │ Queue   │ │ Client    │ │   │
│  │  └─────────┘ └─────────┘ └───────────┘ │   │
│  │  ┌─────────┐ ┌─────────┐               │   │
│  │  │ Keyring │ │ System  │               │   │
│  │  │ Storage │ │ Tray    │               │   │
│  │  └─────────┘ └─────────┘               │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Key Rust Crates**:
- `notify` - Cross-platform file system events
- `keyring` - OS-native credential storage
- `reqwest` - HTTP client for RawDrive API
- `tokio` - Async runtime
- `serde` - JSON serialization
- `tauri-plugin-updater` - Auto-update support

**Risk Mitigation**:
- Team Rust training (basic proficiency sufficient for our needs)
- Start with Windows build, macOS follows same patterns
- Extensive E2E testing on both platforms
- Community support through Tauri Discord

---

## 3. File System Watching

### Requirements
- Detect file create/modify/delete/rename events
- Support recursive folder watching
- Handle large folders (10,000+ files)
- Cross-platform (Windows, macOS)
- Debounce rapid changes
- Resume after app restart

### Options Evaluated

| Approach | Platform | Pros | Cons |
|----------|----------|------|------|
| **notify crate** | Cross-platform | Native APIs, well-maintained | Event coalescing varies by OS |
| **inotify** | Linux only | Kernel-level, efficient | Linux only |
| **FSEvents** | macOS only | Efficient, handles large trees | macOS only |
| **ReadDirectoryChangesW** | Windows only | Native, efficient | Windows only |
| **Polling** | Cross-platform | Consistent behavior | High CPU, delayed detection |

### Decision: **notify crate (recommended backend)**

**Rationale**:
1. Abstracts platform differences (uses FSEvents on macOS, ReadDirectoryChangesW on Windows)
2. Well-maintained, widely used in Rust ecosystem
3. Supports recursive watching
4. Can configure debounce interval

**Event Handling Strategy**:
```rust
// Debounce configuration
const DEBOUNCE_MS: u64 = 500;  // Wait 500ms after last event

// Event types we care about
enum SyncEvent {
    FileCreated(PathBuf),      // New file to upload
    FileModified(PathBuf),     // Re-upload or update metadata
    FileDeleted(PathBuf),      // Remove from gallery (with confirmation)
    FileRenamed(PathBuf, PathBuf), // Update filename in gallery
}

// Ignore patterns
const IGNORE_PATTERNS: &[&str] = &[
    "*.tmp",
    "*.part",
    "~$*",           // Office temp files
    ".DS_Store",     // macOS
    "Thumbs.db",     // Windows
    "*.xmp",         // XMP sidecars handled separately
];
```

**Sync Queue Design**:
- SQLite local database for queue persistence
- Retry with exponential backoff (1s, 2s, 4s, 8s, max 5 min)
- Offline queue holds changes until connectivity restored
- Conflict detection: compare file hash with server version

---

## 4. Keyboard Shortcuts (Web)

### Requirements
- Lightroom-compatible shortcuts (1-5, P/U/X, arrows)
- Work in Review Mode without page navigation
- Accessible (screen reader compatible)
- No conflicts with browser shortcuts

### Options Evaluated

| Library | Size | Pros | Cons |
|---------|------|------|------|
| **react-hotkeys-hook** | 2KB | Simple API, hook-based, well-maintained | Limited scope management |
| **mousetrap** | 5KB | Battle-tested, scope support | Class-based, older style |
| **hotkeys-js** | 6KB | Full-featured, key sequences | Not React-specific |
| **@react-hook/keyboard-event** | 1KB | Minimal, hooks | Very basic |

### Decision: **react-hotkeys-hook**

**Rationale**:
1. Hook-based API fits our React patterns
2. Tiny bundle size (2KB gzipped)
3. Active maintenance
4. Easy scope management for Review Mode

**Shortcut Mapping**:
```typescript
const REVIEW_SHORTCUTS = {
  // Ratings
  '0': () => setRating(0),
  '1': () => setRating(1),
  '2': () => setRating(2),
  '3': () => setRating(3),
  '4': () => setRating(4),
  '5': () => setRating(5),

  // Flags
  'p': () => setFlag('pick'),
  'u': () => setFlag('unflagged'),
  'x': () => setFlag('reject'),

  // Navigation
  'ArrowRight': () => nextPhoto(),
  'ArrowLeft': () => prevPhoto(),
  'Home': () => firstPhoto(),
  'End': () => lastPhoto(),

  // View
  'f': () => toggleFullscreen(),
  'i': () => toggleInfo(),
  'Escape': () => exitReviewMode(),
};
```

---

## 5. Virtualized Lists (Web)

### Requirements
- Handle 10,000+ images in filmstrip
- Smooth scrolling
- Dynamic thumbnail loading
- Memory efficient

### Options Evaluated

| Library | Pros | Cons |
|---------|------|------|
| **react-virtualized** | Full-featured, proven | Large bundle, complex API |
| **react-window** | Smaller, simpler API | Less features |
| **@tanstack/virtual** | Modern, framework-agnostic | Newer, less battle-tested |

### Decision: **@tanstack/virtual (TanStack Virtual)**

**Rationale**:
1. Modern hook-based API
2. Smaller bundle than react-virtualized
3. Better TypeScript support
4. Active maintenance by TanStack team
5. Works with horizontal scrolling (filmstrip)

---

## 6. API Key Security

### Requirements
- Scoped to specific galleries
- Revocable
- SOC2/GDPR audit trail
- Desktop app storage

### Design Decisions

**API Key Format**:
```
rdsync_{gallery_id_prefix}_{random_32_chars}
Example: rdsync_gal_a1b2c3d4_Xk9mN2pQ7rS4tU6vW8xY0zA3bC5dE7fG
```

**Key Components**:
1. **Prefix** (`rdsync_`): Identifies key type for support/debugging
2. **Gallery ID prefix** (`gal_a1b2c3d4`): Hints at scope without exposing full ID
3. **Random component**: 32 alphanumeric characters (192 bits entropy)

**Storage**:
- Backend: SHA-256 hash stored in database (never plaintext)
- Desktop: OS-native keyring (Windows Credential Manager, macOS Keychain)
- Web export: One-time display, user copies to Lightroom

**Audit Trail**:
```sql
CREATE TABLE sync_audit_log (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    gallery_id UUID NOT NULL,
    api_key_id UUID,  -- NULL if action by user directly
    action VARCHAR(50) NOT NULL,  -- 'xmp_export', 'xmp_import', 'file_upload', 'file_delete'
    asset_count INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Real-time Updates (Web)

### Requirements
- Notify web UI when desktop app syncs
- Update filmstrip without full reload
- Low latency

### Decision: **Existing Redis PubSub + WebSocket**

RawDrive already has WebSocket infrastructure. We'll extend it:

```python
# Channel: gallery:{gallery_id}:sync
# Message format:
{
    "type": "sync_event",
    "action": "assets_added" | "assets_updated" | "assets_deleted",
    "asset_ids": ["uuid1", "uuid2"],
    "source": "desktop_sync" | "xmp_import",
    "timestamp": "2026-01-22T10:30:00Z"
}
```

---

## 8. XMP Round-Trip Safety

### Problem
When we export XMP and user modifies in Lightroom, then imports back, we must not lose Lightroom's changes to other fields.

### Solution: Preserve Unknown Fields

```python
def update_xmp_file(filepath: str, updates: dict) -> None:
    """Update specific XMP fields while preserving others."""
    tree = etree.parse(filepath)

    # Only modify our known fields
    for field_name, value in updates.items():
        xpath = FIELD_XPATHS[field_name]
        element = tree.xpath(xpath, namespaces=XMP_NAMESPACES)
        if element:
            element[0].text = str(value)
        else:
            # Create field if missing
            _create_xmp_field(tree, field_name, value)

    # Write back - preserving all other content
    tree.write(filepath, encoding='utf-8', xml_declaration=True)
```

---

## 9. Build & Distribution

### Windows
- **Installer**: MSI via WiX Toolset (bundled with Tauri)
- **Code signing**: Azure Code Signing (EV certificate for SmartScreen)
- **Auto-update**: Tauri updater with NSIS support

### macOS
- **Package**: DMG with app bundle
- **Code signing**: Apple Developer ID
- **Notarization**: Required for Gatekeeper
- **Auto-update**: Sparkle-compatible via Tauri updater

### Distribution Channels
1. Direct download from RawDrive website
2. Future: Microsoft Store, Mac App Store (optional)

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Rust learning curve | Medium | Medium | Focus on simple CRUD patterns; leverage Tauri examples |
| XMP format variations | Medium | High | Golden master tests with files from multiple sources |
| File watcher reliability | Low | High | Fallback to periodic polling if native events fail |
| Code signing delays | Medium | Medium | Apply for certificates early; budget 2-4 weeks |
| macOS notarization issues | Medium | Medium | Test notarization in CI pipeline early |

---

## Appendix: Reference Materials

### XMP Specification
- Adobe XMP Specification Part 1: https://www.adobe.com/devnet/xmp.html
- Lightroom Classic XMP handling: embedded for proprietary RAW, sidecar for DNG/standard formats

### Tauri Documentation
- Official docs: https://v2.tauri.app/
- Plugin ecosystem: https://v2.tauri.app/plugin/

### File Watching
- notify crate: https://docs.rs/notify/latest/notify/
- FSEvents deep dive: Apple Developer Documentation

### Security Standards
- SOC2 Type II audit logging requirements
- GDPR Article 30: Records of processing activities

---

**Research Status**: Complete
**Ready for Phase 1**: Yes
**Last Updated**: 2026-01-22
