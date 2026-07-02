// Loads the parser's booth-level JSON output into the database at BOOTH
// level: creates admin_units rows (under the matching mandal), then
// results + turnout rows for the given AC/election, matching candidates
// by party_guess against the AC's existing candidate rows for that
// election where possible (falls back to inserting a new candidate row
// if no AC-level candidate matches, e.g. a booth-only spelling variant).
//
// Usage: node ingestion/load_booths.js <parsed.json> <ac_name> <election_year> [--by]

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const [, , jsonPath, acName, yearArg, byFlag] = process.argv;
if (!jsonPath || !acName || !yearArg) {
  console.error('Usage: node ingestion/load_booths.js <parsed.json> <ac_name> <election_year> [--by]');
  process.exit(1);
}
const year = parseInt(yearArg, 10);
const isBy = byFlag === '--by' ? 1 : 0;

const db = new DatabaseSync(path.join(__dirname, '..', 'db', 'election_data.sqlite'));
function run(sql, params = []) { return db.prepare(sql).run(...params); }
function one(sql, params = []) { return db.prepare(sql).get(...params); }
function all(sql, params = []) { return db.prepare(sql).all(...params); }

const ac = one(`SELECT id FROM admin_units WHERE name = ? AND level = 'AC'`, [acName]);
if (!ac) { console.error(`AC "${acName}" not found — run db/seed.js first.`); process.exit(1); }

const election = one(
  `SELECT id FROM elections WHERE election_type='AC' AND year=? AND is_by_election=?`,
  [year, isBy]
);
if (!election) { console.error(`Election AC/${year}${isBy ? ' (by)' : ''} not found for this AC.`); process.exit(1); }

const mandals = all(`SELECT id, name FROM admin_units WHERE parent_id = ? AND level='MANDAL'`, [ac.id]);
const mandalByName = Object.fromEntries(mandals.map(m => [m.name, m.id]));

// AC-level candidates for this election, to link booth rows to the same
// candidate/party identity rather than creating duplicates per booth.
const acCandidates = all(
  `SELECT c.id, c.name, p.abbr AS party FROM results r
   JOIN candidates c ON c.id = r.candidate_id
   LEFT JOIN parties p ON p.id = r.party_id
   WHERE r.admin_unit_id = ? AND r.election_id = ?`,
  [ac.id, election.id]
);
const candidateByParty = Object.fromEntries(acCandidates.map(c => [c.party, c]));

const booths = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
let insertedBooths = 0, insertedResults = 0, skipped = 0;

for (const b of booths) {
  const mandalId = mandalByName[b.mandal_hint];
  if (!mandalId) { skipped++; continue; }

  let boothUnit = one(
    `SELECT id FROM admin_units WHERE parent_id = ? AND level = 'BOOTH' AND code = ?`,
    [mandalId, b.part_no]
  );
  let boothId;
  if (boothUnit) {
    boothId = boothUnit.id;
  } else {
    boothId = Number(run(
      `INSERT INTO admin_units (parent_id, level, name, code) VALUES (?, 'BOOTH', ?, ?)`,
      [mandalId, b.booth_name, b.part_no]
    ).lastInsertRowid);
    insertedBooths++;
  }

  for (const c of b.candidates) {
    let candidateId, partyAbbr = c.party_guess;
    const matched = candidateByParty[partyAbbr];
    if (matched) {
      candidateId = matched.id;
    } else {
      candidateId = Number(run(`INSERT INTO candidates (name) VALUES (?)`, [c.name]).lastInsertRowid);
    }
    const partyRow = partyAbbr ? one(`SELECT id FROM parties WHERE abbr = ?`, [partyAbbr]) : null;

    run(
      `INSERT OR REPLACE INTO results (admin_unit_id, election_id, candidate_id, party_id, votes, vote_share_pct, is_winner)
       VALUES (?, ?, ?, ?, ?, NULL, 0)`,
      [boothId, election.id, candidateId, partyRow ? partyRow.id : null, c.votes]
    );
    insertedResults++;
  }

  run(
    `INSERT OR REPLACE INTO turnout (admin_unit_id, election_id, electors, votes_polled, turnout_pct)
     VALUES (?, ?, NULL, ?, NULL)`,
    [boothId, election.id, b.total_votes]
  );
}

console.log(`Loaded ${insertedBooths} new booth admin_units, ${insertedResults} result rows.`);
if (skipped) console.log(`Skipped ${skipped} booths — mandal_hint didn't match any known mandal (check parser heuristic vs. real ECI naming).`);

// Sanity check: booth-level sums should reconcile with the AC-level total already in `results`.
const boothTotals = all(
  `SELECT p.abbr, SUM(r.votes) as total FROM results r
   JOIN admin_units au ON au.id = r.admin_unit_id
   JOIN admin_units mandal ON mandal.id = au.parent_id
   LEFT JOIN parties p ON p.id = r.party_id
   WHERE mandal.parent_id = ? AND r.election_id = ? AND au.level = 'BOOTH'
   GROUP BY p.abbr`,
  [ac.id, election.id]
);
console.log('\nBooth-summed totals (reconciliation check against AC-level row):');
for (const row of boothTotals) console.log(`  ${row.abbr}: ${row.total}`);

const acLevel = all(
  `SELECT p.abbr, r.votes FROM results r LEFT JOIN parties p ON p.id = r.party_id
   WHERE r.admin_unit_id = ? AND r.election_id = ?`,
  [ac.id, election.id]
);
console.log('\nAC-level row (should match):');
for (const row of acLevel) console.log(`  ${row.abbr}: ${row.votes}`);

db.close();
