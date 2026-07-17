-- PostgreSQL schema for the authentication app
-- Run this once to create (or migrate) the users table
--
-- Live DB column notes:
--   auth_method  = 'local' | 'google'   (live DB uses auth_method, not auth_provider)
--   picture      = Google profile picture URL (set on OAuth signup)
--   avatar       = user-uploaded avatar (separate field)

CREATE TABLE IF NOT EXISTS users (
    id                      SERIAL          PRIMARY KEY,

    -- Basic Info
    name                    VARCHAR(50)     NOT NULL
                                            CHECK (char_length(name) >= 3),
    email                   VARCHAR(255)    NOT NULL UNIQUE
                                            CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

    -- Password: NULL is allowed only for OAuth (Google) users.
    -- Enforced by the DB-level constraint below: chk_password_required_for_local
    password                VARCHAR(255),

    -- Auth method
    auth_method             VARCHAR(10)     NOT NULL DEFAULT 'local'
                                            CHECK (auth_method IN ('local', 'google')),

    -- ─── DB-level password enforcement ────────────────────────────────────
    -- local  → password MUST be set (NOT NULL)
    -- google → password may be NULL (user authenticated via OAuth, never set a password)
    --          or non-NULL if the user later adds a local password
    CONSTRAINT chk_password_required_for_local
        CHECK (
            (auth_method = 'local'  AND password IS NOT NULL) OR
            (auth_method = 'google')
        ),
    -- ──────────────────────────────────────────────────────────────────────

    -- Profile
    avatar                  TEXT            DEFAULT '',   -- user-uploaded avatar (deprecated, use avatar_url)
    avatar_url              TEXT            DEFAULT '',   -- Profile picture URL (Cloudinary or Google)
    avatar_public_id        TEXT,                         -- Cloudinary public ID for deletion
    google_id               VARCHAR(255)    UNIQUE,       -- NULL for local users

    -- Role-Based Access
    role                    VARCHAR(10)     NOT NULL DEFAULT 'user'
                                            CHECK (role IN ('user', 'admin')),

    -- Account Status
    is_account_verified     BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Email-Verification OTP  (hashed, managed by otpService.js)
    verify_otp              VARCHAR(255),
    verify_otp_expire_at    TIMESTAMPTZ,
    verify_otp_attempts     INT             NOT NULL DEFAULT 0,
    verify_otp_last_sent_at TIMESTAMPTZ,
    verify_otp_locked_until TIMESTAMPTZ,

    -- Password-Reset OTP  (plain text, short-lived)
    reset_otp               VARCHAR(10),
    reset_otp_expire_at     TIMESTAMPTZ,

    -- Security
    last_login              TIMESTAMPTZ,
    login_attempts          INT             NOT NULL DEFAULT 0,
    lock_until              TIMESTAMPTZ,

    -- Optional Extra Fields
    phone                   VARCHAR(20)     DEFAULT '',

    -- Timestamps  (equivalent to Mongoose { timestamps: true })
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Automatically keep updated_at in sync on every row update
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ─── Migration: add new columns to an existing table ────────────────────────
-- [APPLIED 2026-06-15] avatar column added to live DB
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar   TEXT DEFAULT '';
-- [APPLIED 2026-06-16] google_id for OAuth — stores Google's unique "sub" identifier
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
-- [APPLIED 2026-06-16] avatar_url (formerly picture) and avatar_public_id
ALTER TABLE users RENAME COLUMN picture TO avatar_url;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_public_id TEXT;

-- ─── Migration: password enforcement constraint (APPLIED 2026-06-17) ─────────
-- Step 1: Drop column-level NOT NULL — the CHECK constraint becomes the authority.
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

-- Step 2: Add the CHECK constraint (safe to re-run via DO block).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_password_required_for_local'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT chk_password_required_for_local
            CHECK (
                (auth_method = 'local'  AND password IS NOT NULL) OR
                (auth_method = 'google')
            );
    END IF;
END;
$$;
--
-- What this enforces at the DB level:
--   local  → password IS NOT NULL  (bcrypt hash required — INSERT/UPDATE rejected otherwise)
--   google → password may be NULL  (OAuth user, never set a password)
--            or non-NULL           (user later added a local password)

