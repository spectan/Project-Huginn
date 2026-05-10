# Initial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-ready foundation for Wurm Map Utility: strict Next.js project setup, database schema, domain validation, permissions, audit cleanup rules, Docker Compose, and a minimal protected map shell.

**Architecture:** Use a single Next.js App Router application with TypeScript, Prisma, PostgreSQL, Vitest, and Docker Compose. Keep production behavior behind server-side validation and authorization boundaries, with reusable domain modules tested before UI wiring. The initial UI exposes static authentication-state panels and a map workspace shell; richer marker editing can follow on this tested foundation.

**Tech Stack:** Next.js, React, TypeScript, Prisma, PostgreSQL, Vitest, Testing Library, Zod, Docker Compose.

---

## File Structure

- `package.json`: npm scripts and dependencies.
- `tsconfig.json`: strict TypeScript configuration.
- `next.config.ts`: Next.js production build configuration.
- `eslint.config.mjs`: lint rules with warnings treated as failures in CI scripts.
- `vitest.config.ts`: unit-test configuration.
- `src/lib/domain/constants.ts`: coordinate, marker, and retention constants.
- `src/lib/domain/number-fields.ts`: QL/damage parse and format helpers.
- `src/lib/domain/coordinates.ts`: coordinate and rectangle validation.
- `src/lib/domain/markers.ts`: tower, deed, and note input schemas.
- `src/lib/domain/permissions.ts`: user access and admin permission helpers.
- `src/lib/domain/deletion.ts`: deleted marker restore/cleanup helpers.
- `src/lib/domain/audit.ts`: audit event definitions and metadata guard helpers.
- `src/lib/domain/*.test.ts`: unit tests for domain modules.
- `prisma/schema.prisma`: multi-map-ready database schema.
- `src/lib/db/prisma.ts`: Prisma client singleton.
- `src/app/page.tsx`: redirects to the map shell or account status.
- `src/app/map/page.tsx`: minimal protected map workspace shell.
- `src/app/api/health/route.ts`: health check endpoint.
- `Dockerfile`: production app image.
- `docker-compose.yml`: app and PostgreSQL services for VPS/local deployment.
- `.env.example`: required environment variables.
- `.gitignore`: Node, build, env, and local storage ignores.

---

### Task 1: Repository And Scaffold

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1: Initialize Git and branch**

Run:

```powershell
git init -b main
git add design.md architecture.md learnings.md docs/superpowers/plans/2026-05-10-initial-implementation.md
git commit -m "docs: add project planning"
git checkout -b feature/initial-implementation
```

Expected: repository exists on `feature/initial-implementation`.

- [ ] **Step 2: Create package and config files**

Write `.gitignore`:

```gitignore
node_modules/
.next/
dist/
coverage/
tsconfig.tsbuildinfo
next-env.d.ts
.env
.env.*
!.env.example
map-storage/
postgres-data/
```

Write `package.json` with scripts:

```json
{
  "name": "wurm-map-util",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.13.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "verify": "npm run typecheck && npm run lint && npm run test && npm run build"
  },
  "dependencies": {
    "@prisma/client": "6.19.3",
    "argon2": "0.44.0",
    "next": "16.2.6",
    "prisma": "6.19.3",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@types/node": "25.6.2",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "5.2.0",
    "eslint": "9.39.4",
    "eslint-config-next": "16.2.6",
    "jsdom": "29.1.1",
    "typescript": "6.0.3",
    "vitest": "4.1.5"
  },
  "overrides": {
    "postcss": "8.5.10"
  }
}
```

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Write `eslint.config.mjs`:

```js
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "dist/**"]
  }
];

export default eslintConfig;
```

Write `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone"
};

export default nextConfig;
```

Write `vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"]
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  }
});
```

Create minimal app files:

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wurm Map Utility",
  description: "Shared Wurm Online map annotation utility"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// src/app/page.tsx
export default function HomePage() {
  return (
    <main className="page">
      <h1>Wurm Map Utility</h1>
      <p>Initial application shell is ready.</p>
    </main>
  );
}
```

```css
/* src/app/globals.css */
:root {
  color-scheme: light;
  font-family: Arial, Helvetica, sans-serif;
}

body {
  margin: 0;
  background: #f6f7f9;
  color: #17202a;
}

