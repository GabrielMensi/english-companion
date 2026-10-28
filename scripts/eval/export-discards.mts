/**
 * Exports the corrections you discarded as eval examples ("the model must NOT report this").
 *
 *   pnpm eval:export-discards
 *
 * Reads DATABASE_PATH and writes .eval-results/discards.json (gitignored: it holds your own
 * text, never commit it). Then `pnpm eval:models <spec> --with-discards` includes them.
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "../../src/db";
import { DISCARDS_FILE, discardsToSamples } from "../../src/lib/eval/discards";

const rows = db
  .select({
    messageId: schema.corrections.messageId,
    content: schema.messages.content,
    inputMode: schema.messages.inputMode,
    original: schema.corrections.original,
    discardReason: schema.corrections.discardReason,
  })
  .from(schema.corrections)
  .innerJoin(schema.messages, eq(schema.corrections.messageId, schema.messages.id))
  .where(and(isNotNull(schema.corrections.discardedAt), eq(schema.messages.role, "user")))
  .all();

const samples = discardsToSamples(rows);
const file = path.resolve(DISCARDS_FILE);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(samples, null, 1));
console.log(`${rows.length} discarded corrections -> ${samples.length} samples in ${DISCARDS_FILE}`);
