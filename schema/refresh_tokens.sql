-- ─── Refresh Tokens Table ────────────────────────────────────────────────────
-- Each row represents one active session (one login on one device).
-- Tokens are stored HASHED (SHA-256) so a DB breach doesn't expose raw tokens.
-- Rows are deleted on logout or rotation, and cascade-deleted when the user
-- is deleted.
--
-- Run this once against your live DB before deploying the refresh-token backend.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          SERIAL          PRIMARY KEY,
    user_id     INT             NOT NULL
                                REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64)     NOT NULL UNIQUE,   -- SHA-256 hex (64 chars)
    expires_at  TIMESTAMPTZ     NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Fast lookup by user (e.g. "revoke all sessions for user X")
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
    ON refresh_tokens (user_id);

-- Fast lookup by hash on every /refresh call
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash
    ON refresh_tokens (token_hash);
