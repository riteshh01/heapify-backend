#!/usr/bin/env node
// Quick verification of seeded data
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const queries = [
  ["Companies", "SELECT COUNT(*) FROM companies"],
  ["Problems", "SELECT COUNT(*) FROM dsa_problems"],
  ["Tags", "SELECT COUNT(*) FROM tags"],
  ["Problem-Company links", "SELECT COUNT(*) FROM problem_company_stats"],
  ["Sheets", "SELECT name, slug FROM sheets"],
  ["Sheet problems backfill", "SELECT COUNT(*) FROM sheet_problems"],
];

const client = await pool.connect();
for (const [label, sql] of queries) {
  const res = await client.query(sql);
  const val = res.rows[0].count ?? JSON.stringify(res.rows);
  console.log(`  ${label}: ${val}`);
}
client.release();
await pool.end();
