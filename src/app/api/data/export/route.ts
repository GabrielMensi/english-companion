import { withUser } from "@/lib/auth/with-user";
import { exportUserData } from "@/lib/data-transfer";

/** The signed-in account's data as a JSON download. Never has API keys or login data. */
export const GET = withUser(async (_request, _ctx, { userId }) => {
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(exportUserData(userId)), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="english-companion-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
