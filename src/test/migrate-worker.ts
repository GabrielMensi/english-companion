// Child process for the concurrent migration test (src/db/migrate.test.ts): opens the database like the
// app does and applies the migrations once `startAt` is reached, so several workers collide on purpose.
// Usage: tsx migrate-worker.ts <database file> <migrations folder> <start at (epoch ms)>
import Database from "better-sqlite3";

import { BUSY_TIMEOUT_MS, migrate } from "../db/migrate";

const [file, folder, startAt] = process.argv.slice(2);

const sqlite = new Database(file, { timeout: BUSY_TIMEOUT_MS });
sqlite.pragma("journal_mode = WAL");

// Block this thread until the agreed time (everything above, the slow part, is already loaded).
const wait = Number(startAt) - Date.now();
if (wait > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);

migrate(sqlite, folder);
sqlite.close();
