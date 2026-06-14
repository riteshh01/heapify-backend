import bcrypt from "bcrypt";
import pool from "../config/db.js";

const MAX_ATTEMPTS = 5;
const COOLDOWN = 60 * 1000;         // 1 minute between OTP requests
const OTP_EXPIRY = 2 * 60 * 1000;   // 2 minutes validity
const LOCKOUT_DURATION = 6 * 60 * 60 * 1000; // 6 hours lockout after max attempts


const maskEmail = (email) => {
    const [name, domain] = email.split("@");

    const maskedName =
        name.slice(0, 2) +
        "*".repeat(Math.max(name.length - 2, 0));

    return `${maskedName}@${domain}`;
};

// Generate OTP with security controls — saves to verify_otp columns in PostgreSQL
export const generateOtp = async (user) => {
    const now = Date.now();

    // Check if account is locked due to too many failed attempts
    if (
        user.verify_otp_locked_until &&
        now < new Date(user.verify_otp_locked_until).getTime()
    ) {
        throw new Error("Account temporarily locked. Please try again later.");
    }

    // Cooldown check — rate limiting per user
    if (
        user.verify_otp_last_sent_at &&
        now - new Date(user.verify_otp_last_sent_at).getTime() < COOLDOWN
    ) {
        throw new Error("Please wait before requesting another OTP");
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP for secure storage
    const hashedOtp = await bcrypt.hash(otp, 10);

    const otpExpiry = new Date(now + OTP_EXPIRY);
    const lastSentAt = new Date(now);
    const otpCooldown = new Date(now + COOLDOWN);

    // Persist to PostgreSQL
    await pool.query(
        `UPDATE users
         SET verify_otp             = $1,
             verify_otp_expire_at   = $2,
             verify_otp_attempts    = 0,
             verify_otp_last_sent_at = $3,
             verify_otp_locked_until = NULL
         WHERE id = $4`,
        [hashedOtp, otpExpiry, lastSentAt, user.id]
    );

    // Return timing info only — plain OTP for email, never expose to frontend
    return { otp, otpExpiry, otpCooldown, maskedEmail: maskEmail(user.email)};
};

// Verify OTP with enhanced security — updates PostgreSQL directly
export const verifyOtp = async (user, enteredOtp) => {
    const now = Date.now();

    if (!user) {
        throw new Error("User not found");
    }

    // Check if account is locked
    if (
        user.verify_otp_locked_until &&
        now < new Date(user.verify_otp_locked_until).getTime()
    ) {
        throw new Error("Account temporarily locked. Please try again later.");
    }

    if (!user.verify_otp) {
        throw new Error("OTP not found. Please request a new one.");
    }

    // Check expiry
    if (new Date(user.verify_otp_expire_at).getTime() < now) {
        await pool.query(
            `UPDATE users
             SET verify_otp = NULL, verify_otp_expire_at = NULL, verify_otp_attempts = 0
             WHERE id = $1`,
            [user.id]
        );
        throw new Error("OTP has expired. Please request a new one.");
    }

    const attempts = user.verify_otp_attempts || 0;

    // Check attempt limit before comparing
    if (attempts >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(now + LOCKOUT_DURATION);
        await pool.query(
            `UPDATE users SET verify_otp_locked_until = $1 WHERE id = $2`,
            [lockedUntil, user.id]
        );
        throw new Error("Too many failed attempts. Account locked.");
    }

    // Constant-time comparison to prevent timing attacks
    const isMatch = await bcrypt.compare(enteredOtp, user.verify_otp);

    if (!isMatch) {
        const newAttempts = attempts + 1;
        const lockedUntil = newAttempts >= MAX_ATTEMPTS
            ? new Date(now + LOCKOUT_DURATION)
            : null;

        await pool.query(
            `UPDATE users
             SET verify_otp_attempts    = $1,
                 verify_otp_locked_until = $2
             WHERE id = $3`,
            [newAttempts, lockedUntil, user.id]
        );

        return {
            success: false,
            message: "Invalid OTP",
            locked: lockedUntil ? true : false,
        };
    }

    // Success — mark account as verified and clear OTP fields
    await pool.query(
        `UPDATE users
         SET verify_otp             = NULL,
             verify_otp_expire_at   = NULL,
             verify_otp_attempts    = 0,
             verify_otp_locked_until = NULL,
             is_account_verified    = TRUE
         WHERE id = $1`,
        [user.id]
    );

    return { success: true };
};