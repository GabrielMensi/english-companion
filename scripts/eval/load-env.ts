/**
 * Import this FIRST in the eval scripts: it reads .env.local (DATABASE_PATH, API keys) (like the app) before
 * the database module opens the file, and refuses to create a database that doesn't exist, so a
 * wrong path can't leave an empty one behind (without API keys or chats).
 */
import fs from "node:fs";
import path from "node:path";

// Never overrides variables already in the environment, so the real environment wins.
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const file = path.resolve(process.env.DATABASE_PATH ?? "data/companion.db");
if (!fs.existsSync(file)) {
  console.error(`Database ${file} does not exist: set DATABASE_PATH (in .env.local or the environment).`);
  process.exit(1);
}
