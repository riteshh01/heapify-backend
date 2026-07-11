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
      `SELECT t.id, t.name, 'topic' AS tag_type
       FROM topics t
       JOIN problem_topic_stats pt ON pt.tag_id = t.id
       WHERE pt.problem_id = $1
       UNION ALL
       SELECT c.id, c.name, 'company' AS tag_type
       FROM companies c
       JOIN problem_company_stats pcs ON pcs.company_id = c.id
       WHERE pcs.problem_id = $1
       ORDER BY tag_type ASC, name ASC`,
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

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Problem Bank  (company-seeded 3 250 problems, not DSA-Sheet problems)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/knowledge/all-problems
 * Query params:
 *   page       (default 1)
 *   limit      (default 15, max 50)
 *   difficulty (easy | medium | hard)
 *   company    company slug  e.g. "google"
 *   tag        tag slug      e.g. "dynamic-programming"
 *   search     partial title match
 *   status     solved | unsolved   (requires auth — silently ignored if no user)
 */
export const getAllProblems = async (req, res) => {
  try {
    const page      = Math.max(1, parseInt(req.query.page  || "1",  10));
    const limit     = Math.min(50, Math.max(1, parseInt(req.query.limit || "15", 10)));
    const offset    = (page - 1) * limit;

    const difficulty = req.query.difficulty || "";
    const company    = req.query.company    || "";
    const tag        = req.query.tag        || "";
    const search     = req.query.search     || "";
    const status     = req.query.status     || "";  // solved | unsolved
    const userId     = req.userId || null;

    // ── Build a CTE for clean, composable filtering ─────────────────────────
    const conditions = [
      // Only problems in the company bank (source = company_repo OR those with company stats)
      // Exclude DSA-sheet-only problems (pattern_id IS NOT NULL means it's curated DSA sheet)
      `p.pattern_id IS NULL`,
    ];
    const params = [];

    if (difficulty) {
      params.push(difficulty.toLowerCase());
      conditions.push(`p.difficulty = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`p.title ILIKE $${params.length}`);
    }

    if (company) {
      params.push(company.toLowerCase());
      conditions.push(`
        EXISTS (
          SELECT 1 FROM problem_company_stats pcs
          JOIN companies c ON c.id = pcs.company_id
          WHERE pcs.problem_id = p.id AND c.slug = $${params.length}
        )
      `);
    }

    if (tag) {
      params.push(tag.toLowerCase());
      conditions.push(`
        EXISTS (
          SELECT 1 FROM problem_topic_stats pt
          JOIN topics tg ON tg.id = pt.tag_id
          WHERE pt.problem_id = p.id AND tg.slug = $${params.length}
        )
      `);
    }

    // Status filter — requires a logged-in user
    if (userId && status === "solved") {
      params.push(userId);
      conditions.push(`
        EXISTS (
          SELECT 1 FROM dsa_user_problem_status ups
          WHERE ups.problem_id = p.id AND ups.user_id = $${params.length} AND ups.completed = TRUE
        )
      `);
    } else if (userId && status === "unsolved") {
      params.push(userId);
      conditions.push(`
        NOT EXISTS (
          SELECT 1 FROM dsa_user_problem_status ups
          WHERE ups.problem_id = p.id AND ups.user_id = $${params.length} AND ups.completed = TRUE
        )
      `);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // ── Count query ──────────────────────────────────────────────────────────
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM dsa_problems p ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // ── Data query — embed company + topic tags via aggregation ─────────────
    params.push(limit);
    const limitPlaceholder  = `$${params.length}`;
    params.push(offset);
    const offsetPlaceholder = `$${params.length}`;

    // solved flag for the requesting user (NULL if not logged in)
    const solvedJoin = userId
      ? `LEFT JOIN dsa_user_problem_status ups ON ups.problem_id = p.id AND ups.user_id = ${userId}`
      : "";
    const solvedSelect = userId ? `, COALESCE(ups.completed, FALSE) AS solved` : `, FALSE AS solved`;

    const dataResult = await pool.query(
      `SELECT
         p.id,
         p.title,
         p.difficulty,
         p.problem_link,
         p.slug            AS problem_slug
         ${solvedSelect},

         -- Aggregated companies with logos
         COALESCE(
           JSONB_AGG(DISTINCT jsonb_build_object('name', c.name, 'logo_url', c.logo_url))
           FILTER (WHERE c.name IS NOT NULL),
           '[]'::jsonb
         ) AS companies,

         -- Aggregated topic tags
         COALESCE(
           ARRAY_AGG(DISTINCT tg.name ORDER BY tg.name)
           FILTER (WHERE tg.name IS NOT NULL),
           ARRAY[]::TEXT[]
         ) AS topics

       FROM dsa_problems p
       ${solvedJoin}

       -- Company join
       LEFT JOIN problem_company_stats pcs ON pcs.problem_id = p.id
       LEFT JOIN companies c ON c.id = pcs.company_id

       -- Topic tag join
       LEFT JOIN problem_topic_stats ptg ON ptg.problem_id = p.id
       LEFT JOIN topics tg ON tg.id = ptg.tag_id

       ${whereClause}

       GROUP BY p.id ${userId ? ", ups.completed" : ""}
       ORDER BY p.title ASC
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      params
    );

    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
      problems: dataResult.rows.map((r) => ({
        id:          r.id,
        title:       r.title,
        difficulty:  r.difficulty,
        problemLink: r.problem_link,
        slug:        r.problem_slug,
        solved:      r.solved,
        companies:   r.companies.sort((a, b) => a.name.localeCompare(b.name)),
        topics:      r.topics,
      })),
    });
  } catch (error) {
    console.error("Error fetching all problems:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch problems" });
  }
};

/** GET /api/knowledge/companies — returns all companies for the filter dropdown */
export const getCompaniesList = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT slug, name, logo_url FROM companies ORDER BY name ASC`
    );
    res.status(200).json({ success: true, companies: result.rows });
  } catch (error) {
    console.error("Error fetching companies:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch companies" });
  }
};

/** GET /api/knowledge/tags-list — returns all tags for the topic filter dropdown */
export const getTagsList = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT slug, name FROM topics WHERE slug IS NOT NULL ORDER BY name ASC`
    );
    res.status(200).json({ success: true, tags: result.rows });
  } catch (error) {
    console.error("Error fetching tags list:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch tags" });
  }
};
