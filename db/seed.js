// Seeds the SQLite demo db with the REAL structural hierarchy for the
// ENTIRE state of Andhra Pradesh: 26 districts, 25 Lok Sabha PCs, and all
// 175 Assembly constituencies with verified reservation status.
//
// Source: AC number/name/district/PC cross-referenced from apteachers.in's
// clean district+PC table and myneta.info's inline (SC)/(ST) tags per
// constituency — reservation counts verified to match the official 29 SC
// + 7 ST exactly (see db/ap_acs.json for the raw sourced data).
//
// Scope for this pass: STRUCTURE ONLY for 173 of the 175 ACs (no election
// results, no mandals below AC level) — that's the deliberate scope for
// this build. Badvel and Kadapa keep their full real election history
// (2004-2024) and mandal breakdown from the earlier build, now correctly
// nested one level deeper under YSR Kadapa district instead of directly
// under state.

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'election_data.sqlite');
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

const db = new DatabaseSync(DB_PATH);
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sqlite.sql'), 'utf8'));

function run(sql, params = []) { return db.prepare(sql).run(...params); }
function lastId(res) { return Number(res.lastInsertRowid); }
function one(sql, params = []) { return db.prepare(sql).get(...params); }
function all(sql, params = []) { return db.prepare(sql).all(...params); }

// ---- state ----
const stateId = lastId(run(
  `INSERT INTO admin_units (parent_id, level, name) VALUES (NULL, 'STATE', 'Andhra Pradesh')`
));

// ---- source data: all 175 ACs with district, PC, reservation ----
const acData = JSON.parse(fs.readFileSync(path.join(__dirname, 'ap_acs.json'), 'utf8'));

// ---- 26 districts, under state ----
const districtNames = [...new Set(acData.map(a => a.district))].sort();
const districtIds = {};
for (const d of districtNames) {
  districtIds[d] = lastId(run(
    `INSERT INTO admin_units (parent_id, level, name) VALUES (?, 'DISTRICT', ?)`,
    [stateId, d]
  ));
}

// ---- 25 Lok Sabha PCs, also under state (parallel tree to districts —
// an AC's real parent is its district; PC membership is tracked via
// lok_sabha_pc_id, same pattern as the original Badvel/Kadapa build) ----
const pcNames = [...new Set(acData.map(a => a.ls))].sort();
const pcIds = {};
for (const p of pcNames) {
  pcIds[p] = lastId(run(
    `INSERT INTO admin_units (parent_id, level, name) VALUES (?, 'PC', ?)`,
    [stateId, p]
  ));
}

// ---- all 175 ACs, under their district, linked to their PC ----
const acIds = {}; // keyed by AC number (unique) since 2 names repeat
for (const a of acData) {
  const id = lastId(run(
    `INSERT INTO admin_units (parent_id, level, name, code, reservation, lok_sabha_pc_id)
     VALUES (?, 'AC', ?, ?, ?, ?)`,
    [districtIds[a.district], a.name, String(a.no), a.reservation, pcIds[a.ls]]
  ));
  acIds[a.no] = id;
}
console.log(`Seeded state hierarchy: 1 state, ${districtNames.length} districts, ${pcNames.length} PCs, ${acData.length} ACs.`);

// ---- Badvel (AC 124) and Kadapa (AC 126): full real election history ----
// Same data as the original Kadapa-PC-only build, just re-attached one
// level deeper (under YSR Kadapa district) instead of directly under state.
const badvelId = acIds[124];
const kadapaId = acIds[126];

const badvelMandals = ['Kalasapadu', 'B.Kodur', 'Sri Avadhutha Kasinaya', 'Porumamilla', 'Badvel', 'Gopavaram', 'Atlur'];
for (const m of badvelMandals) {
  run(`INSERT INTO admin_units (parent_id, level, name) VALUES (?, 'MANDAL', ?)`, [badvelId, m]);
}
run(`INSERT INTO admin_units (parent_id, level, name) VALUES (?, 'MANDAL', 'Kadapa')`, [kadapaId]);

