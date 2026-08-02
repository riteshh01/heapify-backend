// routes/knowledgeRoutes.js

import express from "express";
import {
  getTopics,
  getTopicData,
  getPatterns,
  getProblems,
  getProblemTags,
  getProgress,
  getProgressSummary,
  toggleProgress,
  toggleRevised,
  toggleBookmarked,
  getUserNote,
  saveNote,
  getAllProblems,
  getCompaniesList,
  getTagsList,
  getSheets,
  getSheetData,
  getSections,
  getSectionProblems,
} from "../controllers/knowledgeController.js";
import userAuth from "../middleware/userAuth.js";
import csrfProtection from "../middleware/csrfProtection.js";

export const knowledgeRouter = express.Router();

// ── Fixed / Named endpoints (must be declared before parametric routes) ──────
knowledgeRouter.get("/all-problems",  userAuth, getAllProblems);
knowledgeRouter.get("/companies",     userAuth, getCompaniesList);
knowledgeRouter.get("/tags-list",     userAuth, getTagsList);
knowledgeRouter.get("/sheets",        userAuth, getSheets);
knowledgeRouter.get("/sections",      userAuth, getSections);

// ── DSA Sheet / Section Parametric routes ─────────────────────────────────────
knowledgeRouter.get("/sheets/:sheetIdentifier",       userAuth, getSheetData);
knowledgeRouter.get("/sections/:sectionName/problems", userAuth, getSectionProblems);

// ── Topics & Patterns Parametric routes ───────────────────────────────────────
knowledgeRouter.get("/topics",                      userAuth, getTopics);
knowledgeRouter.get("/topics/:topicId",             userAuth, getTopicData);
knowledgeRouter.get("/patterns/:topicId",           userAuth, getPatterns);
knowledgeRouter.get("/problems/:patternId",         userAuth, getProblems);
knowledgeRouter.get("/problems/:problemId/tags",    userAuth, getProblemTags);

// Protected routes (JWT required + Email verified)
knowledgeRouter.get("/progress/summary",          userAuth,                    getProgressSummary);
knowledgeRouter.get("/progress",                  userAuth,                    getProgress);

// POST/PATCH state-changing routes (CSRF protection required)
knowledgeRouter.post("/progress/toggle",          userAuth, csrfProtection,   toggleProgress);
knowledgeRouter.post("/progress/toggle-revised",  userAuth, csrfProtection,   toggleRevised);
knowledgeRouter.post("/progress/toggle-bookmark", userAuth, csrfProtection,   toggleBookmarked);
knowledgeRouter.get("/problems/:problemId/note",   userAuth,                  getUserNote);
knowledgeRouter.patch("/problems/:problemId/note", userAuth, csrfProtection,   saveNote);