# Learnings

This file records recurring bugs, design decisions, and implementation lessons so the project does not repeat avoidable mistakes.

Each entry should use this format:

```markdown
## YYYY-MM-DD - Short Title

Context:

What happened:

Root cause:

Decision:

Prevention:
```

## Initial Decisions

### Coordinate System

Decision:

Use top-left origin coordinates. `(0, 0)` is the upper-left pixel of the map image. `x` increases right, `y` increases downward, and one pixel equals one tile.

Prevention:

Do not introduce alternate coordinate conversions unless a future map explicitly requires them. Client code may convert screen coordinates to map coordinates, but stored coordinates are always map pixel coordinates.

### Numeric Marker Fields

Decision:

Store tower QL and damage as integer hundredths instead of floating point values. QL range is `0` to `10000`; damage range is `0` to `9999`.

Prevention:

Use shared parse and format helpers for QL and damage. Do not parse these values ad hoc in UI components or server handlers.

### Tower Overlay Geometry

Decision:

Tower overlays are centered squares, not circles. The protection overlay extends 25 tiles in each direction for a `51x51` square, and the placement overlay extends 50 tiles in each direction for a `101x101` square. The tower center is a bright white square.

Prevention:

Keep tower overlay constants named as distances rather than radii. UI code should calculate square dimensions as `distance * 2 + 1` so the center tile is included.

### Server-Side Permission Enforcement

Decision:

Every marker write, user approval, permission change, admin restore, and audit-log read must be authorized on the server. UI controls may be hidden for convenience, but hidden controls are not security.

Prevention:

Add tests that call server write paths as read-only, pending, and anonymous users.

### Multi-Map-Ready Data

Decision:

All marker records and relevant audit events reference `mapId` from the first database migration, even if the first UI exposes only one active map.

Prevention:

Do not create marker APIs or queries that assume global markers without a map scope.

### Centered Deed Dimensions

Decision:

Store deed coordinates as the deed center pixel, with separate `north`, `west`, `east`, and `south` tile counts. A default deed uses `5` in each direction, which covers `11x11` total pixels including the center.

Prevention:

Do not reintroduce deed `width`/`height` fields or top-left deed anchors. UI overlays should derive their rectangle from the directional dimensions and render the center pixel separately.

### Deed Fields Cut Across the Whole Stack

Decision:

Treat deed metadata and geometry as one serialized marker contract. Perimeter is a persisted integer from `0` to `100` with a default of `5`, and founding date is an optional date-only database value serialized to the client as `YYYY-MM-DD` or `null`.

Prevention:

When adding a deed field, update domain validation, Prisma schema and migrations, marker service parsing and serialization, workspace marker types, create/edit forms, hover details, and deed fixtures together. For visual perimeters, render tile-thick edge strips instead of CSS borders or outlines so scaled map overlays stay crisp.

### New Marker Types Are Not Just UI

Decision:

Rifts, camps, and minedoors are first-class marker records with their own validation, Prisma models, active list queries, soft-delete/restore flow, audit target types, forms, rendering, and search/context metadata.

Prevention:

When adding a marker type, update the domain module, marker service dependencies, Prisma schema and migrations, map routes, deleted-marker service and database adapters, audit target unions, admin deleted-marker formatting, map forms, context menus, marker rendering, tests, `architecture.md`, and this file in one pass.

### Direct Marker Hit Testing

Context:

Rifts, camps, and minedoors were rendered directly under the screen-space marker layer instead of inside the tower/deed marker group.

What happened:

The markers appeared, but browser hover and right-click actions did not work because the marker layer disables pointer events by default and only grouped tower/deed markers had an explicit pointer-event override.

Root cause:

The new marker rendering copied the visual marker shape but missed the marker-layer interaction contract.

Decision:

Direct marker buttons under `.map-marker-layer` must explicitly set `pointer-events: auto`. Minedoors are a visual 1x1 tile marker, while rifts and camps remain 3x3 centered triangles. Triangle markers must keep `clip-path` on an inner shape rather than on the button, because clipping the button also clips the search pulse box-shadow.

Prevention:

When adding a marker rendering path, test both geometry and hit testing. Include search aliases for user-facing marker names, including plurals and spaced variants.

### Rift Overlay Settings

Context:

Rifts needed a larger visual area marker without giving camps the same treatment.

What happened:

The overlay requirement touched the marker renderer and user map settings because users need a dedicated toggle and opacity control.

Root cause:

Overlay visuals are not marker data, but they are durable per-user display preferences. Adding the visual alone would make the setting reset and would leave the map settings UI incomplete.

Decision:

Render rift overlays as non-interactive 51x51 fill-only squares centered on the rift. Gate them behind both the global `Overlays` setting and a dedicated `Rift Overlays` setting, with independent `Rift Overlay opacity`. Camps remain marker-only.

Prevention:

When adding overlay behavior, update marker geometry tests, map settings defaults and parsers, settings UI controls, persisted settings tests, architecture docs, and this file together.

### Special Marker Display Settings

Context:

Camps and minedoors needed their own visibility toggles and colors after being added as first-class marker types.

What happened:

The direct marker renderer could use the new colors, but workspace-level hit testing and stacked-marker context rows also needed the same visibility and color settings. Otherwise hidden markers could still appear in coordinate context flows, and context chips would keep default colors.

Root cause:

Marker display preferences are consumed in more than one rendering path. Adding a color or toggle only to the visible marker button leaves secondary UI paths out of sync.

Decision:

Persist camp and minedoor visibility and colors in user map settings. Apply those settings in marker rendering, direct coordinate visibility checks, saved-settings parsing, settings UI, and marker context row coloring.

Prevention:

When a marker type gains a display preference, update defaults, parsers, settings service tests, settings UI, marker-layer styles, workspace visibility helpers, context-row colors, and saved-setting load tests together.

### Infrastructure Paths Need View Stability

Context:

Bridges, canals, and highways were added as click-to-draw multi-point markers.

What happened:

The first path point came from the context menu coordinate, but the context menu also updated the shared-link URL. On the next render the map recentered on that URL coordinate, so the next click converted through a different view and produced the wrong map coordinate.

Root cause:

Coordinate conversion depends on the exact view state at the time of the pointer event. Updating a shared coordinate URL can change `urlCoordinateView` during the same workflow unless drawing pins the pre-menu view.

Decision:

Store the view used to open a context menu and pass it into path creation. Path drawing sets that view as the manual view before accepting additional clicks. Paths are first-class `path_markers` records with type `bridge`, `canal`, or `highway`, 2-10 points, width `1`-`20`, soft delete/restore support, search text, settings toggles, and per-type colors.

Prevention:

When adding any multi-click map workflow, test at least one flow that starts from a right-click context menu and then clicks another map point. Keep view state and URL updates explicit so screen-to-map conversion stays stable.

### Path Drawing Must Ignore Panel Events

Context:

Click-to-draw paths use global pointer listeners so mouseup still completes a map click even if pointer capture behaves differently across browsers and tests.

What happened:

Clicking inside the fixed path details panel while a draft was open appended a highway point underneath the panel.

Root cause:

The global pointer-up fallback added points whenever a path draft existed, even if no pointer interaction had started on the map viewport.

Decision:

Only append path points when there is an active drag/click state created by a pointerdown on the map viewport. Highways are also passive by default: hover details and marker actions require the persisted `Highway Details` display mode.

Prevention:

For every multi-click map workflow, test clicks in floating dialogs and controls while the workflow is active. Do not let window-level listeners infer map intent from pointer-up alone.

### Deleted Marker Retention

Decision:

Deleted markers are restorable for 72 hours, then permanently deleted. Audit history remains indefinitely, but coordinate-bearing deleted marker records must not remain after the restore window.

Prevention:

Test cleanup behavior with expired and non-expired deleted markers. Make cleanup create audit events without copying coordinate data into long-lived audit metadata. Do not store marker coordinates in audit metadata unless a future redaction process is added first.

### NASA-Inspired Constraints

Decision:

Apply the intent of NASA's Power of 10 rules to this TypeScript web app: small functions, simple control flow, bounded queries, strict validation, narrow scope, checked results, and warnings treated as failures.

Prevention:

Before merging feature work, run type checks, linting, and tests. Treat ignored promises, broad mutable state, unbounded queries, and overgrown files as defects.

### Initial Map Asset

Decision:

The supplied 2048x2048 Wurm map PNG is checked in as `public/maps/wurm-map.png` for the initial map shell. The current seed asset is assembled from the authorized WurmMaps Celebration terrain tile layer at native zoom `3` and has SHA-256 `f4f033492adeabcafd2bb9153ba71b4065afa1418f9b61390a4c5da10b82865f`.

The Celebration topographical layer is checked in as `public/maps/celebration-topo.png`, sourced from `https://wurmmaps.xyz/Celebration/topo.png`, and has SHA-256 `9d7ae2d054262552fb7dfa1b7fc8a69000b22463ea6455e4417abc0ff6526fab`.

Prevention:

Render the image at its natural 2048x2048 dimensions so one CSS pixel matches one map coordinate unit. When the database-backed map storage workflow is added, preserve the same top-left coordinate convention and migrate this seed asset into the configured map storage path.

### Server Data Scope vs Visual Map Layers

Decision:

The existing `Map` row is the durable server/data scope because towers, deeds, notes, rifts, camps, minedoors, bridge/canal/highway paths, note categories, audit events, and user map settings all reference `mapId`. Visual map variants such as terrain and topographical imagery belong in `MapLayer` rows under the same `Map`.

Prevention:

Do not add a second `Map` row when adding a new visual layer for the same server. Doing so splits marker data and user settings. Add a `MapLayer` instead, and keep marker write/read APIs pointed at the server-scope `map.id`.

### Self-Service Password Changes

Decision:

Users can change their own password from the account dropdown, but the request must include the current password and a matching confirmed new password. The route is `/api/auth/password` and is separate from the admin password-change route.

Prevention:

Do not reuse the admin password API for self-service changes. The admin API has different authorization and broader session-invalidating behavior. Self-service changes must verify the current password, enforce the normal 12-128 character password rule, audit `USER_PASSWORD_CHANGED` without password metadata, pass the current `wurm_session` token hash through the route and service, delete the user's other database sessions, and leave the current signed-in session usable.

### Tile Highlighting Source

Decision:

Terrain/resource highlighting is derived from exact RGB matches in the active map image, matching the WurmMaps approach for clay, tar, peat, roads, cave entrances, and other tile categories. The visible overlay should color the surrounding non-matching tiles instead of filling the matched resource tiles, so the highlight functions as an outline.

Prevention:

Keep tile type names, RGB values, and outline-mask generation centralized in the tile-highlighting domain module. Do not scatter color constants through UI components, and keep highlight overlays as local visual state rather than persisted marker data.

### Docker Desktop PATH

Context:

Docker Desktop was installed, but the current PowerShell process could not find `docker`.

What happened:

`docker compose config` failed until the Docker resource directory was prepended to `PATH`.

Root cause:

The active shell was started before Docker's CLI path was available.

Decision:

For local verification in this workspace, use `C:\Program Files\Docker\Docker\resources\bin\docker.exe` directly or prepend `C:\Program Files\Docker\Docker\resources\bin` to `PATH`.

Prevention:

After installing Docker Desktop, restart shells before Compose work. If Docker credential helper errors mention `docker-credential-desktop`, add Docker's resource `bin` directory to `PATH` for that command.

### Viewport-Derived Map State

Context:

The map view needs to fit to the browser viewport on first render and after resize.

What happened:

Calling `setState` directly inside an effect to fit the map triggered the React hooks lint rule against synchronous state updates in effects.

Root cause:

The initial view was derived from viewport dimensions, but the component treated that derived value as a post-render correction.

Decision:

Use `useSyncExternalStore` for viewport size and derive the fitted map view from that snapshot. Store manual pan/zoom only after direct user interaction.

Prevention:

When state is purely derived from browser dimensions or other external snapshots, model the external source explicitly and derive render state from it instead of patching initial render state in an effect.

### Prisma Client Generation on Windows

Context:

Adding the session model required regenerating the Prisma client.

What happened:

`prisma generate` failed with an `EPERM` rename error for `query_engine-windows.dll.node` while the Next dev server was running.

