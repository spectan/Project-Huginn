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

The initial implementation includes checked-in static Celebration map assets under `public/maps/` so the map workspace can render the real map before the admin map-storage workflow exists. Future map management should move map layer records to database metadata and mounted storage without changing marker coordinates.

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
- Top-right account and map settings dropdowns use shared open-panel state so only one dropdown can be open at a time.
- The top-right map preferences dropdown is labeled `Settings`; its `Default` action resets the full user map settings payload back to the shared defaults.

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
- Authenticated users can change their own password from the account dropdown only after providing their current password and confirming a valid new password.
- Self-service password changes are audited as `USER_PASSWORD_CHANGED` without storing password values in metadata.
- Self-service password changes must revoke the user's other database sessions while preserving the current session identified by the `wurm_session` cookie token hash.

### Session

Sessions are stored server-side in the database. The browser receives only an HTTP-only random token cookie; the database stores a SHA-256 hash of that token, the owning user, and the expiration time. Session cookies are persistent for 90 days, path-scoped to `/`, and same-site `lax` so top-level shared links on the same canonical app host reuse the existing login.

Rules:

- Session cookies must be HTTP-only and same-site.
- Logout deletes the database session and clears the cookie.
- Password changes delete any other sessions for the same user so old devices cannot stay authenticated after a credential rotation.
- Expired sessions must not authenticate a user.
- Shared links must use the canonical host where the cookie was set; browser cookies do not carry between different hostnames or schemes.

### User Map Settings

User map settings are stored server-side in PostgreSQL as a `UserMapSettings` record scoped by `userId` and `mapId`. The settings payload is JSON, but it must always be validated and merged through the map settings domain module before it reaches the UI or database.

Persisted settings include:

- Marker layer visibility, including camps, minedoors, bridge/canal/highway paths, deed perimeters, and rift overlays.
- Marker, grid, and tile highlight colors, including rift, camp, minedoor, bridge, canal, and highway marker colors.
- Marker, grid, roadway, and tile highlight opacities.
- Tile highlight selection.
- Tile highlighter panel position.
- Roadway edit mode panel position.
- Rift overlay visibility and opacity.

Rules:

- Only authenticated users with map read access may read or update their own settings.
- Settings writes do not create marker records and do not affect shared map data.
- Settings writes are preference updates, not audited map edits.
- Invalid or unknown settings fields must fall back to defaults or the current saved value.
- Default opacity slider values are `50`. Slider values are literal percentages: `0` is invisible and `100` is fully opaque.
- Slider-controlled overlay fills must use solid colors and CSS opacity only; do not bake alpha into the color value or `100` will still be translucent.

### Map

The current schema uses `Map` as the server/data scope, not only as a visual image. Marker rows, note categories, audit events, and user settings all reference `mapId`, so switching between visual map variants must not create a new `Map` row for the same Wurm server.

Fields:

- `id`.
- `name`, currently the server name shown in the server selector.
- `imagePath`, retained as the default/fallback visual layer.
- `widthPx`.
- `heightPx`.
- `isActive`.
- `createdAt`.
- `updatedAt`.

Rules:

- Marker coordinates must be within `[0, widthPx - 1]` and `[0, heightPx - 1]`.
- The first UI can select the active server/map data set automatically.
- Server selection chooses a different `Map` record and therefore a different marker/settings data set.
- Visual map selection must choose a `MapLayer` under the same `Map` record so all markers persist at the same coordinates.

### MapLayer

Fields:

- `id`.
- `mapId`.
- `name`.
- `imagePath`.
- `widthPx`.
- `heightPx`.
- `sortOrder`.
- `isDefault`.
- `createdAt`.
- `updatedAt`.

Rules:

- `MapLayer` is a visual variant for a server/data-scope `Map`.
- The layer dropdown can switch `MapLayer` records locally without reloading markers or changing marker API `mapId` values.
- Layers for the same map should use the same coordinate dimensions unless an explicit coordinate transform feature is added.
- Celebration is seeded with `Terrain` at `public/maps/wurm-map.png` and `Topographical` at `public/maps/celebration-topo.png`.

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
- `makerNumber` may be blank when unknown, or one to three digits representing a whole number from `0` through `999`.
- Active tower views exclude rows with `deletedAt` set.
- Expired deleted rows are permanently deleted after `deleteExpiresAt`.

### Deed

Fields:

- `id`.
- `mapId`.
- `x`.
- `y`.
- `name`.
- `foundingDate`, an optional date-only value. Marker APIs serialize it as `YYYY-MM-DD` or `null`.
- `founder` for the stored mayor name. The user-facing label is `Mayor`; the column name can be cleaned up in a later migration.
- `north`.
- `perimeter`, a tile count around the deed footprint. Existing deeds default to `5`.
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
- `perimeter` must be an integer from `0` to `100`.
- `foundingDate` is optional, but when supplied it must be a real date in `YYYY-MM-DD` format.
- The rectangle derived from `x - west`, `y - north`, `x + east`, and `y + south` must fit within the map bounds.
- The perimeter-expanded rectangle derived by adding `perimeter` tiles around the deed footprint must also fit within the map bounds.
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

### Rift

Fields:

- `id`.
- `mapId`.
- `x`.
- `y`.
- `arrivalDate`, optional date-only value serialized as `YYYY-MM-DD` or `null`.
- `estimatedRiftTime`, optional date-time value serialized as `YYYY-MM-DDTHH:mm` or `null`.
- `notes`, optional text.
- `createdByUserId`.
- `updatedByUserId`.
- `deletedAt`.
- `deletedByUserId`.
- `deleteExpiresAt`.
- `createdAt`.
- `updatedAt`.

Rules:

- The stored `x` and `y` are the center of the 3x3 rift marker.
- The 3x3 marker footprint must fit inside the map bounds.
- Active rift views exclude rows with `deletedAt` set.
- Expired deleted rows are permanently deleted after `deleteExpiresAt`.

### Camp

Fields:

- `id`.
- `mapId`.
- `x`.
- `y`.
- `campType`, constrained by domain validation to `Rift` or `Goblin`.
- `notes`, optional text.
- Standard create, update, delete, restore, and expiry fields.

Rules:

- The stored `x` and `y` are the center of the 3x3 camp marker.
- The 3x3 marker footprint must fit inside the map bounds.
- Active camp views exclude rows with `deletedAt` set.
- Expired deleted rows are permanently deleted after `deleteExpiresAt`.

### Minedoor

Fields:

- `id`.
- `mapId`.
- `x`.
- `y`.
- `strength`, optional text.
- `notes`, optional text.
- Standard create, update, delete, restore, and expiry fields.

Rules:

- The stored `x` and `y` are the marked minedoor tile.
- Active minedoor views exclude rows with `deletedAt` set.
- Expired deleted rows are permanently deleted after `deleteExpiresAt`.

### PathMarker

Infrastructure paths are stored as first-class marker records for bridges, canals, and highways.

Fields:

- `id`.
- `mapId`.
- `pathType`, constrained by domain validation to `bridge`, `canal`, or `highway`.
- `x`.
- `y`.
- `name`, optional text.
- `width`, an integer tile width.
- `notes`, optional text.
- `points`, a JSON array of ordered `{ x, y }` map coordinates.
- Standard create, update, delete, restore, and expiry fields.

Rules:

- The stored `x` and `y` are copied from the first path point for context grouping and admin deleted-marker summaries.
- Paths require at least two points and at most ten points.
- Every point must be inside the map bounds.
- `width` must be an integer from `1` to `20`.
- Active path views exclude rows with `deletedAt` set.
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
- Render as opacity-controlled squares centered on the tower position.
- The center pixel renders as a bright white square.

Deed overlays:

- Render as opacity-controlled rectangles.
- The stored coordinate is the center pixel.
- Rectangle edges are calculated from north, west, east, and south tile counts.
- Perimeters render as outline-only edge strips around the rectangle expanded by the deed's perimeter tile count.
- The visual center pixel is highlighted independently from the area overlay.

Special markers:

- Notes render as 3x3 centered circles using the user's note marker color setting. The circle must remain on the interactive marker button so the normal search pulse can radiate from the same element.
- Rifts render as 3x3-centered triangles using the user's rift marker color setting, defaulting to red.
- Rifts can optionally render a same-colored 51x51 overlay centered on the rift location. This overlay is controlled by the global overlay toggle plus a dedicated `Rifts` toggle, `Rifts color` selector, and `Rifts opacity` slider.
- Camps render as 3x3-centered triangles using the user's camp marker color setting, defaulting to yellow.
- Minedoors render as a 1x1 marker at the marked tile with a user-colored outline, defaulting to cyan, and white diagonal stripes.
- Marker buttons rendered directly under the screen-space marker layer must explicitly opt back into pointer events so hover details and context menus work through the layer's non-interactive default.
- Triangle markers draw the clipped triangle on an inner pseudo-element, not on the interactive button itself, so the button can still render the search pulse outside the triangle bounds.
- Search text for searchable marker types should include user-facing aliases such as plural forms and spaced variants like `mine door` so users can find markers by how they describe them.

