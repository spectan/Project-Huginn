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

Prevention:

Render the image at its natural 2048x2048 dimensions so one CSS pixel matches one map coordinate unit. When the database-backed map storage workflow is added, preserve the same top-left coordinate convention and migrate this seed asset into the configured map storage path.

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
