// controllers/knowledgeController.js

import pool from "../config/db.js";

// GET /api/knowledge/topics
// Returns all DSA topics with problem counts (from dsa_pattern_problems and dsa_sheet_items)
export const getTopics = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         t.id,
         t.name,
         t.description,
         (
           SELECT COUNT(DISTINCT p_id)
           FROM (
             SELECT dpp.problem_id AS p_id
             FROM dsa_patterns pa
             JOIN dsa_pattern_problems dpp ON dpp.pattern_id = pa.id
             WHERE pa.topic_id = t.id
             UNION
             SELECT dsi.problem_id AS p_id
             FROM dsa_sheet_items dsi
             WHERE dsi.topic_id = t.id
           ) sub
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
// Returns topic info with patterns and nested problems (including user progress & notes if authenticated)
export const getTopicData = async (req, res) => {
  const { topicId } = req.params;
  const userId = req.userId || null;

  if (!topicId || isNaN(topicId)) {
    return res.status(400).json({ success: false, message: "Invalid topicId" });
  }

  try {
    const params = [topicId];
    let userJoin = "";
    let userSelect = ", FALSE AS completed, '' AS user_note";

    if (userId) {
      params.push(userId);
      userJoin = `LEFT JOIN dsa_user_problem_status ups ON ups.problem_id = pr.id AND ups.user_id = $2`;
      userSelect = `, COALESCE(ups.completed, FALSE) AS completed, COALESCE(ups.user_note, '') AS user_note`;
    }

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
         pr.slug,
         pr.difficulty,
         pr.link        AS problem_link,
         pr.acceptance_rate,
         pr.rating,
         COALESCE(dpp.notes, dsi.notes) AS notes,
         COALESCE(dpp.priority_order, dsi.priority_order, 0) AS priority_order
         ${userSelect}
       FROM dsa_topics t
       LEFT JOIN dsa_patterns pa ON pa.topic_id = t.id
       LEFT JOIN dsa_pattern_problems dpp ON dpp.pattern_id = pa.id
       LEFT JOIN dsa_sheet_items dsi ON dsi.pattern_id = pa.id OR (dsi.topic_id = t.id AND dsi.pattern_id IS NULL)
       LEFT JOIN dsa_problems pr ON pr.id = COALESCE(dpp.problem_id, dsi.problem_id)
       ${userJoin}
       WHERE t.id = $1
       ORDER BY pa.id ASC, COALESCE(dpp.priority_order, dsi.priority_order, 0) ASC, pr.id ASC`,
      params
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

      const patternObj = topic.patterns.get(row.pattern_id);
      if (!patternObj.problems.some((p) => p.id === row.problem_id)) {
        patternObj.problems.push({
          id: row.problem_id,
          title: row.title,
          slug: row.slug,
          difficulty: row.difficulty,
          problemLink: row.problem_link,
          acceptanceRate: row.acceptance_rate,
          rating: row.rating,
          notes: row.notes,
          completed: row.completed,
          userNote: row.user_note,
        });
      }
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
      `SELECT id, topic_id, name, description
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
  const userId = req.userId || null;

  if (!patternId || isNaN(patternId)) {
    return res.status(400).json({ success: false, message: "Invalid patternId" });
  }

  try {
    const params = [patternId];
    let userJoin = "";
    let userSelect = ", FALSE AS completed, '' AS user_note";

    if (userId) {
      params.push(userId);
      userJoin = `LEFT JOIN dsa_user_problem_status ups ON ups.problem_id = pr.id AND ups.user_id = $2`;
      userSelect = `, COALESCE(ups.completed, FALSE) AS completed, COALESCE(ups.user_note, '') AS user_note`;
    }

    const result = await pool.query(
      `SELECT
         pr.id,
         $1::int AS pattern_id,
         pr.title,
         pr.slug,
         pr.difficulty,
         pr.link AS problem_link,
         pr.acceptance_rate,
         pr.rating,
         COALESCE(dpp.notes, dsi.notes) AS notes,
         COALESCE(dpp.priority_order, dsi.priority_order, 0) AS priority_order,
         pr.created_at
         ${userSelect}
       FROM dsa_problems pr
       LEFT JOIN dsa_pattern_problems dpp ON dpp.problem_id = pr.id AND dpp.pattern_id = $1
       LEFT JOIN dsa_sheet_items dsi ON dsi.problem_id = pr.id AND dsi.pattern_id = $1
       ${userJoin}
       WHERE dpp.pattern_id = $1 OR dsi.pattern_id = $1
       ORDER BY COALESCE(dpp.priority_order, dsi.priority_order, 0) ASC, pr.id ASC`,
      params
    );

    res.status(200).json({
      success: true,
      count: result.rows.length,
      problems: result.rows.map((row) => ({
        id: row.id,
        patternId: row.pattern_id,
        title: row.title,
        slug: row.slug,
        difficulty: row.difficulty,
        problemLink: row.problem_link,
        acceptanceRate: row.acceptance_rate,
        rating: row.rating,
        notes: row.notes,
        completed: row.completed,
        userNote: row.user_note,
      })),
    });
  } catch (error) {
    console.error("Error fetching problems:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch problems" });
  }
};

// GET /api/knowledge/progress (requires userAuth)
// Returns all user progress rows from dsa_user_problem_status
export const getProgress = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT problem_id, completed, revised, bookmarked, attempts, user_note, last_solved_at, updated_at
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

// GET /api/knowledge/progress/summary (requires userAuth)
export const getProgressSummary = async (req, res) => {
  try {
    const userId = req.userId;

    const [aggResult, progressResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                               AS total_problems,
           COUNT(*) FILTER (WHERE ups.completed = TRUE)          AS total_solved,
           COUNT(*) FILTER (WHERE LOWER(pr.difficulty) = 'easy') AS easy_total,
           COUNT(*) FILTER (WHERE LOWER(pr.difficulty) = 'easy'  AND ups.completed = TRUE) AS easy_solved,
           COUNT(*) FILTER (WHERE LOWER(pr.difficulty) = 'medium') AS medium_total,
           COUNT(*) FILTER (WHERE LOWER(pr.difficulty) = 'medium' AND ups.completed = TRUE) AS medium_solved,
           COUNT(*) FILTER (WHERE LOWER(pr.difficulty) = 'hard')   AS hard_total,
           COUNT(*) FILTER (WHERE LOWER(pr.difficulty) = 'hard'  AND ups.completed = TRUE) AS hard_solved
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
        totalSolved: parseInt(agg.total_solved || 0, 10),
        totalProblems: parseInt(agg.total_problems || 0, 10),
        byDifficulty: {
          easy: { solved: parseInt(agg.easy_solved || 0, 10), total: parseInt(agg.easy_total || 0, 10) },
          medium: { solved: parseInt(agg.medium_solved || 0, 10), total: parseInt(agg.medium_total || 0, 10) },
          hard: { solved: parseInt(agg.hard_solved || 0, 10), total: parseInt(agg.hard_total || 0, 10) },
        },
      },
      progress: progressResult.rows.map((r) => ({
        problem_id: r.problem_id,
        completed: true,
      })),
    });
  } catch (error) {
    console.error("Error fetching progress summary:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch progress summary" });
  }
};

