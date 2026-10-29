import { deployProblems, fakeAiProblems, serverEnv } from "@/lib/env";

/** Runs once when the server starts: invalid environment variables stop it with a readable message. */
export function register() {
  // The app's server code (routes, proxy) runs on Node.js; process.env only means anything there.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const env = serverEnv();
  const problems = [...deployProblems(env), ...fakeAiProblems(env)];
  if (problems.length > 0)
    throw new Error(`Invalid environment variables (check .env.local):\n  - ${problems.join("\n  - ")}`);
}
