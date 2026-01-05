# Digital Album (Design Studio)

> **Reference Documentation**:
> - `docs/Features/DigitalAlbumFeatures.md` - Detailed feature specifications
> - `docs/Features/GLOSSARY.md` - Terminology

## Business Value Proposition

The Digital Album module (Design Studio) is a powerful upsell engine that allows photographers to design, proof, and sell physical albums directly within RawDrive. By integrating the design process with the gallery, it removes friction, speeds up client approvals, and creates a seamless path from digital delivery to physical heirloom.

### Key Business Benefits
- **Increased Revenue**: Simplifies the process of selling high-margin physical albums.
- **Workflow Efficiency**: Eliminates the need for external design software for many use cases.
- **Faster Approvals**: Integrated proofing loop reduces the time to get client sign-off.
- **Stickiness**: Adds another critical workflow to the platform, increasing retention.
- **Print-Ready**: Ensures output files meet professional lab specifications automatically.

---

## User Personas

### Primary Users
1. **Photographer / Designer**
   - Selects photos and creates album layouts.
   - Manages revisions and client feedback.
   - Exports print-ready files.

2. **Client**
   - Reviews album drafts.
   - Leaves comments on specific spreads or photos.
   - Approves the final design for printing.

---

## Key Capabilities

### 1. Smart Lab & Size Setup
- **Lab Presets**: Built-in specifications for popular labs (sizes, bleed, safe zones).
- **Custom Sizes**: Ability to define custom album dimensions.
- **Live Validation**: Real-time warnings if elements are in the bleed or gutter areas.
 - **Lab Profiles**: Distinguish between RawDrive-maintained lab profiles and user-defined custom presets.

### 2. Designer Workspace
- **Drag-and-Drop**: Intuitive interface for placing photos onto spreads.
- **Auto-Layout**: AI-assisted layout generation based on selected photos.
- **Templates**: Library of professional templates for different styles (Wedding, Minimal, etc.).
- **Photo Management**: Filter by "Used in Album," "Favorites," or "Unused" to ensure no key shots are missed.

### 3. Client Proofing
- **Interactive Review**: Clients can flip through a virtual album.
- **Comment System**: Context-specific comments on spreads.
- **Version Control**: Track changes and revisions across multiple drafts.
- **Approval Workflow**: Formal "Approve for Print" button to lock the design.

### 4. Export & Print
- **High-Res Output**: Generate print-ready JPEGs or PDFs.
- **Color Profiles**: Support for sRGB, AdobeRGB, and CMYK profiles as required by labs.

### 5. Monetization & Plan Limits

- **Plan Gating**: Design Studio is included in Business and Enterprise tiers; Professional can purchase as an add-on; Starter has view-only proofing.
- **Per-Workspace Limits**: Soft limits on concurrent album projects per workspace, with higher caps for Enterprise.
- **Per-Album Pricing**: Optional per-album fees can be configured via Billing, or bundled as part of plan.

### 6. Lab Integrations

- **Preset-Only Mode**: Initial release assumes manual upload to labs using exported files.
- **Future Direct Integrations**: Potential direct submission flows to selected labs (subject to partnerships).
- **Compliance**: Export formats and profiles remain lab-agnostic to avoid lock-in.

---

## Integration Points

- **Gallery Management**: Pulls high-res assets directly from the gallery.
- **Client CRM**: Links album projects to client profiles.
- **Notifications**: Alerts clients to new drafts and photographers to comments/approvals.
- **Billing**: Can be linked to invoices for album payments.

---

## Scalability Considerations

- **Rendering Performance**: Efficient handling of high-resolution images in the browser canvas.
- **Storage**: Management of large print-ready export files.
- **Concurrency**: Handling multiple users (designer + client) viewing the album simultaneously.
