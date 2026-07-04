-- SQLite mirror of schema/schema.sql (Postgres), for local dev/demo.
-- Types simplified (INTEGER/TEXT/REAL) since SQLite is dynamically typed;
-- table/column names and relationships are identical to the Postgres schema
-- so the API layer and query logic transfer directly to a real Postgres deploy.

CREATE TABLE admin_units (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id       INTEGER REFERENCES admin_units(id),
    level           TEXT NOT NULL,
    name            TEXT NOT NULL,
    code            TEXT,
    reservation     TEXT,
    delimitation_year INTEGER DEFAULT 2008,
    lok_sabha_pc_id INTEGER REFERENCES admin_units(id)
);

CREATE TABLE parties (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    abbr        TEXT NOT NULL UNIQUE,
    color_hex   TEXT
);

CREATE TABLE elections (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    election_type TEXT NOT NULL,
    year        INTEGER NOT NULL,
    is_by_election INTEGER DEFAULT 0,
    poll_date   TEXT,
    UNIQUE(election_type, year, is_by_election)
);

CREATE TABLE candidates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    gender      TEXT,
    education   TEXT,
    assets_inr  INTEGER,
    criminal_cases INTEGER
);

CREATE TABLE results (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_unit_id   INTEGER NOT NULL REFERENCES admin_units(id),
    election_id     INTEGER NOT NULL REFERENCES elections(id),
    candidate_id    INTEGER NOT NULL REFERENCES candidates(id),
    party_id        INTEGER REFERENCES parties(id),
    votes           INTEGER,
    vote_share_pct  REAL,
    is_winner       INTEGER DEFAULT 0,
    UNIQUE(admin_unit_id, election_id, candidate_id)
);

CREATE TABLE turnout (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_unit_id   INTEGER NOT NULL REFERENCES admin_units(id),
    election_id     INTEGER NOT NULL REFERENCES elections(id),
    electors        INTEGER,
    votes_polled    INTEGER,
    turnout_pct     REAL,
    UNIQUE(admin_unit_id, election_id)
);

CREATE TABLE demographics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_unit_id   INTEGER NOT NULL REFERENCES admin_units(id),
    census_year     INTEGER NOT NULL,
    population      INTEGER,
    rural_pct       REAL,
    sc_pct          REAL,
    st_pct          REAL,
    literacy_pct    REAL,
    UNIQUE(admin_unit_id, census_year)
);

CREATE TABLE area_classification (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_unit_id   INTEGER NOT NULL REFERENCES admin_units(id),
    election_id     INTEGER NOT NULL REFERENCES elections(id),
    party_id        INTEGER REFERENCES parties(id),
    classification  TEXT,
    margin_pct      REAL,
    UNIQUE(admin_unit_id, election_id, party_id)
);
