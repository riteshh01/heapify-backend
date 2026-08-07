// routes/theoryRoutes.js

import express from "express";
import {
  getSubjects,
  getChaptersBySubjectName,
  getChaptersBySubject,
  getArticlesByChapter,
  getArticle,
  debugTheory,
} from "../controllers/theoryController.js";
import userAuth from "../middleware/userAuth.js";

export const theoryRouter = express.Router();

// Debug route — only accessible in non-production environments
if (process.env.NODE_ENV !== "production") {
  theoryRouter.get("/debug", debugTheory);
}

// All other routes require authentication
theoryRouter.get("/subjects",                                   userAuth, getSubjects);
// Name-based route MUST come before the numeric :subjectId route to avoid collision
theoryRouter.get("/subjects/name/:slug/chapters",               userAuth, getChaptersBySubjectName);
theoryRouter.get("/subjects/:subjectId/chapters",               userAuth, getChaptersBySubject);
theoryRouter.get("/chapters/:chapterId/articles",               userAuth, getArticlesByChapter);
theoryRouter.get("/articles/:articleId",                        userAuth, getArticle);