// GET /api/knowledge/problems/:problemId/tags
export const getProblemTags = async (req, res) => {
  const { problemId } = req.params;

  if (!problemId || isNaN(problemId)) {
    return res.status(400).json({ success: false, message: "Invalid problemId" });
  }

  try {
    const result = await pool.query(
      `SELECT DISTINCT t.id, t.name, 'topic' AS tag_type, NULL AS logo_url
       FROM topics t
       JOIN problem_topics pt ON pt.topic_id = t.id
       WHERE pt.problem_id = $1
       UNION ALL
       SELECT DISTINCT c.id, c.name, 'company' AS tag_type, c.logo_url
       FROM companies c
       JOIN problem_companies pc ON pc.company_id = c.id
       WHERE pc.problem_id = $1
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

// GET /api/knowledge/problems/:problemId/note (requires userAuth)
// Fetches the user note from dsa_user_problem_status table
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

// PATCH /api/knowledge/problems/:problemId/note (requires userAuth + CSRF)
// Saves or updates personal user notes into dsa_user_problem_status table
export const saveNote = async (req, res) => {
  const { problemId } = req.params;
  const { note } = req.body;

  if (!problemId || isNaN(problemId)) {
    return res.status(400).json({ success: false, message: "Invalid problemId" });
  }

  if (typeof note !== "string") {
    return res.status(400).json({ success: false, message: "Note must be a string" });
  }

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

    res.status(200).json({ success: true, message: "Note saved", problemId, note: note.trim() });
  } catch (error) {
    console.error("Error saving user note:", error.message);
    res.status(500).json({ success: false, message: "Failed to save note" });
  }
};

// POST /api/knowledge/progress/toggle (requires userAuth)
// Toggles the completed status (and updates attempts + last_solved_at) in dsa_user_problem_status table
export const toggleProgress = async (req, res) => {
  const { problemId } = req.body;

  if (!problemId || isNaN(problemId)) {
    return res.status(400).json({ success: false, message: "Invalid problemId" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO dsa_user_problem_status (user_id, problem_id, completed, attempts, last_solved_at, updated_at)
       VALUES ($1, $2, TRUE, 1, NOW(), NOW())
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

// POST /api/knowledge/progress/toggle-revised (requires userAuth)
// Toggles the revised status in dsa_user_problem_status table
export const toggleRevised = async (req, res) => {
  const { problemId } = req.body;

  if (!problemId || isNaN(problemId)) {
    return res.status(400).json({ success: false, message: "Invalid problemId" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO dsa_user_problem_status (user_id, problem_id, revised, updated_at)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (user_id, problem_id)
       DO UPDATE
         SET revised    = NOT dsa_user_problem_status.revised,
             updated_at = NOW()
       RETURNING problem_id, revised`,
      [req.userId, problemId]
    );

    const row = result.rows[0];
    res.status(200).json({
      success: true,
      problemId: row.problem_id,
      revised: row.revised,
    });
  } catch (error) {
    console.error("Error toggling revised:", error.message);
    res.status(500).json({ success: false, message: "Failed to update revised status" });
  }
};

