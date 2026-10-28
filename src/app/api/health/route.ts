import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Healthcheck for the deploy: public, no data. */
export function GET() {
  try {
    db.run(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
