const express = require('express');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'db', 'election_data.sqlite'), { readOnly: true });
const app = express();
app.use(cors());

function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}
function one(sql, params = []) {
  return db.prepare(sql).get(...params);
}

// GET /api/admin-units/:id/children  — drill down the hierarchy
app.get('/api/admin-units/:id/children', (req, res) => {
  const rows = all(
    `SELECT id, level, name, code, reservation FROM admin_units WHERE parent_id = ? ORDER BY name`,
    [req.params.id]
  );
  res.json(rows);
});

// GET /api/pc/:id/acs — the Assembly segments of a Parliamentary constituency.
// Distinct from /children because AC.parent_id points at STATE (ACs and PCs
// both roll up to state independently), so this relationship is carried by
// admin_units.lok_sabha_pc_id instead.
app.get('/api/pc/:id/acs', (req, res) => {
  const rows = all(
    `SELECT id, level, name, code, reservation FROM admin_units WHERE lok_sabha_pc_id = ? ORDER BY name`,
    [req.params.id]
  );
  res.json(rows);
});

// GET /api/admin-units?name=Badvel — resolve a name to an admin_unit id
app.get('/api/admin-units', (req, res) => {
  const { name, level } = req.query;
  let sql = 'SELECT id, level, name, code, reservation, parent_id FROM admin_units WHERE 1=1';
  const params = [];
  if (name) { sql += ' AND name = ?'; params.push(name); }
  if (level) { sql += ' AND level = ?'; params.push(level); }
  res.json(all(sql, params));
});

// GET /api/admin-units/:id/results — all elections' results for one admin unit
app.get('/api/admin-units/:id/results', (req, res) => {
  const auId = req.params.id;
  const elections = all(
    `SELECT id, election_type, year, is_by_election FROM elections ORDER BY year, is_by_election`
  );

  const out = elections.map(el => {
    const candidates = all(
      `SELECT r.votes, r.vote_share_pct, r.is_winner, c.name AS candidate, p.abbr AS party, p.color_hex
       FROM results r
       JOIN candidates c ON c.id = r.candidate_id
       LEFT JOIN parties p ON p.id = r.party_id
       WHERE r.admin_unit_id = ? AND r.election_id = ?
       ORDER BY r.votes DESC`,
      [auId, el.id]
    );
    if (candidates.length === 0) return null;

    const turnout = one(
      `SELECT electors, votes_polled, turnout_pct FROM turnout WHERE admin_unit_id = ? AND election_id = ?`,
      [auId, el.id]
    );
    const classification = one(
      `SELECT ac.classification, ac.margin_pct, p.abbr AS party
       FROM area_classification ac
       LEFT JOIN parties p ON p.id = ac.party_id
       WHERE ac.admin_unit_id = ? AND ac.election_id = ?`,
      [auId, el.id]
    );

    return {
      year: el.year,
      is_by_election: !!el.is_by_election,
      turnout,
      classification,
      candidates
    };
  }).filter(Boolean);

  res.json(out);
});

// GET /api/admin-units/:id/trend?party=YSRCP,TDP,BJP,INC — vote share series across elections
app.get('/api/admin-units/:id/trend', (req, res) => {
  const auId = req.params.id;
  const rows = all(
    `SELECT e.year, e.is_by_election, p.abbr AS party, r.vote_share_pct
     FROM results r
     JOIN elections e ON e.id = r.election_id
     LEFT JOIN parties p ON p.id = r.party_id
     WHERE r.admin_unit_id = ?
     ORDER BY e.year`,
    [auId]
  );
  res.json(rows);
});

// GET /api/state-summary — statewide seat count by party for the latest
// election on record, plus how many seats changed party vs. the prior
// comparable election. Powers the "State" home view.
app.get('/api/state-summary', (req, res) => {
  const seatsByParty = all(
    `SELECT p.abbr AS party, p.color_hex, COUNT(*) AS seats
     FROM results r
     JOIN admin_units ac ON ac.id = r.admin_unit_id AND ac.level = 'AC'
     JOIN elections e ON e.id = r.election_id
     JOIN parties p ON p.id = r.party_id
     WHERE e.year = 2024 AND e.is_by_election = 0 AND r.is_winner = 1
     GROUP BY p.abbr, p.color_hex
     ORDER BY seats DESC`
  );

  const flips = all(
    `SELECT ac.name, ac.code, d.name AS district, p19.abbr AS party_2019, p24.abbr AS party_2024
     FROM admin_units ac
     JOIN admin_units d ON d.id = ac.parent_id
     JOIN results r19 ON r19.admin_unit_id = ac.id AND r19.is_winner = 1
     JOIN elections e19 ON e19.id = r19.election_id AND e19.year = 2019 AND e19.is_by_election = 0
     JOIN parties p19 ON p19.id = r19.party_id
     JOIN results r24 ON r24.admin_unit_id = ac.id AND r24.is_winner = 1
     JOIN elections e24 ON e24.id = r24.election_id AND e24.year = 2024 AND e24.is_by_election = 0
     JOIN parties p24 ON p24.id = r24.party_id
     WHERE ac.level = 'AC' AND p19.abbr != p24.abbr
     ORDER BY CAST(ac.code AS INTEGER)`
  );

  const totalAcs = one(`SELECT COUNT(*) AS n FROM admin_units WHERE level = 'AC'`).n;
  const totalDistricts = one(`SELECT COUNT(*) AS n FROM admin_units WHERE level = 'DISTRICT'`).n;

  res.json({ totalAcs, totalDistricts, seatsByParty, flippedCount: flips.length, flips });
});

// GET /api/districts/:id/summary — every AC in a district with its most
// recent (2024) winner + party, in one call instead of N. Powers the
// "District" home view.
app.get('/api/districts/:id/summary', (req, res) => {
  const districtId = req.params.id;
  const acs = all(
    `SELECT id, name, code, reservation FROM admin_units WHERE parent_id = ? AND level = 'AC' ORDER BY CAST(code AS INTEGER)`,
    [districtId]
  );

  const out = acs.map(ac => {
    const winner = one(
      `SELECT c.name AS candidate, p.abbr AS party, r.votes, r.vote_share_pct
       FROM results r
       JOIN candidates c ON c.id = r.candidate_id
       LEFT JOIN parties p ON p.id = r.party_id
       JOIN elections e ON e.id = r.election_id
       WHERE r.admin_unit_id = ? AND r.is_winner = 1 AND e.year = 2024 AND e.is_by_election = 0`,
      [ac.id]
    );
    return { ...ac, winner2024: winner || null };
  });

  res.json(out);
});

app.get('/api/admin-units/:id/demographics', (req, res) => {
  res.json(all(`SELECT * FROM demographics WHERE admin_unit_id = ?`, [req.params.id]));
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', db: 'sqlite' }));

// Serve the built frontend (run `npm run build` in frontend/ first) so this
// single process is the entire deployable app — one URL, one process.
const frontendDist = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Election analytics API listening on :${PORT}`));
