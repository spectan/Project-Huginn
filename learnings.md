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

### Tower Creator Numbers

Decision:

Tower creator numbers are optional, but when present they are a whole number from `0` through `999`. The UI's combined Creator field must parse `Kichi 1`, `Kichi 42`, and `Kichi 999` as the same creator name with different maker numbers.

Prevention:

Do not reintroduce an exact three-digit tower-number requirement. Keep tests for domain validation and the combined Creator form parser so saved one- and two-digit tower numbers round-trip without becoming part of the creator name.

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

### Overlay-Aware Hover And Edit Dragging

Context:

Some markers can sit under larger overlay areas, and users need to adjust marker positions while looking at an edit dialog.

What happened:

Hover details only described the DOM element that caught the pointer event, so a deed/rift/locate overlay could hide the marker underneath. Edit forms also required manual coordinate entry even when the desired move was visual.

Root cause:

The map treated hover as an element event instead of a coordinate query, and edit state did not have a temporary marker preview separate from persisted marker data.

Decision:

Hover details now run a coordinate hit test: direct pips on the tile come first, then overlay or roadway areas covering the tile, and multiple matches render as stacked pills. Marker context menus must use the same helper, so right-clicking an overlay-covered pip shows the same marker set as hover and still lets users edit the hidden pip. While a non-path marker edit dialog is open, dragging that marker's center pip updates only the dialog marker preview and X/Y fields until Save persists the change. Path markers still use their path-point editor.

Prevention:

For map interactions driven by screen coordinates, test with rendered screen positions derived from the marker style or current view, not raw map coordinates. Keep overlay hit testing in one workspace helper so hover, context menus, and future coordinate interactions do not drift by marker type.

### Shift-Drag Deed Drafting

Context:

Adding deeds through the right-click menu is precise but slow when users already know the intended footprint.

What happened:

Users needed a quick gesture that captures deed dimensions from the map without bypassing the existing deed validation and save flow.

Root cause:

The old create path only accepted a single coordinate from the context menu, and map pointer drags always meant pan unless another explicit tool mode was active.

Decision:

Writers can use `Shift + left-drag` on the map to draw an inclusive deed rectangle. The app previews the dragged area, converts the bounds into center `x/y` plus `north/west/east/south`, and opens the normal `Add deed` dialog. The selected footprint stays visible while the dialog is open, then clears when the dialog closes or the deed saves. The gesture works over marker overlays, ignores click-only or same-tile drags, and does not create a marker until Save.

Prevention:

When adding map gestures, keep modifier-driven tools separate from pan state and test both plain-map targets and overlay targets. Any quick-create tool should feed the existing create form unless the product explicitly asks for immediate persistence. Visual draft state should survive the create dialog long enough for users to verify their selection, and only clear on explicit close/cancel or successful save.

### Rift Overlay Settings

Context:

Rifts needed a larger visual area marker without giving camps the same treatment.

What happened:

The overlay requirement touched the marker renderer and user map settings because users need a dedicated toggle and opacity control.

Root cause:

Overlay visuals are not marker data, but they are durable per-user display preferences. Adding the visual alone would make the setting reset and would leave the map settings UI incomplete.

Decision:

Render rift overlays as non-interactive 51x51 fill-only squares centered on the rift. Gate them behind both the global `Overlays` setting and a dedicated `Rifts` setting, with independent `Rifts color` and `Rifts opacity`. The rift triangle and overlay use the same persisted rift color, defaulting to red. Camps remain marker-only.

Prevention:

When adding overlay behavior, update marker geometry tests, map settings defaults and parsers, settings UI controls, persisted settings tests, architecture docs, and this file together. If the marker has a fixed visual color, decide explicitly whether that color should become a persisted user setting.

### Overlay Context Menus Must Preserve Click Coordinates

Context:

Right-clicking an existing overlay should still allow users to create a bridge, canal, or highway starting exactly where they clicked.

What happened:

The marker context menu used the overlay marker's stored center coordinate for all context actions, so starting a path on top of a deed overlay used the deed center instead of the clicked tile.

Root cause:

The marker context path conflated "which marker received the context click" with "which map coordinate the user clicked".

Decision:

