-- PostgreSQL schema for the authentication app
-- Run this once to create (or migrate) the users table

CREATE TABLE IF NOT EXISTS users (
    id                      SERIAL          PRIMARY KEY,

    -- Basic Info
    name                    VARCHAR(50)     NOT NULL
                                            CHECK (char_length(name) >= 3),
    email                   VARCHAR(255)    NOT NULL UNIQUE
                                            CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    password                VARCHAR(255),                        -- NULL for OAuth users

    -- Profile
    avatar                  TEXT            DEFAULT '',

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
    auth_provider           VARCHAR(10)     NOT NULL DEFAULT 'local'
                                            CHECK (auth_provider IN ('local', 'google')),

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
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar                  TEXT DEFAULT '';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS role                    VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin'));
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_otp              VARCHAR(255);
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_otp_expire_at    TIMESTAMPTZ;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_otp_attempts     INT NOT NULL DEFAULT 0;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_otp_last_sent_at TIMESTAMPTZ;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_otp_locked_until TIMESTAMPTZ;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp               VARCHAR(10);
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_expire_at     TIMESTAMPTZ;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login              TIMESTAMPTZ;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts          INT NOT NULL DEFAULT 0;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS lock_until              TIMESTAMPTZ;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS phone                   VARCHAR(20) DEFAULT '';

-- ─── Fix: convert OTP timing columns from BIGINT (epoch ms) → TIMESTAMPTZ ──
-- Run these if your table was created with BIGINT for OTP columns.
-- The USING clause converts epoch-milliseconds to a proper timestamp.
ALTER TABLE users
    ALTER COLUMN verify_otp_expire_at    TYPE TIMESTAMPTZ USING to_timestamp(verify_otp_expire_at    / 1000.0),
    ALTER COLUMN verify_otp_last_sent_at TYPE TIMESTAMPTZ USING to_timestamp(verify_otp_last_sent_at / 1000.0),
    ALTER COLUMN verify_otp_locked_until TYPE TIMESTAMPTZ USING to_timestamp(verify_otp_locked_until / 1000.0),
    ALTER COLUMN reset_otp_expire_at     TYPE TIMESTAMPTZ USING to_timestamp(reset_otp_expire_at     / 1000.0);
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider           VARCHAR(10) NOT NULL DEFAULT 'local' CHECK (auth_provider IN ('local','google'));
