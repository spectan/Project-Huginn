# Wurm Map Utility Architecture

## Architecture Summary

The recommended architecture is a single full-stack Next.js application using TypeScript, PostgreSQL, Prisma, and Docker Compose. The app runs on a single VPS with one application container and one database container. The design keeps deployment simple while preserving clean server-side boundaries for authentication, authorization, validation, marker persistence, audit logging, and future multi-map support.

The app should be built as a production web application, not as a client-only static tool. Permissions, marker writes, and audit events must be enforced on the server.

## Technology Choices

Core stack:

- Next.js with the App Router.
- TypeScript with strict mode enabled.
- PostgreSQL for durable relational storage.
- Prisma for schema management, typed queries, and migrations.
- Docker Compose for local development and first production deployment.
- Zod or an equivalent schema validator for request and form validation.
- A password hashing library using Argon2id or bcrypt.

Why this stack:

- Next.js supports a rich client map workspace and server-side data access in one deployable unit.
- PostgreSQL provides durable relational data, constraints, transactions, and reliable audit storage.
- Prisma gives clear schema evolution and typed database access.
- Docker Compose matches the single-server deployment target without introducing orchestration complexity.
- Strict TypeScript, schema validation, and linting help adapt NASA-style safety practices to web software.

## Container Layout

Initial Docker Compose services:

- `app`: Next.js production server.
- `db`: PostgreSQL with a persistent volume.

Expected mounted or persistent storage:

- PostgreSQL data volume.
- Map image storage directory or Docker volume.

The initial implementation includes the supplied Wurm map as a checked-in static seed asset at `public/maps/wurm-map.png` so the map workspace can render the real map before the admin map-storage workflow exists. Future map management should move map records to database metadata and mounted storage without changing marker coordinates.

Production environment variables:

- `DATABASE_URL`.
- `AUTH_SECRET` or equivalent session signing secret.
- `MAP_STORAGE_PATH`.
- `INITIAL_ADMIN_USERNAME`.
- `INITIAL_ADMIN_PASSWORD` or an initialization-only hashed credential flow.
- `NODE_ENV=production`.

Database migrations should be run explicitly as a deployment step. The application should not silently mutate the database schema during normal startup.

## Application Boundaries

### Server

The server owns:

- Authentication.
- Session creation and invalidation.
- User approval and permission checks.
- Marker validation.
- Marker persistence.
- Audit event creation.
- Deleted marker cleanup.
- Map metadata.

Every write operation must run through a server-side permission check. Client-side checks are only usability improvements.

### Client

The client owns:

- Rendering the map image.
- Pan and zoom interactions.
- Pointer-to-coordinate conversion.
- Marker selection and form presentation.
- Overlay rendering for tower radii and deed bounds.
- Read-only versus writable control visibility.
- Client-side marker search, filtering, and visual match highlighting for the currently loaded map data.
- Client-side tile-type highlighting by exact RGB matching against the loaded map image. The source map image remains the coordinate source: one pixel equals one tile, and generated highlight masks are local visual overlays only.

Client code must treat server responses as authoritative. Client-calculated coordinates must be validated again on the server against the target map dimensions.

## Data Model

The schema should be multi-map-ready from the first migration.

### User

Fields:

- `id`.
- `username`, unique.
- `passwordHash`.
- `approvalStatus`: `PENDING`, `APPROVED`, `REJECTED`.
- `accessLevel`: `NONE`, `READ`, `WRITE`.
- `isAdmin`.
- `createdAt`.
- `updatedAt`.
- `approvedAt`.
- `approvedByUserId`.

Rules:

- Pending and rejected users cannot access map data.
- Admin capability is separate from write capability.
- Usernames must be normalized consistently for uniqueness.

### Session

Sessions are stored server-side in the database. The browser receives only an HTTP-only random token cookie; the database stores a SHA-256 hash of that token, the owning user, and the expiration time.

Rules:

- Session cookies must be HTTP-only and same-site.
- Logout deletes the database session and clears the cookie.
- Expired sessions must not authenticate a user.

### Map

Fields:

- `id`.
- `name`.
- `imagePath`.
- `widthPx`.
- `heightPx`.
- `isActive`.
- `createdAt`.
- `updatedAt`.

Rules:

- Marker coordinates must be within `[0, widthPx - 1]` and `[0, heightPx - 1]`.
- The first UI can select the active map automatically.
- Future UIs can expose map selection without changing marker tables.

### Tower

Fields:

