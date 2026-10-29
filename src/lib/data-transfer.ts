import "server-only";

import { eq } from "drizzle-orm";
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import {
  derivedId,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  type ExportFile,
  isExportableSetting,
  perSessionKey,
  type ParsedFile,
  type Row,
  serializeRow,
  TABLE_NAMES,
  TABLE_SPECS,
  type TableName,
} from "@/lib/data-transfer-core";

type OwnedTable = SQLiteTable & { id: AnySQLiteColumn; userId: AnySQLiteColumn };
const tableOf = (name: TableName) => TABLE_SPECS[name].table as unknown as OwnedTable;

/**
 * Everything the account owns (chats, mistakes, vocabulary, flashcards, readings, its settings), and
 * nothing else: no API keys, no login data, no other account's rows. Every query names the owner.
 */
export function exportUserData(userId: string): ExportFile {
  const data = {} as Record<TableName, Row[]>;
  for (const name of TABLE_NAMES) {
    const table = tableOf(name);
    const rows = db.select().from(table).where(owned(table, userId)).all() as Row[];
    data[name] = rows.map((row) => serializeRow(name, row));
  }
  const settings: Record<string, unknown> = {};
  const saved = db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId)).all();
  for (const { key, value } of saved) if (isExportableSetting(key)) settings[key] = value;
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), data, settings };
}

export interface ImportSummary {
  added: Record<TableName, number>;
  /** Rows already there (an earlier import or the same account), or that clash with one of theirs: left alone. */
  skipped: number;
  /** Rows dropped: invalid, or their parent is missing. */
  dropped: number;
  settingsAdded: number;
}

/**
 * Adds the file's rows to the account, in one transaction. Additive: nothing existing is changed or
 * deleted, and importing the same file twice adds nothing the second time. A row whose id belongs to
 * another account gets a derived id (see `derivedId`), with its children following it.
 */
export function importUserData(userId: string, file: ParsedFile): ImportSummary {
  const summary: ImportSummary = {
    added: Object.fromEntries(TABLE_NAMES.map((n) => [n, 0])) as Record<TableName, number>,
    skipped: 0,
    dropped: Object.values(file.invalid).reduce<number>((a, b) => a + (b ?? 0), 0),
    settingsAdded: 0,
  };
  // old id -> the id it has in this account, per table.
  const ids = Object.fromEntries(TABLE_NAMES.map((n) => [n, new Map<string, string>()])) as Record<
    TableName,
    Map<string, string>
  >;

  db.transaction((tx) => {
    for (const name of TABLE_NAMES) {
      const table = tableOf(name);
      const spec = TABLE_SPECS[name];
      const ownerOf = (id: string) =>
        tx.select({ userId: table.userId }).from(table).where(eq(table.id, id)).get() as
          { userId: string | null } | undefined;
      // Replies point at the message they answer: the learner's messages go first.
      const rows =
        name === "messages"
          ? [...file.data[name]].sort((a, b) => Number(b.role === "user") - Number(a.role === "user"))
          : file.data[name];

      for (const row of rows) {
        const oldId = row.id as string;
        let id = oldId;
        const existing = ownerOf(oldId);
        if (existing?.userId === userId) {
          ids[name].set(oldId, oldId);
          summary.skipped++;
          continue;
        }
        if (existing) {
          id = derivedId(userId, name, oldId);
          if (ownerOf(id)?.userId === userId) {
            ids[name].set(oldId, id);
            summary.skipped++;
            continue;
          }
        }

        const values: Row = { ...row, id, userId };
        let orphan = false;
        for (const parent of spec.parents) {
          const original = row[parent.column];
          if (original === null || original === undefined) continue;
          const mapped = ids[parent.parent].get(original as string);
          if (mapped) values[parent.column] = mapped;
          else if (parent.required) orphan = true;
          else values[parent.column] = null;
        }
        if (orphan) {
          summary.dropped++;
          continue;
        }

        // A unique index (one state per card, one missed item per chat position) means the account already has it.
        const result = tx
          .insert(table)
          .values(values as never)
          .onConflictDoNothing()
          .run();
        if (result.changes === 0) summary.skipped++;
        else {
          ids[name].set(oldId, id);
          summary.added[name]++;
        }
      }
    }

    for (const [key, value] of Object.entries(file.settings)) {
      let target = key;
      const perSession = perSessionKey(key);
      if (perSession) {
        const session = ids.sessions.get(perSession.sessionId);
        if (!session) continue;
        target = `${perSession.prefix}${session}`;
      }
      const result = tx.insert(schema.userSettings).values({ userId, key: target, value }).onConflictDoNothing().run();
      summary.settingsAdded += result.changes;
    }
  });
  return summary;
}
