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

export const authRouter = express.Router();

// ─── Public routes ────────────────────────────────────────────────────────────
authRouter.post("/register",           registerLimiter, register);
authRouter.post("/login",              loginLimiter,    login);
authRouter.post("/logout",                              logout);

// Token refresh — no userAuth middleware (access token may be expired)
authRouter.post("/refresh",                             refresh);

// Email verification
authRouter.post("/send-verify-otp",    otpLimiter,      sendVerifyOtp);
authRouter.post("/verify-account",                      verifyEmail);
authRouter.post("/resend-verify-otp",  otpLimiter,      resendVerifyOtp);

// Password reset
authRouter.post("/send-reset-otp",     otpLimiter,      sendResetOtp);
authRouter.post("/reset-password",     otpLimiter,      resetPassword);

// ─── Protected routes (require valid accessToken cookie) ──────────────────────

// Current user profile — called on every page load to hydrate auth state
authRouter.get("/me",                  userAuth,         getMe);

// Legacy is-auth (kept for backwards-compat)
authRouter.post("/is-auth",            userAuth,         isAuthenticated);
