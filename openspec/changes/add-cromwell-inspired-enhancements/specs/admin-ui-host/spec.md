## ADDED Requirements

### Requirement: Admin Widget Slot Rendering

The Admin UI host SHALL provide a `<PluginSlot>` React component that renders plugin-registered widgets at designated extension points. The host SHALL fetch widget declarations from the server API and load plugin components via Module Federation.

```typescript
interface PluginSlotProps {
  name: string;           // slot name, e.g., "dashboard", "entity.actions.product"
  context?: Record<string, unknown>; // contextual data passed to widgets (e.g., entity ID)
  layout?: 'grid' | 'inline' | 'tabs'; // rendering layout strategy
}
```

#### Scenario: Dashboard renders plugin widgets
- **WHEN** the Admin Dashboard page loads
- **AND** two plugins have declared `slot: "dashboard"` widgets
- **THEN** both widgets are rendered in a draggable grid layout
- **AND** each widget is wrapped in an error boundary
- **AND** widget load failures show a fallback UI without affecting other widgets

#### Scenario: Entity action slot passes context
- **WHEN** the Product edit page renders `<PluginSlot name="entity.actions.product" context={{ entityId: "123" }} />`
- **AND** a plugin has declared `slot: "entity.actions.product"`
- **THEN** the plugin's widget component receives `{ entityId: "123" }` as a prop
- **AND** the widget is rendered inline near the Save button

#### Scenario: No widgets registered for slot
- **WHEN** no plugins have declared widgets for `slot: "settings.tab"`
- **THEN** the `<PluginSlot name="settings.tab" />` renders nothing
- **AND** the Settings page shows only Core tabs

#### Scenario: Plugin widget load error isolated
- **WHEN** a plugin's widget component fails to load (Module Federation error)
- **THEN** the error boundary catches the error
- **AND** a fallback "Widget unavailable" message is shown
- **AND** other widgets in the same slot continue to render normally

---

### Requirement: Custom Data Management Page

The Admin panel SHALL provide a platform-level page at `/platform/custom-data` for managing custom field definitions and custom entity types. This page SHALL be accessible only to platform administrators.

#### Scenario: Admin creates custom field for Product
- **WHEN** an admin navigates to `/platform/custom-data`
- **AND** selects entity type "Product"
- **AND** adds a field with key "brand", label "Brand", type "Simple text"
- **AND** clicks Save
- **THEN** a row is inserted into `custom_field_definitions` table
- **AND** the Product edit page shows a "Brand" input field
- **AND** the Product list page can display "Brand" as a sortable column

#### Scenario: Admin creates custom entity type
- **WHEN** an admin clicks "Add Entity Type"
- **AND** fills in type "movie", list label "Movies", entity label "Movie"
- **AND** clicks Apply
- **THEN** a row is inserted into `custom_entity_types` table
- **AND** a "Movies" link appears in the Admin sidebar
- **AND** the admin can add custom fields to the Movie entity

#### Scenario: Plugin-registered entity type is non-deletable
- **WHEN** a custom entity type has `source = 'com.vendor.seo'` (registered by plugin)
- **THEN** the delete button is disabled for that entity type
- **AND** a tooltip explains "This entity type is managed by plugin: com.vendor.seo"

---

### Requirement: Data Import/Export Platform Page

The Admin panel SHALL provide a platform-level page at `/platform/data-migration` for bulk data import and export. The page SHALL support CSV, JSON, and Excel (.xlsx) formats. All operations SHALL be tenant-scoped and recorded in the audit log.

#### Scenario: Admin exports Products to CSV
- **WHEN** an admin selects "Products" table and "CSV" format
- **AND** clicks "Export"
- **THEN** a CSV file is generated with all product columns as headers
- **AND** custom field values are included as additional columns
- **AND** the file is downloaded to the browser
- **AND** an audit log entry is created: "Exported 150 Products as CSV"

#### Scenario: Admin imports data from Excel
- **WHEN** an admin uploads an .xlsx file with a "Products" sheet
- **AND** the sheet headers match Product schema columns
- **THEN** each row is validated against the Product Zod schema
- **AND** valid rows are inserted with `organization_id` set to current tenant
- **AND** invalid rows are collected into an error report
- **AND** an audit log entry is created: "Imported 120/125 Products (5 skipped)"

#### Scenario: Import rejects cross-tenant data
- **WHEN** an import file contains rows with `organization_id` different from current tenant
- **THEN** those rows are rejected
- **AND** the error report shows "Row 15: organization_id mismatch (cross-tenant import forbidden)"

#### Scenario: Export generates schema template
- **WHEN** an admin clicks "Download Template" for the Products table
- **THEN** an empty file is generated with all column headers
- **AND** required columns are marked (e.g., "name*", "slug*")
- **AND** enum columns include allowed values as comments
