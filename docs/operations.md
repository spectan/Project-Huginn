# Operations

This project is designed for one VPS running Docker Compose. The production shape is:

- `app`: Next.js server on `127.0.0.1:3000`.
- `db`: PostgreSQL on Docker's private network and `127.0.0.1:5432` for host maintenance.
- `postgres-data`: durable PostgreSQL volume.
- `map-storage`: durable map image storage volume for future uploaded maps.

Put HTTPS in front of the app with a host reverse proxy such as Caddy, Nginx, or Traefik. The Compose file intentionally binds the app to localhost so it is not exposed directly on the VPS public interface.

## Environment

Create `.env` from `.env.example` and replace every placeholder before starting production:

```bash
cp .env.example .env
```

Required production values:

- `AUTH_SECRET`: long random session signing secret.
- `POSTGRES_PASSWORD`: long random database password.
- `INITIAL_ADMIN_USERNAME`: first admin account name.
- `INITIAL_ADMIN_PASSWORD`: first admin password, at least 12 characters.
- `POSTGRES_DB`: keep `wurm_map_util` unless there is a reason to change it.
- `POSTGRES_USER`: keep `wurm` unless there is a reason to change it.

Generate secrets with a password manager or:

```bash
openssl rand -base64 48
```

Do not commit `.env`. Do not reuse the sample values in production.

## First Deploy

Run these from the repository directory on the VPS:

```bash
docker compose build app
docker compose up -d db
docker compose run --rm app npm run db:migrate
docker compose run --rm app npm run seed:admin
docker compose up -d app
curl -f http://127.0.0.1:3000/api/health
```

After the health check passes, configure the reverse proxy to route HTTPS traffic to `http://127.0.0.1:3000`.

The seed command is idempotent, but it also resets the configured admin account password to `INITIAL_ADMIN_PASSWORD`. Treat it as an initialization and recovery command, not a routine startup step.

If a database already exists from an earlier `prisma db push` workflow, `prisma migrate deploy` may refuse the initial migration because the schema is non-empty but not recorded in `_prisma_migrations`. Back up the database first, confirm the schema matches the initial migration, then baseline once:

```bash
docker compose run --rm app npx prisma migrate resolve --applied 20260510043000_initial
docker compose run --rm app npm run db:migrate
```

Do not use `migrate resolve` to skip unknown schema drift. Use it only to mark an already-applied migration as applied.

## Updates

For a normal deployment update:

```bash
git pull
docker compose build app
docker compose run --rm app npm run db:migrate
docker compose up -d app
curl -f http://127.0.0.1:3000/api/health
```

Run `npm run verify` before building a release candidate. Production migrations stay explicit; the app container should not mutate schema on normal startup.

## Deleted Marker Cleanup

Deleted markers are restorable for 72 hours. Expired deleted marker records must be permanently removed so coordinate-bearing deleted rows do not live indefinitely.

Run cleanup manually:

```bash
docker compose exec -T app npm run cleanup:deleted-markers
```

Schedule cleanup from host cron. Hourly is simple and bounded:

```cron
15 * * * * cd /opt/wurm-map-util && /usr/bin/docker compose exec -T app npm run cleanup:deleted-markers >> /var/log/wurm-map-util-cleanup.log 2>&1
```

Adjust `/opt/wurm-map-util` and `/usr/bin/docker` for the VPS. The cleanup command processes bounded batches and emits JSON counts.

## Backups

Back up both PostgreSQL and map storage. Store backups off the VPS.

Create a timestamped backup directory:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "backups/$STAMP"
```

Database backup:

```bash
docker compose exec -T db pg_dump -U wurm -d wurm_map_util -Fc > "backups/$STAMP/wurm_map_util.dump"
```

Map storage backup:

```bash
MAP_VOLUME=$(docker volume ls --format '{{.Name}}' | grep '_map-storage$' | head -n 1)
docker run --rm -v "$MAP_VOLUME:/data:ro" -v "$PWD/backups/$STAMP:/backup" alpine tar -czf /backup/map-storage.tgz -C /data .
```

Check that both files exist and are non-empty:

```bash
ls -lh "backups/$STAMP"
```

## Restore

Restore only from a backup you trust. A database restore replaces current data.

Start the database, stop the app, and recreate the database:

```bash
docker compose up -d db
docker compose stop app
docker compose exec -T db dropdb -U wurm --if-exists wurm_map_util
docker compose exec -T db createdb -U wurm wurm_map_util
docker compose exec -T db pg_restore -U wurm -d wurm_map_util < backups/<STAMP>/wurm_map_util.dump
```

Restore map storage:

```bash
MAP_VOLUME=$(docker volume ls --format '{{.Name}}' | grep '_map-storage$' | head -n 1)
docker run --rm -v "$MAP_VOLUME:/data" -v "$PWD/backups/<STAMP>:/backup" alpine sh -c "rm -rf /data/* && tar -xzf /backup/map-storage.tgz -C /data"
```

Then run migrations for the deployed version and start the app:

```bash
docker compose run --rm app npm run db:migrate
docker compose up -d app
curl -f http://127.0.0.1:3000/api/health
```

## Production Checks

Before exposing the app:

- Firewall allows public `80/tcp` and `443/tcp` only.
- Reverse proxy terminates HTTPS and forwards to `127.0.0.1:3000`.
- `.env` has production secrets and is not checked into Git.
- `docker compose ps` shows healthy `app` and `db` services.
- `curl -f http://127.0.0.1:3000/api/health` succeeds on the VPS.
- Admin can log in and open `/admin/history`.
- Host cron runs `npm run cleanup:deleted-markers`.
- A backup has been created and test-restored in a non-production environment.
