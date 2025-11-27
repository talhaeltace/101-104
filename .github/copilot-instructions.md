# Quick AI guide: what to read and what to change

Purpose: make an AI coding assistant productive in this React + TypeScript + Vite app (Supabase backend, Leaflet + inline SVG map, client-side Route Builder, Capacitor mobile packaging).

## Core dev commands (project root)
- Start dev (hosted on LAN): npm run dev -- --host 0.0.0.0
- Quick dev (local): npm run dev
- Build (prod): npm run build
- Lint / typecheck: npm run lint

## Key architecture & single-source files
- Data: `src/hooks/useLocations.ts` — canonical source of truth: maps snake_case DB rows to app `Location` shape, groups by `region_id`, and handles DB CRUD. Edit this file first when changing shape.
- Map: `src/components/MapComponent.tsx` — dynamic Leaflet import + inline SVG wiring (MutationObserver + DOM refs). Avoid importing Leaflet globally.
- Routes: `src/components/RouteBuilderModal.tsx` — route optimization (nearest-neighbor + 2-opt), start-mode (auto/fixed/current), and Google Maps export logic. Keep computeRoute() and export code in sync.
- Seeds & types: `src/data/regions.ts` — seed locations and the `Location` TypeScript interface used across the app.
- Supabase client: `src/lib/supabase.ts` — env fallbacks and client instantiation; change here if modifying auth or DB usage.
- App shell: `src/App.tsx` — routing, header, role gating (admin/editor/user), and where modals are opened.

## Patterns, conventions & gotchas
- DB rows are snake_case; `useLocations` converts to camelCase and `coordinates: [lat, lng]`. Follow this mapping when adding fields.
- IDs: seed data uses string slugs while DB returns numeric ids. Prefer using the DB-returned inserted row id for state updates.
- MapComponent dynamically injects Leaflet CSS. If the map is blank, check the console for dynamic import/CSS injection errors.
- Inline SVG interactions are wired imperatively (refs + event listeners). Edit the mounting/wiring effect rather than rewriting the SVG as React nodes.
- Route Builder appends `&avoid=ferries` to Google Maps URLs when that flag is set — handle export formatting consistently.

## High-value files to open right now
- `src/hooks/useLocations.ts` — data mapping & persistence flows
- `src/components/MapComponent.tsx` — map rendering, markers, SVG wiring
- `src/components/RouteBuilderModal.tsx` — route algorithm & export
- `src/components/LocationEditModal.tsx` and `LocationDetailsModal.tsx` — forms and display
- `src/lib/supabase.ts` — Supabase client config
- `src/data/regions.ts` — seeds and `Location` type

## Dev & debugging tips specific to this repo
- Geolocation requires HTTPS or localhost. For device testing use `npm run dev -- --host 0.0.0.0` and open the network URL on your phone, or use ngrok/localtunnel or mkcert/Vite for HTTPS.
- Capacitor flow: `npm run build` → `npx cap copy android|ios` → `npx cap sync` → open native project (or build via Gradle/Xcode).
- Android build gotchas: Gradle/AGP may require specific JDKs (e.g., Java 11/17). If WebView shows white screen, remove `server.url` from `capacitor.config.json` and bundle assets via `npm run build` + `npx cap copy`.
- When changing the data shape (add/remove fields), update the DB migration in `supabase/migrations/`, the `Location` type and seeds in `src/data/regions.ts`, the `useLocations` mapping, and the UI forms in `LocationEditModal` / `LocationDetailsModal`.

## Small concrete examples
- Add `address` field:
  1. Add `address text` in a migration under `supabase/migrations/`.
  2. Add `address?: string` to `src/data/regions.ts` and the `Location` type.
  3. Update mapping/payloads in `src/hooks/useLocations.ts` (initialize/create/update flows).
  4. Add a textarea in `src/components/LocationEditModal.tsx` bound to `location.address`.
  5. Show `address` in `src/components/LocationDetailsModal.tsx`.

## When an AI agent is asked to change behavior
- For data shape changes: start in `src/hooks/useLocations.ts`, then update DB migrations and UI forms.
- For map UX changes: edit `src/components/MapComponent.tsx` wiring (preserve dynamic import pattern).
- For route logic: update `computeRoute()` in `RouteBuilderModal.tsx` and adjust export formatting.

## Integration & external points
- Supabase: `src/lib/supabase.ts` (env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Migrations: `supabase/migrations/`.
- Leaflet: dynamically imported in `MapComponent` — avoid top-level import to keep bundles small.
- Capacitor: mobile packaging is present; use `npx cap` commands above and ensure `capacitor.config.json` `server.url` is only used for dev live-reload.

If anything here is unclear or you want CI/fastlane/App Store/OTA snippets added, tell me which target and I will add a small patch and step-by-step instructions.
