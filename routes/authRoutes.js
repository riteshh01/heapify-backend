import express from "express";
import {
    login,
    register,
    logout,
    refresh,
    getMe,
    sendVerifyOtp,
    verifyEmail,
    isAuthenticated,
    sendResetOtp,
    resetPassword,
    resendVerifyOtp,
} from "../controllers/authController.js";
import userAuth from "../middleware/userAuth.js";
import { loginLimiter, otpLimiter, registerLimiter } from "../middleware/rateLimit.js";
import csrfProtection from "../middleware/csrfProtection.js";

export const authRouter = express.Router();

// ─── Public routes ────────────────────────────────────────────────────────────
// These routes either GENERATE the CSRF token (login, verifyEmail) or don't
// require one (registration, OTP flows). CSRF protection is NOT applied here.
authRouter.post("/register",           registerLimiter, register);
authRouter.post("/login",              loginLimiter,    login);
authRouter.post("/logout",                              logout);  // clears own cookies

// Token refresh — no userAuth middleware (access token may be expired)
// No CSRF needed: the refresh token IS the proof of identity here.
authRouter.post("/refresh",                             refresh);

// Email verification
authRouter.post("/send-verify-otp",    otpLimiter,      sendVerifyOtp);
authRouter.post("/verify-account",                      verifyEmail);
authRouter.post("/resend-verify-otp",  otpLimiter,      resendVerifyOtp);

// Password reset
authRouter.post("/send-reset-otp",     otpLimiter,      sendResetOtp);
authRouter.post("/reset-password",     otpLimiter,      resetPassword);

// ─── Protected routes (require valid accessToken + valid CSRF token) ──────────

// Current user profile — GET is a safe method, no CSRF needed
authRouter.get("/me",                  userAuth,                          getMe);

// Legacy is-auth (kept for backwards-compat)
// POST is a state-changing method — CSRF protection applied
authRouter.post("/is-auth",            userAuth, csrfProtection,          isAuthenticated);