- `id`.
- `mapId`.
- `x`.
- `y`.
- `qlHundredths`.
- `damageHundredths`.
- `makerName`.
- `makerNumber`.
- `createdByUserId`.
- `updatedByUserId`.
- `deletedAt`.
- `deletedByUserId`.
- `deleteExpiresAt`.
- `createdAt`.
- `updatedAt`.

Rules:

- `qlHundredths` is between `0` and `10000`.
- `damageHundredths` is between `0` and `9999`.
- `makerNumber` is exactly three digits.
- Active tower views exclude rows with `deletedAt` set.
- Expired deleted rows are permanently deleted after `deleteExpiresAt`.

### Deed

Fields:

- `id`.
- `mapId`.
- `x`.
- `y`.
- `name`.
- `founder` for the stored mayor name. The user-facing label is `Mayor`; the column name can be cleaned up in a later migration.
- `north`.
- `west`.
- `east`.
- `south`.
- `createdByUserId`.
- `updatedByUserId`.
- `deletedAt`.
- `deletedByUserId`.
- `deleteExpiresAt`.
- `createdAt`.
- `updatedAt`.

Rules:

- `north`, `west`, `east`, and `south` must be non-negative integers.
- The rectangle derived from `x - west`, `y - north`, `x + east`, and `y + south` must fit within the map bounds.
- The stored `x` and `y` are the deed center pixel.
- Active deed views exclude rows with `deletedAt` set.
- Expired deleted rows are permanently deleted after `deleteExpiresAt`.

### Note

Fields:

- `id`.
- `mapId`.
- `x`.
- `y`.
- `title`.
- `category`.
- `text`.
- `createdByUserId`.
- `updatedByUserId`.
- `deletedAt`.
- `deletedByUserId`.
- `deleteExpiresAt`.
- `createdAt`.
- `updatedAt`.

Rules:

- Note categories are map-scoped and selectable by all approved users.
- Admins can add new note categories; non-admins can only select existing categories.
- Title, category, and text are validated server-side for every note write.
- Text has a fixed maximum length.
- Active note views exclude rows with `deletedAt` set.
- Expired deleted rows are permanently deleted after `deleteExpiresAt`.

### NoteCategory

Fields:

- `id`.
- `mapId`.
- `name`.
- `createdAt`.
- `updatedAt`.

Rules:

- Category names are unique per map.
- Category creation is admin-only.
- Deleting or renaming categories should be handled by a future explicit admin workflow so existing notes do not silently lose context.

### AuditEvent

Fields:

- `id`.
- `actorUserId`.
- `action`.
- `targetType`.
- `targetId`.
- `mapId`.
- `metadata`.
- `createdAt`.

Rules:

- Audit events are retained indefinitely.
- Audit events must not include password hashes or secrets.
- Audit all server-side user actions that affect sessions, permissions, map access, map data, or marker data.
- Do not audit local-only map interactions such as pan, zoom, hover, and cursor movement.
- Audit metadata may include non-location changed fields, but long-lived audit metadata must not store marker coordinates.
- Deleted marker coordinate-bearing records are permanently removed after the restore window.
- Cleanup deletion events should record marker type, marker ID, actor as system, and cleanup time.

## Authorization Model

Authorization must use explicit server-side checks:

- Anonymous users can register and log in.
- Pending users can see only pending-account state.
- Rejected users can see only rejected-account state.
- `READ` users can fetch maps and active markers.
- `WRITE` users can create, update, and delete markers.
- Admin users can approve users, change permissions, remove account access, view audit logs, and restore deleted markers.

Server handlers should check both authentication and authorization before parsing or applying writes where practical. All handlers must validate parameters after authorization to avoid trusting client data.

## Coordinate And Overlay Rules

Coordinate system:

- Origin is top-left.
- `x` increases to the right.
- `y` increases downward.
- One map image pixel equals one Wurm tile.
- Coordinates are integers.

Tower overlays:

- Protection distance is 25 pixels in each direction from the tower center.
- Placement distance is 50 pixels in each direction from the tower center.
- Render as low-opacity squares centered on the tower position.
- The center pixel renders as a bright white square.

Deed overlays:

- Render as low-opacity rectangles.
- The stored coordinate is the center pixel.
- Rectangle edges are calculated from north, west, east, and south tile counts.
- The visual center pixel is highlighted independently from the area overlay.

Tile highlighting:

