# Copilot instructions (MapFlow)

MapFlow is a React + TypeScript + Vite + Tailwind app packaged with Capacitor (Android/iOS). Backend is a Fastify API with Prisma + MySQL (no Supabase).

## Start here (core flow)
- `src/App.tsx`: auth/session restore + role/permission gating; route start/restore/cancel/complete; GPS throttling; local snapshot restore when offline.
- `src/lib/apiClient.ts`: single HTTP wrapper (`apiFetch`) + auth token storage; uses `CapacitorHttp` on native to avoid WebView CORS quirks.
- `src/data/regions.ts` + `src/hooks/useLocations.ts`: Region/Location shapes + seed data; seeds DB when empty; snake_case (DB) ↔ camelCase (UI) mapping; optional `VITE_PROJECT_ID` for deployments with `locations.project_id` NOT NULL.
- `src/components/MapComponent.tsx`: Leaflet dynamic import + custom markers; follow behavior; optional inline SVG mode.
- `src/components/RouteBuilderModal.tsx`: selection/search/filter; route heuristics (nearest-neighbor + 2-opt) with safety caps; large-N uses a Worker; Google waypoint cap + GPX/export.
- `src/components/VersionChecker.tsx`: calls `/app-version/latest` and shows a blocking update UI when newer version exists.

## API / DB patterns
- API entrypoint: `api/server.ts` (Fastify). Requests authenticate via JWT and then “hydrate” user/role from DB each request.
- Prisma schema/models: `prisma/schema.prisma` (MySQL datasource). Use `npm run db:generate` after schema changes.
- Client API calls: keep wrappers in `src/lib/*` (e.g. `src/lib/teamStatus.ts`, `src/lib/tasks.ts`, `src/lib/messages.ts`, `src/lib/workEntries.ts`) and call `apiFetch`.
- Auth timing: don’t call protected endpoints until a token exists (see `getAuthToken()` usage in `src/hooks/useLocations.ts`).

## Env / builds
- Build requires `VITE_API_BASE_URL`. `npm run build` runs `scripts/check-required-env.cjs` to fail fast (blocks unsafe localhost/http for release unless overridden).
- API env vars live in `.env.api.example` (e.g. `DATABASE_URL`, `JWT_SECRET`, OTP/email settings).

## Conventions / gotchas
- IDs: seeds may be string; DB may return number → normalize with `String(id)` for UI selections and `route_location_ids`.
- Local storage keys are stable: `ui_state_v1`, `route_tracking_snapshot_v2` (see `src/lib/trackingStorage.ts`).
- Permissions: defaults in `src/lib/userPermissions.ts`; DB flags override.

## Dev / mobile workflows
- Web dev: `npm run dev` (LAN: `npm run dev:network`).
- API dev: `npm run api:dev` (tsx watch).
- Android: `npm run build:apk` / `npm run build:aab`; release steps in `README-GOOGLE-PLAY.md`.
