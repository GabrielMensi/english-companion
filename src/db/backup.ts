// Consistent copies of the database for the deploy scripts (no server-only import; tested on temp files).
// `cp` of a WAL database can copy an inconsistent state, so this uses SQLite's own backup API.
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

/** Backups live next to the database, in a folder only the owner can open. */
export function backupsDir(databaseFile: string): string {
  return path.join(path.dirname(databaseFile), "backups");
}

/** `2026-10-28T20-05-09Z`: sortable and safe in a file name. */
export function timestamp(date = new Date()): string {
  return date
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replaceAll(":", "-");
}

/** Copies the live database to `destination` (mode 600, folder 700). Refuses to overwrite a file. */
export async function backupDatabase(sqlite: Database.Database, destination: string): Promise<void> {
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(destination), 0o700);
  if (fs.existsSync(destination)) throw new Error(`Backup ${destination} already exists`);
  try {
    await sqlite.backup(destination);
  } catch (error) {
    fs.rmSync(destination, { force: true });
    throw error;
  }
  fs.chmodSync(destination, 0o600);
}

/** Deletes all but the newest `keep` files named `<prefix>*.db` in `dir` (names sort by their timestamp). */
export function pruneBackups(dir: string, prefix: string, keep: number): string[] {
  if (!fs.existsSync(dir)) return [];
  const names = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".db"))
    .sort();
  const removed = names.slice(0, Math.max(0, names.length - keep));
  for (const name of removed) fs.rmSync(path.join(dir, name), { force: true });
  return removed;
}
