/**
 * oauth.js
 *
 * Initializes the arctic Google OAuth 2.0 client.
 * The redirect URI must be registered in Google Cloud Console exactly as shown.
 */

import { Google } from "arctic";

const GOOGLE_REDIRECT_URI =
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:4000/api/auth/google/callback";

const google = new Google(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
);

export default google;
