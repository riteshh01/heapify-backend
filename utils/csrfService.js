/**
 * csrfService.js
 *
 * CSRF protection utilities for the Double Submit Cookie Pattern.
 *
 * How it works:
 *   1. On login / token rotation → generateCsrfToken() is called.
 *   2. A cryptographically random token is set in a non-httpOnly cookie
 *      ("csrfToken") so the frontend JavaScript can read it.
 *   3. For every state-changing request (POST, PUT, PATCH, DELETE) the
 *      frontend reads that cookie and sends the value in X-CSRF-Token header.
 *   4. The csrfProtection middleware compares cookie value vs. header value.
 *      If they don't match → 403 Forbidden.
 *
 * Why this is safe:
 *   - A malicious third-party site can trigger a credentialed request (sending
 *     the httpOnly auth cookies), but it CANNOT read the csrfToken cookie
 *     (different origin) and therefore cannot supply the matching header.
 *   - The token is regenerated on every login / refresh rotation, limiting
 *     the window of a stolen CSRF token.
 */

import crypto from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

/** 32 random bytes → 64-char hex string. Entropy: 256 bits. */
const CSRF_TOKEN_BYTES = 32;

// ─── Token generation ─────────────────────────────────────────────────────────

/**
 * Generate a secure random CSRF token string.
 * @returns {string} 64-character hex token
 */
export function generateCsrfToken() {
    return crypto.randomBytes(CSRF_TOKEN_BYTES).toString("hex");
}

// ─── Cookie attachment ────────────────────────────────────────────────────────

/**
 * Build the options object for the CSRF cookie.
 *
 * Key differences from the auth cookies:
 *   - httpOnly: FALSE  → JS must be able to read this value
 *   - sameSite: "strict" in dev, "none" in prod (mirrors auth cookies so
 *               cross-origin frontends can still read it)
 *
 * @param {number} maxAgeSeconds
 */
function csrfCookieOptions(maxAgeSeconds) {
    return {
        httpOnly: false,                                           // must be readable by JS
        secure:   process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        maxAge:   maxAgeSeconds * 1000,
    };
}

/**
 * Attach a fresh CSRF token cookie to the response.
 * Lifetime mirrors the refresh-token lifetime so the cookie stays valid as
 * long as the session is valid.
 *
 * @param {object} res           - Express response object
 * @param {number} maxAgeSeconds - Lifetime that matches the refresh token
 * @returns {string}             - The generated token (for tests / logging)
 */
export function attachCsrfCookie(res, maxAgeSeconds) {
    const token = generateCsrfToken();
    res.cookie("csrfToken", token, csrfCookieOptions(maxAgeSeconds));
    return token;
}

/**
 * Clear the CSRF cookie from the browser (call on logout / session revocation).
 * Options MUST match those used when setting the cookie or some browsers will
 * refuse to clear it.
 */
export function clearCsrfCookie(res) {
    res.clearCookie("csrfToken", {
        httpOnly: false,
        secure:   process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    });
}
