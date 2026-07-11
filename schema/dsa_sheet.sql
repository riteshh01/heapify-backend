-- DSA TOPICS
-- Example: Arrays, Graphs, Two Pointers, Sliding Window


CREATE TABLE IF NOT EXISTS dsa_topics (

    id              SERIAL PRIMARY KEY,

    name            VARCHAR(100) NOT NULL,

    description     TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- DSA PATTERNS / SUBTOPICS
-- Example: Opposite End Pointers, BFS, Merge Style

CREATE TABLE IF NOT EXISTS dsa_patterns (

    id              SERIAL PRIMARY KEY,

    topic_id        INT NOT NULL
                    REFERENCES dsa_topics(id)
                    ON DELETE CASCADE,

    name            VARCHAR(100) NOT NULL,

    description     TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- DSA PROBLEMS

CREATE TABLE IF NOT EXISTS dsa_problems (

    id                  SERIAL PRIMARY KEY,

    pattern_id          INT
                        REFERENCES dsa_patterns(id)
                        ON DELETE CASCADE,

    title               VARCHAR(255) NOT NULL,

    difficulty          VARCHAR(20)
                        CHECK (difficulty IN ('easy', 'medium', 'hard')),

    type                VARCHAR(50) DEFAULT 'problem',

    problem_link        TEXT,

    youtube_link        TEXT,

    article_link        TEXT,

    notes               TEXT,

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- DSA USER PROBLEM STATUS
-- Tracks per-user progress
-- ============================================================================

CREATE TABLE IF NOT EXISTS dsa_user_problem_status (

    id                  SERIAL PRIMARY KEY,

    user_id             INT NOT NULL
                        REFERENCES users(id)
                        ON DELETE CASCADE,

    problem_id          INT NOT NULL
                        REFERENCES dsa_problems(id)
                        ON DELETE CASCADE,

    completed           BOOLEAN DEFAULT FALSE,

    revised             BOOLEAN DEFAULT FALSE,

    bookmarked          BOOLEAN DEFAULT FALSE,

    attempts            INT DEFAULT 0,

    last_solved_at      TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    user_note           TEXT DEFAULT '',

    UNIQUE(user_id, problem_id)
);

-- Migration: add user_note column if upgrading from an older schema
-- ALTER TABLE dsa_user_problem_status ADD COLUMN IF NOT EXISTS user_note TEXT DEFAULT '';


CREATE TABLE IF NOT EXISTS tags (

    id              SERIAL PRIMARY KEY,

    name            VARCHAR(100) UNIQUE NOT NULL
);


CREATE TABLE IF NOT EXISTS problem_tags (

    problem_id      INT NOT NULL
                    REFERENCES dsa_problems(id)
                    ON DELETE CASCADE,

    tag_id          INT NOT NULL
                    REFERENCES tags(id)
                    ON DELETE CASCADE,

    PRIMARY KEY(problem_id, tag_id)
);

-- ALTER TABLE tags ADD COLUMN tag_type VARCHAR(20);
ALTER TABLE dsa_problems DROP COLUMN IF EXISTS company_tag;


-- ============================================================================
-- MIGRATION: Extend DSA schema to support
--   1) A curated "DSA Sheet" (~500 problems) vs a large problem bank (2000+)
--   2) Company-wise browsing with frequency data (30d / 3m / 6m / all-time)
--   3) Topic-wise, difficulty-wise, company-wise flexible filtering
--
-- SAFE / ADDITIVE: does not modify or drop any existing table or column.
-- Your existing dsa_topics, dsa_patterns, dsa_problems, dsa_user_problem_status,
-- tags, problem_tags tables and data are untouched.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. COMPANIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    slug            VARCHAR(150) UNIQUE NOT NULL,   -- e.g. 'google', 'amazon'
    logo_url        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);


