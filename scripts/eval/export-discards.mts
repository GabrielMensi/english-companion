/**
 * Exports the corrections you discarded as eval examples ("the model must NOT report this").
 *
 *   pnpm eval:export-discards
 *
 * Reads DATABASE_PATH and writes .eval-results/discards.json (gitignored: it holds your own
 * text, never commit it). Then `pnpm eval:models <spec> --with-discards` includes them.
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, isNotNull, lt } from "drizzle-orm";
import { db, schema } from "../../src/db";
import { DISCARDS_FILE, type DiscardContext, groupDiscards } from "../../src/lib/eval/discards";
import { getPractice, practiceReplyRule } from "../../src/lib/practice";
import { evalUserId } from "./settings";

// Operator-only: exports the administrator's (first account's) discards, never other accounts'.
const userId = (await evalUserId()) ?? "";

const rows = db
  .select({
    messageId: schema.corrections.messageId,
    sessionId: schema.messages.sessionId,
    createdAt: schema.messages.createdAt,
    content: schema.messages.content,
    inputMode: schema.messages.inputMode,
    original: schema.corrections.original,
    discardReason: schema.corrections.discardReason,
  })
  .from(schema.corrections)
  .innerJoin(schema.messages, eq(schema.corrections.messageId, schema.messages.id))
  .where(
    and(
      eq(schema.corrections.userId, userId),
      isNotNull(schema.corrections.discardedAt),
      eq(schema.messages.role, "user"),
    ),
  )
  .all();

/** The chat the message was written in: mode, topic or practice rule, and the turns before it (as the app sends them). */
function contextOf(sessionId: string, createdAt: Date): DiscardContext {
  const session = db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), eq(schema.sessions.id, sessionId)))
    .get();
  const previous = db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.userId, userId),
        eq(schema.messages.sessionId, sessionId),
        lt(schema.messages.createdAt, createdAt),
      ),
    )
    .orderBy(desc(schema.messages.createdAt))
    .limit(20)
    .all()
    .reverse();
  const history: DiscardContext["history"] = [];
  for (const m of previous) {
    if (m.role === "user") history.push({ learner: m.correctedText ?? m.content, assistant: null });
    else if (history.length > 0) history[history.length - 1].assistant = m.content;
    else history.push({ learner: null, assistant: m.content });
  }
  return {
    mode: session?.mode === "conversation" ? "conversation" : "correction",
    practiceRule: practiceReplyRule(getPractice(userId, sessionId)),
    history,
  };
}

const contexts = new Map<string, DiscardContext>();
const withContext = rows.map(({ sessionId, createdAt, ...row }) => {
  if (!contexts.has(row.messageId)) contexts.set(row.messageId, contextOf(sessionId, createdAt));
  return { ...row, context: contexts.get(row.messageId) };
});

const { samples, dropped } = groupDiscards(withContext);
const file = path.resolve(DISCARDS_FILE);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(samples, null, 1));
const kept = rows.length - dropped;
console.log(
  `${rows.length} discarded corrections: ${kept} kept in ${samples.length} messages, ${dropped} left out (fragment not in the message) -> ${DISCARDS_FILE}`,
);
