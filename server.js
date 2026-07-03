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

// CORS — includes local dev origins and any production frontend URLs from env.
// FRONTEND_URL  → single URL (e.g. https://heapify-frontend.vercel.app)
// FRONTEND_URLS → comma-separated list for multiple origins (preview deployments, custom domains)
const extraOrigins = [
  ...(process.env.FRONTEND_URL  ? [process.env.FRONTEND_URL]                       : []),
  ...(process.env.FRONTEND_URLS ? process.env.FRONTEND_URLS.split(",").map(s => s.trim()) : []),
];

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  ...extraOrigins,
];

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (curl, mobile apps, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' is not allowed`));
  },
  credentials: true,
};

app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));


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