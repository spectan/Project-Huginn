# Build And Deploy

## Local Verification

```bash
npm install
npm run verify
```

## Production Environment

```bash
cp .env.example .env
```

Set production values in `.env`:

```bash
POSTGRES_PASSWORD=<long-random-password>
INITIAL_ADMIN_USERNAME=<admin-username>
INITIAL_ADMIN_PASSWORD=<admin-password>
POSTGRES_DB=wurm_map_util
POSTGRES_USER=wurm
WURMMAPS_EVENT_FEED_TIMEOUT_MS=3000
WURMMAPS_STAT_DELEGATE_BASE_URL=https://wurmmaps.xyz/APIs/stat-delegate.php
```

## First Deploy

```bash
docker compose build app
docker compose up -d db
docker compose run --rm app npm run db:migrate
docker compose run --rm app npm run seed:admin
docker compose up -d app
curl -f http://127.0.0.1:3000/api/health
```

## Update Deploy

```bash
git pull
docker compose build app
docker compose run --rm app npm run db:migrate
docker compose up -d app
curl -f http://127.0.0.1:3000/api/health
```

## Cleanup

```bash
docker compose exec -T app npm run cleanup:deleted-markers
```
