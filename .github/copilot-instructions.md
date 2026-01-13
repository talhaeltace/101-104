# Copilot instructions (MapFlow)

React + TypeScript + Vite app packaged with Capacitor (Android/iOS). Core features: Supabase persistence (tables + RPC + Realtime), Leaflet map (dynamic import + custom HTML markers) or inline SVG map, route optimization (nearest-neighbor + 2‑opt), tasks/team tracking, and acceptance workflow.

## Start here (core flow)
- `src/App.tsx`: app orchestration (auth/permissions), route start/restore/cancel/complete, GPS throttling (`pushUserLocation`), and “DB is source-of-truth + local snapshot fallback” restore.
- `src/data/regions.ts`: `Location` shape + seeded regions (`coordinates: [lat,lng]`).
- `src/hooks/useLocations.ts`: locations CRUD + seed-to-DB initialization; strict snake_case ↔ camelCase mapping; optional `VITE_PROJECT_ID` support.
- `src/components/MapComponent.tsx`: Leaflet dynamic import + local marker assets; team live markers + “follow once then pan only if out-of-bounds”; optional `useInlineSvg` mode.
- `src/components/RouteBuilderModal.tsx`: route selection/search/filter; nearest-neighbor + 2‑opt; Blob Worker compute path for large N; Google Maps waypoint cap (`MAX_GOOGLE_WAYPOINTS = 23`); GPX/export.
- `src/hooks/useLocationTracking.ts`: proximity logic (default 100m) using parent-fed `userPosition` (no internal geolocation watch).

## Supabase integration patterns
- `src/lib/supabase.ts` throws early if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing.
- DB rows are snake_case; keep mappings consistent with existing libs/hooks.
- Team/route persistence via RPC: `src/lib/teamStatus.ts` (`update_team_status`, `get_user_route`, `clear_team_status`) with a legacy fallback path when the DB function signature is older.
- Tasks: `src/lib/tasks.ts` uses `tasks` table; `src/components/TasksPanel.tsx` subscribes to `postgres_changes` filtered by `assigned_to_user_id`.
- Team panel: `src/components/TeamPanel.tsx` reads `team_status`, subscribes to `team_status` and `tasks` changes.
- Editor workflow: location completion can create a pending acceptance request (`src/lib/acceptanceRequests.ts`).

## Conventions / gotchas
- IDs: seeds are often string; DB may return numeric. Normalize to `String(id)` for UI selections and `route_location_ids` payloads.
- Route resume: App tries fast local restore first, then hydrates from `get_user_route`. Keep the local snapshot aligned with DB when you change tracking fields.

## LocalStorage keys (don’t rename lightly)
- UI state: `ui_state_v1`.
- Route snapshot: `route_tracking_snapshot_v2` (see `src/lib/trackingStorage.ts`; also writes legacy per-key values for backward compatibility).

## Role/permission behavior
- Role defaults live in `src/lib/userPermissions.ts`; DB flags on the user override role defaults.
- `can_manual_gps` gates “manual GPS mode” (disables live GPS for proximity and forces the arrival swipe UX).

## Dev/build/mobile workflows
- Dev: `npm run dev` (LAN: `npm run dev:network`). Build: `npm run build`.
- Android debug APK: `npm run build:apk` (build → `cap sync android` → `gradlew assembleDebug` → copies APK to repo root).
- Native file export uses Capacitor Filesystem + Share (`src/lib/nativeFiles.ts`).

## When changing schemas/fields
- Location fields: update `supabase/migrations/` + `src/data/regions.ts` + `src/hooks/useLocations.ts` + edit/detail UIs.
- Route/team/task fields: update Supabase RPC/table schema + corresponding payload parsing in `src/lib/teamStatus.ts` and restore/start flows in `src/App.tsx`.
