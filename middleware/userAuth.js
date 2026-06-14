/**
 * userAuth middleware
 *
 * Verifies the short-lived accessToken cookie on every protected route.
 * If the access token is missing or expired, responds 401 so the frontend
 * interceptor can silently call POST /api/auth/refresh and replay the request.
 */

import jwt from "jsonwebtoken";
import pool from "../config/db.js";

const userAuth = async (req, res, next) => {
    const { accessToken } = req.cookies;

    if (!accessToken) {
        return res.status(401).json({
            success: false,
            code: "TOKEN_MISSING",
            message: "Not Authorized",
        });
    }

    try {
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);

        req.userId = decoded.id;
        req.email  = decoded.email;

        // Confirm the user still exists and is verified
        const userResult = await pool.query(
            "SELECT is_account_verified FROM users WHERE id = $1",
            [decoded.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                code: "USER_NOT_FOUND",
                message: "User not found",
            });
        }

        if (!userResult.rows[0].is_account_verified) {
            return res.status(403).json({
                success: false,
                code: "EMAIL_NOT_VERIFIED",
                message: "Please verify your email before accessing this resource",
            });
        }

        next();

    } catch (error) {
        // jwt.verify throws TokenExpiredError for expired tokens
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                code: "TOKEN_EXPIRED",
                message: "Access token expired",
            });
        }

        return res.status(401).json({
            success: false,
            code: "TOKEN_INVALID",
            message: "Invalid token",
        });
    }
};

export default userAuth;