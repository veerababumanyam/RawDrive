# Face Recognition & Tagging Requirements for RawDrive

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

## 1. Introduction & Scope

### 1.1. Purpose
This document outlines the requirements for a face recognition and tagging system within the RawDrive application. This feature will enable photographers to automatically detect, group, and identify people across their photo galleries, enhancing organization and searchability.

### 1.2. Scope
- The system will scan photos stored in the user's connected cloud storage (Google Drive/Dropbox).
- It will identify and group unique faces, allowing the photographer to assign names to them.
- It will create a new "People" view for browsing photos by person.
- The feature's visibility to end-clients will be configurable by the photographer on a per-gallery basis.

## 2. Core Architecture & Technical Requirements

### 2.1. Face Detection and Embedding
- The system shall use a high-accuracy, open-source deep learning model (e.g., FaceNet, Dlib) to perform face detection and generate high-dimensional vector embeddings for each detected face.
- This process will run as a non-blocking background job, initiated by the photographer. Progress will be communicated to the user via a UI element like the **ScanProgressToast**.

### 2.2. Vector Storage and Similarity Search
- The generated face embeddings shall be stored in the application's **PostgreSQL** database using the **`pgvector`** extension.
- When a new face is detected, its embedding will be compared against the existing embeddings in the database to find matches (i.e., other photos of the same person). This similarity search is the core of the grouping functionality.

### 2.3. Metadata Storage
- A new `People` table will be created to store information about identified individuals (e.g., Person ID, Name).
- A linking table will associate `Photos` with `People`, storing the location of the face tag on the image. This metadata-driven approach ensures the original image files are never modified.

### 2.4. Workflow Logic
- Face recognition will only be run on a photo if it has not been processed before.
- Once a photo is scanned, a flag will be set to prevent re-processing, unless a manual re-scan is initiated by the photographer.

## 3. User Experience (UX) & Application Components

### 3.1. For the Photographer (Admin)
- **Initiating Scan:** A new action will be available in the **AdminToolbar** or gallery view to "Scan for Faces" for one or more galleries.
- **People View (`PeopleView.tsx`):** A new top-level "People" route will be added to the main navigation. This view will display clusters of faces, grouped by presumed identity. Unnamed groups will be shown first.
- **Managing People (`PersonDetailView.tsx`):** From the People view, a photographer can:
    - Assign a name to a group of faces.
    - Merge multiple groups that represent the same person.
    - Remove incorrect photos from a person's group.
- **Manual Tagging (`FaceTagModal.tsx`):** In the **MediaViewer**, photographers should be able to manually draw a box around a face and tag it if the automated system missed it or identified it incorrectly.

### 3.2. For the Client
- **Opt-In Visibility:** The visibility of people tags to clients shall be disabled by default.
- **Gallery Setting (`GallerySettings.tsx`):** The photographer can enable a "Filter by Person" option in the gallery settings.
- **Filtering:** When enabled, clients will see a filter or search option in the gallery view that allows them to select a person's name and see all photos they appear in.

## 4. Privacy and Consent
- All face embedding data and people tags are strictly private to the photographer's account and will never be shared across different accounts.
- The feature is designed with photographer control in mind. No face information is shown to clients without the photographer's explicit action to enable it for a specific gallery.

## 5. Documentation
- The main `README.md` shall be updated with a note on the new feature and any significant system requirements (e.g., backend processing capabilities) needed to run the face recognition models efficiently.