import { sql } from "drizzle-orm";

import { db } from "@/db";

// Public on purpose (the container healthcheck and uptime probes call it): no data, only whether the
// app is up and can read its database.
export const dynamic = "force-dynamic";

export function GET() {
  try {
    db.run(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
