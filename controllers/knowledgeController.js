// controllers/knowledgeController.js

import pool from "../config/db.js";

// GET /api/knowledge/topics
export const getTopics = async (req, res) => {
  try {
    // COUNT is pushed into SQL using a correlated subquery on the pre-indexed
    // dsa_problems.pattern_id column — avoids a full two-level JOIN + GROUP BY.
    const result = await pool.query(
      `SELECT
         t.id,
         t.name,
         (
           SELECT COUNT(*)
           FROM dsa_patterns pa
           JOIN dsa_problems pr ON pr.pattern_id = pa.id
           WHERE pa.topic_id = t.id
         ) AS problem_count
       FROM dsa_topics t
       ORDER BY t.id ASC`
    );

    res.status(200).json({
      success: true,
      count: result.rows.length,
      topics: result.rows,
    });
  } catch (error) {
    console.error("Error fetching topics:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch topics" });
  }
};

// GET /api/knowledge/topics/:topicId
// Returns the topic info with all its patterns and nested problems
export const getTopicData = async (req, res) => {
  const { topicId } = req.params;

  if (!topicId || isNaN(topicId)) {
    return res.status(400).json({ success: false, message: "Invalid topicId" });
  }

  try {
    const result = await pool.query(
      `SELECT
         t.id           AS topic_id,
         t.name         AS topic_name,
         t.description  AS topic_description,
         pa.id          AS pattern_id,
         pa.name        AS pattern_name,
         pa.description AS pattern_description,
         pr.id          AS problem_id,
         pr.title,
         pr.difficulty,
         pr.type,
         pr.problem_link,
         pr.youtube_link,
         pr.article_link,
         pr.notes
       FROM dsa_topics t
       LEFT JOIN dsa_patterns pa ON pa.topic_id = t.id
       LEFT JOIN dsa_problems pr ON pr.pattern_id = pa.id
       WHERE t.id = $1
       ORDER BY pa.id ASC, pr.id ASC`,
      [topicId]
    );

    if (result.rows.length === 0 || result.rows[0].topic_id === null) {
      return res.status(404).json({ success: false, message: "Topic not found" });
    }

    const firstRow = result.rows[0];
    const topic = {
      id: firstRow.topic_id,
      name: firstRow.topic_name,
      description: firstRow.topic_description,
      patterns: new Map(),
    };

    for (const row of result.rows) {
      if (!row.pattern_id) continue;

      if (!topic.patterns.has(row.pattern_id)) {
        topic.patterns.set(row.pattern_id, {
          id: row.pattern_id,
          name: row.pattern_name,
          description: row.pattern_description,
          problems: [],
        });
      }

      if (!row.problem_id) continue;

      topic.patterns.get(row.pattern_id).problems.push({
        id: row.problem_id,
        title: row.title,
        difficulty: row.difficulty,
        type: row.type,
        problemLink: row.problem_link,
        youtubeLink: row.youtube_link,
        articleLink: row.article_link,
        notes: row.notes,
      });
    }

    const response = {
      ...topic,
      patterns: Array.from(topic.patterns.values()),
    };

    res.status(200).json({ success: true, topic: response });
  } catch (error) {
    console.error("Error fetching topic data:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch topic data" });
  }
};

// GET /api/knowledge/patterns/:topicId
export const getPatterns = async (req, res) => {
  const { topicId } = req.params;

  if (!topicId || isNaN(topicId)) {
    return res.status(400).json({ success: false, message: "Invalid topicId" });
  }

  try {
    const result = await pool.query(
      `SELECT id, topic_id, name
       FROM dsa_patterns
       WHERE topic_id = $1
       ORDER BY id ASC`,
      [topicId]
    );

    res.status(200).json({
      success: true,
      count: result.rows.length,
      patterns: result.rows,
    });
  } catch (error) {
    console.error("Error fetching patterns:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch patterns" });
  }
};

