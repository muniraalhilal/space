# Deployment

## Components

| Process | Command | Notes |
| --- | --- | --- |
| API | `node apps/api/dist/main.js` | stateless; scale horizontally behind a load balancer |
| Worker | `node apps/api/dist/worker.js` | runs agent jobs; scale by `AGENT_WORKER_CONCURRENCY` and replicas |
| Web | `next start` in `apps/web` | `API_INTERNAL_URL` must be set **at build time** (rewrites are compiled in) |
| PostgreSQL 16 | | run `node apps/api/dist/db/migrate.js` on each release |
| Redis 7 | | queues + realtime pub/sub; enable persistence (AOF) |
| File storage | local disk or S3-compatible | `STORAGE_DRIVER=s3` with bucket credentials for multi-instance APIs |

## Docker Compose

```bash
cp .env.example .env
# set APP_ENCRYPTION_KEY (openssl rand -base64 48) and, optionally, AI_PROVIDER + key
docker compose up -d --build
docker compose run --rm api node dist/db/migrate.js
docker compose run --rm api node dist/db/seed/index.js     # optional demo data
```

Web on :3000, API on :4000. Put both behind one HTTPS origin in production (the web server already proxies
`/api` and `/realtime`), then set `COOKIE_SECURE=true` and `WEB_ORIGIN=https://your-domain`.

## Production checklist

- `NODE_ENV=production` — the API refuses to start with the development encryption key.
- `APP_ENCRYPTION_KEY` stored in a secret manager; rotating it invalidates stored integration tokens
  (re-enter them in Settings → AI & integrations).
- HTTPS only, `COOKIE_SECURE=true`.
- Backups for PostgreSQL and the file bucket.
- `GET /api/health` reports database and Redis status for load-balancer checks.
- Do **not** run the demo seed in production: it deletes and recreates the `juniper` and `qamar` demo companies.
- No email provider is integrated: new members receive a one-time temporary password shown to the admin.