const partyColors = {
  YSRCP: '#2a78d6', TDP: '#eda100', INC: '#1baf7a', BJP: '#e34948',
  CPI: '#e87ba4', JSP: '#4a3aa7', IND: '#898781', NOTA: '#c3c2b7'
};
const partyIds = {};
for (const [abbr, color] of Object.entries(partyColors)) {
  partyIds[abbr] = lastId(run(`INSERT INTO parties (name, abbr, color_hex) VALUES (?, ?, ?)`, [abbr, abbr, color]));
}

const badvelElections = [
  { year: 2004, isBy: 0, electors: null, votesPolled: 153429, turnoutPct: 72.19,
    candidates: [
      { name: 'Devasani Chinna Govinda Reddy', party: 'INC', votes: 57023 },
      { name: 'Konireddy Vijayamma', party: 'TDP', votes: 51742 }
    ]},
  { year: 2009, isBy: 0, electors: null, votesPolled: 135134, turnoutPct: 73.07,
    candidates: [
      { name: 'P. M. Kamalamma', party: 'INC', votes: 78486 },
      { name: 'Chennaiah Lakkineni', party: 'TDP', votes: 41892 },
      { name: 'Singamala Venkateswarlu', party: 'IND', votes: 9574 },
      { name: 'Singamala Venkateswarlu (BJP)', party: 'BJP', votes: 1415 }
    ]},
  { year: 2014, isBy: 0, electors: null, votesPolled: 155132, turnoutPct: 72.87,
    candidates: [
      { name: 'Thiriveedi Jayaramulu', party: 'YSRCP', votes: 78879 },
      { name: 'N. D. Vijaya Jyothi', party: 'TDP', votes: 68800 },
      { name: 'Seeli Venkata Subbaiah', party: 'CPI', votes: 2185 },
      { name: 'J Kamal Prabhash', party: 'INC', votes: 1524 },
      { name: 'NOTA', party: 'NOTA', votes: 550 }
    ]},
  { year: 2019, isBy: 0, electors: 204618, votesPolled: 150621, turnoutPct: 77.64,
    candidates: [
      { name: 'Gunthoti Venkata Subbaiah', party: 'YSRCP', votes: 95482 },
      { name: 'Obulapuram Rajasekhar', party: 'TDP', votes: 50748 },
      { name: 'Neerugattu Dora Vijaya Jyothi', party: 'IND', votes: 2883 },
      { name: 'NOTA', party: 'NOTA', votes: 2004 }
    ]},
  { year: 2021, isBy: 1, electors: null, votesPolled: 146983, turnoutPct: 67.12,
    candidates: [
      { name: 'Dasari Sudha', party: 'YSRCP', votes: 112211 },
      { name: 'Panathala Suresh', party: 'BJP', votes: 21678 },
      { name: 'P M Kamalamma', party: 'INC', votes: 6235 },
      { name: 'NOTA', party: 'NOTA', votes: 3650 }
    ]},
  { year: 2024, isBy: 0, electors: 220220, votesPolled: 174880, turnoutPct: 79.93,
    candidates: [
      { name: 'Dasari Sudha', party: 'YSRCP', votes: 90410 },
      { name: 'Bojja Roshanna', party: 'BJP', votes: 71843 },
      { name: 'Neerugattu Dora Vijaya Jyothi', party: 'INC', votes: 7366 },
      { name: 'NOTA', party: 'NOTA', votes: 3076 }
    ]}
];

