import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import transporter from "../config/nodemailer.js";
import { generateOtp, verifyOtp } from "../utils/otpService.js";
import {
    generateTokens,
    rotateRefreshToken,
    revokeRefreshToken,
    revokeAllUserTokens,
    clearAuthCookies,
    hashToken,
} from "../utils/tokenService.js";
import { generateState, generateCodeVerifier } from "arctic";
import google from "../config/oauth.js";
import cloudinary from "../config/cloudinary.js";

export const register = async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: "Missing Details" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    if (name.trim().length < 2 || name.trim().length > 50) {
        return res.status(400).json({
            success: false,
            message: "Name must be between 2 and 50 characters",
        });
    }

    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!strongPasswordRegex.test(password)) {
        return res.status(400).json({ success: false, message: "Weak password" });
    }

    try {
        const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ success: false, message: "User Already Exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (name, email, password, auth_method) VALUES ($1, $2, $3, $4) RETURNING id, name, email`,
            [name.trim(), email.toLowerCase(), hashedPassword, "local"]
        );

        const user = result.rows[0];

        const { otp, otpExpiry, otpCooldown, maskedEmail } = await generateOtp(user);

        await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: "Account Verification Code",
            text: `Your verification code is ${otp}. It expires in 2 minutes.`,
        });

        return res.status(200).json({
            success: true,
            data: { otpExpiry, otpCooldown, maskedEmail },
            message: "Verification code sent",
        });

    } catch (error) {
        console.error("Registration Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Registration failed. Please try again.",
        });
    }
};

export const login = async (req, res) => {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email and password are required",
        });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    try {
        const result = await pool.query(
            `SELECT id, name, email, password, is_account_verified
             FROM users
             WHERE email = $1`,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const user = result.rows[0];

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        if (!user.is_account_verified) {
            return res.status(403).json({
                success: false,
                message: "Please verify your email first",
            });
        }

        // Issue both access token (15min) + refresh token (7d / 30d)
        await generateTokens(res, { id: user.id, email: user.email }, !!rememberMe);

        return res.json({ success: true });

    } catch (error) {
        console.error("Login Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Login failed. Please try again",
        });
    }
};

export const logout = async (req, res) => {
    try {
        const { refreshToken } = req.cookies;

        if (refreshToken) {
            // Revoke this specific session from the DB
            await revokeRefreshToken(hashToken(refreshToken));
        }

        clearAuthCookies(res);

        return res.json({ success: true, message: "Logged Out" });
    } catch (error) {
        console.error("Logout Error:", error.message);
        // Still clear cookies even if DB revocation fails
        clearAuthCookies(res);
        return res.json({ success: true, message: "Logged Out" });
    }
};

/**
 * POST /api/auth/refresh
 *
 * Called by the frontend when it receives a 401 (expired access token).
 * Validates the refreshToken cookie against the DB, rotates the token pair,
 * and returns the current user's profile so the frontend can restore state.
 *
 * No userAuth middleware — the access token is intentionally expired here.
 */
export const refresh = async (req, res) => {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
        return res.status(401).json({
            success: false,
            code: "REFRESH_MISSING",
            message: "No refresh token",
        });
    }

    const tokenHash = hashToken(refreshToken);

    try {
        // Look up the token in the DB
        const result = await pool.query(
            `SELECT rt.user_id, rt.expires_at, u.id, u.name, u.email, u.is_account_verified
             FROM refresh_tokens rt
             JOIN users u ON u.id = rt.user_id
             WHERE rt.token_hash = $1`,
            [tokenHash]
        );

        if (result.rows.length === 0) {
            // Token doesn't exist — could be a replay attack or already rotated
            clearAuthCookies(res);
            return res.status(401).json({
                success: false,
                code: "REFRESH_INVALID",
                message: "Invalid or expired refresh token",
            });
        }

        const row = result.rows[0];

        // Check DB-level expiry
        if (new Date(row.expires_at) < new Date()) {
            await revokeRefreshToken(tokenHash);
            clearAuthCookies(res);
            return res.status(401).json({
                success: false,
                code: "REFRESH_EXPIRED",
                message: "Refresh token expired. Please log in again.",
            });
        }

        if (!row.is_account_verified) {
            clearAuthCookies(res);
            return res.status(403).json({
                success: false,
                code: "EMAIL_NOT_VERIFIED",
                message: "Please verify your email",
            });
        }

        // Rotate: delete old token, issue new access + refresh pair
        // Preserve "long" expiry if the existing token expires in > 8 days
        const msRemaining = new Date(row.expires_at) - new Date();
        const rememberMe  = msRemaining > 8 * 24 * 60 * 60 * 1000;

        await rotateRefreshToken(
            res,
            tokenHash,
            { id: row.user_id, email: row.email },
            rememberMe
        );

        return res.json({
            success: true,
            data: {
                user: {
                    id:    row.user_id,
                    name:  row.name,
                    email: row.email,
                },
            },
        });

    } catch (error) {
        console.error("Refresh Error:", error.message);
        clearAuthCookies(res);
        return res.status(401).json({
            success: false,
            code: "REFRESH_FAILED",
            message: "Session expired. Please log in again.",
        });
    }
};

