// Migrates data from db/election_data.sqlite (the dev seed) into a real
// Postgres database using schema/schema.sql. This is the path from local
// prototyping to a real deploy: SQLite and Postgres schemas are
// column-for-column identical, so this is a straight copy, table by table,
// in FK-safe order — no data transformation needed.
//
// Usage: DATABASE_URL=postgres://user:pass@host/db node db/migrate_to_postgres.js

const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:localdev@localhost:5432/election_analytics';

async function main() {
  const sqlite = new DatabaseSync(path.join(__dirname, 'election_data.sqlite'), { readOnly: true });
  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  // Wipe existing rows (idempotent re-runs) — children first for FK order.
  await pg.query(`TRUNCATE area_classification, demographics, turnout, results, candidates, elections, parties, admin_units RESTART IDENTITY CASCADE`);

  const tables = [
    {
      name: 'admin_units',
      select: `SELECT id, parent_id, level, name, code, reservation, delimitation_year, lok_sabha_pc_id FROM admin_units ORDER BY id`,
      insert: `INSERT INTO admin_units (id, parent_id, level, name, code, reservation, delimitation_year, lok_sabha_pc_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      map: r => [r.id, r.parent_id, r.level, r.name, r.code, r.reservation, r.delimitation_year, r.lok_sabha_pc_id]
    },
    {
      name: 'parties',
      select: `SELECT id, name, abbr, color_hex FROM parties ORDER BY id`,
      insert: `INSERT INTO parties (id, name, abbr, color_hex) VALUES ($1,$2,$3,$4)`,
      map: r => [r.id, r.name, r.abbr, r.color_hex]
    },
    {
      name: 'elections',
      select: `SELECT id, election_type, year, is_by_election, poll_date FROM elections ORDER BY id`,
      insert: `INSERT INTO elections (id, election_type, year, is_by_election, poll_date) VALUES ($1,$2,$3,$4,$5)`,
      map: r => [r.id, r.election_type, r.year, !!r.is_by_election, r.poll_date]
    },
    {
      name: 'candidates',
      select: `SELECT id, name, gender, education, assets_inr, criminal_cases FROM candidates ORDER BY id`,
      insert: `INSERT INTO candidates (id, name, gender, education, assets_inr, criminal_cases) VALUES ($1,$2,$3,$4,$5,$6)`,
      map: r => [r.id, r.name, r.gender, r.education, r.assets_inr, r.criminal_cases]
    },
    {
      name: 'results',
      select: `SELECT id, admin_unit_id, election_id, candidate_id, party_id, votes, vote_share_pct, is_winner FROM results ORDER BY id`,
      insert: `INSERT INTO results (id, admin_unit_id, election_id, candidate_id, party_id, votes, vote_share_pct, is_winner)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      map: r => [r.id, r.admin_unit_id, r.election_id, r.candidate_id, r.party_id, r.votes, r.vote_share_pct, !!r.is_winner]
    },
    {
      name: 'turnout',
      select: `SELECT id, admin_unit_id, election_id, electors, votes_polled, turnout_pct FROM turnout ORDER BY id`,
      insert: `INSERT INTO turnout (id, admin_unit_id, election_id, electors, votes_polled, turnout_pct) VALUES ($1,$2,$3,$4,$5,$6)`,
      map: r => [r.id, r.admin_unit_id, r.election_id, r.electors, r.votes_polled, r.turnout_pct]
    },
    {
      name: 'demographics',
      select: `SELECT id, admin_unit_id, census_year, population, rural_pct, sc_pct, st_pct, literacy_pct FROM demographics ORDER BY id`,
      insert: `INSERT INTO demographics (id, admin_unit_id, census_year, population, rural_pct, sc_pct, st_pct, literacy_pct)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      map: r => [r.id, r.admin_unit_id, r.census_year, r.population, r.rural_pct, r.sc_pct, r.st_pct, r.literacy_pct]
    },
    {
      name: 'area_classification',
      select: `SELECT id, admin_unit_id, election_id, party_id, classification, margin_pct FROM area_classification ORDER BY id`,
      insert: `INSERT INTO area_classification (id, admin_unit_id, election_id, party_id, classification, margin_pct)
                VALUES ($1,$2,$3,$4,$5,$6)`,
      map: r => [r.id, r.admin_unit_id, r.election_id, r.party_id, r.classification, r.margin_pct]
    }
  ];

  for (const t of tables) {
    const rows = sqlite.prepare(t.select).all();
    for (const r of rows) {
      await pg.query(t.insert, t.map(r));
    }
    // Reset the sequence so future inserts continue after the migrated ids.
    await pg.query(`SELECT setval(pg_get_serial_sequence('${t.name}', 'id'), COALESCE((SELECT MAX(id) FROM ${t.name}), 1))`);
    console.log(`  ${t.name}: ${rows.length} rows`);
  }

  await pg.end();
  sqlite.close();
  console.log('Migration complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