Marker and overlay context menus compute the clicked map coordinate from the event and view, use that coordinate for `Add at ...` actions, and still include the clicked marker in the context rows for edit/delete actions.

Prevention:

When context menus support both marker actions and coordinate-based creation, test a click away from the marker center inside an overlay. Keep the target marker identity separate from the clicked coordinate.

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

### Opacity Settings Use Percent Values

Context:

Layer opacity controls need to be predictable across marker overlays, paths, grids, and tile highlighting.

What happened:

Some controls defaulted to fully opaque and tile highlighting defaulted to a different value, which made the settings panel inconsistent.

Root cause:

Opacity defaults had grown feature-by-feature instead of being treated as one shared settings contract.

Decision:

All opacity sliders default to `50`. Slider values are interpreted as literal percentages: `0` maps to invisible CSS opacity `0`, and `100` maps to fully opaque CSS opacity `1`.

Do not combine slider opacity with semi-transparent `rgba(...)` or generated alpha colors. The fill/stroke color should be solid, and the slider should be the only opacity source; otherwise `100` still renders partially transparent.

Prevention:

When adding any opacity-backed setting, put it through the shared map settings defaults and parser, and test both the default slider value and at least one boundary conversion.

### Marker Opacity Is Overlay-Only

Context:

Tower, deed, and note center pips need to stay readable even when users reduce overlay opacity.

What happened:

The shared center-pip style helper accepted an opacity value, so tower, deed, and note 3x3 centers faded with the same slider used for their larger overlays.

Root cause:

Overlay opacity and marker-pip opacity were coupled in one style helper even though the UI intent is different: overlays should fade, but center pips are location anchors.

Decision:

Keep tower, deed, and note center pips at CSS opacity `1`. Apply marker opacity sliders only to overlay/area visuals such as tower ranges, deed rectangles/perimeters, rift overlays, paths, grids, and tile highlighting.

Prevention:

Use separate helper paths for opaque center pips and opacity-controlled overlays. Tests should assert both sides: a low tower opacity fades the tower overlay while the tower center remains fully opaque, and note centers remain fully opaque because notes have no separate overlay.

### Disbanded Deeds Convert Server-Side

Context:

Users need to preserve old deed information after a deed disbands, but the map should stop treating it as an active deed.

What happened:

The desired workflow crosses marker types: an edited deed becomes an `Abandoned Deed` note while the deed leaves the active marker list.

Root cause:

Doing this as separate client calls would split category creation, note creation, deed deletion, and marker state replacement across multiple failure points.

Decision:

Use one server-side deed-disband operation. It creates or reuses the map-scoped `Abandoned Deed` note category, creates a note at the deed center with the old deed name and details, and soft-deletes the deed inside one database transaction.

Prevention:

Keep cross-marker conversions in marker service/database dependencies rather than UI request chains. The client should apply the single response by adding the returned category if needed, removing the deleted deed ID, and inserting the returned note marker.

### Infrastructure Paths Need View Stability

Context:

Bridges, canals, and highways were added as click-to-draw multi-point markers.

What happened:

The first path point came from the context menu coordinate, but the context menu also updated the shared-link URL. On the next render the map recentered on that URL coordinate, so the next click converted through a different view and produced the wrong map coordinate.

Root cause:

Coordinate conversion depends on the exact view state at the time of the pointer event. Updating a shared coordinate URL can change `urlCoordinateView` during the same workflow unless drawing pins the pre-menu view.

Decision:

Store the view used to open a context menu and pass it into path creation. Path drawing sets that view as the manual view before accepting additional clicks. Paths are first-class `path_markers` records with type `bridge`, `canal`, or `highway`, 2-10 points, width `1`-`20`, soft delete/restore support, settings toggles, and per-type colors/opacities.

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

Only append path points when there is an active drag/click state created by a pointerdown on the map viewport. Infrastructure paths are also passive by default: hover details and marker actions require local `Roadway Edit Mode`.

Prevention:

For every multi-click map workflow, test clicks in floating dialogs and controls while the workflow is active. Do not let window-level listeners infer map intent from pointer-up alone.

### Route Planner Is Temporary

Context:

Users needed a quick route measuring tool separate from persisted bridges, canals, and highways.

What happened:

The map already had multi-point path creation, but that flow writes first-class marker records and opens a save dialog. Reusing it would blur a temporary measurement tool with shared map data.

Decision:

The route planner is local-only state behind a compact bottom-left icon toggle. Only one planned route can exist at a time. With the planner enabled, double-click starts a route when none exists and clears the existing route when one exists. Left clicks append points after the route starts. Distance is summed as straight-line tile-coordinate segment length and meters are `tiles * 4`.

Prevention:

Keep measurement tools separate from persisted marker/path workflows unless the product explicitly asks to save them. Regression tests should cover double-click start, double-click clear, click-to-add, the tile-to-meter conversion, and clicks over marker overlays.

### Map Tool Clicks Over Marker Overlays

Context:

The route planner is a map-level click workflow, but deed overlays and some marker centers are interactive buttons.

What happened:

The generic map click guard ignored interactive targets to keep dialogs and controls from creating map points. That also blocked route planner clicks on deed overlays, even though those overlays are visually part of the map.

Decision:

When route planner mode is active, pointer and double-click handling treats marker overlays inside the map viewport as map targets. Fixed controls, menus, and dialogs remain outside the viewport workflow and must not create route points.

Prevention:

For map-level tools, test both plain map clicks and clicks over marker overlay elements. Do not use a broad interactive-target guard when the interaction mode intentionally needs to pass through map markers.

### Legend Uses Display Settings

Decision:

The map legend is a local bottom-left popup next to the route planner. It lists tower, deed, note, rift, camp, minedoor, bridge, canal, and highway symbols, and each symbol reads from the current marker color settings instead of hardcoded duplicate colors. Bottom-left popups should open to the right of their icon instead of above the stack so they do not cover the buttons users need to close or switch tools.

Prevention:

When adding a new visible marker or path type, update the legend in the same pass as marker rendering and settings. Tests should assert that legend symbol colors come from `markerColors`.

### Note Marker Shape And Search Pulse

Context:

Notes should render as circular map markers while still participating in normal search highlighting.

What happened:

The later 3x3 note marker sizing rule reset `border-radius` to `0`, overriding the shared circular marker shape and making notes appear as squares.

Root cause:

Marker shape, marker sizing, and search pulse behavior all live on the interactive button. Changing the sizing rule without preserving the shape changed the visual marker even though search still added the correct `map-search-match` class.

Decision:

Keep notes as 3x3 centered circles by preserving `border-radius: 50%` on `.map-marker--note`. Do not move the note shape to a pseudo-element; the interactive button should keep the shape and the search pulse animation.

Prevention:

CSS regression tests should cover both the note shape and the search pulse contract. When changing marker shape CSS, verify the searched marker still receives `map-search-match` and that no pseudo-element absorbs the visible marker shape.

### Default Floating Tool Stacks

Context:

Tile highlighting, Roadway Edit Mode, the legend, route planner, event feed, and support link are all floating map UI.

Decision:

Use explicit corner stacks for default, unpositioned tools. The lower-right stack places Tile Highlighting above Roadway Edit Mode. The lower-left stack places the legend button above the route planner button and Events button. The support link is separate fixed bottom-center text so it stays unobtrusive and does not join either tool stack. Once a user drags a panel, its saved fixed position overrides the default stack.

Prevention:

When adding or moving floating map tools, test both DOM order and CSS stack direction. Avoid encoding "above another panel" as a guessed pixel offset when the controls can live in a flex stack. Treat non-tool links as separate fixed UI with low visual weight.

### Mobile Map Interaction

Context:

Desktop map workflows relied on wheel zoom, hover details, and right-click context menus.

What happened:

Pointer panning worked on touch screens, but there was no mobile replacement for wheel zoom, hover, or right-click. Floating controls and popout panels could also crowd or overflow narrow screens.

Root cause:

Touch input was treated like a single primary pointer. The map did not track multiple active touch pointers for pinch gestures, and context actions were bound only to native context-menu events.

Decision:

Track active touch pointers in the map workspace. A second active touch starts pinch zoom around the touch midpoint, one-finger movement remains pan, and long-press opens the existing coordinate context menu. Tapping a marker-covered coordinate can show the stacked marker details used by desktop hover. CSS uses a 720px mobile breakpoint to keep search, top-right menus, bottom tool icons, lower-right tools, and legend/event panels within the viewport.

