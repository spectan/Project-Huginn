# Map Asset And Coordinate Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the low-quality map asset with the provided Celebration source image and add the first WurmMaps-style coordinate link behavior.

**Architecture:** Keep the existing single-image renderer for this slice, because the provided source image has the same `2048x2048` coordinate space and can be swapped without database changes. Add URL coordinate parsing and copy-link behavior inside the map workspace, with tests around read/write permissions and initial centering.

**Tech Stack:** Next.js App Router, React client component state, TypeScript, Testing Library, Vitest, static PNG map asset.

---

### Task 1: Replace The Seed Map Asset

**Files:**
- Modify binary asset: `public/maps/wurm-map.png`
- Modify test: `src/lib/map-assets.test.ts`
- Modify docs: `learnings.md`

- [ ] **Step 1: Copy the provided source over the active seed map**

Run:

```powershell
Copy-Item -LiteralPath ".\Celebration-classic-20260224.png" -Destination ".\public\maps\wurm-map.png" -Force
```

Expected: `public/maps/wurm-map.png` remains a `2048x2048` PNG but has the new byte length and hash from the provided Celebration source.

- [ ] **Step 2: Update the asset integrity test**

Change `src/lib/map-assets.test.ts` so the expected byte length and SHA-256 match the copied asset while preserving the PNG signature and dimensions checks.

- [ ] **Step 3: Update the learning note**

Change the seed map asset hash in `learnings.md` to the new SHA-256 so future asset drift is intentional.

### Task 2: Make Pixel Zooming Crisp

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add image-rendering to the map surface**

Add `image-rendering: pixelated;` to `.map-stage` and `.map-image` so browser zoom does not blur individual map pixels.

- [ ] **Step 2: Verify CSS remains scoped**

Run:

```powershell
npm run lint
```

Expected: no lint errors from the CSS or modified TypeScript.

### Task 3: Add Coordinate Deep Links And Copy Links

**Files:**
- Modify: `src/app/map/map-workspace.tsx`
- Modify: `src/app/map/page.test.tsx`

- [ ] **Step 1: Write tests for URL coordinate centering and read-only context links**

Add tests that render `/map?x=1070&y=278`, assert the map starts centered on that coordinate at natural zoom when possible, and assert read-only users can right-click the map to copy a coordinate link without seeing create commands.

- [ ] **Step 2: Implement URL coordinate parsing**

Add a pure helper in `map-workspace.tsx` that reads integer `x` and `y` values from `window.location.search`, rejects invalid or out-of-bounds coordinates, and derives an initial view centered on that coordinate.

- [ ] **Step 3: Implement copy-link context menu behavior**

Allow approved read-only users to open a coordinate context menu. Show `Copy link` for every approved user and show marker creation commands only for write-capable users. The copied URL must preserve origin/path and set `x` and `y`.

### Task 4: Verify

**Files:**
- No additional files.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm run test -- src/app/map/page.test.tsx src/lib/map-assets.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm run verify
```

Expected: typecheck, lint, and tests pass.
