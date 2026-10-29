// Sets a new password for an account and deletes its sessions (a copied cookie can live up to 5 minutes more) (there is no reset by email).
// Usage: pnpm auth:reset-password <email>     (the password is asked on stdin, hidden when it's a terminal)
// Uses DATABASE_PATH like the app does, so run it where the app's .env.local is.
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

// Same configuration as the app (DATABASE_PATH, ...): .env.local, then .env.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Not there.
  }
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: pnpm auth:reset-password <email>");
  process.exit(1);
}

/** Reads a line without echoing it when stdin is a terminal. */
async function askPassword(): Promise<string> {
  const muted = { on: false };
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted.on) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
  process.stdout.write("New password: ");
  muted.on = true;
  const password = await rl.question("");
  muted.on = false;
  rl.close();
  process.stdout.write("\n");
  return password;
}

const { resetPassword } = await import("../src/lib/auth/reset-password");
const password = await askPassword();
try {
  await resetPassword(email, password);
  console.log(`Password changed for ${email}. Every session of that account was closed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
