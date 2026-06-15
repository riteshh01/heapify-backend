/**
 * csrfProtection.js
 *
 * Express middleware implementing the Double Submit Cookie Pattern for CSRF
 * protection.
 *
 * Validation logic:
 *   1. Skip safe HTTP methods (GET, HEAD, OPTIONS) — they are read-only.
 *   2. For state-changing methods (POST, PUT, PATCH, DELETE):
 *      a. Read `req.cookies.csrfToken` (set as a non-httpOnly cookie by the
 *         server on login / token rotation).
 *      b. Read `req.headers["x-csrf-token"]` (sent by the frontend JS).
 *      c. If either is missing OR they don't match → respond 403 Forbidden.
 *      d. Comparison uses `timingSafeEqual` to prevent timing-based attacks.
 *
 * Why timing-safe comparison matters:
 *   A naive string equality (`===`) can leak information through timing
 *   differences when strings differ early vs. late. `crypto.timingSafeEqual`
 *   always takes the same amount of time regardless of where the strings
 *   diverge.
 */

import crypto from "crypto";

/** HTTP methods that do NOT mutate state — CSRF validation is skipped. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * csrfProtection middleware
 *
 * Attach to any route (or router) that handles state-changing operations.
 *
 * @example
 * // Single route
 * router.post("/some-action", userAuth, csrfProtection, handler);
 *
 * // Entire router (GET calls pass through automatically)
 * router.use(csrfProtection);
 */
const csrfProtection = (req, res, next) => {
    // 1. Safe methods are exempt
    if (SAFE_METHODS.has(req.method)) {
        return next();
    }

    const cookieToken  = req.cookies?.csrfToken;
    const headerToken  = req.headers["x-csrf-token"];

    // 2. Both values must be present
    if (!cookieToken || !headerToken) {
        return res.status(403).json({
            success: false,
            code:    "CSRF_MISSING",
            message: "CSRF token missing",
        });
    }

    // 3. Tokens must be the same length before byte-level comparison
    //    (timingSafeEqual throws if buffers differ in length)
    if (cookieToken.length !== headerToken.length) {
        return res.status(403).json({
            success: false,
            code:    "CSRF_INVALID",
            message: "CSRF token invalid",
        });
    }

    // 4. Constant-time comparison — prevents timing oracle attacks
    try {
        const cookieBuf = Buffer.from(cookieToken,  "utf8");
        const headerBuf = Buffer.from(headerToken, "utf8");

        if (!crypto.timingSafeEqual(cookieBuf, headerBuf)) {
            return res.status(403).json({
                success: false,
                code:    "CSRF_INVALID",
                message: "CSRF token invalid",
            });
        }
    } catch {
        // Defensive: timingSafeEqual can throw on unexpected input
        return res.status(403).json({
            success: false,
            code:    "CSRF_INVALID",
            message: "CSRF token invalid",
        });
    }

    // 5. All checks passed
    next();
};

export default csrfProtection;
