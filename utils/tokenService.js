/**
 * tokenService.js
 *
 * Centralises all access-token + refresh-token lifecycle operations:
 *   - generateTokens  → issue both cookies + persist hashed refresh token in DB
 *   - rotateRefreshToken → atomic delete-old / insert-new (prevents replay)
 *   - revokeRefreshToken → single-session logout
 *   - revokeAllUserTokens → "logout from all devices"
 *   - hashToken → deterministic SHA-256 hex used for DB storage
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";
import pool from "../config/db.js";

// ─── Lifetimes ────────────────────────────────────────────────────────────────
const ACCESS_TOKEN_EXPIRY_SECONDS  = 15 * 60;              // 15 minutes
const REFRESH_TOKEN_EXPIRY_DEFAULT = 7  * 24 * 60 * 60;   // 7 days
const REFRESH_TOKEN_EXPIRY_LONG    = 30 * 24 * 60 * 60;   // 30 days ("Remember Me")

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deterministic SHA-256 hex of a raw token string.
 * We never store the raw refresh token in the DB.
 */
export function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Cookie options shared by both token types.
 * httpOnly → JS cannot read the value (prevents XSS theft).
 * secure   → HTTPS-only in production.
 * sameSite → "strict" in dev (same-origin), "none" in prod (cross-origin possible).
 */
function cookieOptions(maxAgeSeconds) {
    return {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        maxAge:   maxAgeSeconds * 1000, // express uses milliseconds
    };
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * generateTokens
 *
 * Issues an accessToken + refreshToken, sets both as httpOnly cookies on `res`,
 * and persists the hashed refresh token in the `refresh_tokens` table.
 *
 * @param {object} res        - Express response object
 * @param {{ id, email }}     - Minimal user payload for JWT
 * @param {boolean} rememberMe - If true, refresh token lives for 30 days
 */
export async function generateTokens(res, user, rememberMe = false) {
    // 1. Access token (short-lived JWT)
    const accessToken = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS }
    );

    // 2. Refresh token (opaque random bytes — NOT a JWT)
    const refreshTokenRaw = crypto.randomBytes(64).toString("hex");
    const refreshExpiry   = rememberMe
        ? REFRESH_TOKEN_EXPIRY_LONG
        : REFRESH_TOKEN_EXPIRY_DEFAULT;

    // 3. Persist hashed refresh token to DB
    const tokenHash  = hashToken(refreshTokenRaw);
    const expiresAt  = new Date(Date.now() + refreshExpiry * 1000);

    await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
    );

    // 4. Set cookies — JS cannot read these
    res.cookie("accessToken",  accessToken,    cookieOptions(ACCESS_TOKEN_EXPIRY_SECONDS));
    res.cookie("refreshToken", refreshTokenRaw, cookieOptions(refreshExpiry));
}

/**
 * rotateRefreshToken
 *
 * Atomically deletes the old refresh token and inserts a new one.
 * This prevents replay attacks — each refresh token can only be used once.
 *
 * Returns { accessToken, refreshTokenRaw } and sets new cookies.
 *
 * @param {object} res
 * @param {string} oldTokenHash  - SHA-256 hash of the consumed refresh token
 * @param {{ id, email }}        - User whose tokens are being rotated
 * @param {boolean} rememberMe   - Preserve long expiry on rotation
 */
export async function rotateRefreshToken(res, oldTokenHash, user, rememberMe = false) {
    // 1. Delete the old token (atomic — if already deleted, treat as replay)
    const del = await pool.query(
        `DELETE FROM refresh_tokens
         WHERE token_hash = $1 AND user_id = $2
         RETURNING expires_at`,
        [oldTokenHash, user.id]
    );

    if (del.rowCount === 0) {
        throw new Error("Refresh token not found or already used");
    }

    // 2. Issue a fresh pair
    await generateTokens(res, user, rememberMe);
}

/**
 * revokeRefreshToken
 *
 * Deletes a single refresh token row (single-session logout).
 *
 * @param {string} tokenHash - SHA-256 hash of the token to revoke
 */
export async function revokeRefreshToken(tokenHash) {
    await pool.query(
        `DELETE FROM refresh_tokens WHERE token_hash = $1`,
        [tokenHash]
    );
}

/**
 * revokeAllUserTokens
 *
 * Deletes ALL refresh tokens for a user ("logout from all devices").
 *
 * @param {number} userId
 */
export async function revokeAllUserTokens(userId) {
    await pool.query(
        `DELETE FROM refresh_tokens WHERE user_id = $1`,
        [userId]
    );
}

/**
 * clearAuthCookies
 *
 * Clears both httpOnly auth cookies from the browser.
 * Must match the same options used when setting them.
 */
export function clearAuthCookies(res) {
    const opts = {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    };
    res.clearCookie("accessToken",  opts);
    res.clearCookie("refreshToken", opts);
}
