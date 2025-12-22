# Copilot instructions (MapFlow)

React + TypeScript + Vite app with Supabase persistence, Leaflet map (dynamic import + custom HTML markers), route optimization (nearest-neighbor + 2‑opt), and Capacitor packaging (Android/iOS).

## Key files (start here)
- App orchestration + permissions + restore/start flows: `src/App.tsx`
- Locations data shape + seed regions: `src/data/regions.ts` (`Location`, `coordinates: [lat,lng]`)
- Supabase mapping/CRUD (snake_case ↔ camelCase): `src/hooks/useLocations.ts`
- Map rendering: `src/components/MapComponent.tsx` (Leaflet dynamic import + CSS injection; custom divIcons)
- Route builder + optimization + GPX/Maps export: `src/components/RouteBuilderModal.tsx`
- Route/team persistence RPCs: `src/lib/teamStatus.ts` (`update_team_status`, `get_user_route`, `clear_team_status`)
- Task assignments: `src/lib/tasks.ts`, `src/components/TasksPanel.tsx`, `src/components/TeamPanel.tsx`
- Tracking snapshot (local fallback): `src/lib/trackingStorage.ts` (`route_tracking_snapshot_v2`)

## Project conventions / gotchas
- DB rows are snake_case; keep mapping consistent in `useLocations`.
- IDs: seeds are often string; DB inserts may return numeric. Normalize to `String(id)` when storing selections (e.g. route builder/task prefill).
- Location tracking is parent-fed: `useLocationTracking` consumes `userPosition` from `App.tsx` (no internal GPS watch).
- Active route resume: DB is source-of-truth, localStorage snapshot (`route_tracking_snapshot_v2`) is a fast fallback.

## Tasks ("Görev") behavior
- Admin assigns tasks from Team panel: `src/components/TeamPanel.tsx` creates tasks for members.
- User starts a task from `TasksPanel` → opens `RouteBuilderModal` prefilled (selected locations + region + start mode=current) → user taps “Rotayı Başlat”.
- Task lifecycle: `assigned` → `in_progress` → `completed` via `updateTaskStatus`.

## Dev & build commands
- Dev server: `npm run dev` (or LAN: `npm run dev:network`)
- Web build: `npm run build`
- Android debug APK (reliable sequence, Windows):
  - `node .\node_modules\vite\bin\vite.js build`
  - `npx cap sync android`
  - `cd android; .\gradlew.bat assembleDebug --no-daemon`
  - APK output: `android/app/build/outputs/apk/debug/*.apk` (often copied to repo root as `101-104-debug.apk`)

## When changing schemas/fields
- Add/rename Location fields: update `supabase/migrations/` + `src/data/regions.ts` + `src/hooks/useLocations.ts` + edit/detail modals.
- Route/team/task changes usually touch both `src/lib/teamStatus.ts` (RPC payload) and `src/App.tsx` (restore/start/finish flows).