.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px;
}
```

- [ ] **Step 3: Install dependencies**

Run:

```powershell
npm install
```

Expected: `node_modules` and `package-lock.json` are created.

- [ ] **Step 4: Verify scaffold**

Run:

```powershell
npm run typecheck
npm run test
```

Expected: typecheck passes; test command passes with no tests or existing tests.

- [ ] **Step 5: Commit scaffold**

Run:

```powershell
git add .gitignore package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs vitest.config.ts src
git commit -m "chore: scaffold strict Next.js app"
```

Expected: commit succeeds on `feature/initial-implementation`.

### Task 2: Domain Validation

**Files:**
- Create: `src/lib/domain/constants.ts`
- Create: `src/lib/domain/number-fields.ts`
- Create: `src/lib/domain/coordinates.ts`
- Create: `src/lib/domain/markers.ts`
- Create: `src/lib/domain/number-fields.test.ts`
- Create: `src/lib/domain/coordinates.test.ts`
- Create: `src/lib/domain/markers.test.ts`

- [ ] **Step 1: Write failing tests**

Tests must cover:

- QL accepts `0.00`, `99.99`, and `100.00`.
- QL rejects `100.01`.
- Damage accepts `0.00` and `99.99`.
- Damage rejects `100.00`.
- Maker number must be exactly three digits.
- Coordinates must be integers inside map bounds.
- Deed rectangles must fit inside map bounds.
- Note text must be non-empty and bounded.

Run:

```powershell
npm run test -- src/lib/domain
```

Expected: tests fail because modules do not exist.

- [ ] **Step 2: Implement domain modules**

Implement constants:

```ts
export const TOWER_PROTECTION_RADIUS_TILES = 50;
export const TOWER_PLACEMENT_RADIUS_TILES = 100;
export const DELETED_MARKER_RETENTION_HOURS = 72;
export const MAX_NOTE_TEXT_LENGTH = 1000;
export const MAX_NAME_LENGTH = 80;
```

Implement parse helpers that return discriminated unions:

```ts
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

Use integer hundredths for QL and damage and reject out-of-range or malformed values.

Implement coordinate and marker validators with no floating point storage and no unbounded string fields.

- [ ] **Step 3: Verify domain tests pass**

Run:

```powershell
npm run test -- src/lib/domain
```

Expected: domain tests pass.

- [ ] **Step 4: Commit domain validation**

Run:

```powershell
git add src/lib/domain
git commit -m "feat: add marker domain validation"
```

Expected: commit succeeds.

### Task 3: Permissions, Audit Guards, And Deletion Rules

**Files:**
- Create: `src/lib/domain/permissions.ts`
- Create: `src/lib/domain/deletion.ts`
- Create: `src/lib/domain/audit.ts`
- Create: `src/lib/domain/permissions.test.ts`
- Create: `src/lib/domain/deletion.test.ts`
- Create: `src/lib/domain/audit.test.ts`

- [ ] **Step 1: Write failing tests**

Tests must cover:

- Pending users cannot read map data.
- Read users can read but cannot write.
- Write users can read and write but cannot administer.
- Admin users can approve users, change permissions, view audit logs, and restore deleted markers.
- Deleted markers are restorable before the 72-hour expiration.
- Deleted markers are cleanup-eligible at or after expiration.
- Long-lived audit metadata rejects marker coordinate keys.

Run:

```powershell
npm run test -- src/lib/domain/permissions.test.ts src/lib/domain/deletion.test.ts src/lib/domain/audit.test.ts
```

Expected: tests fail because modules do not exist.

- [ ] **Step 2: Implement modules**

Implement permission helpers:

```ts
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type AccessLevel = "NONE" | "READ" | "WRITE";

export type UserAccess = {
  approvalStatus: ApprovalStatus;
  accessLevel: AccessLevel;
  isAdmin: boolean;
};

export function canReadMap(user: UserAccess): boolean;
export function canWriteMarkers(user: UserAccess): boolean;
export function canAdminister(user: UserAccess): boolean;
export function canRestoreDeletedMarkers(user: UserAccess): boolean;
```

Implement deletion helpers:

```ts
export function getDeleteExpiresAt(deletedAt: Date): Date;
export function canRestoreDeletedMarker(now: Date, deleteExpiresAt: Date): boolean;
export function isDeletedMarkerCleanupEligible(now: Date, deleteExpiresAt: Date): boolean;
```

Implement audit metadata guard:

```ts
export function assertNoCoordinateMetadata(metadata: Record<string, unknown>): void;
```

