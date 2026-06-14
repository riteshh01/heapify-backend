// controllers/knowledgeController.js

import pool from "../config/db.js";

// GET /api/knowledge/topics
export const getTopics = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.name,COUNT(pr.id) AS problem_count
      FROM dsa_topics t
      LEFT JOIN dsa_patterns pa ON pa.topic_id = t.id
      LEFT JOIN dsa_problems pr ON pr.pattern_id = pa.id
      GROUP BY t.id
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
         pr.notes,
         pr.company_tag
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
        companyTag: row.company_tag,
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
              problem_link, youtube_link, article_link, notes, company_tag, created_at
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
        companyTag: row.company_tag,
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
