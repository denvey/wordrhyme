## ADDED Requirements

### Requirement: Media Library Browser UI

The Admin panel SHALL provide a media library page with grid and list view modes for browsing uploaded assets. The page SHALL display variant thumbnails leveraging the existing `ImageProcessorService` presets (thumbnail, small, medium, large). The page SHALL support folder navigation, search, and filtering.

All asset operations MUST be scoped to the current `organizationId` (enforced by `ScopedDb`). Asset listing requires `asset.read`, upload requires `asset.create`, and deletion requires `asset.delete` permissions — checked via `protectedProcedure.meta({ permission })` on the corresponding tRPC endpoints.

#### Scenario: Grid view displays thumbnails
- **WHEN** an admin navigates to the media library page
- **THEN** assets are displayed in a responsive grid layout
- **AND** image assets show their `thumbnail` variant (200x200)
- **AND** non-image assets show a file-type icon
- **AND** each card shows filename and file size

#### Scenario: List view displays metadata
- **WHEN** the admin toggles to list view
- **THEN** assets are displayed in a table with columns: thumbnail, name, type, size, tags, date
- **AND** columns are sortable

#### Scenario: Search and filter
- **WHEN** the admin types in the search box or selects a file type filter
- **THEN** the asset list updates in real-time
- **AND** search matches filename, alt text, and tags

---

### Requirement: Drag-and-Drop Upload

The media library SHALL support drag-and-drop file upload with progress indicators and multi-file batch upload.

#### Scenario: Files dropped on upload zone
- **WHEN** the admin drags files onto the upload zone
- **THEN** each file shows an individual progress bar
- **AND** images are auto-processed by ImageProcessorService after upload
- **AND** variant thumbnails appear once processing completes

#### Scenario: Upload validation
- **WHEN** the admin drops a file exceeding the configured size limit
- **THEN** the file is rejected with an error message
- **AND** other valid files in the batch continue uploading

#### Scenario: Upload denied without permission
- **WHEN** a user without `asset.create` permission attempts to upload
- **THEN** the upload zone is disabled (frontend) and the tRPC endpoint returns 403 (backend)
- **AND** an audit log entry is recorded for the denied action

---

### Requirement: Media Picker Dialog

The Admin panel SHALL provide a reusable `<MediaPickerDialog>` component for selecting assets from the media library within entity edit forms.

#### Scenario: Single-select media picker
- **WHEN** an entity edit form opens the media picker in single-select mode
- **AND** the admin selects one image and clicks "Confirm"
- **THEN** the dialog closes and returns the selected asset metadata to the parent form

#### Scenario: Multi-select media picker
- **WHEN** an entity edit form opens the media picker in multi-select mode
- **AND** the admin selects multiple images
- **THEN** all selected assets are returned as an array on confirmation
