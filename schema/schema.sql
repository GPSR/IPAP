-- Indian Political Analytics Platform — foundation schema (Postgres)
-- Hierarchy: State -> PC -> AC -> Mandal -> Village -> Booth
-- All levels live in one self-referencing table so the same queries
-- work regardless of how many levels a given state/constituency has.

CREATE TABLE admin_units (
    id              SERIAL PRIMARY KEY,
    parent_id       INTEGER REFERENCES admin_units(id),
    level           VARCHAR(20) NOT NULL CHECK (level IN
                        ('STATE','DISTRICT','PC','AC','MANDAL','VILLAGE','BOOTH')),
    name            VARCHAR(200) NOT NULL,
    code            VARCHAR(50),          -- ECI/Census code where available
    reservation     VARCHAR(10),          -- NULL, 'SC', 'ST' (AC level)
    delimitation_year INTEGER DEFAULT 2008,
    lok_sabha_pc_id INTEGER REFERENCES admin_units(id), -- AC -> its parent PC, set explicitly since PCs and ACs both roll up to STATE, not to each other, in a strict tree
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_admin_units_parent ON admin_units(parent_id);
CREATE INDEX idx_admin_units_level ON admin_units(level);
CREATE INDEX idx_admin_units_name ON admin_units(name);

CREATE TABLE parties (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    abbr        VARCHAR(20) NOT NULL UNIQUE,   -- YSRCP, TDP, BJP, INC, JSP...
    color_hex   VARCHAR(7)                     -- for consistent chart coloring
);

CREATE TABLE elections (
    id          SERIAL PRIMARY KEY,
    election_type VARCHAR(10) NOT NULL CHECK (election_type IN ('AC','LS')),
    year        INTEGER NOT NULL,
    is_by_election BOOLEAN DEFAULT FALSE,
    poll_date   DATE,
    UNIQUE(election_type, year, is_by_election)
);

CREATE TABLE candidates (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    gender      VARCHAR(10),
    -- affidavit fields (MyNeta/ADR sourced), nullable until ingested
    education   VARCHAR(200),
    assets_inr  BIGINT,
    criminal_cases INTEGER
);

-- One row per candidate per admin_unit (typically AC-level) per election.
-- Booth-level rows use the same table so AC totals can be derived by
-- summing booth rows, or ingested directly from ECI Form 20 as AC totals.
CREATE TABLE results (
    id              SERIAL PRIMARY KEY,
    admin_unit_id   INTEGER NOT NULL REFERENCES admin_units(id),
    election_id     INTEGER NOT NULL REFERENCES elections(id),
    candidate_id    INTEGER NOT NULL REFERENCES candidates(id),
    party_id        INTEGER REFERENCES parties(id),  -- NULL for independents grouped as IND
    votes           INTEGER,        -- nullable: NULL means "known winner, vote count not yet sourced"
    vote_share_pct  NUMERIC(5,2),   -- NULL under the same condition, never fabricated
    is_winner       BOOLEAN DEFAULT FALSE,
    UNIQUE(admin_unit_id, election_id, candidate_id)
);
CREATE INDEX idx_results_admin_election ON results(admin_unit_id, election_id);
CREATE INDEX idx_results_party ON results(party_id);

-- Turnout is stored once per admin_unit/election rather than derived from
-- summed candidate votes, because electors and NOTA/rejected votes matter
-- for turnout % independent of who the candidates were.
CREATE TABLE turnout (
    id              SERIAL PRIMARY KEY,
    admin_unit_id   INTEGER NOT NULL REFERENCES admin_units(id),
    election_id     INTEGER NOT NULL REFERENCES elections(id),
    electors        INTEGER,
    votes_polled    INTEGER,
    turnout_pct     NUMERIC(5,2),
    UNIQUE(admin_unit_id, election_id)
);

-- Aggregate, area-level only — never linked to individual voters.
-- Sourced from Census village directory, not electoral rolls.
CREATE TABLE demographics (
    id              SERIAL PRIMARY KEY,
    admin_unit_id   INTEGER NOT NULL REFERENCES admin_units(id),
    census_year     INTEGER NOT NULL,
    population      INTEGER,
    rural_pct       NUMERIC(5,2),
    sc_pct          NUMERIC(5,2),
    st_pct          NUMERIC(5,2),
    literacy_pct    NUMERIC(5,2),
    UNIQUE(admin_unit_id, census_year)
);

-- Derived classification (stronghold / swing / weak) per admin_unit per
-- election, computed by the analytics layer, not entered by hand — kept
-- as its own table so the classification rule can change without
-- touching raw results.
CREATE TABLE area_classification (
    id              SERIAL PRIMARY KEY,
    admin_unit_id   INTEGER NOT NULL REFERENCES admin_units(id),
    election_id     INTEGER NOT NULL REFERENCES elections(id),
    party_id        INTEGER REFERENCES parties(id),      -- party being classified against
    classification  VARCHAR(20) CHECK (classification IN ('STRONGHOLD','SWING','WEAK')),
    margin_pct      NUMERIC(5,2),
    UNIQUE(admin_unit_id, election_id, party_id)
);
