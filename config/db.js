import pkg from "pg"; // pg package is a library for node.js
const { Pool } = pkg; // isme se mai Pool extract kr raha hu 

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Neon jaisi cloud DB services secure SSL use karti hain.
    rejectUnauthorized: true, // SSL certificate strictly verify mat karo 
  },
});

// Handle unexpected errors on idle clients (e.g. Neon dropping the connection)
pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

// Test connection — acquire a client, log result, then release it back to the pool
pool.connect()
  .then((client) => {
    console.log("PostgreSQL Connected");
    client.release();
  })
  .catch((err) => console.error("DB Connection Error:", err));

export default pool;