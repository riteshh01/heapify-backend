// controllers/theoryController.js

import pool from "../config/db.js";

/**
 * GET /api/theory/subjects
 * Returns all theory subjects (OS, Networks, DBMS, Git, OOP, etc.)
 */
export const getSubjects = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, icon
       FROM theory_subjects
       ORDER BY id ASC`
    );
    res.status(200).json({ success: true, subjects: result.rows });
  } catch (error) {
    console.error("Error fetching subjects:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch subjects" });
  }
};

/**
 * GET /api/theory/subjects/:subjectId/chapters
 * Returns all chapters for a given subject, each with its article list (stubs).
 * Uses a single LEFT JOIN query so chapters with 0 articles still appear.
 */
export const getChaptersBySubject = async (req, res) => {
  const { subjectId } = req.params;

  if (!subjectId || isNaN(subjectId)) {
    return res.status(400).json({ success: false, message: "Invalid subjectId" });
  }

  try {
    // Single JOIN: chapters LEFT JOIN articles — works even if a chapter has 0 articles
    const result = await pool.query(
      `SELECT
         c.id              AS chapter_id,
         c.name            AS chapter_name,
         c.sequence_order,
         a.id              AS article_id,
         a.title           AS article_title,
         a.read_time_minutes,
         a.is_premium
       FROM theory_chapters c
       LEFT JOIN theory_articles a ON a.chapter_id = c.id
       WHERE c.subject_id = $1
       ORDER BY c.sequence_order ASC, c.id ASC, a.id ASC`,
      [subjectId]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({ success: true, chapters: [] });
    }

    // Fold rows into chapter → articles shape
    const chapMap = new Map();
    for (const row of result.rows) {
      if (!chapMap.has(row.chapter_id)) {
        chapMap.set(row.chapter_id, {
          id: row.chapter_id,
          name: row.chapter_name,
          sequenceOrder: row.sequence_order,
          articles: [],
        });
      }
      // Only push if this row actually has an article
      if (row.article_id !== null) {
        chapMap.get(row.chapter_id).articles.push({
          id: row.article_id,
          chapterId: row.chapter_id,
          title: row.article_title,
          readTimeMinutes: row.read_time_minutes,
          isPremium: row.is_premium,
        });
      }
    }

    res.status(200).json({
      success: true,
      chapters: Array.from(chapMap.values()),
    });
  } catch (error) {
    console.error("Error fetching chapters:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch chapters" });
  }
};

/**
 * GET /api/theory/chapters/:chapterId/articles
 * Returns all article stubs for a specific chapter.
 * Used as a fallback / direct fetch when chapter detail is needed.
 */
export const getArticlesByChapter = async (req, res) => {
  const { chapterId } = req.params;

  if (!chapterId || isNaN(chapterId)) {
    return res.status(400).json({ success: false, message: "Invalid chapterId" });
  }

  try {
    const result = await pool.query(
      `SELECT
         a.id,
         a.chapter_id,
         a.title,
         a.read_time_minutes,
         a.is_premium,
         c.name AS chapter_name,
         s.id   AS subject_id,
         s.name AS subject_name
       FROM theory_articles a
       JOIN theory_chapters c ON c.id = a.chapter_id
       JOIN theory_subjects s ON s.id = c.subject_id
       WHERE a.chapter_id = $1
       ORDER BY a.id ASC`,
      [chapterId]
    );

    res.status(200).json({
      success: true,
      count: result.rows.length,
      articles: result.rows.map((row) => ({
        id: row.id,
        chapterId: row.chapter_id,
        chapterName: row.chapter_name,
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        title: row.title,
        readTimeMinutes: row.read_time_minutes,
        isPremium: row.is_premium,
      })),
    });
  } catch (error) {
    console.error("Error fetching articles by chapter:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch articles" });
  }
};

/**
 * GET /api/theory/articles/:articleId
 * Returns full article content for reading.
 */
export const getArticle = async (req, res) => {
  const { articleId } = req.params;

  if (!articleId || isNaN(articleId)) {
    return res.status(400).json({ success: false, message: "Invalid articleId" });
  }

  try {
    const result = await pool.query(
      `SELECT
         a.id,
         a.chapter_id,
         a.title,
         a.content,
         a.read_time_minutes,
         a.is_premium,
         a.video_link,
         a.cover_image,
         a.created_at,
         c.name AS chapter_name,
         s.id   AS subject_id,
         s.name AS subject_name
       FROM theory_articles a
       JOIN theory_chapters c ON c.id = a.chapter_id
       JOIN theory_subjects s ON s.id = c.subject_id
       WHERE a.id = $1`,
      [articleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Article not found" });
    }

    const row = result.rows[0];
    res.status(200).json({
      success: true,
      article: {
        id: row.id,
        chapterId: row.chapter_id,
        chapterName: row.chapter_name,
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        title: row.title,
        content: row.content,
        readTimeMinutes: row.read_time_minutes,
        isPremium: row.is_premium,
        videoLink: row.video_link,
        coverImage: row.cover_image,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    console.error("Error fetching article:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch article" });
  }
};

/**
 * GET /api/theory/debug
 * Returns a snapshot of all theory tables — use to verify DB seeding.
 * Remove this endpoint once data is confirmed correct.
 */
export const debugTheory = async (req, res) => {
  try {
    const [subjects, chapters, articles] = await Promise.all([
      pool.query(`SELECT id, name FROM theory_subjects ORDER BY id`),
      pool.query(`SELECT id, subject_id, name FROM theory_chapters ORDER BY id`),
      pool.query(
        `SELECT id, chapter_id, title FROM theory_articles ORDER BY id LIMIT 50`
      ),
    ]);

    res.status(200).json({
      success: true,
      subjects: subjects.rows,
      chapters: chapters.rows,
      articles: articles.rows,
    });
  } catch (error) {
    console.error("Debug error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
