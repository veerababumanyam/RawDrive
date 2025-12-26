# Libraries (DAM) Technical Specification

> **Status:** Draft
> **Feature:** Digital Asset Management (Library)
> **Owner:** AntiGravity

## 1. Overview
The **Libraries** feature serves as the Digital Asset Management (DAM) layer for RawDrive. Unlike **Galleries**, which are curated subsets of assets for specific clients/events, the **Library** is the master repository of _all_ assets within a Workspace.

It serves three core purposes:
1.  **Unsorted Material**: A staging area for raw uploads before they are organized into Galleries.
2.  **Reusable Assets**: A home for stock photography, branding assets (logos, watermarks), and marketing collateral.
3.  **Unified Search (GEO)**: The interface for searching across the entire workspace lineage using AI (semantic search), metadata, and tags.

## 2. Core Concepts

### 2.1 The "Library" Concept
In the RawDrive data model, the "Library" is **not** a distinct database entity (unlike a Gallery). Instead, it is a **logical view** of the `assets` table filtered by `workspace_id`.

-   **Library View**: Query of `SELECT * FROM assets WHERE workspace_id = :id AND deleted = false`.
-   **Unassigned Assets**: Assets that exist in the workspace but are not linked to any `gallery_id` via `gallery_assets`.
-   **Gallery Assets**: Assets that are linked to one or more galleries. These _also_ appear in the Library (Unified View).

### 2.2 Reusable Assets
To support branding and stock assets, we will introduce a robust tagging/categorization system (if not already present) or simply rely on Folder/Collection organization within the Library view.
*Proposed*: We will stick to a flat asset list with powerful search/filter filters for Phase 1.

## 3. Data Model
No major schema changes are required to the `assets` table, assuming it already contains `workspace_id`.

**Key Schema Assumptions:**
-   `assets` table has `workspace_id`, `created_at`, `type` (photo/video), `status`, `metadata/exif`.
-   `gallery_assets` is a many-to-many link.

## 4. Backend Architecture

### 4.1 New Service: `LibraryService`
A new service dedicated to workspace-wide asset operations.

**Methods:**
-   `list_workspace_assets(workspace_id, filters, pagination)`: Main DAM query.
    -   Filters: `type`, `date_range`, `uploaded_by`, `is_unassigned` (true/false), `search_query` (GEO/Text).
-   `upload_asset_to_library(workspace_id, file)`: Direct upload without a gallery context.
-   `delete_assets(asset_ids)`: Soft delete (Recycle Bin).
-   `move_assets_to_gallery(asset_ids, gallery_id)`: Link assets to a gallery (create `gallery_assets` rows).

### 4.2 API Endpoints
Base Path: `/api/v1/workspace/{workspace_id}/library`

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/assets` | List all assets in workspace (with filters). |
| `POST` | `/assets` | Upload new assets to library (unassigned). |
| `POST` | `/assets/batch-delete` | Move assets to trash. |
| `POST` | `/assets/assign` | Link selected assets to a specific Gallery. |

## 5. Frontend Architecture

### 5.1 Route
-   Path: `/workspace/libraries`
-   Component: `LibraryPage.tsx`

### 5.2 Components
1.  **LibrarySidebar / FilterPanel**:
    *   Filters for: "Unassigned", "All Assets", "Media Type", "Date Range".
    *   GEO Search Input: Large search bar for semantic queries ("Photos of layout with red flowers").

2.  **AssetGrid (Resused)**:
    *   Reuse `PhotoGrid` component but adapt it to accept a generic `Asset[]` instead of `GalleryAsset[]`.
    *   *Note*: `PhotoGrid` currently might be tightly coupled to `gallery_assets` (sort order, etc.). We may need to refactor it or create a `BaseAssetGrid`.

3.  **Action Toolbar**:
    *   "Add to Gallery": Select assets -> Modal to choose/create Gallery -> Link.
    *   "Delete": Move to trash.
    *   "Download": Direct download.

## 6. Implementation Plan (Phased)

### Phase 1: The "All Assets" View (MVP)
1.  Backend: Implement `list_workspace_assets` in `LibraryService`.
2.  Backend: Add `GET /library/assets` endpoint.
3.  Frontend: Scaffolding `LibraryPage.tsx` and basic list view.

### Phase 2: Upload & Organize
1.  Backend: Support `upload_asset` without `gallery_id`.
2.  Frontend: Reusable UploadDropzone for Library.
3.  Frontend: "Move to Gallery" action.
4.  Frontend: "Unassigned" filter (orphaned assets).

### Phase 3: GEO Search Integration
1.  Connect Unified Search bar to `SearchService` (existing vectors).
2.  Display semantic results in Library Grid.

## 7. Migration / Compatibility
-   Existing galleries remain untouched.
-   Existing assets in galleries will simply "appear" in the Library view.