// POST /api/knowledge/progress/toggle-bookmark (requires userAuth)
// Toggles the bookmarked status in dsa_user_problem_status table
export const toggleBookmarked = async (req, res) => {
  const { problemId } = req.body;

  if (!problemId || isNaN(problemId)) {
    return res.status(400).json({ success: false, message: "Invalid problemId" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO dsa_user_problem_status (user_id, problem_id, bookmarked, updated_at)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (user_id, problem_id)
       DO UPDATE
         SET bookmarked = NOT dsa_user_problem_status.bookmarked,
             updated_at = NOW()
       RETURNING problem_id, bookmarked`,
      [req.userId, problemId]
    );

    const row = result.rows[0];
    res.status(200).json({
      success: true,
      problemId: row.problem_id,
      bookmarked: row.bookmarked,
    });
  } catch (error) {
    console.error("Error toggling bookmark:", error.message);
    res.status(500).json({ success: false, message: "Failed to update bookmark status" });
  }
};

// GET /api/knowledge/all-problems (Paginated Problem Bank)
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

    const conditions = [];
    const params = [];

    if (difficulty) {
      params.push(difficulty.toLowerCase());
      conditions.push(`LOWER(p.difficulty) = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`p.title ILIKE $${params.length}`);
    }

    if (company) {
      params.push(company.toLowerCase());
      conditions.push(`
        EXISTS (
          SELECT 1 FROM problem_companies pc
          JOIN companies c ON c.id = pc.company_id
          WHERE pc.problem_id = p.id AND c.slug = $${params.length}
        )
      `);
    }

    if (tag) {
      params.push(tag.toLowerCase());
      conditions.push(`
        EXISTS (
          SELECT 1 FROM problem_topics pt
          JOIN topics tg ON tg.id = pt.topic_id
          WHERE pt.problem_id = p.id AND tg.slug = $${params.length}
        )
      `);
    }

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

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM dsa_problems p ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    let solvedJoin = "";
    let solvedSelect = ", FALSE AS solved";

    if (userId) {
      params.push(userId);
      solvedJoin = `LEFT JOIN dsa_user_problem_status ups ON ups.problem_id = p.id AND ups.user_id = $${params.length}`;
      solvedSelect = `, COALESCE(ups.completed, FALSE) AS solved`;
    }

    params.push(limit);
    const limitPlaceholder  = `$${params.length}`;
    params.push(offset);
    const offsetPlaceholder = `$${params.length}`;

    const dataResult = await pool.query(
      `SELECT
         p.id,
         p.title,
         p.difficulty,
         p.link            AS problem_link,
         p.slug            AS problem_slug
         ${solvedSelect},

         COALESCE(
           JSONB_AGG(DISTINCT jsonb_build_object('name', c.name, 'logo_url', c.logo_url))
           FILTER (WHERE c.name IS NOT NULL),
           '[]'::jsonb
         ) AS companies,

         COALESCE(
           ARRAY_AGG(DISTINCT tg.name ORDER BY tg.name)
           FILTER (WHERE tg.name IS NOT NULL),
           ARRAY[]::TEXT[]
         ) AS topics

       FROM dsa_problems p
       ${solvedJoin}

       LEFT JOIN problem_companies pc ON pc.problem_id = p.id
       LEFT JOIN companies c ON c.id = pc.company_id

       LEFT JOIN problem_topics pt ON pt.problem_id = p.id
       LEFT JOIN topics tg ON tg.id = pt.topic_id

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

// GET /api/knowledge/companies — returns all companies
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

// GET /api/knowledge/tags-list — returns all topic tags
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

// ── DSA SHEETS & SECTIONS CONTROLLERS ────────────────────────────────────────

// GET /api/knowledge/sheets — returns all public DSA sheets with problem counts
export const getSheets = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         s.id,
         s.name,
         s.slug,
         s.description,
         s.is_public,
         s.created_at,
         COUNT(dsi.id)::int AS total_problems
       FROM dsa_sheets s
       LEFT JOIN dsa_sheet_items dsi ON dsi.sheet_id = s.id
       WHERE s.is_public = TRUE
       GROUP BY s.id
       ORDER BY s.id ASC`
    );

    res.status(200).json({
      success: true,
      count: result.rows.length,
      sheets: result.rows,
    });
  } catch (error) {
    console.error("Error fetching sheets:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch sheets" });
  }
};

