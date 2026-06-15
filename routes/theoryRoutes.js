// routes/theoryRoutes.js

import express from "express";
import {
  getSubjects,
  getChaptersBySubject,
  getArticlesByChapter,
  getArticle,
  debugTheory,
} from "../controllers/theoryController.js";
import userAuth from "../middleware/userAuth.js";

export const theoryRouter = express.Router();

// Debug — no auth (remove after confirming DB is seeded correctly)
theoryRouter.get("/debug", debugTheory);

// All other routes require authentication
theoryRouter.get("/subjects",                           userAuth, getSubjects);
theoryRouter.get("/subjects/:subjectId/chapters",       userAuth, getChaptersBySubject);
theoryRouter.get("/chapters/:chapterId/articles",       userAuth, getArticlesByChapter);
theoryRouter.get("/articles/:articleId",                userAuth, getArticle);
