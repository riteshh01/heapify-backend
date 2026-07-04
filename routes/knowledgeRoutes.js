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
  getUserNote,
  saveNote,
} from "../controllers/knowledgeController.js";
import userAuth from "../middleware/userAuth.js";
import csrfProtection from "../middleware/csrfProtection.js";

export const knowledgeRouter = express.Router();

// All routes now require authentication and email verification
knowledgeRouter.get("/topics",                      userAuth, getTopics);
knowledgeRouter.get("/topics/:topicId",             userAuth, getTopicData);
knowledgeRouter.get("/patterns/:topicId",           userAuth, getPatterns);
knowledgeRouter.get("/problems/:patternId",         userAuth, getProblems);
knowledgeRouter.get("/problems/:problemId/tags",    userAuth, getProblemTags);

// Protected routes (JWT required + Email verified)
knowledgeRouter.get("/progress/summary",   userAuth,                    getProgressSummary);
knowledgeRouter.get("/progress",           userAuth,                    getProgress);
// POST/PATCH are state-changing — CSRF protection required
knowledgeRouter.post("/progress/toggle",   userAuth, csrfProtection,   toggleProgress);
knowledgeRouter.get("/problems/:problemId/note",    userAuth,                  getUserNote);
knowledgeRouter.patch("/problems/:problemId/note",  userAuth, csrfProtection, saveNote);