- [ ] **Step 3: Verify tests pass**

Run:

```powershell
npm run test -- src/lib/domain/permissions.test.ts src/lib/domain/deletion.test.ts src/lib/domain/audit.test.ts
```

Expected: tests pass.

- [ ] **Step 4: Commit rules**

Run:

```powershell
git add src/lib/domain
git commit -m "feat: add permission and deletion rules"
```

Expected: commit succeeds.

### Task 4: Database Schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db/prisma.ts`
- Create: `.env.example`

- [ ] **Step 1: Add Prisma schema**

Create models for:

- `User`
- `Map`
- `Tower`
- `Deed`
- `Note`
- `AuditEvent`

Use enums for approval status, access level, audit action, and target type. Include `mapId` on every marker and relevant audit event. Include `deletedAt`, `deletedByUserId`, and `deleteExpiresAt` on each marker table.

- [ ] **Step 2: Add Prisma client singleton**

Create `src/lib/db/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 3: Add environment example**

Create `.env.example` with:

```dotenv
DATABASE_URL="postgresql://wurm:wurm@localhost:5432/wurm_map_util?schema=public"
AUTH_SECRET="replace-with-a-long-random-secret"
MAP_STORAGE_PATH="/app/map-storage"
INITIAL_ADMIN_USERNAME="admin"
INITIAL_ADMIN_PASSWORD="replace-before-use"
```

- [ ] **Step 4: Verify Prisma schema**

Run:

```powershell
npx prisma validate
npx prisma generate
npm run typecheck
```

Expected: Prisma validates, client generates, and TypeScript passes.

- [ ] **Step 5: Commit schema**

Run:

```powershell
git add prisma src/lib/db .env.example
git commit -m "feat: add multi-map database schema"
```

Expected: commit succeeds.

### Task 5: Health Check And Map Shell

**Files:**
- Create: `src/app/api/health/route.ts`
- Create: `src/app/map/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing tests**

Create focused tests for any pure helper functions introduced for the map shell. Do not unit test Next.js internals.

Run:

```powershell
npm run test
```

Expected: existing tests pass before UI changes.

- [ ] **Step 2: Implement health route**

Create `src/app/api/health/route.ts`:

```ts
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 3: Implement map shell**

Create a restrained app workspace with:

- static map area,
- static coordinate readout,
- marker type summary,
- read/write/admin status panels.

Do not add marker write behavior until server actions and auth are implemented in a later task.

- [ ] **Step 4: Verify app builds**

Run:

```powershell
npm run typecheck
npm run lint
npm run build
```

Expected: both commands pass.

- [ ] **Step 5: Commit shell**

Run:

```powershell
git add src/app
git commit -m "feat: add health route and map shell"
```

Expected: commit succeeds.

### Task 6: Docker Compose

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Add production Dockerfile**

Use a multi-stage Node image:

```dockerfile
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Add Compose services**

Create `docker-compose.yml` with `app`, `db`, `postgres-data`, and `map-storage`. The app depends on Postgres and exposes port `3000`.

- [ ] **Step 3: Verify Docker config parses**

Run:

```powershell
docker compose config
```

Expected: Compose renders valid config.

- [ ] **Step 4: Commit Docker setup**

Run:

```powershell
git add Dockerfile docker-compose.yml .gitignore
git commit -m "chore: add Docker Compose deployment"
```

Expected: commit succeeds.

### Task 7: Full Verification

**Files:**
- Modify only files needed to fix verification failures.

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected: all commands pass with no warnings treated as release blockers.

- [ ] **Step 2: Review requirements coverage**

Confirm the implementation slice covers:

- strict TypeScript foundation,
- domain validation,
- permission rules,
- deleted marker retention rules,
- audit metadata guard,
- Prisma schema,
- Docker Compose deployment base,
- health route,
- minimal map shell.

- [ ] **Step 3: Commit verification fixes**

If any fixes were needed:

```powershell
git add .
git commit -m "fix: resolve initial verification issues"
```

If no fixes were needed, do not create an empty commit.

## Self-Review Notes

- This plan covers the first implementation slice, not the complete finished app.
- Full login/session flows, admin pages, marker CRUD server actions, and rich map interaction should be implemented in follow-up plans after this foundation is verified.
- The plan keeps production code test-first for domain behavior and avoids writing marker mutation code before authorization and validation are in place.
