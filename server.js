import express from "express";
import cors from "cors";
import "dotenv/config";
import cookieParser from "cookie-parser";
import pool from "./config/db.js";
import { authRouter } from "./routes/authRoutes.js";
import { userRouter } from "./routes/userRoutes.js";
import { knowledgeRouter } from "./routes/knowledgeRoutes.js";
import { theoryRouter } from "./routes/theoryRoutes.js";

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001"];

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: allowedOrigins, credentials: true }));

// API Endpoints
app.get("/", (req, res) => res.send("Authentication and Authorization"));
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/theory", theoryRouter);

app.listen(PORT, () => console.log(`Server started on PORT: ${PORT}`));