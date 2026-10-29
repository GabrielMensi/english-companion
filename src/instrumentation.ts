/** Runs once when the server starts: invalid environment variables stop it with a readable message. */
export async function register() {
  // The app's server code (routes, proxy) runs on Node.js; process.env only means anything there.
  // env.ts uses node:fs/os/path, so it is loaded only in the Node.js branch (the Edge compile of this file skips it).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { deployProblems, fakeAiProblems, serverEnv } = await import("@/lib/env");
  const env = serverEnv();
  const problems = [...deployProblems(env), ...fakeAiProblems(env)];
  if (problems.length > 0)
    throw new Error(`Invalid environment variables (check .env.local):\n  - ${problems.join("\n  - ")}`);
}
