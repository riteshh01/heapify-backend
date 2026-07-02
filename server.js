import express from "express";
import cors from "cors";
import "dotenv/config";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import pool from "./config/db.js";
import { authRouter } from "./routes/authRoutes.js";
import { userRouter } from "./routes/userRoutes.js";
import { knowledgeRouter } from "./routes/knowledgeRoutes.js";
import { theoryRouter } from "./routes/theoryRoutes.js";

const app = express();
const PORT = process.env.PORT || 4000;

// ES module setup for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Swagger setup
const swaggerDocument = YAML.load(path.join(__dirname, "./swagger.yaml"));

// CORS — includes local dev origins and the production frontend URL from env
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Swagger UI Route
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// API Endpoints
app.get("/", (req, res) => res.send("Heapify API is running!"));
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/theory", theoryRouter);

// Start server only in local dev (not in Vercel serverless environment)
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () =>
    console.log(
      `Server started on PORT: ${PORT}\nSwagger docs available at http://localhost:${PORT}/api-docs`
    )
  );
}

export default app;