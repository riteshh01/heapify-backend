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
// Returns rich metadata: totals, difficulty breakdown, per-topic stats,
// streak (current + longest), recent activity, and raw solved IDs.
export const getProgressSummary = async (req, res) => {
  try {
    const userId = req.userId;

    // ── 1. All problems with topic/difficulty context ─────────────────────────
    const problemsResult = await pool.query(
      `SELECT
         pr.id          AS problem_id,
         pr.title,
         pr.difficulty,
         t.id           AS topic_id,
         t.name         AS topic_name,
         ups.completed,
         ups.attempts,
         ups.last_solved_at
       FROM dsa_problems pr
       JOIN dsa_patterns pa ON pa.id = pr.pattern_id
       JOIN dsa_topics   t  ON t.id  = pa.topic_id
       LEFT JOIN dsa_user_problem_status ups
              ON ups.problem_id = pr.id AND ups.user_id = $1
       ORDER BY ups.last_solved_at DESC NULLS LAST`,
      [userId]
    );

    const rows = problemsResult.rows;

    // ── 2. User account creation date ─────────────────────────────────────────
    const userResult = await pool.query(
      `SELECT created_at FROM users WHERE id = $1`,
      [userId]
    );
    const memberSince = userResult.rows[0]?.created_at ?? null;

    // ── 3. Aggregate totals ───────────────────────────────────────────────────
    const totalProblems = rows.length;
    const solvedRows    = rows.filter((r) => r.completed);
    const totalSolved   = solvedRows.length;
    const completionPercent =
      totalProblems > 0 ? Math.round((totalSolved / totalProblems) * 100) : 0;

    const lastSolvedAt = solvedRows[0]?.last_solved_at ?? null;

    // ── 4. Difficulty breakdown ───────────────────────────────────────────────
    const byDifficulty = { easy: { solved: 0, total: 0 }, medium: { solved: 0, total: 0 }, hard: { solved: 0, total: 0 } };
    for (const r of rows) {
      const key = (r.difficulty || "").toLowerCase();
      if (byDifficulty[key]) {
        byDifficulty[key].total++;
        if (r.completed) byDifficulty[key].solved++;
      }
    }

    // ── 5. Per-topic breakdown ────────────────────────────────────────────────
    const topicMap = new Map();
    for (const r of rows) {
      if (!topicMap.has(r.topic_id)) {
        topicMap.set(r.topic_id, { topicId: r.topic_id, topicName: r.topic_name, solved: 0, total: 0 });
      }
      const t = topicMap.get(r.topic_id);
      t.total++;
      if (r.completed) t.solved++;
    }
    const byTopic = Array.from(topicMap.values()).map((t) => ({
      ...t,
      percent: t.total > 0 ? Math.round((t.solved / t.total) * 100) : 0,
    }));

    // ── 6. Recent activity (last 7 solved) ────────────────────────────────────
    const recentActivity = solvedRows.slice(0, 7).map((r) => ({
      problemId:  r.problem_id,
      title:      r.title,
      difficulty: r.difficulty,
      topicName:  r.topic_name,
      solvedAt:   r.last_solved_at,
    }));

    // ── 7. Streak calculation ─────────────────────────────────────────────────
    // Collect unique calendar days (UTC date strings) on which user solved ≥1 problem
    const solvedDays = [
      ...new Set(
        solvedRows
          .filter((r) => r.last_solved_at)
          .map((r) => new Date(r.last_solved_at).toISOString().slice(0, 10))
      ),
    ].sort((a, b) => b.localeCompare(a)); // newest first

    let currentStreak = 0;
    let longestStreak = 0;

    if (solvedDays.length > 0) {
      const todayStr    = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

      // Current streak only counts if the user solved something today or yesterday
      if (solvedDays[0] === todayStr || solvedDays[0] === yesterdayStr) {
        currentStreak = 1;
        for (let i = 1; i < solvedDays.length; i++) {
          const prev = new Date(solvedDays[i - 1]);
          const curr = new Date(solvedDays[i]);
          const diffDays = Math.round((prev - curr) / 86_400_000);
          if (diffDays === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }

      // Longest streak: scan all sorted days
      let run = 1;
      longestStreak = 1;
      for (let i = 1; i < solvedDays.length; i++) {
        const prev = new Date(solvedDays[i - 1]);
        const curr = new Date(solvedDays[i]);
        const diffDays = Math.round((prev - curr) / 86_400_000);
        if (diffDays === 1) {
          run++;
          if (run > longestStreak) longestStreak = run;
        } else {
          run = 1;
        }
      }
    }

    // ── 8. Raw progress list (for DSA sheet checkboxes) ──────────────────────
    const progress = solvedRows.map((r) => ({
      problem_id:     r.problem_id,
      completed:      r.completed,
      attempts:       r.attempts,
      last_solved_at: r.last_solved_at,
    }));

    res.status(200).json({
      success: true,
      summary: {
        totalSolved,
        totalProblems,
        completionPercent,
        streak: { current: currentStreak, longest: longestStreak },
        byDifficulty,
        byTopic,
        recentActivity,
        lastSolvedAt,
        memberSince,
      },
      progress,
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
