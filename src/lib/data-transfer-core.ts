/**
 * The export file of one account (Settings > Your data) and its validation. No server-only imports, unit
 * tested. JSON because it is readable, diffable, versioned and carries exactly what we choose to put in
 * it; a SQLite copy would drag along every other account and the login tables. The file never has
 * API keys, passwords, sessions, e-mail or user ids.
 */
import { createHash } from "node:crypto";
import { getTableColumns } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/schema";
import { CARD_KINDS } from "@/lib/flashcards-core";
import { FLUENCY_VERSION } from "@/lib/fluency";
import { GRADES } from "@/lib/srs";
import { upgradeSettings } from "@/lib/settings-core";
import { ERROR_CATEGORIES, PRONUNCIATION_CATEGORIES, SEVERITIES } from "@/lib/taxonomy";

export const EXPORT_FORMAT = "english-companion-export";
export const EXPORT_VERSION = 1;
/** Import limits: the request body, and rows per table (a heavy user has a few thousand at most). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS_PER_TABLE = 50_000;
/** The import is one synchronous transaction that blocks the server: ~68k rows took ~7 s, so 30k keeps it near 3 s. */
export const MAX_TOTAL_ROWS = 30_000;

export type TableName =
  | "sessions"
  | "messages"
  | "corrections"
  | "vocabulary"
  | "reviews"
  | "missedExercises"
  | "reviewLog"
  | "readAloudAttempts"
  | "pronunciationIssues";

interface Parent {
  /** The column (property name) holding the parent's id. */
  column: string;
  parent: TableName;
  /** Without the parent the row makes no sense and is dropped; otherwise the column becomes null. */
  required: boolean;
}
interface TableSpec {
  table: SQLiteTable;
  parents: Parent[];
}

/** Parents come before their children. */
export const TABLE_SPECS: Record<TableName, TableSpec> = {
  sessions: { table: schema.sessions, parents: [] },
  messages: {
    table: schema.messages,
    parents: [
      { column: "sessionId", parent: "sessions", required: true },
      { column: "replyToId", parent: "messages", required: false },
    ],
  },
  corrections: { table: schema.corrections, parents: [{ column: "messageId", parent: "messages", required: true }] },
  vocabulary: { table: schema.vocabulary, parents: [{ column: "messageId", parent: "messages", required: true }] },
  reviews: { table: schema.reviews, parents: [] },
  missedExercises: {
    table: schema.missedExercises,
    parents: [{ column: "sessionId", parent: "sessions", required: false }],
  },
  reviewLog: { table: schema.reviewLog, parents: [] },
  readAloudAttempts: { table: schema.readAloudAttempts, parents: [] },
  pronunciationIssues: {
    table: schema.pronunciationIssues,
    parents: [{ column: "attemptId", parent: "readAloudAttempts", required: true }],
  },
};

export const TABLE_NAMES = Object.keys(TABLE_SPECS) as TableName[];

/**
 * Settings keys of the form `<prefix><chat id>`: they travel with the chat, so an import that gives the
 * chat a new id renames them too. A new per-chat setting only needs its prefix here.
 */
export const PER_SESSION_PREFIXES = ["practice:", "feedback:"] as const;

/** The prefix and chat id of a per-chat settings key, or null for any other key. */
export function perSessionKey(key: string): { prefix: string; sessionId: string } | null {
  const prefix = PER_SESSION_PREFIXES.find((p) => key.startsWith(p));
  return prefix ? { prefix, sessionId: key.slice(prefix.length) } : null;
}

/** Settings that travel with the account. Anything else (the API keys above all) never leaves or enters. */
export function isExportableSetting(key: string): boolean {
  // The insights outputs are caches the app regenerates: they stay out.
  return key === "app" || perSessionKey(key) !== null;
}

const ENUMS: Partial<Record<TableName, Record<string, readonly string[]>>> = {
  sessions: { mode: ["correction", "conversation"] },
  messages: { role: ["user", "assistant"], status: ["pending", "done", "error"], inputMode: ["typed", "spoken"] },
  corrections: {
    category: ERROR_CATEGORIES,
    severity: SEVERITIES,
    severityBeforeTypo: SEVERITIES,
    classification: ["pending", "done", "failed", "skipped"],
  },
  reviews: { kind: CARD_KINDS, lastGrade: GRADES },
  reviewLog: { kind: CARD_KINDS, grade: GRADES },
  readAloudAttempts: { source: ["sounds", "correction", "vocabulary", "review"] },
  pronunciationIssues: { category: PRONUNCIATION_CATEGORIES },
  missedExercises: { category: ERROR_CATEGORIES },
};

export type Row = Record<string, unknown>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const isNumberMap = (value: unknown) => isObject(value) && Object.values(value).every(isNumber);