// GET /api/knowledge/sheets/:sheetIdentifier — returns a sheet with grouped sections, nested problems & user notes/status
export const getSheetData = async (req, res) => {
  const { sheetIdentifier } = req.params;
  const userId = req.userId || null;

  if (!sheetIdentifier) {
    return res.status(400).json({ success: false, message: "Invalid sheet identifier" });
  }

  try {
    const isId = !isNaN(sheetIdentifier);
    const whereClause = isId ? `s.id = $1` : `s.slug = $1`;
    const params = [sheetIdentifier];

    let userJoin = "";
    let userSelect = ", FALSE AS completed, FALSE AS revised, FALSE AS bookmarked, '' AS user_note";

    if (userId) {
      params.push(userId);
      userJoin = `LEFT JOIN dsa_user_problem_status ups ON ups.problem_id = pr.id AND ups.user_id = $2`;
      userSelect = `, COALESCE(ups.completed, FALSE) AS completed, COALESCE(ups.revised, FALSE) AS revised, COALESCE(ups.bookmarked, FALSE) AS bookmarked, COALESCE(ups.user_note, '') AS user_note`;
    }

    const result = await pool.query(
      `SELECT
         s.id                AS sheet_id,
         s.name              AS sheet_name,
         s.slug              AS sheet_slug,
         s.description       AS sheet_description,
         dsi.id              AS item_id,
         COALESCE(dsi.section_name, t.name, 'General') AS section_name,
         dsi.priority_order  AS item_order,
         dsi.notes           AS item_notes,
         t.id                AS topic_id,
         t.name              AS topic_name,
         pa.id               AS pattern_id,
         pa.name             AS pattern_name,
         pr.id               AS problem_id,
         pr.title            AS problem_title,
         pr.slug             AS problem_slug,
         pr.link             AS problem_link,
         pr.difficulty       AS problem_difficulty,
         pr.acceptance_rate,
         pr.rating
         ${userSelect}
       FROM dsa_sheets s
       JOIN dsa_sheet_items dsi ON dsi.sheet_id = s.id
       LEFT JOIN dsa_topics t ON t.id = dsi.topic_id
       LEFT JOIN dsa_patterns pa ON pa.id = dsi.pattern_id
       JOIN dsa_problems pr ON pr.id = dsi.problem_id
       ${userJoin}
       WHERE ${whereClause}
       ORDER BY COALESCE(dsi.section_name, t.name, 'General'), dsi.priority_order ASC, dsi.id ASC`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Sheet not found or has no problems" });
    }

    const firstRow = result.rows[0];
    const sectionsMap = new Map();

    for (const row of result.rows) {
      const secName = row.section_name;
      if (!sectionsMap.has(secName)) {
        sectionsMap.set(secName, {
          name: secName,
          topicId: row.topic_id,
          topicName: row.topic_name,
          problems: [],
        });
      }

      sectionsMap.get(secName).problems.push({
        id: row.problem_id,
        title: row.problem_title,
        slug: row.problem_slug,
        difficulty: row.problem_difficulty,
        problemLink: row.problem_link,
        acceptanceRate: row.acceptance_rate,
        rating: row.rating,
        notes: row.item_notes,
        patternId: row.pattern_id,
        patternName: row.pattern_name,
        priorityOrder: row.item_order,
        completed: row.completed,
        revised: row.revised,
        bookmarked: row.bookmarked,
        userNote: row.user_note,
      });
    }

    res.status(200).json({
      success: true,
      sheet: {
        id: firstRow.sheet_id,
        name: firstRow.sheet_name,
        slug: firstRow.sheet_slug,
        description: firstRow.sheet_description,
        sections: Array.from(sectionsMap.values()),
      },
    });
  } catch (error) {
    console.error("Error fetching sheet data:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch sheet data" });
  }
};

