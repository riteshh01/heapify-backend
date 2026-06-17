// routes/knowledgeRoutes.js

import express from "express";
import {
  getTopics,
  getTopicData,
  getPatterns,
  getProblems,
  getProgress,
  getProgressSummary,
  toggleProgress,
} from "../controllers/knowledgeController.js";
import userAuth from "../middleware/userAuth.js";
import csrfProtection from "../middleware/csrfProtection.js";

export const knowledgeRouter = express.Router();

// All routes now require authentication and email verification
knowledgeRouter.get("/topics",                  userAuth, getTopics);
knowledgeRouter.get("/topics/:topicId",         userAuth, getTopicData);
knowledgeRouter.get("/patterns/:topicId",       userAuth, getPatterns);
knowledgeRouter.get("/problems/:patternId",     userAuth, getProblems);

// Protected routes (JWT required + Email verified)
knowledgeRouter.get("/progress/summary",   userAuth,                    getProgressSummary);
knowledgeRouter.get("/progress",           userAuth,                    getProgress);
// POST is state-changing — CSRF protection required
knowledgeRouter.post("/progress/toggle",   userAuth, csrfProtection,   toggleProgress);