# Persistent Auth User Map Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist authenticated users' map display preferences in PostgreSQL and keep existing session cookies usable when shared map links are opened on the same app host.

**Architecture:** Add a `UserMapSettings` Prisma model scoped by `userId + mapId` with a validated JSON payload. Load settings with the server-rendered map workspace, update them through an authenticated map settings API route, and debounce client-side saves from the map workspace. Keep sessions server-side and document that cookie persistence depends on using one canonical host.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, PostgreSQL JSONB, Vitest, Testing Library.

---

### Task 1: Settings Domain

**Files:**
- Create: `src/lib/map-settings/map-settings.ts`
- Test: `src/lib/map-settings/map-settings.test.ts`

- [ ] **Step 1: Write failing tests**

Cover default settings, partial payload merging, invalid color fallback, opacity clamping, and nullable tile highlighter position.

- [ ] **Step 2: Run the domain tests to verify failure**

Run: `npx vitest run src/lib/map-settings/map-settings.test.ts`
Expected: fail because the module does not exist.

- [ ] **Step 3: Implement domain validation and serialization**

Export `DEFAULT_USER_MAP_SETTINGS`, `parseUserMapSettings`, and `mergeUserMapSettingsInput`. Reuse existing marker setting shapes from `src/lib/markers/marker-types.ts`.

- [ ] **Step 4: Run the domain tests to verify pass**

Run: `npx vitest run src/lib/map-settings/map-settings.test.ts`
Expected: pass.

### Task 2: Database Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260511010000_user_map_settings/migration.sql`
- Create: `src/lib/map-settings/database.ts`
- Create: `src/lib/map-settings/map-settings-service.ts`
- Test: `src/lib/map-settings/map-settings-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Cover fetching defaults when no row exists, rejecting unreadable users, and upserting merged settings for a readable user.

- [ ] **Step 2: Run the service tests to verify failure**

Run: `npx vitest run src/lib/map-settings/map-settings-service.test.ts`
Expected: fail because service/database modules do not exist.

- [ ] **Step 3: Add Prisma model and migration**

Add `UserMapSettings` with `userId`, `mapId`, `settings Json`, timestamps, cascading foreign keys, and unique `userId + mapId`.

- [ ] **Step 4: Implement service and Prisma dependencies**

Expose `getUserMapSettings` and `saveUserMapSettings`; authorize with `canReadMap`; validate every returned or saved payload through the domain module.

- [ ] **Step 5: Run service tests to verify pass**

Run: `npx vitest run src/lib/map-settings/map-settings-service.test.ts`
Expected: pass.

### Task 3: API And Server Load

**Files:**
- Create: `src/app/api/maps/[mapId]/settings/route.ts`
- Test: `src/app/api/maps/[mapId]/settings/route.test.ts`
- Modify: `src/app/map/page.tsx`

- [ ] **Step 1: Write failing API tests**

Cover unauthenticated `PATCH` returning 401 and authenticated `PATCH` returning merged settings.

- [ ] **Step 2: Run API tests to verify failure**

Run: `npx vitest run src/app/api/maps/[mapId]/settings/route.test.ts`
Expected: fail because the route does not exist.

- [ ] **Step 3: Implement route and load initial settings**

Use `getCurrentViewer`, `createUserMapSettingsDependencies`, `saveUserMapSettings`, and `getUserMapSettings`. Pass `initialSettings` into `MapWorkspace`.

- [ ] **Step 4: Run API tests to verify pass**

Run: `npx vitest run src/app/api/maps/[mapId]/settings/route.test.ts`
Expected: pass.

### Task 4: Client Persistence

**Files:**
- Modify: `src/app/map/map-workspace.tsx`
- Test: `src/app/map/page.test.tsx`

- [ ] **Step 1: Write failing component tests**

Cover initial settings being rendered and changes to tile highlighter position/color being saved to `/api/maps/:mapId/settings`.

- [ ] **Step 2: Run component tests to verify failure**

Run: `npx vitest run src/app/map/page.test.tsx`
Expected: fail on the new persistence expectations.

- [ ] **Step 3: Wire settings state and debounced save**

Initialize settings state from server props, save settings after client changes, and include tile highlighter position in the settings payload.

- [ ] **Step 4: Run component tests to verify pass**

Run: `npx vitest run src/app/map/page.test.tsx`
Expected: pass.

### Task 5: Auth Persistence And Docs

**Files:**
- Create: `src/lib/auth/cookies.test.ts`
- Modify: `src/lib/auth/session.ts`
- Modify: `architecture.md`
- Modify: `learnings.md`

- [ ] **Step 1: Write failing cookie tests**

Cover persistent max-age, root path, HTTP-only, and same-site lax cookie options.

- [ ] **Step 2: Run cookie tests to verify failure**

Run: `npx vitest run src/lib/auth/cookies.test.ts`
Expected: fail if cookie options are not exported for direct verification.

- [ ] **Step 3: Make cookie options testable and document the lesson**

Export a small session cookie options builder if needed, keep the cookie HTTP-only, and document canonical-host requirements plus database-backed user map settings.

- [ ] **Step 4: Run final verification**

Run: `npm run verify`
Expected: typecheck, lint, tests, and build all succeed.