-- ----------------------------------------------------------------------------
-- 2. EXTEND dsa_problems (additive only)
--    - slug: stable identity per LeetCode problem, used to dedupe on import
--    - source: distinguishes hand-curated vs bulk-imported problems
-- ----------------------------------------------------------------------------
ALTER TABLE dsa_problems ADD COLUMN IF NOT EXISTS slug   VARCHAR(255);
ALTER TABLE dsa_problems ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'manual';
-- source values: 'manual' (your original 500) | 'company_repo' (bulk import)

-- Partial unique index: enforce uniqueness only where slug is set,
-- so existing rows with NULL slug aren't affected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dsa_problems_slug
    ON dsa_problems(slug)
    WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dsa_problems_difficulty ON dsa_problems(difficulty);
CREATE INDEX IF NOT EXISTS idx_dsa_problems_pattern ON dsa_problems(pattern_id);


-- ----------------------------------------------------------------------------
-- 3. COMPANY <-> PROBLEM FREQUENCY STATS
--    One row per (problem, company, time_window) — matches the repo's
--    30 Days / 3 Months / 6 Months / More Than 6 Months / All CSVs.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE time_period_enum AS ENUM (
        'thirty_days',
        'three_months',
        'six_months',
        'more_than_six_months',
        'all_time'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL; -- safe to re-run
END $$;

CREATE TABLE IF NOT EXISTS problem_company_stats (
    id                  SERIAL PRIMARY KEY,

    problem_id          INT NOT NULL
                        REFERENCES dsa_problems(id)
                        ON DELETE CASCADE,

    company_id          INT NOT NULL
                        REFERENCES companies(id)
                        ON DELETE CASCADE,

    time_period         time_period_enum NOT NULL,

    frequency           NUMERIC(6,2),      -- as given by the repo (0-100 scale)
    acceptance_rate     NUMERIC(5,2),

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(problem_id, company_id, time_period)
);

CREATE INDEX IF NOT EXISTS idx_pcs_company        ON problem_company_stats(company_id);
CREATE INDEX IF NOT EXISTS idx_pcs_problem        ON problem_company_stats(problem_id);
CREATE INDEX IF NOT EXISTS idx_pcs_company_period ON problem_company_stats(company_id, time_period);


-- ----------------------------------------------------------------------------
-- 4. SHEETS (collections) — flexible container concept
--    "DSA Sheet" is just one row here. You can add "Blind 75",
--    "NeetCode 150", "Company Special" etc. later with zero schema change.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sheets (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    slug            VARCHAR(150) UNIQUE NOT NULL,
    description     TEXT,
    is_curated      BOOLEAN DEFAULT TRUE,   -- true = handpicked sheet, false = auto-generated
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sheet_problems (
    sheet_id        INT NOT NULL
                    REFERENCES sheets(id)
                    ON DELETE CASCADE,

    problem_id      INT NOT NULL
                    REFERENCES dsa_problems(id)
                    ON DELETE CASCADE,

    position        INT,                    -- ordering within the sheet, nullable
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY(sheet_id, problem_id)
);

CREATE INDEX IF NOT EXISTS idx_sheet_problems_problem ON sheet_problems(problem_id);


-- ----------------------------------------------------------------------------
-- 5. SEED: register your existing curated set as the "DSA Sheet"
--    Adjust the WHERE clause below to however you currently identify
--    your original ~500 curated problems (e.g. pattern_id IS NOT NULL,
--    or source = 'manual', or an explicit id list).
-- ----------------------------------------------------------------------------
INSERT INTO sheets (name, slug, description, is_curated)
VALUES ('DSA Sheet', 'dsa-sheet', 'Curated set of handpicked DSA problems', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Backfill: existing manually-added problems -> DSA Sheet
INSERT INTO sheet_problems (sheet_id, problem_id, position)
SELECT
    (SELECT id FROM sheets WHERE slug = 'dsa-sheet'),
    p.id,
    ROW_NUMBER() OVER (ORDER BY p.id)
FROM dsa_problems p
WHERE p.source = 'manual' OR p.source IS NULL
ON CONFLICT DO NOTHING;
