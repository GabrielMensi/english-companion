import "server-only";

import { db } from "@/db";
import { hasUnclaimedData } from "@/db/claim";

import { isAdmin } from "./admin";

/**
 * Whether to tell this user that data from before accounts existed is waiting to be claimed. Only the
 * first account (the administrator, the one `pnpm auth:claim-data` is for) sees it.
 */
export function showUnclaimedNotice(userId: string): boolean {
  return isAdmin(userId) && hasUnclaimedData(db.$client);
}
