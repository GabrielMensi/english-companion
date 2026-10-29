import { defineConfig } from "drizzle-kit";

import { parseEnv } from "./src/lib/env";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: parseEnv(process.env).DATABASE_PATH,
  },
});
