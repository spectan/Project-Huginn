# Project Huginn

A shared, web-based mapping utility for Wurm Online. Project Huginn lets communities view, search, plan, and manage deeds, towers, infrastructure routes, resource locations, and custom annotations across multiple servers and map layers.

## Table of Contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Quick Start](#quick-start)
4. [Local Development](#local-development)
5. [Production Setup](#production-setup)
6. [First Deploy](#first-deploy)
7. [Update Deploy](#update-deploy)
8. [Administration](#administration)
9. [Testing and Verification](#testing-and-verification)
10. [Development Scripts](#development-scripts)

## Features

### Map Viewing and Navigation

- Full-screen, pan-and-zoom map viewer with pixel-perfect map image rendering.
- Support for multiple visual map layers such as terrain and topographical views.
- Per-server maps grouped by cluster, with a favorites system for quick access.
- URL-backed coordinate and server state, making locations shareable via links.
- Responsive layout with safe-area inset support for mobile browsers.

### Marker and Layer System

- Deeds with configurable directional dimensions, perimeters, and center points.
- Guard towers with quality, damage, creator, planned status, and influence zones.
- Infrastructure paths including bridges, canals, highways, and custom roadways.
- Resource markers for clay, peat, moss, tar, and other map resources.
- Rifts, camps, mine doors, and locate-soul shadow markers.
- Custom note annotations with user-defined categories, colors, shapes, and sizes.
- Toggleable, individually recolorable layers for every marker type.
- Opacity sliders for overlays while keeping center pips fully visible.

### Search and Planning Tools

- Live search that highlights matching markers and draws lines to results.
- Route planner with configurable travel speed and segment distance estimation.
- Roadway edit mode with click-to-add path points and draggable draft nodes.
- Quick deed planning by shift-dragging bounds directly on the map.
- Quick tower planning by marking an existing tower as planned and control-clicking.
- Coordinate selection with left click and one-click coordinate link copying.

### Account and Access Control

- Local account registration with bcrypt-hashed passwords.
- Admin approval workflow for new accounts.
- Per-map read or write permissions managed from the admin panel.
- User settings persisted per account, including layer colors, opacities, and favorites.

### Admin Tools

- Admin accounts panel for approving, rejecting, and resetting users.
- Audit history view showing marker changes with coordinates and map links.
- Deleted markers recovery with a 72-hour restore window.
- Note category management shared across the instance.

### Event Feed

- WurmMaps event feed integration for server-specific celebrations and events.
- Resizable, repositionable event feed panel with automatic refresh.

## Requirements

- Node.js 22.13.0 or newer
- Docker and Docker Compose for production deployments
- A PostgreSQL database for production use

## Quick Start

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd map.samuel.zone
npm install
```

Create a local environment file from the example:

```bash
cp .env.example .env
```

Run the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## Local Development

### Environment Variables

Copy `.env.example` to `.env` and adjust values for local development. At minimum you will need database credentials and the initial admin account details.

### Database

A local PostgreSQL instance can be started with Docker Compose:

```bash
docker compose up -d db
```

Run migrations and seed the admin account:

```bash
npm run db:migrate
npm run seed:admin
```

### Running Tests

Run the full verification suite before committing:

```bash
npm run verify
```

This executes type checking, linting, tests, and a production build in sequence.

Individual commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Production Setup

### Environment Variables

Copy the example environment file and fill in production values:

```bash
cp .env.example .env
```

Required production values:

```bash
POSTGRES_PASSWORD=<long-random-password>
POSTGRES_USER=wurm
POSTGRES_DB=wurm_map_util
INITIAL_ADMIN_USERNAME=<admin-username>
INITIAL_ADMIN_PASSWORD=<strong-admin-password>
POSTGRES_URL=postgresql://wurm:<long-random-password>@db:5432/wurm_map_util
WURMMAPS_EVENT_FEED_TIMEOUT_MS=3000
WURMMAPS_STAT_DELEGATE_BASE_URL=https://wurmmaps.xyz/APIs/stat-delegate.php
```

Store sensitive values securely. The application reads environment variables from `.env` at build time and runtime through Docker Compose.

### Build the Production Image

```bash
docker compose build app
```

### SSL and Reverse Proxy

The bundled Docker Compose exposes the application on port 3014. In production, place a reverse proxy such as Traefik or Nginx in front of the container to terminate TLS and route traffic. The application expects requests with the configured production host header.

## First Deploy

Build the image, start the database, run migrations, seed the admin account, and start the application:

```bash
docker compose build app
docker compose up -d db
docker compose run --rm app npm run db:migrate
docker compose run --rm app npm run seed:admin
docker compose up -d app
```

Verify the deployment:

```bash
curl -f -H 'Host: map.samuel.zone' http://127.0.0.1:3014/api/health
```

Expected response:

```json
{"status":"ok"}
```

Log in with the initial admin username and password configured in `.env`.

## Update Deploy

Pull the latest changes, rebuild the image, run any pending migrations, and recreate the application container:

```bash
git pull
docker compose build app
docker compose run --rm app npm run db:migrate
docker compose up -d --force-recreate app
```

Verify the deployment:

```bash
curl -f -H 'Host: map.samuel.zone' http://127.0.0.1:3014/api/health
```

## Administration

### User Management

Administrators can approve, reject, and reset passwords for accounts from the admin accounts panel at `/admin/accounts`.

### Map Permissions

After a user is approved, assign read or write access to specific maps from the admin accounts panel.

### Deleted Markers

Deleted markers are retained for 72 hours. They can be restored from the deleted markers view at `/admin/deleted-markers`.

### Cleanup

A scheduled cleanup task removes soft-deleted markers older than 72 hours. Run it manually with:

```bash
docker compose exec -T app npm run cleanup:deleted-markers
```

## Testing and Verification

The project uses Vitest for unit and component tests, ESLint for linting, and the TypeScript compiler for type checking.

Run everything in one command:

```bash
npm run verify
```

Run individual checks:

```bash
npm run typecheck   # Prisma generate, Next.js type generation, and tsc
npm run lint        # ESLint across the project
npm run test        # Vitest test suite
npm run build       # Production Next.js build
```

## Development Scripts

```bash
npm run dev                         # Start the Next.js development server
npm run build                       # Build for production
npm run start                       # Start the production server
npm run typecheck                   # Run type checks
npm run lint                        # Run ESLint
npm run test                        # Run tests once
npm run test:watch                  # Run tests in watch mode
npm run verify                      # Run typecheck, lint, test, and build
npm run db:migrate                  # Deploy Prisma migrations
npm run db:push                     # Push schema changes without migration files
npm run seed:admin                  # Create the initial admin account
npm run cleanup:deleted-markers     # Remove soft-deleted markers older than 72 hours
```

## Version

Current version: 1.2.0