Root cause:

The dev server had the generated Prisma query engine loaded, so Windows prevented Prisma from replacing the DLL.

Decision:

Stop the local WurmMapUtil dev server before regenerating Prisma after schema changes.

Prevention:

If `prisma generate`, `prisma db push`, or migration commands fail with a Windows DLL rename error, inspect Node processes for this workspace, stop the dev server, rerun the Prisma command, then restart the server.

### Prisma No-Engine Generation

Context:

Regenerating Prisma on Windows after schema changes hit a locked query engine DLL.

What happened:

Using `PRISMA_GENERATE_NO_ENGINE=1 prisma generate` avoided the Windows rename error, but the generated client then failed local API requests with `P6001` because normal PostgreSQL URLs require the local query engine.

Root cause:

The no-engine Prisma client is for driver-adapter or Prisma Accelerate-style URLs, not this app's direct `postgresql://` local and Compose database connections.

Decision:

Do not use `PRISMA_GENERATE_NO_ENGINE=1` for this project. Stop the Next dev server, regenerate Prisma normally, then restart the dev server.

Prevention:

If admin APIs or other Prisma-backed routes suddenly fail while tests still pass, run a direct Prisma query with the same `DATABASE_URL`. If it reports `P6001`, regenerate Prisma normally after stopping the process that has `query_engine-windows.dll.node` loaded.

### Local Compose Database Access

Context:

The app service can reach Postgres on Docker's internal network, but the host-run Next dev server also needs database access.

What happened:

The database container started successfully but was not reachable from the host because no port was published.

Root cause:

The initial Compose file only supported container-to-container database access.

Decision:

Publish Postgres on `127.0.0.1:5432` for local development while keeping it bound to localhost.

Prevention:

Do not change this to `0.0.0.0:5432` for convenience. On a VPS, Postgres should stay private to Docker or localhost-only access.

### Local Node Runtime Version

Context:

The project requires Node `>=22.13.0`, but the machine-wide `node` on this shell resolved to Node 18.

What happened:

Vitest failed before loading tests because Rolldown imported `node:util` features that are not available in Node 18.

Root cause:

The active PowerShell `PATH` preferred `C:\Program Files\nodejs\node.exe` over the newer bundled Codex runtime.

Decision:

For local verification in this workspace, prepend `%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin` to `PATH`, or install a machine-wide Node version that satisfies `package.json`.

Prevention:

Check `node -v` before running `npm run verify`. If test startup fails inside Rolldown or Vite with missing Node built-in exports, confirm the shell is using Node 22 or newer before debugging application code.

### Postgres Volume Passwords

Context:

Compose validation was run with a different `POSTGRES_PASSWORD` than the password used when the local `postgres-data` volume was first initialized.

What happened:

The database container started, but app-side Prisma commands failed with `P1000: Authentication failed against database server`.

Root cause:

The official Postgres image only applies `POSTGRES_PASSWORD` when initializing an empty data directory. Once a volume exists, changing the environment variable does not change the existing database user's password.

Decision:

Keep the Compose `.env` password stable for a given database volume. If the password must change, run an explicit SQL password change or recreate the volume intentionally after backing up data.

Prevention:

When app containers cannot authenticate but the database health check passes, confirm the `POSTGRES_PASSWORD` value matches the initialized volume. Do not assume changing `.env` updates an existing Postgres user.

### Overlay Visibility and Crispness

Context:

Map overlays are zoomed with the marker layer and can be hidden independently from marker centers.

What happened:

Hiding overlays still left deed outline artifacts because deeds used a hidden 1x1 overlay button as the interactive marker. Tower and deed overlay edges also looked blurry under zoom because CSS outlines/borders were being transformed.

Root cause:

Overlay geometry and marker center interaction were coupled in the same element, and CSS stroke properties do not align cleanly when the map layer is scaled to fractional zoom levels.

Decision:

Render deed overlays as separate fill-only overlay elements, and render the 3x3 deed center as the actual marker when overlays are hidden. Tower and deed overlays should use translucent fills without outline, border, or shadow strokes.

Prevention:

Keep overlay visibility tests checking that hidden overlays remove the overlay element. Keep overlay CSS tests rejecting `outline`, `border`, and `box-shadow` on map overlay blocks.

### Map-Scoped Note Categories

Context:

Notes were expanded from plain text markers into categorized records with titles.

What happened:

The note UI, domain validation, marker serialization, seed data, and Prisma schema all had to change together.

Root cause:

Notes are displayed, searched, validated, persisted, and edited through separate layers, so adding fields in only one layer creates drift quickly.

Decision:

Store `title` and `category` on each note, and store selectable categories in a map-scoped `note_categories` table. Admins can create categories; all approved users can select existing categories.

Prevention:

When marker fields change, update domain validation, Prisma schema, database serialization, UI forms, hover details, search text, seed data, and tests in the same change.

### Persistent Auth and Shared Links

Context:

Logged-in users need shared `/map?...` links to open without another login prompt.

What happened:

The app already used database-backed sessions and an HTTP-only browser cookie, but the persistence behavior was not explicitly tested and the cookie lifetime was short enough to be mistaken for non-persistent auth.

Root cause:

Persistent auth depends on both sides staying aligned: the database session must remain unexpired, and the browser must send the same host's root-scoped cookie when opening a top-level shared link. Cookies do not transfer between `localhost`, an IP address, and a production domain.

Decision:

Keep session tokens HTTP-only and database-backed, set the persistent session lifetime to 90 days, path-scope the cookie to `/`, and keep `sameSite: "lax"` so external top-level links back to the same canonical app host include the session cookie.

Prevention:

Keep direct tests for session cookie options. When debugging a login prompt from a shared link, first compare the link host and scheme to the host and scheme used at login before changing auth code.

### Dev Server Environment for Auth

Context:

The admin seed command was run successfully, but browser login still showed the generic "Authentication failed" message.

What happened:

The Next dev server had been started before `DATABASE_URL` was set. Login requests returned HTTP 500 from Prisma initialization, and the client displayed the fallback auth failure text.

Root cause:

Environment variables are captured when the dev server process starts. Setting `DATABASE_URL` for a later seed command does not update an already-running Next process.

Decision:

When starting dev against the Compose Postgres container, launch `next dev` with `DATABASE_URL` derived from the running database container environment, or create a local `.env` before starting the server.

Prevention:

If login says "Authentication failed" after reseeding credentials, check `.next/codex-dev.err.log` and the login response status. A 500 with missing `DATABASE_URL` means restart the dev server with the database environment before changing passwords again.

### User Map Settings Persistence

Context:

Map layer colors, opacity, visibility, tile highlight selection, and the draggable tile highlighter position were reset on page reload or when opening shared links.

What happened:

Those controls lived only in React component state. The map UI could restore server data such as markers, but it had no server-owned preference record for per-user display settings.

Root cause:

Display preferences are not shared map data, but they still need durable account-scoped storage. Treating them as local visual state made them disappear across devices and fresh page loads.

Decision:

Store settings in `user_map_settings` scoped by `userId` and `mapId` with a validated JSON payload. Load settings with the map workspace data and save full merged settings through `PATCH /api/maps/[mapId]/settings`.

Prevention:

For any preference that should survive a shared-link open or device change, add it to the map settings domain defaults, parser, service tests, API payload, and workspace save payload in the same change.

### Repository Metadata Hygiene

Context:

The source tree did not contain personal email addresses, but local Git metadata did.

What happened:

The local `.git/config`, `.git/FETCH_HEAD`, and reflogs contained prior author identity, remote URL, and old branch/project references.

Root cause:

Git stores operational metadata outside the source tree, and `rg` scans that exclude `.git` do not catch local repository identity. Commit objects also retain historical author and committer identities even after local config and reflog cleanup.

Decision:

Keep source scans and Git metadata scans separate. Clean local metadata by removing local Git identity, remote URLs, `FETCH_HEAD`, and reflog entries. Do not include `.git` in deploy or share artifacts.

Prevention:

Before sharing a workspace archive, scan with and without `.git`. If `git log --format` still shows personal identities, treat that as a history-rewrite task and get explicit approval before rewriting refs.
