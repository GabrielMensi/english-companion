import { serverEnv } from "@/lib/env";

/** Runs once when the server starts: invalid environment variables stop it with a readable message. */
export function register() {
  serverEnv();
}
