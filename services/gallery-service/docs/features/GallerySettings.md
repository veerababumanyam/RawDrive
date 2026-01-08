The Gallery Settings in RawDrive are designed to give photographers granular control over how their clients experience a gallery, balancing high-end aesthetics with functional security.

Here is a detailed breakdown of each configuration component and its underlying logic:

### 1. Gallery Settings
These settings define the basic identity and visual structure of the gallery.

- **Client View Layout**:
    - **Tabs**: Creates a navigation bar for galleries and sub-galleries (e.g., "Ceremony", "Reception"). Best for large weddings.
    - **Continuous**: A single scrolling page where galleries and sub-galleries act as section headers. Best for storytelling.

### 2. Access & Privacy
This layer controls the "Magic Link" behavior and security barriers.

- **Status**: Controls visibility (`Draft`, `Published`, `Archived`). If not `Published`, the public URL returns a 404 state.
- **Password Protection**: When enabled (`password_protected` flag), the gallery is wrapped in a `LockScreen` component. Visitors must enter a PIN/Password before the `AlbumDetailView` is mounted.
- **PIN Protection**: The photos in gallery when enabled with PIN protection, the PIN used to protect access to the photos in the public shared gallery where additional PIN to open in the gallery. second level protection for PIN enabled photos to hide from the public view. Smart way to protect photos from being viewed in magic link.
- **Email Registration**: A lead-generation tool. If `email_registration_required` is true, a `ClientEmailModal` (additional modal to capture the email ids of visitors who views the publicly shared photos)forces visitors to enter an email address before viewing.
- **Custom Domain (CNAME)**: Allows photographers to mask `gallery.rawdrive.ai/id` with `photos.rawdrive.ai`.
- **Gallery Expiry**: A logic check that automatically restricts access to the public link once the current date passes the `expires_at` timestamp.

### 3. Permissions & Metadata
Controls what the visitor can do with the assets.

- **Download Policy**:
    - `view_only`: No downloading allowed.
    - `web_only`: Download low-res/web-sized versions only.
    - `watermarked_only`: Download versions with applied watermarks.
    - `original_allowed`: Download full-resolution original files.
- **Show Camera Metadata**: Toggles the visibility of EXIF data (Aperture, ISO, Shutter Speed) in the InfoPanel via `exif_visible` flag.

### 4. Branding
This is the most complex component, allowing the gallery to look like a bespoke website.

- **Visual Identity (Logo & Tagline)**: The `BrandingHeader` uses these to replace the platform logo.
- **Primary Brand Color**: A single HEX input that dynamically updates the `--color-accent-main` CSS variable.
- **Typography**: Swaps the global font family across the gallery.
- **Watermarking**:
    - **Logic**: When the download policy implies watermarking, or for display protection, the `WatermarkOverlay` component is absolute-positioned over images using `pointer-events-none` and `mix-blend-mode` techniques (frontend), or burned into the generated asset variant (backend) depending on the context.
- **Custom Links & Socials**: Injects navigation buttons into the header and footer.

### 5. Visitor Data & Lead Generation
To convert gallery traffic into potential leads, RawDrive includes a dedicated visitor tracking system.

- **Data Capture**: When `email_registration_required` is enabled, the following data is collected via the `ClientEmailModal`:
    - **Email** (Required): Primary unique identifier for the visitor.
    - **Name**: First and Last name.
    - **Phone**: Contact number for follow-ups.
    - **Address**: Physical address if relevant.
    - **Metadata**: Flexible JSON field for "Important Dates" (e.g., Wedding Date) or other custom questions.

- **Architecture**:
    - **`visitors` Table**: Stores unique visitor profiles linked to the workspace. Prevents duplication if the same person visits multiple galleries.
    - **`gallery_visitors` Table**: An access log that links a `visitor_id` to a `gallery_id`. This tracks *who* viewed *what* and *when*.
    - **Integration**: Data is submitted via `POST /api/v1/public/galleries/{id}/register` before access is granted.

### 6. Studio Defaults (Sync Logic)
To save time, the settings include a "Apply Studio Defaults" feature. This works by:
1. Fetching the photographer’s `CompanyProfile` (Company name, logo, contact info).
2. Mapping those global values to the specific Gallery settings.
3. Ensuring that every new gallery created starts with a consistent professional look without manual entry.

### Technical Implementation
Unlike a monolithic JSON object, these settings are stored as individual columns in the `galleries` table (e.g., `layout_style`, `theme`, `download_policy`, `branding_profile_id`). This allows for efficient querying and indexing. When the application renders a gallery, it fetches these fields and helps the frontend constructing a `GallerySettingsContext` that drives the UI adaptability.
