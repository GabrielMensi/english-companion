import { serverEnv } from "@/lib/env";

/** Runs once when the server starts: invalid environment variables stop it with a readable message. */
export function register() {
  // The app's server code (routes, proxy) runs on Node.js; process.env only means anything there.
  if (process.env.NEXT_RUNTIME === "nodejs") serverEnv();
}