// GET /api/knowledge/problems/:patternId
export const getProblems = async (req, res) => {
  const { patternId } = req.params;

  if (!patternId || isNaN(patternId)) {
    return res.status(400).json({ success: false, message: "Invalid patternId" });
  }

  try {
    const result = await pool.query(
      `SELECT id, pattern_id, title, difficulty, type,
              problem_link, youtube_link, article_link, notes, created_at
       FROM dsa_problems
       WHERE pattern_id = $1
       ORDER BY id ASC`,
      [patternId]
    );

    res.status(200).json({
      success: true,
      count: result.rows.length,
      problems: result.rows.map(row => ({
        id: row.id,
        patternId: row.pattern_id,
        title: row.title,
        difficulty: row.difficulty,
        type: row.type,
        problemLink: row.problem_link,
        youtubeLink: row.youtube_link,
        articleLink: row.article_link,
        notes: row.notes,
      })),
    });
  } catch (error) {
    console.error("Error fetching problems:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch problems" });
  }
};

// GET /api/knowledge/progress  (requires userAuth)
export const getProgress = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT problem_id, completed, revised, bookmarked, attempts, last_solved_at
       FROM dsa_user_problem_status
       WHERE user_id = $1`,
      [req.userId]
    );

    res.status(200).json({ success: true, progress: result.rows });
  } catch (error) {
    console.error("Error fetching progress:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch progress" });
  }
};

// GET /api/knowledge/progress/summary  (requires userAuth)
// Returns totals + difficulty breakdown (easy / medium / hard) and raw solved IDs.
export const getProgressSummary = async (req, res) => {
  try {
    const userId = req.userId;

    // ── Single query: push ALL aggregation into PostgreSQL ────────────────────
    // Instead of fetching every row to JS and counting in a loop, let the DB
    // compute totals, difficulty splits, and the solved list in one round-trip.
    const [aggResult, progressResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                               AS total_problems,
           COUNT(*) FILTER (WHERE ups.completed = TRUE)          AS total_solved,
           COUNT(*) FILTER (WHERE pr.difficulty = 'easy')        AS easy_total,
           COUNT(*) FILTER (WHERE pr.difficulty = 'easy'  AND ups.completed = TRUE) AS easy_solved,
           COUNT(*) FILTER (WHERE pr.difficulty = 'medium')      AS medium_total,
           COUNT(*) FILTER (WHERE pr.difficulty = 'medium' AND ups.completed = TRUE) AS medium_solved,
           COUNT(*) FILTER (WHERE pr.difficulty = 'hard')        AS hard_total,
           COUNT(*) FILTER (WHERE pr.difficulty = 'hard'  AND ups.completed = TRUE) AS hard_solved
         FROM dsa_problems pr
         LEFT JOIN dsa_user_problem_status ups
                ON ups.problem_id = pr.id AND ups.user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT problem_id
         FROM dsa_user_problem_status
         WHERE user_id = $1 AND completed = TRUE`,
        [userId]
      ),
    ]);

    const agg = aggResult.rows[0];

    res.status(200).json({
      success: true,
      summary: {
        totalSolved:   parseInt(agg.total_solved,  10),
        totalProblems: parseInt(agg.total_problems, 10),
        byDifficulty: {
          easy:   { solved: parseInt(agg.easy_solved,   10), total: parseInt(agg.easy_total,   10) },
          medium: { solved: parseInt(agg.medium_solved, 10), total: parseInt(agg.medium_total, 10) },
          hard:   { solved: parseInt(agg.hard_solved,   10), total: parseInt(agg.hard_total,   10) },
        },
      },
      // Raw solved IDs — only the completed rows (much smaller than all rows)
      progress: progressResult.rows.map((r) => ({
        problem_id: r.problem_id,
        completed:  true,
      })),
    });
  } catch (error) {
    console.error("Error fetching progress summary:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch progress summary" });
  }
};