Infrastructure paths:

- Bridges, canals, and highways render as SVG polylines over the map.
- Default colors follow the WurmMaps convention: bridge magenta, canal blue, highway yellow.
- Users create and edit paths with click-to-draw points instead of typing every coordinate.
- Starting a path from the context menu must pin the pre-menu view so coordinate conversion does not shift after the shared-link URL updates.
- Bridges, canals, and highways are not searchable. Search filtering must not match path type, name, notes, width, points, or coordinates.
- Bridges, canals, and highways are visible by default but passive by default. Hover details, keyboard focus, and marker context actions are enabled only when local `Roadway Edit Mode` is on.
- `Roadway Edit Mode` is a draggable bottom-right map control. Its enabled state is local and defaults off; its screen position is persisted in user map settings.
- Path drawing must only append points from pointer interactions that start on the map viewport; fixed dialogs and controls must not create map points.
- Path creation from a marker/overlay context menu must use the clicked tile coordinate for the first point, even when the context row still includes the overlay marker that received the right-click.

Route planner:

- The route planner is a local, unsaved map tool controlled by a compact bottom-left icon button.
- The bottom-left tool stack renders the legend button above the route planner button.
- Only one planned route can exist at a time.
- When the planner is enabled, double-clicking an empty planner starts a route at that map tile. Double-clicking while a route exists clears that route.
- After a route starts, primary left clicks on the map append route points.
- Route planner interactions must work over map marker overlays such as deed areas; fixed dialogs and controls still must not create route points.
- Route length is the sum of straight-line segment distances in tile coordinates. The meter value is `tiles * 4`.
- Planned routes are visual overlays only; they do not create marker rows, audit events, or user map settings.

Legend:

- The bottom-left map tools include a legend button next to the route planner.
- The legend popup lists map marker and path symbols for towers, deeds, notes, rifts, camps, minedoors, bridges, canals, and highways.
- Legend symbol colors come from the current user map settings so changing layer colors updates the legend without separate state.

Tile highlighting:

- Tile highlight selections use the same color-detected terrain categories as WurmMaps for the active map image.
- The UI groups selections into Resources, Roads, Natural Terrain, Infected Terrain, and Other.
- The default lower-right tool stack renders the tile highlighting selector above Roadway Edit Mode. Dragged panel positions are saved as user map settings and override this default stack.
- Highlight masks are transparent image overlays generated from exact RGB matches, with user-configurable highlight color and opacity.
- The overlay highlights the non-matching tiles surrounding matched tiles, not the matched resource tiles themselves, so resources remain visible while the highlight reads as an outline.
- Generated highlight masks are local visual overlays and must not create audit events or marker records. The user's selected highlight category, color, opacity, and panel position are persisted as user map settings.
- Map settings layer rows are ordered as toggle, color selector, label, and opacity slider so visibility and styling controls scan consistently. The settings dropdown is intentionally compact because it contains many layer controls.

Client pointer conversion must account for zoom, pan, and image scaling. Server validation must only accept stored map coordinates, not screen coordinates.

Context menus:

- Right-click map and marker context menus show a copyable coordinate row at the top.
- The coordinate row is one button with the coordinate label and copy icon inside it, so either the visible text or icon writes the same shared link for that coordinate to the browser clipboard.
- Coordinate copy links use the current URL with `x` and `y` search parameters updated, preserving other relevant search parameters.

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
- Tower maker number rejects non-numeric values and values outside `0` through `999`.
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
- Do not include `.git` in application deploy or share artifacts; Git metadata can contain author emails, remote URLs, reflogs, and old project names even when the source tree is clean.
- Personal-information scans must check source files separately from Git metadata, and full Git-history cleanup requires an explicit history rewrite.
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
- Map settings modules own user preference validation and persistence.
- Audit module owns audit event creation.
- Cleanup command owns expired deleted marker removal.
- Map workspace components own rendering and interaction only.

No file should become a catch-all for unrelated app behavior.
