# Wurm Map Utility Design

## Goal

Build a production-viable web utility for approved Wurm Online community users to view a shared map and manage map annotations. The map image uses a top-left origin coordinate system where `(0, 0)` is the upper-left image pixel, `x` increases to the right, `y` increases downward, and one pixel equals one in-game tile.

The first release should support a single active map in the UI while using a multi-map-ready data model so future maps can be added without redesigning marker storage or permissions.

## Users And Permissions

Users create local username/password accounts. New registrations are pending by default and cannot view map data until approved by an admin.

Approved users receive one of these access levels:

- `READ`: can view active maps and all active markers.
- `WRITE`: can view maps and create, update, and delete markers through allowed workflows.
- `ADMIN`: can manage accounts, change read/write/admin privileges, remove account access, restore deleted markers, and view the history log.

Admin capability is separate from read/write access. Server-side authorization must enforce every privileged action even if the UI hides unavailable controls.

## Map Scope

All approved users can see all active markers on a map. There are no private, faction-scoped, or group-scoped markers in the first version.

The data model must include maps from the start. Towers, deeds, notes, and audit events reference a `mapId`. The first UI may expose only one active map, but the architecture must not assume that only one map can exist.

Map image files are stored on the server filesystem through a Docker volume or mounted host directory. The database stores map metadata such as name, image path, width, height, active status, and timestamps.

## Marker Types

### Towers

Towers represent guard towers or similar fixed points on the map.

Fields:

- `position`: integer `x` and `y` coordinates in map pixels.
- `ql`: quality level from `0.00` to `100.00`.
- `damage`: damage from `0.00` to `99.99`.
- `creator`: a player name plus exactly three digits, for example `Mako 945`.

The application may store creator name and number separately as `makerName` and `makerNumber`, but the user-facing field is a single `Creator` value.

Numeric values should be stored as integer hundredths, not floating point decimals. For example, `99.95` is stored as `9995`.

Tower overlays:

- Protection square: 25 tiles in each direction from the tower center, producing a `51x51` tile overlay.
- Maximum placement square: 50 tiles in each direction from the tower center, producing a `101x101` tile overlay.

Both overlays should be rendered as low-opacity square map layers that can be shown without hiding the map image or nearby markers. The inner overlay should be more opaque than the outer overlay. The tower center should render as a bright white square.

### Deeds

Deeds represent rectangular settlement areas.

Fields:

- `name`: deed name.
- `position`: integer `x` and `y` coordinates for the deed center pixel.
- `mayor`: mayor name. The first implementation stores this in the legacy `founder` field until a later schema cleanup.
- `north`: integer tile count north of the center pixel.
- `west`: integer tile count west of the center pixel.
- `east`: integer tile count east of the center pixel.
- `south`: integer tile count south of the center pixel.

The deed overlay is a low-opacity rectangle derived from the stored directional dimensions. The center should be rendered as a crisp bright yellow `3x3` tile marker centered on the deed coordinate. The default deed dimensions are `5` tiles in each direction from the center, producing an `11x11` tile rectangle.

### Notes

Notes are simple text annotations at a map position.

Fields:

- `position`: integer `x` and `y` coordinates.
- `title`: short label for the note.
- `category`: map-scoped category selected from the configured category list.
- `text`: bounded text content.

Notes do not have an area overlay in the first version.

Notes render as crisp bright pink `3x3` tile markers centered on the note coordinate.

Admins can add new note categories from the note dialog. Non-admin users can select existing categories but cannot create new ones.

## Marker Lifecycle

Creating, updating, deleting, and restoring markers must be explicit user actions and must create audit events.

Deleted markers are soft-deleted first and hidden from normal map views. Admins can restore deleted markers for 72 hours after deletion. After the 72-hour restore window, a cleanup process permanently deletes the marker record.

Audit history is retained indefinitely. Audit events may record that a marker was deleted or cleaned up, but coordinate-bearing deleted marker records must not survive beyond the 72-hour restore window.

## History Log

Admins need a history page that shows every server-side user action that affects security, permissions, map data, marker data, or sessions. Local-only map interactions such as pan, zoom, hover, and cursor movement are not audit events because they do not reach the server or change shared state.

Events to audit:

- Registration.
- Login.
- Logout.
- Failed login.
- Failed authorization attempt.
- User approval or rejection.
- Permission changes.
- Map view.
- Map creation or update when that feature exists.
- Marker list or marker detail view.
- Marker creation.
- Marker update.
- Marker delete.
- Marker restore.
- Cleanup deletion after the 72-hour restore window.

Each audit event should include actor, action, target type, target ID when available, map ID when relevant, timestamp, and structured metadata. Sensitive values such as password hashes must never be included in audit metadata. Long-lived audit metadata should not store marker coordinates; active marker records and restorable deleted marker records are the coordinate source of truth.

## User Experience

The first screen for approved users should be the map workspace, not a marketing page. The interface should prioritize accurate map inspection and repeated editing workflows.

Expected map workspace capabilities:

- Pan and zoom the map.
- Select existing markers.
- Add towers, deeds, and notes from map context menus when the user has write access.
- Edit or delete markers from existing marker context menus when the user has write access.
- Show tower square overlays and deed size overlays.
- Let users hide overlays or marker categories from the account menu without changing shared marker data.
- Provide a top-left search field that filters visible markers to matching towers, deeds, or notes and highlights matching marker centers with a radiating glow.
- Keep the map itself as the primary surface, with only a quiet account control visible by default.

Read-only users should see the same map and markers, but write controls should be unavailable and server-side write attempts should be rejected.

## Production Definition

The project is production viable when it has:

- Durable PostgreSQL storage.
- Server-side authentication and authorization.
- Password hashing with a modern password hashing algorithm.
- Database migrations.
- Docker Compose deployment for a single VPS.
- Health check endpoint.
- Input validation at every server boundary.
- Strict TypeScript checks.
- Linting and tests that fail on warnings.
- Backups documented for the database and map image storage.
- Admin audit visibility.
- A cleanup path for expired deleted markers.

## Future Scope

Future work may add:

- Full multi-map admin UI.
- Admin-uploaded map images.
- Marker import/export.
- Marker filtering by type or creator.
- Admin restore UI enhancements.
- Optional reverse proxy and TLS automation through Caddy, Nginx, or Traefik.

The first version should avoid private marker groups, external OAuth, email flows, real-time collaboration, and object storage unless a later requirement makes them necessary.
