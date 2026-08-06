/**
 * Self-pinging keep-alive utility to prevent hosting platforms (e.g. Render, Railway)
 * from putting the backend into sleep mode after periods of inactivity.
 */

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function startKeepAlive(port = process.env.PORT || 4000) {
  // Determine target URL for self-pinging
  const baseUrl = process.env.BACKEND_URL || process.env.SERVER_URL || `http://localhost:${port}`;
  const healthUrl = baseUrl.endsWith('/health') ? baseUrl : `${baseUrl.replace(/\/+$/, '')}/health`;

  console.log(`[Keep-Alive] Starting self-ping service targeting: ${healthUrl} (every 5 minutes)`);

  const ping = async () => {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        console.log(`[Keep-Alive] Ping successful at ${new Date().toISOString()} (Status: ${response.status})`);
      } else {
        console.warn(`[Keep-Alive] Ping returned status ${response.status} at ${new Date().toISOString()}`);
      }
    } catch (error) {
      console.error(`[Keep-Alive] Ping error at ${new Date().toISOString()}:`, error.message);
    }
  };

  // Initial ping after 10 seconds to ensure server startup complete
  const initialTimeout = setTimeout(ping, 10000);

  // Set up 5 minute interval
  const intervalId = setInterval(ping, FIVE_MINUTES_MS);

  // Prevent interval from blocking graceful process termination
  if (intervalId.unref) {
    intervalId.unref();
  }

  return { intervalId, initialTimeout };
}