/** Shapes of the JSON columns, as their readers expect them. A failing optional column becomes null; a required one drops the row. */
const JSON_CHECKS: Record<string, (value: unknown) => boolean> = {
  "messages.fallbackAttempts": (v) => Array.isArray(v) && v.length <= 20 && v.every(isObject),
  "messages.tenseCounts": (v) => isObject(v) && isNumber(v.version) && isNumberMap(v.counts),
  "messages.fluency": (v) =>
    isObject(v) &&
    v.version === FLUENCY_VERSION &&
    ["words", "speechMs", "pauses", "pauseMs", "longestPauseMs"].every((k) => isNumber(v[k])) &&
    isNumberMap(v.fillers),
  "vocabulary.english": (v) =>
    Array.isArray(v) && v.length <= 50 && v.every((item) => typeof item === "string" && item.length <= 500),
};

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  data: Record<TableName, Row[]>;
  settings: Record<string, unknown>;
}

/** A row as stored (Dates, booleans...) to plain JSON, without the owner. */
export function serializeRow(table: TableName, row: Row): Row {
  const out: Row = {};
  for (const key of Object.keys(getTableColumns(TABLE_SPECS[table].table))) {
    if (key === "userId") continue;
    const value = row[key];
    out[key] = value instanceof Date ? value.getTime() : (value ?? null);
  }
  return out;
}

/** One row from the file, checked column by column against the schema, as the values to insert (Dates restored). */
function parseRow(table: TableName, raw: unknown): Row | string {
  if (!isObject(raw)) return "not an object";
  const columns = getTableColumns(TABLE_SPECS[table].table);
  const out: Row = {};
  for (const [key, column] of Object.entries(columns)) {
    if (key === "userId") continue;
    const value = raw[key] ?? null;
    if (value === null) {
      if (column.notNull && !column.hasDefault) return `${key} is required`;
      if (!column.notNull) out[key] = null;
      continue;
    }
    switch (column.dataType) {
      case "string":
        if (typeof value !== "string") return `${key} must be text`;
        if (value.length > 1_000_000) return `${key} is too long`;
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) return `${key} must be a number`;
        break;
      case "boolean":
        if (typeof value !== "boolean") return `${key} must be true or false`;
        break;
      case "json": {
        const check = JSON_CHECKS[`${table}.${key}`];
        if (check && !check(value)) {
          if (column.notNull) return `${key} has the wrong shape`;
          out[key] = null;
          continue;
        }
        break;
      }
      case "date":
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 8.64e15) {
          return `${key} must be a timestamp`;
        }
        out[key] = new Date(value);
        continue;
      default:
        return `${key} has an unsupported type`;
    }
    const allowed = ENUMS[table]?.[key];
    if (allowed && !allowed.includes(value as string)) return `${key} has an unknown value`;
    out[key] = value;
  }
  return out;
}

export type ParsedImport = { ok: true; file: ParsedFile } | { ok: false; error: string };
export interface ParsedFile {
  data: Record<TableName, Row[]>;
  settings: Record<string, unknown>;
  /** Rows dropped for being invalid, per table. */
  invalid: Partial<Record<TableName, number>>;
}

/** Checks a decoded export file. Invalid rows are dropped and counted; a file of the wrong shape is refused. */
export function parseExportFile(raw: unknown): ParsedImport {
  if (!isObject(raw) || raw.format !== EXPORT_FORMAT)
    return { ok: false, error: "This is not an English Companion export" };
  if (raw.version !== EXPORT_VERSION) return { ok: false, error: "This export comes from a newer version of the app" };
  if (!isObject(raw.data)) return { ok: false, error: "The export has no data" };

  const data = {} as Record<TableName, Row[]>;
  const invalid: ParsedFile["invalid"] = {};
  let total = 0;
  for (const name of TABLE_NAMES) {
    const rows = raw.data[name] ?? [];
    if (!Array.isArray(rows)) return { ok: false, error: `${name} must be a list` };
    if (rows.length > MAX_ROWS_PER_TABLE) return { ok: false, error: `${name} has too many rows` };
    total += rows.length;
    if (total > MAX_TOTAL_ROWS) return { ok: false, error: "The file has too many rows" };
    data[name] = [];
    for (const row of rows) {
      const parsed = parseRow(name, row);
      if (typeof parsed === "string" || typeof parsed.id !== "string" || parsed.id === "") {
        invalid[name] = (invalid[name] ?? 0) + 1;
      } else data[name].push(parsed);
    }
  }
  const settings: Record<string, unknown> = {};
  if (isObject(raw.settings)) {
    for (const [key, value] of Object.entries(raw.settings)) {
      if (!isExportableSetting(key) || !isObject(value)) continue;
      if (key === "app") {
        // Settings of an older or newer version are upgraded, or refused.
        const upgraded = upgradeSettings(value);
        if (upgraded) settings[key] = upgraded;
      } else if (JSON.stringify(value).length <= 100_000) settings[key] = value;
    }
  }
  return { ok: true, file: { data, settings, invalid } };
}

/**
 * The id a row gets when its original id already belongs to another account (ids are unique across the
 * database). Derived from the importing account, so importing the same file again lands on the same id
 * and is skipped.
 */
export function derivedId(userId: string, table: TableName, id: string): string {
  const hex = createHash("sha256").update(`${userId}\0${table}\0${id}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
