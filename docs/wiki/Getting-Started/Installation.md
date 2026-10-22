# Installation

## Requirements
- Node.js 20+ (LTS)
- PostgreSQL 15+ or Docker Compose database
- MapLibre GL / Mapbox access token (optional for local tiles)

## Quick Start
1. Clone: `git clone https://github.com/osiris/osiris.git`
2. Install: `npm install`
3. Configure: `cp .env.template .env` and set `DATABASE_URL`, `SECRET_KEY`, `MAP_TOKEN`
4. Migrate: `npx prisma migrate dev`
5. Build: `npm run build`
6. Run: `npm run dev` (port 3000) or `docker-compose up`

## Docker Deploy
Use `docker-compose.yml` with `build:` context and `.env` mounted. CSP/Security headers configured via NGINX or middleware (`Content-Security-Policy` notes in `.env.template`).

## Verification
After startup verify `/api/health`, `/api/scanner?accept=text/event-stream`, and map tile loading. See `PROGRESS.md` Phase 14 for full verification checklist.
