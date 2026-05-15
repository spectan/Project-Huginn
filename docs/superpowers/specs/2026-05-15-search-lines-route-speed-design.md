# Search Lines and Route Speed Design

## Scope

Add two persisted map preferences:

- Search lines from the selected coordinate to matching search results.
- Route planner speed in km/h, used to estimate travel time.

Both preferences are scoped to the current user and map through the existing `UserMapSettings` payload.

## Search Lines

The search menu gains a compact `Search lines` checkbox. The setting defaults to `false` and persists as `searchLinesEnabled`.

When all of these are true, the map renders lines:

- `searchLinesEnabled` is true.
- The search query is non-empty.
- A selected coordinate exists from the current coordinate state or URL coordinate.
- Search results contain visible matching non-path markers.

The lines start at the selected coordinate and end at each matching marker center. They render in a non-interactive SVG layer beneath marker pips and above the map image, so they do not block hover, context menus, route planning, or marker editing. Search lines do not include bridge, canal, or highway markers because roadways are intentionally excluded from search.

## Route Planner Speed

The route planner button gains a compact popout to the right of the icon whenever the planner is enabled. The popout contains:

- A numeric speed input labeled `Speed`, range `0-60`, unit `km/h`.
- Route distance in tiles.
- Route distance in meters.
- Estimated travel time.

The speed defaults to `0` and persists as `routePlannerSpeedKmh`. Values are clamped to the inclusive range `0-60` when loaded from settings and when changed in the UI.

Travel time calculation:

- `meters = tiles * 4`
- `hours = (meters / 1000) / speedKmh`

When speed is `0`, the estimated time renders as `--` because travel time is undefined. Otherwise, time is formatted as seconds, minutes, or hours/minutes depending on duration.

## Data Flow

`DEFAULT_USER_MAP_SETTINGS` adds `searchLinesEnabled` and `routePlannerSpeedKmh`. The settings parser validates both fields and merges invalid or missing values back to defaults.

`MapWorkspace` owns the two state values, includes them in `userMapSettings`, passes the search-lines setting into `SearchOverlay`, and passes speed into `RoutePlannerControl`.

Search line geometry is derived from the current rendered search result list, `renderedSelectedCoordinate`, marker visibility, and map view. It is not stored as marker data and does not create audit events.

## Testing

Add or update tests for:

- User settings defaults, saved values, invalid fallback, and reset behavior.
- Search checkbox rendering and persistence.
- Search lines rendering only when enabled, search has results, and a selected coordinate exists.
- Search lines using screen-space geometry under current zoom/pan.
- Route speed input default, clamp behavior, persistence, and reset behavior.
- Route travel-time display using `4 meters` per tile and `--` at `0 km/h`.
- CSS keeps the route speed popout aligned to the right of the route button and usable on mobile.

## Documentation

Update `architecture.md` and `learnings.md` with the persisted settings, rendering conditions, and route time formula.