- Tile highlight selections use the same color-detected terrain categories as WurmMaps for the active map image.
- The UI groups selections into Resources, Roads, Natural Terrain, Infected Terrain, and Other.
- Highlight masks are transparent image overlays generated from exact RGB matches, with user-configurable highlight color and opacity.
- The overlay highlights the non-matching tiles surrounding matched tiles, not the matched resource tiles themselves, so resources remain visible while the highlight reads as an outline.
- Highlighting is local view state and must not create audit events or marker records.

Client pointer conversion must account for zoom, pan, and image scaling. Server validation must only accept stored map coordinates, not screen coordinates.

## Deleted Marker Cleanup

Deletion is a two-phase lifecycle:

1. User with write permission deletes a marker.
2. The marker receives `deletedAt`, `deletedByUserId`, and `deleteExpiresAt = deletedAt + 72 hours`.
3. Normal map queries hide the marker.
4. Admins can restore the marker before `deleteExpiresAt`.
5. Cleanup permanently deletes expired marker records.
6. Cleanup writes an audit event without retaining coordinate-bearing marker data.

On a single VPS, cleanup can run as:

- a protected admin-triggered maintenance action,
- a scheduled host cron command that runs a container command,
- or a lightweight app-side scheduled command invoked by deployment automation.

The first production plan should prefer an explicit command or host cron so cleanup behavior is visible and testable.

## NASA-Inspired Coding Constraints

The source guidance is NASA JPL's Power of 10 rules as summarized by Perforce: https://www.perforce.com/blog/kw/NASA-rules-for-developing-safety-critical-code

The original rules target C and safety-critical embedded software. This project adapts their intent to TypeScript web development:

- Use simple control flow. Avoid clever branching, hidden side effects, and recursive application logic.
- Bound loops. Paginate audit logs and bound marker queries rather than processing unbounded datasets in request handlers.
- Avoid uncontrolled allocation patterns. Do not load entire audit history or large image data into memory during normal requests.
- Keep functions small. Split validation, authorization, persistence, and rendering logic into focused functions.
- Use assertions and invariants. Validate coordinates, map dimensions, role assumptions, numeric bounds, and impossible states.
- Keep scope narrow. Declare values close to use and avoid broad mutable module state.
- Check every meaningful result. Do not ignore failed parses, rejected promises, database write results, or authorization outcomes.
- Avoid preprocessor-like indirection. Keep build-time configuration explicit and minimal.
- Avoid unsafe dynamic behavior. Prefer typed functions and explicit dispatch over stringly typed runtime behavior.
- Treat warnings as failures. Type checks, linting, tests, and dependency audits should be required before release.

These constraints are engineering discipline for reliability; they do not imply that this web app is safety-critical software.

## Testing Strategy

Required test layers:

- Unit tests for validation functions, coordinate conversion helpers, permission checks, numeric parsing, and marker lifecycle helpers.
- Integration tests for server actions or API routes that create, update, delete, restore, and clean up markers.
- Database tests for schema constraints and cleanup behavior.
- UI tests for map coordinate selection, read-only behavior, write controls, and overlay rendering.
- End-to-end smoke tests for registration, approval, login, marker creation, marker deletion, restoration, and audit visibility.

Important test cases:

- QL rejects values below `0.00` and above `100.00`.
- Damage rejects values below `0.00` and above `99.99`.
- Tower maker number rejects non-three-digit input.
- Coordinates outside map bounds are rejected.
- Read-only users cannot write through direct server calls.
- Pending users cannot fetch map data.
- Failed authorization attempts create audit events.
- Deleted markers are hidden from normal map queries.
- Expired deleted markers are permanently deleted.
- Audit events are created for meaningful actions.

## Deployment And Operations

Initial deployment target:

- Single VPS.
- Docker Compose.
- PostgreSQL volume.
- Map image storage volume or host-mounted directory.

Operational requirements:

- Document backup and restore for PostgreSQL.
- Include map image storage in backups.
- Use HTTPS through a reverse proxy before exposing production traffic.
- Configure secure cookies in production.
- Use strong session secrets.
- Do not log passwords, hashes, or session secrets.
- Provide a health check endpoint.
- Keep migrations explicit and reversible where practical.

The concrete single-VPS runbook is maintained in `docs/operations.md`.

## Initial File Responsibilities

The implementation plan should keep files focused:

- Database schema and migrations define persistent structure.
- Auth module owns password hashing, session lookup, and current-user retrieval.
- Permission module owns access checks.
- Marker validation modules own tower, deed, note, and coordinate validation.
- Marker data modules own database reads and writes.
- Audit module owns audit event creation.
- Cleanup command owns expired deleted marker removal.
- Map workspace components own rendering and interaction only.

No file should become a catch-all for unrelated app behavior.
