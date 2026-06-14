// routes/knowledgeRoutes.js

import express from "express";
import {
  getTopics,
  getTopicData,
  getPatterns,
  getProblems,
  getProgress,
  toggleProgress,
} from "../controllers/knowledgeController.js";
import userAuth from "../middleware/userAuth.js";

export const knowledgeRouter = express.Router();

// All routes now require authentication and email verification
knowledgeRouter.get("/topics",                  userAuth, getTopics);
knowledgeRouter.get("/topics/:topicId",         userAuth, getTopicData);
knowledgeRouter.get("/patterns/:topicId",       userAuth, getPatterns);
knowledgeRouter.get("/problems/:patternId",     userAuth, getProblems);

// Protected routes (JWT required + Email verified)
knowledgeRouter.get("/progress",            userAuth, getProgress);
knowledgeRouter.post("/progress/toggle",    userAuth, toggleProgress);