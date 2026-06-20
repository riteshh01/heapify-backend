

CREATE TABLE IF NOT EXISTS theory_subjects (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL UNIQUE,
    description      TEXT,
    icon             VARCHAR(255), 
    created_at       TIMESTAMPTZ DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS theory_chapters (

    id                  SERIAL PRIMARY KEY,
    subject_id          INT NOT NULL REFERENCES theory_subjects(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    sequence_order      INT DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS theory_articles (

    id                  SERIAL PRIMARY KEY,

    chapter_id          INT NOT NULL
                        REFERENCES theory_chapters(id)
                        ON DELETE CASCADE,

    title               VARCHAR(255) NOT NULL,

    cover_image         TEXT,

    content             TEXT NOT NULL,

    video_link          TEXT,

    read_time_minutes   INT DEFAULT 5,

    is_premium          BOOLEAN DEFAULT FALSE,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS theory_articles_set_updated_at ON theory_articles;

CREATE TRIGGER theory_articles_set_updated_at
BEFORE UPDATE ON theory_articles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS theory_article_images (

    id                  SERIAL PRIMARY KEY,

    article_id          INT NOT NULL
                        REFERENCES theory_articles(id)
                        ON DELETE CASCADE,

    image_url           TEXT NOT NULL,

    caption             VARCHAR(255),

    created_at          TIMESTAMPTZ DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS user_theory_progress (

    id                  SERIAL PRIMARY KEY,

    user_id             INT NOT NULL
                        REFERENCES users(id)
                        ON DELETE CASCADE,

    article_id          INT NOT NULL
                        REFERENCES theory_articles(id)
                        ON DELETE CASCADE,

    is_completed        BOOLEAN DEFAULT FALSE,

    is_bookmarked       BOOLEAN DEFAULT FALSE,

    last_read_at        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, article_id)
);


DROP TRIGGER IF EXISTS theory_progress_set_updated_at
ON user_theory_progress;

CREATE TRIGGER theory_progress_set_updated_at
BEFORE UPDATE ON user_theory_progress
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS user_theory_notes (

    id                  SERIAL PRIMARY KEY,

    user_id             INT NOT NULL
                        REFERENCES users(id)
                        ON DELETE CASCADE,

    article_id          INT NOT NULL
                        REFERENCES theory_articles(id)
                        ON DELETE CASCADE,

    content             TEXT NOT NULL,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    updated_at          TIMESTAMPTZ DEFAULT NOW()
);


DROP TRIGGER IF EXISTS theory_notes_set_updated_at
ON user_theory_notes;

CREATE TRIGGER theory_notes_set_updated_at
BEFORE UPDATE ON user_theory_notes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();




CREATE TABLE IF NOT EXISTS user_stats (

    user_id             INT PRIMARY KEY
                        REFERENCES users(id)
                        ON DELETE CASCADE,

    easy_solved         INT DEFAULT 0,

    medium_solved       INT DEFAULT 0,

    hard_solved         INT DEFAULT 0,

    total_score         INT DEFAULT 0,

    articles_read       INT DEFAULT 0,

    theory_score        INT DEFAULT 0,

    last_activity_at    TIMESTAMPTZ
);



CREATE INDEX IF NOT EXISTS idx_theory_chapters_subject
ON theory_chapters(subject_id);

CREATE INDEX IF NOT EXISTS idx_theory_articles_chapter
ON theory_articles(chapter_id);

CREATE INDEX IF NOT EXISTS idx_theory_progress_user
ON user_theory_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_theory_notes_user
ON user_theory_notes(user_id);