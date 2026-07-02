# Election Analytics — Andhra Pradesh state hierarchy + Kadapa PC detail

The structural hierarchy for the **entire state of Andhra Pradesh** — all
26 districts, 25 Lok Sabha PCs, and 175 Assembly constituencies with
verified reservation status — plus full real election history (2004-2024)
for Badvel and Kadapa ACs as a detail example within that structure.

## What's real vs. scope of this pass

**Real, state-wide**: every AC's number, name, district (current 26-district
system), parent Lok Sabha PC, and reservation status (SC/ST/general).
Sourced from apteachers.in's district+PC table cross-referenced against
myneta.info's per-constituency (SC)/(ST) tags — verified to match the
official totals exactly: **29 SC seats, 7 ST seats, 175 total**. Raw
sourced data in `db/ap_acs.json`.

**Real, two ACs only**: full multi-election results (2004, 2009, 2014,
2019, Badvel's 2021 by-election, 2024) with real candidate names, votes,
turnout, margins — for Badvel and Kadapa, both under YSR Kadapa district.
This is deliberately not yet extended to all 175 ACs; see "Next steps."

**Not yet built**: mandals below AC level (only seeded for Badvel/Kadapa),
election results for the other 173 ACs, booth-level data outside the
ingestion-pipeline test fixture (see `ingestion/README.md`).

## Structure

```
schema/schema.sql          Production Postgres DDL (now includes DISTRICT level)
db/schema.sqlite.sql        Same schema, SQLite dialect, for local dev
db/ap_acs.json               Sourced data: all 175 ACs w/ district, PC, reservation
db/seed.js                   Loads full state hierarchy + Badvel/Kadapa results
db/seed_kadapa_pc_only.js.bak  Previous version (2-AC only), kept for reference
db/migrate_to_postgres.js   Copies the SQLite db into a real Postgres instance
server.js                   Express API (SQLite), also serves the built frontend
server.pg.js                 Same API on Postgres (API-only, no frontend serving yet)
frontend/                   React (Vite) dashboard, currently scoped to Kadapa PC's 2 detailed ACs
ingestion/                  ECI Form 20 PDF -> booth-level data pipeline
render.yaml                  One-click deploy config
```

## Hierarchy shape

```
STATE (Andhra Pradesh)
 ├── DISTRICT (26, e.g. "YSR Kadapa") ──┐
 │    └── AC (175 total, parent=DISTRICT)│
 │                                        │  AC.lok_sabha_pc_id also points to:
 └── PC (25, e.g. "Kadapa") ←────────────┘
      (parallel tree, not a parent of AC — same pattern as the original
       2-AC build: an AC's structural parent is its district; PC
       membership is a separate link, since district and PC boundaries
       don't nest inside each other cleanly — see Annamayya district
       verification below)
```

Verified this actually matters, not just theoretically: YSR Kadapa
district's 7 ACs map 1:1 onto Kadapa PC's 7 AC segments (they happen to
align), but Annamayya district's 6 ACs *all* fall under Rajampet PC while
other Rajampet-PC ACs belong to different districts (Tirupati, YSR
Kadapa) — confirming district and PC are genuinely independent trees, not
one nested inside the other.

## Run it

```
npm install
npm run seed        # builds db/election_data.sqlite — full state + Badvel/Kadapa detail
npm run build         # builds frontend/dist
npm start              # one process, one port: UI + API together
```
Open http://localhost:3001. The AC switcher still only shows Badvel/Kadapa
(frontend hasn't been updated for full-state browsing yet — see below).

**Deploy to a real host (e.g. Render):** `render.yaml` included, same as before.

**Postgres:**
```
DATABASE_URL=postgres://user:pass@host/db node db/migrate_to_postgres.js
DATABASE_URL=postgres://user:pass@host/db node server.pg.js
```

## Endpoints (unchanged — this is the payoff of the generic hierarchy design)

No API code changed to support the full state. The existing endpoints just
work at any scale:
- `GET /api/admin-units?level=DISTRICT` — all 26 districts
- `GET /api/admin-units?level=PC` — all 25 PCs
- `GET /api/admin-units/:id/children` — State→districts, District→ACs, AC→mandals (where seeded)
- `GET /api/pc/:id/acs` — a PC's AC segments (via `lok_sabha_pc_id`)
- `GET /api/admin-units/:id/results` — empty array for the 173 ACs without seeded results yet

## Next steps

1. **Frontend**: extend beyond the Kadapa-PC-only AC switcher to a real
   District/PC browser for the full state (state → district → AC drill-down
   UI). The API already supports this; only the React app needs it.
2. **Results data for remaining 173 ACs**: this is the big one — sourcing
   real multi-election results at this scale needs either a lot of
   individual page fetches or a proper ECI archive scraper, not
   hand-curation like Badvel/Kadapa.
3. Real Form 20 ingestion from an unrestricted environment (see `ingestion/README.md`).
4. PostGIS + real district/AC boundary shapefiles for the map layer.

