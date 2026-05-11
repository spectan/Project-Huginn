# Server Map Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development while implementing this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server selection plus map layer selection so Celebration can switch between terrain and topographical imagery while keeping all markers/settings on the same server data set.

**Architecture:** Keep the existing `Map` record as the server/data scope because all markers and user settings already reference `mapId`. Add `MapLayer` records under each `Map` for visual imagery variants. The workspace switches layers locally, while server switching can reload a different `Map` data set by URL query when more servers exist.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma/PostgreSQL, Vitest, local PNG map assets.

---

### Task 1: Prove Workspace Layer Switching

**Files:**
- Test: `src/app/map/page.test.tsx`
- Modify: `src/app/map/map-workspace.tsx`
- Modify: `src/app/globals.css`

- [ ] Write a failing test that renders a server dropdown with `Celebration`, a map dropdown with `Terrain` and `Topographical`, and verifies that selecting `Topographical` swaps the map image without removing an existing marker.
- [ ] Run `npm test -- src/app/map/page.test.tsx --runInBand` or `npm test -- src/app/map/page.test.tsx` and confirm the test fails because the dropdowns do not exist.
- [ ] Add `layers` to `WorkspaceMap`, local selected-layer state, and a `MapSelectionOverlay` under the search box.
- [ ] Style the selectors as compact controls below the search input.
- [ ] Re-run the page test and confirm it passes.

### Task 2: Prove Marker Service Serializes Layers

**Files:**
- Test: `src/lib/markers/marker-service.test.ts`
- Modify: `src/lib/markers/marker-service.ts`
- Modify: `src/lib/markers/marker-types.ts`

- [ ] Write a failing test that `listMarkers` returns the same `map.id` plus both visual layers.
- [ ] Run `npm test -- src/lib/markers/marker-service.test.ts` and confirm it fails because map layers are missing.
- [ ] Extend the marker service map record type and serializer to include layer metadata with a default fallback from `imagePath`.
- [ ] Re-run the marker service test and confirm it passes.

### Task 3: Persist Layers In Database

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260511050000_map_layers/migration.sql`
- Modify: `src/lib/markers/database.ts`
- Modify: `src/app/map/page.tsx`
- Modify: `src/app/api/maps/active/route.ts`
- Modify: `scripts/seed-admin.mjs`

- [ ] Add `MapLayer` to Prisma and relate it to `Map`.
- [ ] Add a migration that creates `map_layers`, backfills a terrain layer for existing maps, inserts the Celebration topographical layer, and renames the seeded map to `Celebration`.
- [ ] Include ordered layers in `findMap`, `findActiveMap`, and active map loading.
- [ ] Add helpers to list active server summaries and pick a server from `?server=`.
- [ ] Update the seed script to upsert `Celebration` and its two layers.
- [ ] Run Prisma generation or the project verification step that regenerates the client.

### Task 4: Add Topographical Asset

**Files:**
- Create: `public/maps/celebration-topo.png`
- Modify: `src/lib/map-assets.test.ts`
- Modify: `learnings.md`

- [ ] Download the WurmMaps Celebration topographic PNG to `public/maps/celebration-topo.png`.
- [ ] Add an asset test asserting it is a 2048x2048 PNG and pin its byte length/hash.
- [ ] Record the source URL and hash in `learnings.md`.

### Task 5: Document And Verify

**Files:**
- Modify: `architecture.md`
- Modify: `learnings.md`

- [ ] Document that `Map` is currently the server/data scope and `MapLayer` is the visual layer scope.
- [ ] Run targeted tests for the map workspace, marker service, and map assets.
- [ ] Run the project verification command or the strongest practical subset.
- [ ] Start the dev server and verify the page loads locally.
