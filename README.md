# Election Analytics — foundation layer (Kadapa PC: Badvel + Kadapa ACs)

A working slice of the Indian Political Analytics Platform: real ECI-sourced
results for two Assembly Constituencies under Kadapa PC (Badvel — SC-reserved,
rural — and Kadapa — general seat, urban), a Postgres-backed API, a React
dashboard, and a working PDF ingestion pipeline for booth-level data.

## What's real vs. illustrative

**Real** (ECI results via Wikipedia, cross-checked against Oneindia for
2024): AC-level candidate names, party, votes, vote share, turnout,
electors, and margins for both ACs across 2004, 2009, 2014, 2019, 2024
(plus Badvel's 2021 by-election). The mandal lists for both ACs. Census
2011 demographics for Badvel.

**Synthetic, clearly labeled**: booth-level splits loaded via
`ingestion/load_booths.js` come from a fabricated test fixture (see
`ingestion/README.md`) — this sandbox can't reach eci.gov.in to pull real
Form 20 PDFs. The parser and loader are real, tested code; the booth
numbers they happened to run against for this demo aren't.

## Structure

```
schema/schema.sql          Production Postgres DDL
db/schema.sqlite.sql        Same schema, SQLite dialect, for local dev
db/seed.js                  Loads real AC-level data (Badvel + Kadapa) into SQLite
db/migrate_to_postgres.js   Copies the SQLite db into a real Postgres instance
server.js                   Express API on SQLite (local dev, no Postgres needed)
server.pg.js                 Same API on Postgres (the deploy target)
frontend/                   React (Vite) dashboard, fetches live from the API
ingestion/                  ECI Form 20 PDF -> booth-level data pipeline
```

## Run it

**Single-process app (recommended — this is what deploy configs use):**
```
npm install
npm run seed        # builds db/election_data.sqlite
npm run build        # builds frontend/dist and installs frontend deps
npm start             # one process, one port: UI + API together
```
Open http://localhost:3001 — the whole app, one URL.

**Deploy to a real host (e.g. Render):** `render.yaml` is included — connect
this repo on Render (or run `buildCommand: npm install && npm run seed &&
npm run build`, `startCommand: npm start` on any Node host) and it gets a
real persistent URL. Requires Node ≥22.5 (uses the built-in `node:sqlite`
module — see `engines` in package.json).

**Backend only, frontend in dev mode (for active frontend development):**
```
npm install && npm run seed && npm start     # API on :3001
cd frontend && npm install && npm run dev     # UI on :5173, proxies /api to :3001
```

**Backend (Postgres):**
```
# requires a running Postgres + schema/schema.sql applied
DATABASE_URL=postgres://user:pass@host/db node db/migrate_to_postgres.js
DATABASE_URL=postgres://user:pass@host/db node server.pg.js
```
(server.pg.js doesn't serve the frontend yet — point a separately built
frontend at it via VITE_API_BASE, or add the same static-serving block
from server.js if you want the single-process pattern on Postgres too.)

**Booth-level ingestion pipeline:** see `ingestion/README.md`.

## Endpoints

- `GET /api/admin-units?name=Kadapa&level=PC` — resolve a name to an id
- `GET /api/pc/:id/acs` — the AC segments of a PC (via `lok_sabha_pc_id`, not `parent_id`)
- `GET /api/admin-units/:id/children` — drill down the hierarchy (AC → mandals → booths)
- `GET /api/admin-units/:id/results` — every election's full result set for that unit
- `GET /api/admin-units/:id/trend` — vote-share-by-party series across elections
- `GET /api/admin-units/:id/demographics` — Census-derived area stats

## Design notes

- **One hierarchy table** (`admin_units`), self-referencing by `parent_id`,
  so state/PC/AC/mandal/village/booth all use the same queries — proven by
  the ingestion pipeline creating real BOOTH rows with zero schema or API
  changes. An AC also carries `lok_sabha_pc_id` since PC and AC don't nest
  inside each other in a strict tree — both roll up to state independently,
  but every AC belongs to exactly one PC for reporting (see `/api/pc/:id/acs`).
- **Classification is derived, not entered.** `area_classification` is
  computed from margin_pct in `db/seed.js` (≥15% stronghold, 5–15% swing,
  <5% weak/contested) — a placeholder rule you'll want to replace with
  something that also weighs multi-election trend direction, not just one
  year's margin.
- **Demographics are area-level only**, sourced from Census village
  directories, never linked to individual voters or electoral rolls — this
  is a legal/compliance boundary, not just a modeling choice.
- **Two ACs prove generalization, not scale.** The frontend's AC switcher,
  the `/api/pc/:id/acs` endpoint, and the classification logic all work
  unchanged across Badvel (7 rural mandals, SC-reserved, YSRCP hold) and
  Kadapa (1 urban mandal, general seat, TDP flip in 2024) — genuinely
  different shapes of constituency, not just two rows with different names.

## Next steps

1. Get real Form 20 PDFs into the ingestion pipeline (needs network access
   to eci.gov.in from wherever this runs — not available in this sandbox).
2. Add PostGIS + real AC/booth boundary shapefiles (ECI/Survey of India) for
   the map layer.
3. Add a `/api/admin-units/:id/compare?ids=...` endpoint for side-by-side
   AC or mandal comparison — natural next step now two ACs exist.
4. Extend past Kadapa PC to prove the hierarchy holds at district/state
   scale, not just two neighboring ACs.

