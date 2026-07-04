// Postgres-backed API server — same routes and response shapes as server.js
// (the SQLite dev version), but reading from a real Postgres database
// populated by db/migrate_to_postgres.js. This is the version to actually
// deploy; server.js remains for local dev without a Postgres instance.
//
// Usage: DATABASE_URL=postgres://user:pass@host/db node server.pg.js

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:localdev@localhost:5432/election_analytics'
});

const app = express();
app.use(cors());

async function all(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}
async function one(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

app.get('/api/admin-units/:id/children', async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT id, level, name, code, reservation FROM admin_units WHERE parent_id = $1 ORDER BY name`,
      [req.params.id]
    ));
  } catch (e) { next(e); }
});

app.get('/api/pc/:id/acs', async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT id, level, name, code, reservation FROM admin_units WHERE lok_sabha_pc_id = $1 ORDER BY name`,
      [req.params.id]
    ));
  } catch (e) { next(e); }
});

app.get('/api/admin-units', async (req, res, next) => {
  try {
    const { name, level } = req.query;
    let sql = 'SELECT id, level, name, code, reservation, parent_id FROM admin_units WHERE 1=1';
    const params = [];
    if (name) { params.push(name); sql += ` AND name = $${params.length}`; }
    if (level) { params.push(level); sql += ` AND level = $${params.length}`; }
    res.json(await all(sql, params));
  } catch (e) { next(e); }
});

app.get('/api/admin-units/:id/results', async (req, res, next) => {
  try {
    const auId = req.params.id;
    const elections = await all(
      `SELECT id, election_type, year, is_by_election FROM elections ORDER BY year, is_by_election`
    );

    const out = [];
    for (const el of elections) {
      const candidates = await all(
        `SELECT r.votes, r.vote_share_pct, r.is_winner, c.name AS candidate, p.abbr AS party, p.color_hex
         FROM results r
         JOIN candidates c ON c.id = r.candidate_id
         LEFT JOIN parties p ON p.id = r.party_id
         WHERE r.admin_unit_id = $1 AND r.election_id = $2
         ORDER BY r.votes DESC`,
        [auId, el.id]
      );
      if (candidates.length === 0) continue;

      const turnout = await one(
        `SELECT electors, votes_polled, turnout_pct FROM turnout WHERE admin_unit_id = $1 AND election_id = $2`,
        [auId, el.id]
      );
      const classification = await one(
        `SELECT ac.classification, ac.margin_pct, p.abbr AS party
         FROM area_classification ac
         LEFT JOIN parties p ON p.id = ac.party_id
         WHERE ac.admin_unit_id = $1 AND ac.election_id = $2`,
        [auId, el.id]
      );

      out.push({
        year: el.year,
        is_by_election: el.is_by_election,
        turnout,
        classification,
        candidates
      });
    }
    res.json(out);
  } catch (e) { next(e); }
});

app.get('/api/admin-units/:id/trend', async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT e.year, e.is_by_election, p.abbr AS party, r.vote_share_pct
       FROM results r
       JOIN elections e ON e.id = r.election_id
       LEFT JOIN parties p ON p.id = r.party_id
       WHERE r.admin_unit_id = $1
       ORDER BY e.year`,
      [req.params.id]
    ));
  } catch (e) { next(e); }
});

app.get('/api/state-summary', async (req, res, next) => {
  try {
    const seatsByParty = await all(
      `SELECT p.abbr AS party, p.color_hex, COUNT(*) AS seats
       FROM results r
       JOIN admin_units ac ON ac.id = r.admin_unit_id AND ac.level = 'AC'
       JOIN elections e ON e.id = r.election_id
       JOIN parties p ON p.id = r.party_id
       WHERE e.year = 2024 AND e.is_by_election = false AND r.is_winner = true
       GROUP BY p.abbr, p.color_hex
       ORDER BY seats DESC`
    );
    const flips = await all(
      `SELECT ac.name, ac.code, d.name AS district, p19.abbr AS party_2019, p24.abbr AS party_2024
       FROM admin_units ac
       JOIN admin_units d ON d.id = ac.parent_id
       JOIN results r19 ON r19.admin_unit_id = ac.id AND r19.is_winner = true
       JOIN elections e19 ON e19.id = r19.election_id AND e19.year = 2019 AND e19.is_by_election = false
       JOIN parties p19 ON p19.id = r19.party_id
       JOIN results r24 ON r24.admin_unit_id = ac.id AND r24.is_winner = true
       JOIN elections e24 ON e24.id = r24.election_id AND e24.year = 2024 AND e24.is_by_election = false
       JOIN parties p24 ON p24.id = r24.party_id
       WHERE ac.level = 'AC' AND p19.abbr != p24.abbr
       ORDER BY CAST(ac.code AS INTEGER)`
    );
    const totalAcs = (await one(`SELECT COUNT(*) AS n FROM admin_units WHERE level = 'AC'`)).n;
    const totalDistricts = (await one(`SELECT COUNT(*) AS n FROM admin_units WHERE level = 'DISTRICT'`)).n;
    res.json({ totalAcs: Number(totalAcs), totalDistricts: Number(totalDistricts), seatsByParty, flippedCount: flips.length, flips });
  } catch (e) { next(e); }
});

app.get('/api/districts/:id/summary', async (req, res, next) => {
  try {
    const districtId = req.params.id;
    const acs = await all(
      `SELECT id, name, code, reservation FROM admin_units WHERE parent_id = $1 AND level = 'AC' ORDER BY CAST(code AS INTEGER)`,
      [districtId]
    );
    const out = [];
    for (const ac of acs) {
      const winner = await one(
        `SELECT c.name AS candidate, p.abbr AS party, r.votes, r.vote_share_pct
         FROM results r
         JOIN candidates c ON c.id = r.candidate_id
         LEFT JOIN parties p ON p.id = r.party_id
         JOIN elections e ON e.id = r.election_id
         WHERE r.admin_unit_id = $1 AND r.is_winner = true AND e.year = 2024 AND e.is_by_election = false`,
        [ac.id]
      );
      out.push({ ...ac, winner2024: winner || null });
    }
    res.json(out);
  } catch (e) { next(e); }
});

app.get('/api/admin-units/:id/demographics', async (req, res, next) => {
  try {
    res.json(await all(`SELECT * FROM demographics WHERE admin_unit_id = $1`, [req.params.id]));
  } catch (e) { next(e); }
});

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'postgres' });
  } catch (e) { next(e); }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal error', detail: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Election analytics API (Postgres) listening on :${PORT}`));
