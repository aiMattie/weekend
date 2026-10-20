// Load .env for CLI scripts (Next loads it itself for the app). Never prints values.
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
