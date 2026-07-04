# Election Analytics — Andhra Pradesh state hierarchy + Kadapa PC detail

The structural hierarchy for the **entire state of Andhra Pradesh** — all
26 districts, 25 Lok Sabha PCs, and 175 Assembly constituencies with
verified reservation status — plus full real election history (2004-2024)
for Badvel and Kadapa ACs as a detail example within that structure.

## What's real vs. scope of this pass

**Real, state-wide, full detail**: every AC's number, name, district, PC,
and reservation status. Verified against official totals exactly (29 SC,
7 ST, 175 total).

**Real, state-wide, winner-only**: for 173 of 175 ACs, the actual winning
candidate and party for **2019 and 2024** — sourced from Wikipedia's
15th/16th Andhra Pradesh Assembly member-list pages, cross-checked against
official seat totals which matched exactly (2024: TDP 135, JSP 21, BJP 8,
YSRCP 11; 2019: YSRCP 151, TDP 23, JSP 1). This is deliberately a thinner
data shape than full results — **no vote counts, no margins, no runner-up,
no turnout** for these 173, because that data wasn't sourced and we don't
fabricate numbers we don't have. `results.votes` and `vote_share_pct` are
`NULL` for these rows; the frontend shows a clear "winner known, full
results not yet sourced" message instead of a misleading chart.

**Real, full candidate-level detail**: Badvel and Kadapa only — multi-
election results (2004-2024 for both, plus Badvel's 2021 by-election) with
real candidate names, votes, turnout, margins.

**What this state-wide winner data already enables** (verified with real
queries): 142 of 175 seats changed party between 2019 and 2024 — a real
swing analysis, not aggregate commentary. District-level "which party
leads this district" breakdowns. The fact that Y.S. Jagan Mohan Reddy held
his own Pulivendla seat continuously even as his party collapsed
statewide from 151 to 11 seats.

**Not yet built**: mandals below AC level (only Badvel/Kadapa), full
vote-count/margin/turnout data for the 173 winner-only ACs, historical
elections (2004/2009/2014) for anything beyond Badvel/Kadapa, booth-level
data outside the ingestion-pipeline test fixture.

## Structure

```
schema/schema.sql          Production Postgres DDL (now includes DISTRICT level)
db/schema.sqlite.sql        Same schema, SQLite dialect, for local dev
db/ap_acs.json               Sourced data: all 175 ACs w/ district, PC, reservation
db/winners_2019.json          Sourced data: real winner+party for 175 ACs, 2019
db/winners_2024.json          Sourced data: real winner+party for 175 ACs, 2024
db/seed.js                   Loads full state hierarchy + Badvel/Kadapa full results + winner-only data
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

1. **Vote counts/margins for the 173 winner-only ACs**: the big remaining
   gap. Would need either individual per-AC page fetches (~173 pages,
   each with full multi-year tables like Badvel/Kadapa) or a proper ECI
   archive/scraper — much bigger sourcing job than winner-only data was.
2. **Frontend**: extend beyond the Kadapa-PC-only AC switcher to a real
   District/PC browser for the full state, and surface the swing/flip
   analysis (142 seats changed party 2019→2024) as an actual view instead
   of just a query you can run against the database directly.
3. Historical elections (2004/2009/2014) for ACs beyond Badvel/Kadapa.
4. Real Form 20 ingestion from an unrestricted environment (see `ingestion/README.md`).
5. PostGIS + real district/AC boundary shapefiles for the map layer.

