#!/usr/bin/env node
/**
 * Migration Runner
 * Executes SQL schema files + seeds in the correct order against the Neon DB.
 *
 * Run:  node schema/migrate.js
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Large timeout for the massive dsa_problem.sql file
  statement_timeout: 300_000,   // 5 minutes per statement
  query_timeout:     300_000,
});

async function runFile(filePath, label) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`\n🚀  Running: ${label}`);
  console.log(`    File   : ${filePath}`);
  console.log(`    Size   : ${(sql.length / 1024).toFixed(1)} KB`);

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(`✅  Done   : ${label}`);
  } catch (err) {
    console.error(`❌  FAILED : ${label}`);
    console.error(`   Error  : ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

async function runSQL(sql, label) {
  const client = await pool.connect();
  try {
    console.log(`\n🔧  Running inline: ${label}`);
    await client.query(sql);
    console.log(`✅  Done   : ${label}`);
  } catch (err) {
    // Ignore "already exists" type errors for idempotency
    if (err.message.includes('already exists') || err.message.includes('duplicate')) {
      console.log(`⚠️  Skipped (already exists): ${label}`);
    } else {
      console.error(`❌  FAILED : ${label}`);
      console.error(`   Error  : ${err.message}`);
      throw err;
    }
  } finally {
    client.release();
  }
}

async function main() {
  console.log('====================================================');
  console.log('  Heapify Database Migration Runner');
  console.log('====================================================');
  console.log(`  DB: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] ?? 'unknown host'}`);

  try {
    // ── Step 1: Users table ────────────────────────────────────────────────
    await runFile(path.join(__dirname, 'users.sql'), 'Users schema');

    // ── Step 2: DSA Sheet schema (tables, migrations, indexes) ────────────
    await runFile(path.join(__dirname, 'dsa_sheet.sql'), 'DSA Sheet schema');

    // ── Step 3: Patch tags table with slug + link columns ─────────────────
    //    (required by dsa_problem.sql which inserts tags with those columns)
    await runSQL(`
      ALTER TABLE tags ADD COLUMN IF NOT EXISTS slug VARCHAR(150);
      ALTER TABLE tags ADD COLUMN IF NOT EXISTS link TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug) WHERE slug IS NOT NULL;
    `, 'Add slug + link columns to tags');

    // ── Step 3b: Fix problem_company_stats time_period constraint ──────────
    //    dsa_problem.sql inserts only (problem_id, company_id) with no time_period.
    //    Set a default so inserts succeed without specifying the column.
    await runSQL(`
      ALTER TABLE problem_company_stats
        ALTER COLUMN time_period SET DEFAULT 'all_time';
    `, 'Set default time_period = all_time on problem_company_stats');

    // ── Step 3c: Relax the UNIQUE constraint to allow (problem, company) without period
    //    The current UNIQUE(problem_id, company_id, time_period) is fine since
    //    all rows will default to 'all_time'. No change needed there.

    // ── Step 4: Seed all data (companies, tags, problems, problem-company links)
    await runFile(path.join(__dirname, 'dsa_problem.sql'), 'DSA Problem seed data (3250 problems, 470 companies)');

    console.log('\n====================================================');
    console.log('  ✅  All migrations completed successfully!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n====================================================');
    console.error('  ❌  Migration FAILED — see error above');
    console.error('====================================================\n');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