/**
 * GET /api/auth/me
 *
 * Protected by userAuth middleware.
 * Called on every page load to validate the session and return the user profile.
 * This replaces the old localStorage-based hydration on the frontend.
 */
export const getMe = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, avatar_url, role, created_at
             FROM users
             WHERE id = $1`,
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        return res.json({
            success: true,
            data: { user: result.rows[0] },
        });
    } catch (error) {
        console.error("GetMe Error:", error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// send verification otp to the users email
export const sendVerifyOtp = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM users WHERE id = $1",
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Request failed. Please try again.",
            });
        }

        const user = result.rows[0];

        if (user.is_account_verified) {
            return res.json({
                success: false,
                message: "Verification already complete.",
            });
        }

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const hashedOtp = await bcrypt.hash(otp, 10);

        const otpExpiry = new Date(Date.now() + 2 * 60 * 1000);
        const lastSentAt = new Date();
        const otpCooldown = new Date(Date.now() + 60 * 1000);

        await pool.query(
            `UPDATE users
             SET verify_otp              = $1,
                 verify_otp_expire_at    = $2,
                 verify_otp_attempts     = 0,
                 verify_otp_last_sent_at = $3,
                 verify_otp_locked_until = NULL
             WHERE id = $4`,
            [hashedOtp, otpExpiry, lastSentAt, req.userId]
        );

        await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: "Account Verification Code",
            text: `Your verification code is ${otp}. This code will expire in 2 minutes. Do not share this code with anyone.`,
        });

        return res.json({
            success: true,
            data: { otpExpiry, otpCooldown },
            message: "Verification code sent",
        });

    } catch (error) {
        console.error("Send OTP Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Request failed. Please try again.",
        });
    }
};

// Resend verification OTP to the users email
export const resendVerifyOtp = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required." });
    }

    try {
        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Request failed. Please try again." });
        }

        const user = result.rows[0];

        if (user.is_account_verified) {
            return res.json({
                success: false,
                message: "Verification already complete.",
            });
        }

        const { otp, otpExpiry, otpCooldown, maskedEmail } = await generateOtp(user);

        await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: "New Verification Code",
            text: `Your new verification code is ${otp}. This code will expire in 2 minutes. Do not share this code with anyone.`,
        });

        return res.json({
            success: true,
            data: { otpExpiry, otpCooldown, maskedEmail },
            message: "Verification code sent",
        });
    } catch (error) {
        console.error("Resend OTP Error:", error.message);

        if (error.message.includes("locked")) {
            return res.status(429).json({
                success: false,
                message: "Request failed. Please try again later.",
                locked: true,
            });
        }

        if (error.message.includes("wait")) {
            return res.status(429).json({
                success: false,
                message: "Request failed. Please try again later.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Request failed. Please try again later.",
        });
    }
};

// verify the Email
export const verifyEmail = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: "Missing details" });
    }

    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: "Verification failed. Please try again." });
        }

        const user = result.rows[0];

        const verifyResult = await verifyOtp(user, otp);

        if (!verifyResult.success) {
            return res.status(400).json({
                success: false,
                message: "Verification failed. Please try again.",
                locked: verifyResult.locked || false,
            });
        }

        // Issue both tokens after successful email verification
        await generateTokens(res, { id: user.id, email: user.email }, false);

        return res.json({ success: true, message: "Email verified successfully" });
    } catch (error) {
        console.error("Verify Email Error:", error.message);

        if (error.message.includes("locked")) {
            return res.status(429).json({
                success: false,
                message: "Verification failed. Please try again later.",
                locked: true,
            });
        }

        return res.status(400).json({
            success: false,
            message: "Verification failed. Please try again.",
        });
    }
};

// Is the session valid? (kept for backwards-compat, prefer GET /me)
export const isAuthenticated = async (req, res) => {
    try {
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// send password reset otp
export const sendResetOtp = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: "Email is Required" });
    }

    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [
            email.toLowerCase(),
        ]);

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                message: "If email exists, reset code has been sent",
            });
        }

        const user = result.rows[0];

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const hashedOtp = await bcrypt.hash(otp, 10);
        const otpExpiry = new Date(Date.now() + 2 * 60 * 1000);

        await pool.query(
            `UPDATE users
             SET reset_otp = $1, reset_otp_expire_at = $2
             WHERE id = $3`,
            [hashedOtp, otpExpiry, user.id]
        );

        await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: "Password Reset Code",
            text: `Your password reset code is ${otp}. This code will expire in 2 minutes. Do not share this code with anyone.`,
        });

        return res.json({
            success: true,
            message: "If email exists, reset code has been sent",
        });
    } catch (error) {
        console.error("Send Reset OTP Error:", error.message);
        return res
            .status(500)
            .json({ success: false, message: "Request failed. Please try again." });
    }
};

// verify the resetOtp and reset the password
export const resetPassword = async (req, res) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        return res.status(400).json({
            success: false,
            message: "Email, OTP and newPassword are required",
        });
    }

    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [
            email.toLowerCase(),
        ]);

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: "User not found" });
        }

        const user = result.rows[0];

        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!strongPasswordRegex.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 chars long and include uppercase, lowercase, number, and special char",
            });
        }

        const isOtpValid = await bcrypt.compare(otp, user.reset_otp);
        if (!user.reset_otp || !isOtpValid) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        if (user.reset_otp_expire_at < Date.now()) {
            return res.status(400).json({ success: false, message: "OTP is Expired" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query(
            `UPDATE users
             SET password = $1,
                 reset_otp = '',
                 reset_otp_expire_at = NULL
             WHERE id = $2`,
            [hashedPassword, user.id]
        );

        // Revoke all sessions on password reset (security best practice)
        await revokeAllUserTokens(user.id);
        clearAuthCookies(res);

        return res.json({ success: true, message: "Password is Reset Successfully" });
    } catch (error) {
        console.error("Reset Password Error:", error.message);
        return res
            .status(500)
            .json({ success: false, message: "Password reset failed. Please try again." });
    }
};

// ─── Google OAuth ─────────────────────────────────────────────────────────────

/**
 * GET /api/auth/google
 *
 * Generates a PKCE code verifier + state, saves both in short-lived httpOnly
 * cookies, then redirects the browser to Google's consent page.
 *
 * arctic v2 uses PKCE by default — the codeVerifier must be persisted across
 * the redirect and sent back on the callback.
 */
export const googleOAuthRedirect = async (req, res) => {
    try {
        const state        = generateState();
        const codeVerifier = generateCodeVerifier();

        // Build Google's authorization URL (arctic v2: state, codeVerifier, scopes)
        const url = google.createAuthorizationURL(state, codeVerifier, [
            "openid",
            "profile",
            "email",
        ]);

        // In production the frontend and backend are on different origins.
        // sameSite must be "none" (with secure:true) so cookies survive the
        // cross-origin Google redirect.  In dev, "lax" works fine on localhost.
        const isProduction = process.env.NODE_ENV === "production";
        const cookieOpts = {
            httpOnly: true,
            secure:   isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge:   10 * 60 * 1000, // 10 minutes
        };

        // Store both state and codeVerifier — single-use, validated on callback
        res.cookie("oauth_state",         state,        cookieOpts);
        res.cookie("oauth_code_verifier", codeVerifier, cookieOpts);

        console.log("Google OAuth: redirecting to Google, state set");
        return res.redirect(url.toString());
    } catch (error) {
        console.error("Google OAuth Redirect Error:", error.message, error.stack);
        return res.redirect(
            `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=oauth_init_failed`
        );
    }
};

/**
 * GET /api/auth/google/callback
 *
 * Validates state cookie, exchanges authorization code + codeVerifier for
 * tokens via arctic, fetches Google userinfo, upserts user in DB, issues JWT
 * cookies, then redirects to the frontend dashboard.
 *
 * NOTE: Live DB uses column names:
 *   - auth_method  (not auth_provider)
 *   - picture      (Google profile picture URL stored here)
 *   - avatar       (user-uploaded avatar, separate field)
 */
export const googleOAuthCallback = async (req, res) => {
    const { code, state } = req.query;
    const storedState        = req.cookies?.oauth_state;
    const storedCodeVerifier = req.cookies?.oauth_code_verifier;

    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

    // ── 1. Validate state (CSRF protection) ──────────────────────────────────
    if (!code || !state || !storedState || !storedCodeVerifier || state !== storedState) {
        console.error("Google OAuth Callback: state mismatch or missing params", {
            hasCode: !!code, hasState: !!state,
            hasStoredState: !!storedState, hasCodeVerifier: !!storedCodeVerifier,
            stateMatch: state === storedState,
        });
        return res.redirect(`${FRONTEND_URL}/login?error=oauth_state_mismatch`);
    }

    // Clear both cookies immediately — single use.
    // MUST exactly match the options used when setting them or the browser
    // will silently ignore the clear (leaving stale cookies for the next attempt).
    const isProduction = process.env.NODE_ENV === "production";
    const clearOpts = {
        httpOnly: true,
        secure:   isProduction,
        sameSite: isProduction ? "none" : "lax",
    };
    res.clearCookie("oauth_state",         clearOpts);
    res.clearCookie("oauth_code_verifier", clearOpts);

    try {
        // ── 2. Exchange code + codeVerifier for Google tokens via arctic ─────
        const tokens      = await google.validateAuthorizationCode(code, storedCodeVerifier);
        const accessToken = tokens.accessToken();

        // ── 3. Fetch user profile from Google userinfo endpoint ──────────────
        const userInfoResponse = await fetch(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!userInfoResponse.ok) {
            throw new Error(`Failed to fetch Google user info: ${userInfoResponse.status}`);
        }

        const googleUser = await userInfoResponse.json();
        // googleUser: { id, email, name, picture, verified_email }
        console.log("Google user fetched:", { email: googleUser.email, id: googleUser.id });

        if (!googleUser.email || !googleUser.verified_email) {
            return res.redirect(`${FRONTEND_URL}/login?error=google_email_unverified`);
        }

        const normalizedEmail = googleUser.email.toLowerCase();
        const googlePicture   = googleUser.picture || "";
        const googleName      = googleUser.name    || normalizedEmail.split("@")[0];

        // ── 4. Upsert user in DB ─────────────────────────────────────────────
        // Strategy:
        //   a) Find by google_id  → returning Google user
        //   b) Find by email      → existing local user, link Google account
        //   c) Neither            → create brand-new OAuth user

        let user;

        // a) Look up by google_id first
        const byGoogleId = await pool.query(
            `SELECT id, name, email, avatar_url, avatar_public_id FROM users WHERE google_id = $1`,
            [googleUser.id]
        );

        if (byGoogleId.rows.length > 0) {
            // Returning Google user — refresh name
            const updated = await pool.query(
                `UPDATE users
                 SET name = $1
                 WHERE google_id = $2
                 RETURNING id, name, email`,
                [googleName, googleUser.id]
            );
            user = updated.rows[0];

        } else {
            // Check if we need to upload googlePicture to Cloudinary for new/linked users
            let uploadedAvatarUrl = "";
            let uploadedAvatarPublicId = null;

            if (googlePicture) {
                try {
                    const uploadResponse = await cloudinary.uploader.upload(googlePicture, {
                        folder: "heapify_avatars",
                    });
                    uploadedAvatarUrl = uploadResponse.secure_url;
                    uploadedAvatarPublicId = uploadResponse.public_id;
                } catch (err) {
                    console.error("Cloudinary upload error during Google OAuth:", err);
                    uploadedAvatarUrl = googlePicture; // fallback to raw google URL
                }
            }

            // b) Check if the email already belongs to a local account
            const byEmail = await pool.query(
                `SELECT id, name, email, avatar_url FROM users WHERE email = $1`,
                [normalizedEmail]
            );

            if (byEmail.rows.length > 0) {
                // Merge: link Google to existing local account
                const merged = await pool.query(
                    `UPDATE users
                     SET google_id            = $1,
                         avatar_url           = CASE WHEN avatar_url = '' OR avatar_url IS NULL THEN $2 ELSE avatar_url END,
                         avatar_public_id     = CASE WHEN avatar_public_id IS NULL THEN $3 ELSE avatar_public_id END,
                         auth_method          = 'google',
                         is_account_verified  = TRUE
                     WHERE email = $4
                     RETURNING id, name, email`,
                    [googleUser.id, uploadedAvatarUrl, uploadedAvatarPublicId, normalizedEmail]
                );
                user = merged.rows[0];

            } else {
                // c) Create brand-new OAuth user (no password)
                const created = await pool.query(
                    `INSERT INTO users
                         (name, email, password, google_id, avatar_url, avatar_public_id, auth_method, is_account_verified)
                     VALUES ($1, $2, NULL, $3, $4, $5, 'google', TRUE)
                     RETURNING id, name, email`,
                    [googleName, normalizedEmail, googleUser.id, uploadedAvatarUrl, uploadedAvatarPublicId]
                );
                user = created.rows[0];
            }
        }

        console.log("Google OAuth: user upserted:", user);

        // ── 5. Issue JWT + refresh token cookies (same as regular login) ─────
        await generateTokens(res, { id: user.id, email: user.email }, false);

        // ── 6. Redirect to frontend dashboard ────────────────────────────────
        // Regular login works because the browser initiates a fetch() and the
        // response cookies are accepted as same-origin (frontend calls backend directly).
        // BUT in OAuth, cookies are set during a BACKEND-initiated redirect.
        // Chrome treats these as third-party cookies and blocks them on subsequent
        // requests from the frontend (sec-fetch-site: cross-site → cookie stripped).
        //
        // The proxy in next.config.ts fixes regular API calls (browser → frontend → backend)
        // but cannot fix the initial OAuth cookie set since Google redirects to the
        // backend directly.
        //
        // Solution: redirect to the frontend which will proxy the /api/auth/me
        // call through the same-origin proxy — by the time the user lands on /dashboard,
        // AuthContext.validateSession() fires and goes through the proxy.
        // The cookies ARE set on the backend domain (by generateTokens above), and because
        // regular fetch with credentials:include now goes through the Next.js proxy
        // (same-origin), the browser WILL send those third-party backend cookies on
        // preflight-free same-origin proxy requests.
        //
        // NOTE: This still relies on SameSite=None; Secure for the proxy-forwarded
        // requests to the backend (server-to-server). That works correctly.
        return res.redirect(`${FRONTEND_URL}/dashboard`);

    } catch (error) {
        console.error("Google OAuth Callback Error:", error.message, error.stack);
        return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    }
};


export const uploadAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image provided" });
        }

        const userId = req.userId;
        
        // Fetch current avatar to delete from Cloudinary if it exists
        const userQuery = await pool.query(
            "SELECT avatar_public_id FROM users WHERE id = $1",
            [userId]
        );
        const oldPublicId = userQuery.rows[0]?.avatar_public_id;

        if (oldPublicId) {
            try {
                await cloudinary.uploader.destroy(oldPublicId);
            } catch (err) {
                console.error("Failed to delete old avatar from Cloudinary", err);
            }
        }

        // Upload new image from buffer
        // Since cloudinary doesn't support direct buffer upload via promise easily without stream,
        // we wrap it in a Promise
        const uploadResponse = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: "heapify_avatars" },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            stream.end(req.file.buffer);
        });

        const avatarUrl = uploadResponse.secure_url;
        const avatarPublicId = uploadResponse.public_id;

        await pool.query(
            "UPDATE users SET avatar_url = $1, avatar_public_id = $2 WHERE id = $3",
            [avatarUrl, avatarPublicId, userId]
        );

        res.json({
            success: true,
            message: "Avatar uploaded successfully",
            avatarUrl,
        });

    } catch (error) {
        console.error("Upload Avatar Error:", error.message);
        res.status(500).json({ success: false, message: "Failed to upload avatar", error: error.message, stack: error.stack });
    }
};

export const deleteAvatar = async (req, res) => {
    try {
        const userId = req.userId;
        
        const userQuery = await pool.query(
            "SELECT avatar_public_id FROM users WHERE id = $1",
            [userId]
        );
        const publicId = userQuery.rows[0]?.avatar_public_id;

        if (publicId) {
            try {
                await cloudinary.uploader.destroy(publicId);
            } catch (err) {
                console.error("Failed to delete avatar from Cloudinary", err);
            }
        }

        await pool.query(
            "UPDATE users SET avatar_url = '', avatar_public_id = NULL WHERE id = $1",
            [userId]
        );

        res.json({
            success: true,
            message: "Avatar deleted successfully",
        });
    } catch (error) {
        console.error("Delete Avatar Error:", error.message);
        res.status(500).json({ success: false, message: "Failed to delete avatar" });
    }
};

