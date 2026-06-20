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

    UNIQUE(user_id, problem_id)
);


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