Prevention:

When adding map interactions, include both pointer/mouse and touch equivalents in tests. For floating map chrome, add CSS regression checks for narrow viewports so panels stay reachable and do not rely on desktop-only side popouts.

### Fixed Map Popup Positioning

Context:

Map context menus and hover/tap detail panels are fixed-position overlays anchored to the pointer coordinate.

What happened:

Right-clicking or long-pressing near the viewport edge placed the popup at the raw pointer `left/top`, so much of the menu could render off-screen even though CSS constrained its maximum size.

Root cause:

The interaction code treated the clicked map coordinate and the popup screen anchor as the same problem. Coordinate conversion was correct, but popup layout still needed viewport-aware clamping.

Decision:

Keep map coordinates unchanged for actions and links, but clamp the fixed popup `left/top` using the viewport size, popup maximum dimensions, and a small margin. Apply the same helper to map context menus, marker context menus, and hover/tap detail panels.

Prevention:

When adding any fixed overlay anchored to a pointer event, test an edge-click case on a narrow viewport. CSS `max-width` and `max-height` are not enough unless the screen anchor is also bounded.

### Roadway Edit Mode

Context:

Bridges, canals, and highways needed the same interaction model, and users did not want roadways to participate in search.

What happened:

The old implementation treated highways as passive behind a saved `Highway Details` setting, while bridges and canals stayed interactive. Path search text also caused roadways to filter and pulse like normal markers.

Root cause:

Roadway visibility/style preferences and roadway edit intent are different concerns. Persisting edit intent in marker visibility settings made one path type behave differently and put an interaction mode in the wrong UI.

Decision:

Keep bridge, canal, and highway visibility, colors, and opacities in map settings. Move edit intent to a draggable bottom-right `Roadway Edit Mode` control. The mode defaults off and is local to the current view; only the panel position is saved in user map settings. When off, all roadways are visual-only with no hover, focus, or context menu. When on, all three path types support hover details and edit/delete context actions identically. Roadways are excluded from search text entirely.

Prevention:

When adding path behavior, test all three path types together. Do not add per-type interaction toggles unless there is a product requirement for different behavior.

### Top-Right Dropdowns Share Open State

Context:

The account dropdown and map settings dropdown live beside each other in the top-right controls.

What happened:

Each dropdown originally owned its own `isOpen` state, so users could open both panels concurrently and overlap the UI.

Root cause:

Open/close state was local to each dropdown component even though the two controls form one menu group.

Decision:

The map workspace owns a single top-panel state and passes controlled `isOpen`/`onOpenChange` props to account and map settings. Opening one panel closes the other.

Prevention:

For colocated dropdowns that should be mutually exclusive, keep ownership of open state at their nearest shared parent and add a regression test that opens both in sequence.

### Settings Defaults Are One Action

Context:

Users need a quick way to return the dense map settings menu to a known baseline.

What happened:

Settings were individually adjustable and persisted, but there was no single control to undo accumulated display changes.

Root cause:

The settings UI exposed the shared defaults but did not expose a reset action wired to the same source of truth.

Decision:

The top-right `Settings` menu includes a bottom-right `Default` button. It resets marker visibility, colors, opacities, tile highlight settings, and draggable panel positions to `DEFAULT_USER_MAP_SETTINGS`.

Prevention:

When adding new persisted user map settings, include them in `DEFAULT_USER_MAP_SETTINGS` and verify the `Default` action restores that field.

### Locate Soul Casts Are Pip Plus Shadow

Context:

Locate Soul support needs to represent a cast target location and the approximate spell result area without turning the result area into the interactive marker itself.

What happened:

The feature spans domain spell bands, persisted marker data, map rendering, search, hover details, deleted-marker restore, audit target typing, and per-user display settings.

Root cause:

The user-facing marker is a 3x3 cast pip, but the useful spell result is a derived direction/distance overlay. Treating both as one visual would make opacity and hit testing behave incorrectly.

Decision:

Store Locate Soul as a first-class marker with target name, caster facing, relative direction, Wurmpedia distance band, optional notes, and a 3x3 centered pip. Keep the pip fully opaque and interactive. Render the derived spell shadow as a non-interactive annular sector whose opacity comes only from the Locate Souls overlay setting. Do not track above-ground or cave state.

Prevention:

For spell-derived or calculated overlays, keep the persisted marker pip as the hit target and render the derived area with `pointer-events: none`. Keep modern game value tables in a domain module with tests; reference Wurm Unlimited code only as implementation context when current Wurmpedia values differ.

### Locate Soul Input Should Match The Event Log

Context:

Manually selecting target, direction, and distance for Locate Soul made users translate a game message into form fields.

What happened:

The game already emits one structured result line such as `Corpse of Itsumo is very far away behind you to the right`, and users naturally copy that line from the event window.

Root cause:

The first UI exposed the database fields directly instead of matching the workflow players actually use.

Decision:

The Locate Soul dialog keeps caster facing as a selector and replaces target, direction, distance, and notes inputs with one pasted event-output textarea. A shared domain parser extracts target name, Wurmpedia distance band, and relative direction from the log text. Existing stored markers still keep the same normalized fields.

Prevention:

For game-log-derived marker types, design the form around pasteable event output first, then parse into normalized server fields. Keep phrase parsing in the domain module with tests for real copied lines and no-result lines.

### Locate Soul Can Produce No In-Map Tiles

Context:

A Locate Soul marker can store and render correctly while its derived distance sector has no overlap with the current map.

What happened:

The pip appeared, but the shadow appeared missing. The saved user setting had `Locate Souls` opacity at `0`, and the latest `2000+` result was placed at a coordinate whose farthest Celebration tile was less than 2000 tiles away.

Root cause:

The renderer created an SVG path for the mathematical sector even when that sector was completely outside the map viewport, and there was no visible state distinguishing "hidden by opacity" from "no possible tiles on this map".

Decision:

Detect whether the locate-soul annular sector intersects the current map bounds. Render the normal filled shadow when it does. When it does not, render a dashed non-interactive direction indicator to the map edge using the same Locate Souls color and opacity settings.

Prevention:

For map overlays derived from ranges or bearings, test both a visible in-map case and an off-map/no-intersection case. Also check saved opacity when a layer appears absent, because `0%` opacity is a valid user setting.

### Context Coordinates Are Copyable Links

Context:

Right-click context menus already compute the exact coordinate the user clicked.

What happened:

The coordinate was visible, but sharing it required manually copying or reconstructing the URL.

Root cause:

Coordinate display and shared-link generation were separate UI paths.

Decision:

Map and marker context menus render a copyable coordinate row at the top. The row is a single button containing both the coordinate text and copy icon, and clicking either writes the current page URL with updated `x` and `y` parameters to the clipboard.

Prevention:

For future context-menu coordinate changes, test both map and marker menus, verify the copied URL matches the coordinate used by the menu actions, and keep the text/icon affordance as one accessible menu item.

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

### External Event Feeds Stay Server-Owned

Context:

Celebration live event/status data is useful in the map UI, but WurmMaps exposes it through an unofficial PHP endpoint rather than a documented API contract.

What happened:

The visible WurmMaps client calls `stat-delegate.php?map=celebration` and receives mixed event sections for deeds, missions, rifts, rites, holy sites, unique slayings, and status data.

Root cause:

The endpoint is public JSON but still an external implementation detail. Letting every browser call it directly would spread the dependency through the client and make failures harder to control.

Decision:

Fetch WurmMaps event/status data server-side, normalize it into a small read-only event feed, decode simple HTML entities, sort newest-first, cap the payload to 30 entries, and keep it minimized behind a bottom-left Events button below the legend and route planner controls. The feed panel has a persisted, validated size in user map settings and resizes through constrained corner drag handles while the list keeps its internal scroll. Do not import WurmMaps marker or path data as part of the event feed.

Prevention:

Keep external feed parsing in a dedicated module with tests. Route and page code should consume normalized data only, and feed failures must not block normal map loading. Bottom-left status panels should default to compact buttons and pop out to the right unless users explicitly open them, so persistent map tools do not obscure the map or their own toggle buttons. Persist dimensions through the shared settings parser rather than raw local storage so invalid sizes fall back safely.

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