const kadapaElections = [
  { year: 2004, isBy: 0, electors: null, votesPolled: 133281, turnoutPct: 59.86,
    candidates: [
      { name: 'Ahamadulla Mohammad Syed', party: 'INC', votes: 75615 },
      { name: 'Kandula Sivananda Reddy', party: 'TDP', votes: 54959 }
    ]},
  { year: 2009, isBy: 0, electors: null, votesPolled: 136674, turnoutPct: 59.98,
    candidates: [
      { name: 'Ahmadulla Mohammad Syed', party: 'INC', votes: 61613 },
      { name: 'Kandula Sivananda Reddy', party: 'TDP', votes: 54263 },
      { name: 'Afzal Alikhan T.K.', party: 'IND', votes: 13989 }
    ]},
  { year: 2014, isBy: 0, electors: null, votesPolled: 162279, turnoutPct: 60.09,
    candidates: [
      { name: 'Amzath Basha Shaik Bepari', party: 'YSRCP', votes: 95077 },
      { name: 'Durgaprasad Rao Sudha', party: 'TDP', votes: 49872 }
    ]},
  { year: 2019, isBy: 0, electors: 265154, votesPolled: 166679, turnoutPct: 62.86,
    candidates: [
      { name: 'Amzath Basha Shaik Bepari', party: 'YSRCP', votes: 104822 },
      { name: 'Ameer Babu Nawabjan', party: 'TDP', votes: 50028 },
      { name: 'Sunkara Sreenivas', party: 'JSP', votes: 5385 },
      { name: 'Nazeer Ahmed Shaik', party: 'INC', votes: 1863 },
      { name: 'NOTA', party: 'NOTA', votes: 1459 }
    ]},
  { year: 2024, isBy: 0, electors: 265154, votesPolled: 190527, turnoutPct: 65.27,
    candidates: [
      { name: 'Reddeppagari Madhavi Reddy', party: 'TDP', votes: 90988 },
      { name: 'Amzath Basha Shaik Bepari', party: 'YSRCP', votes: 72128 },
      { name: 'Tumman Kalyal Afzal Ali Khan', party: 'INC', votes: 24500 },
      { name: 'NOTA', party: 'NOTA', votes: 1444 }
    ]}
];

function needsParty(abbr) {
  if (partyIds[abbr]) return;
  partyIds[abbr] = lastId(run(`INSERT INTO parties (name, abbr, color_hex) VALUES (?, ?, ?)`, [abbr, abbr, partyColors[abbr] || '#888780']));
}
needsParty('JSP');

function seedElections(targetAcId, electionsData) {
  for (const el of electionsData) {
    run(`INSERT OR IGNORE INTO elections (election_type, year, is_by_election) VALUES ('AC', ?, ?)`, [el.year, el.isBy]);
    const electionId = one(`SELECT id FROM elections WHERE election_type='AC' AND year=? AND is_by_election=?`, [el.year, el.isBy]).id;

    const totalVotes = el.candidates.reduce((s, c) => s + c.votes, 0);
    const sorted = [...el.candidates].sort((a, b) => b.votes - a.votes);
    const winnerVotes = sorted[0].votes;
    const runnerUpVotes = sorted[1] ? sorted[1].votes : 0;

    for (const c of el.candidates) {
      const candId = lastId(run(`INSERT INTO candidates (name) VALUES (?)`, [c.name]));
      const sharePct = Math.round((c.votes / totalVotes) * 10000) / 100;
      const isWinner = c.votes === winnerVotes ? 1 : 0;
      run(
        `INSERT INTO results (admin_unit_id, election_id, candidate_id, party_id, votes, vote_share_pct, is_winner)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [targetAcId, electionId, candId, partyIds[c.party], c.votes, sharePct, isWinner]
      );
    }

    run(
      `INSERT INTO turnout (admin_unit_id, election_id, electors, votes_polled, turnout_pct) VALUES (?, ?, ?, ?, ?)`,
      [targetAcId, electionId, el.electors, el.votesPolled, el.turnoutPct]
    );

    const marginPct = Math.round(((winnerVotes - runnerUpVotes) / totalVotes) * 10000) / 100;
    const winnerParty = sorted[0].party;
    let classification;
    if (marginPct >= 15) classification = 'STRONGHOLD';
    else if (marginPct >= 5) classification = 'SWING';
    else classification = 'WEAK';

    run(
      `INSERT INTO area_classification (admin_unit_id, election_id, party_id, classification, margin_pct) VALUES (?, ?, ?, ?, ?)`,
      [targetAcId, electionId, partyIds[winnerParty], classification, marginPct]
    );
  }
}

seedElections(badvelId, badvelElections);
seedElections(kadapaId, kadapaElections);

run(
  `INSERT INTO demographics (admin_unit_id, census_year, population, rural_pct, sc_pct, st_pct) VALUES (?, 2011, 274179, 74.24, 21.73, 1.8)`,
  [badvelId]
);

console.log(`Attached full election history (2004-2024) + mandals to Badvel (AC 124, id=${badvelId}) and Kadapa (AC 126, id=${kadapaId}).`);
console.log('Everything else: structural only (district, PC, reservation) — no results, no mandals below AC yet.');
db.close();
