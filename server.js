import express from "express";
import cors from "cors";
import "dotenv/config";
import cookieParser from "cookie-parser";
import path from "path"; // Added for path resolution
import { fileURLToPath } from "url"; // Added for __dirname in ES modules
import swaggerUi from "swagger-ui-express"; // Added
import YAML from "yamljs"; // Added
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
const swaggerDocument = YAML.load(path.join(__dirname, "./swagger.yaml")); // Ensure your file is named openapi.yaml in root

const allowedOrigins = ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001"];

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

app.listen(PORT, () => console.log(`Server started on PORT: ${PORT}\nSwagger docs available at http://localhost:${PORT}/api-docs`));