// GET /api/knowledge/sections — returns all distinct sections across dsa_sheet_items & dsa_topics
export const getSections = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COALESCE(dsi.section_name, t.name) AS section_name,
         t.id AS topic_id,
         COUNT(DISTINCT dsi.problem_id)::int AS problem_count
       FROM dsa_sheet_items dsi
       LEFT JOIN dsa_topics t ON t.id = dsi.topic_id
       GROUP BY COALESCE(dsi.section_name, t.name), t.id
       ORDER BY section_name ASC`
    );

    res.status(200).json({
      success: true,
      count: result.rows.length,
      sections: result.rows,
    });
  } catch (error) {
    console.error("Error fetching sections:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch sections" });
  }
};

// GET /api/knowledge/sections/:sectionName/problems — returns all problems inside a section (with user note & progress)
export const getSectionProblems = async (req, res) => {
  const { sectionName } = req.params;
  const userId = req.userId || null;

  if (!sectionName) {
    return res.status(400).json({ success: false, message: "Invalid section name" });
  }

  try {
    const decodedSec = decodeURIComponent(sectionName);
    const params = [decodedSec];
    let userJoin = "";
    let userSelect = ", FALSE AS completed, '' AS user_note";

    if (userId) {
      params.push(userId);
      userJoin = `LEFT JOIN dsa_user_problem_status ups ON ups.problem_id = pr.id AND ups.user_id = $2`;
      userSelect = `, COALESCE(ups.completed, FALSE) AS completed, COALESCE(ups.user_note, '') AS user_note`;
    }

    const result = await pool.query(
      `SELECT DISTINCT ON (pr.id)
         pr.id,
         pr.title,
         pr.slug,
         pr.difficulty,
         pr.link AS problem_link,
         pr.acceptance_rate,
         pr.rating,
         COALESCE(dsi.section_name, t.name) AS section_name,
         dsi.notes,
         dsi.priority_order
         ${userSelect}
       FROM dsa_sheet_items dsi
       JOIN dsa_problems pr ON pr.id = dsi.problem_id
       LEFT JOIN dsa_topics t ON t.id = dsi.topic_id
       ${userJoin}
       WHERE dsi.section_name ILIKE $1 OR t.name ILIKE $1
       ORDER BY pr.id, dsi.priority_order ASC`,
      params
    );

    res.status(200).json({
      success: true,
      count: result.rows.length,
      problems: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        difficulty: row.difficulty,
        problemLink: row.problem_link,
        acceptanceRate: row.acceptance_rate,
        rating: row.rating,
        sectionName: row.section_name,
        notes: row.notes,
        completed: row.completed,
        userNote: row.user_note,
      })),
    });
  } catch (error) {
    console.error("Error fetching section problems:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch section problems" });
  }
};
