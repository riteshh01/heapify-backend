// scripts/fixGitArticles.js
// Run once: node scripts/fixGitArticles.js
// Moves Git articles (ids 6, 7, 8) from chapter_id=1 (OS) to chapter_id=36 (Git Internals)

import "dotenv/config";
import pool from "../config/db.js";

const run = async () => {
  try {
    // The three Git articles were accidentally inserted with chapter_id = 1 (OS)
    // The correct chapter is id = 36 "1. Git Internals & Core Architecture"
    const result = await pool.query(
      `UPDATE theory_articles
       SET chapter_id = 36
       WHERE id IN (6, 7, 8)
       RETURNING id, chapter_id, title`
    );

    console.log("✅ Fixed articles:");
    result.rows.forEach((r) =>
      console.log(`  id=${r.id} → chapter_id=${r.chapter_id} | ${r.title}`)
    );

    // Verify: show all Git articles now
    const check = await pool.query(
      `SELECT a.id, a.chapter_id, a.title, c.name AS chapter_name
       FROM theory_articles a
       JOIN theory_chapters c ON c.id = a.chapter_id
       WHERE c.subject_id = 5
       ORDER BY a.id`
    );
    console.log("\n📋 All Git articles after fix:");
    check.rows.forEach((r) =>
      console.log(`  id=${r.id} chapter=${r.chapter_id} (${r.chapter_name}) | ${r.title}`)
    );

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
};

run();