// GET /api/knowledge/problems/:problemId/tags
// Returns all tags (companies + topics) associated with a problem
export const getProblemTags = async (req, res) => {
  const { problemId } = req.params;

  if (!problemId || isNaN(problemId)) {
    return res.status(400).json({ success: false, message: "Invalid problemId" });
  }

  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.tag_type
       FROM tags t
       JOIN problem_tags pt ON pt.tag_id = t.id
       WHERE pt.problem_id = $1
       ORDER BY t.tag_type ASC, t.name ASC`,
      [problemId]
    );

    res.status(200).json({
      success: true,
      count: result.rows.length,
      tags: result.rows,
    });
  } catch (error) {
    console.error("Error fetching problem tags:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch tags" });
  }
};

// GET /api/knowledge/problems/:problemId/note  (requires userAuth)
// Returns the user's personal note for a problem
export const getUserNote = async (req, res) => {
  const { problemId } = req.params;

  if (!problemId || isNaN(problemId)) {
    return res.status(400).json({ success: false, message: "Invalid problemId" });
  }

  try {
    const result = await pool.query(
      `SELECT user_note
       FROM dsa_user_problem_status
       WHERE user_id = $1 AND problem_id = $2`,
      [req.userId, problemId]
    );

    const note = result.rows[0]?.user_note ?? "";
    res.status(200).json({ success: true, note });
  } catch (error) {
    console.error("Error fetching user note:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch note" });
  }
};

// PATCH /api/knowledge/problems/:problemId/note  (requires userAuth + CSRF)
// Body: { note } — upserts the user's personal note for a problem
export const saveNote = async (req, res) => {
  const { problemId } = req.params;
  const { note } = req.body;

  if (!problemId || isNaN(problemId)) {
    return res.status(400).json({ success: false, message: "Invalid problemId" });
  }

  if (typeof note !== "string") {
    return res.status(400).json({ success: false, message: "Note must be a string" });
  }

  // Limit note length to 10,000 characters
  if (note.length > 10000) {
    return res.status(400).json({ success: false, message: "Note is too long (max 10,000 characters)" });
  }

  try {
    await pool.query(
      `INSERT INTO dsa_user_problem_status (user_id, problem_id, user_note, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, problem_id)
       DO UPDATE SET
         user_note  = EXCLUDED.user_note,
         updated_at = NOW()`,
      [req.userId, problemId, note.trim()]
    );

    res.status(200).json({ success: true, message: "Note saved" });
  } catch (error) {
    console.error("Error saving user note:", error.message);
    res.status(500).json({ success: false, message: "Failed to save note" });
  }
};

// POST /api/knowledge/progress/toggle  (requires userAuth)
// Body: { problemId } — toggles the `completed` flag
export const toggleProgress = async (req, res) => {
  const { problemId } = req.body;

  if (!problemId || isNaN(problemId)) {
    return res.status(400).json({ success: false, message: "Invalid problemId" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO dsa_user_problem_status (user_id, problem_id, completed, attempts, last_solved_at)
       VALUES ($1, $2, TRUE, 1, NOW())
       ON CONFLICT (user_id, problem_id)
       DO UPDATE
         SET completed      = NOT dsa_user_problem_status.completed,
             attempts       = dsa_user_problem_status.attempts + 1,
             last_solved_at = CASE
                                WHEN NOT dsa_user_problem_status.completed THEN NOW()
                                ELSE dsa_user_problem_status.last_solved_at
                              END,
             updated_at     = NOW()
       RETURNING problem_id, completed, attempts, last_solved_at`,
      [req.userId, problemId]
    );

    const row = result.rows[0];
    res.status(200).json({
      success: true,
      problemId: row.problem_id,
      completed: row.completed,
      attempts: row.attempts,
    });
  } catch (error) {
    console.error("Error toggling progress:", error.message);
    res.status(500).json({ success: false, message: "Failed to update progress" });
  }
};
