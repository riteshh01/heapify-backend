
// this is script file to run sql files so that the changes are being shown in the db
import 'dotenv/config'; // loads .env before everything else
import fs from 'fs';
import pool from '../config/db.js';

const runSQL = async () => {
  try {

    // SQL file read karo by giving correct file path
    const sql = fs.readFileSync('./schema/dsa_sheet.sql', 'utf8');

    // Execute karo
    await pool.query(sql);

    console.log('Process Run Successfully ✅');

    process.exit();

  } catch (error) {

    console.error('Error Occurs ❌');
    console.log(error);

    process.exit(1);
  }
};

runSQL();

// node scripts/runDSASheet.js