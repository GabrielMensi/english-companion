import fs from "node:fs";
import type { FullResult, Reporter } from "@playwright/test/reporter";

/** Removes the run's temporary data (database, session) when it passed; a failed run keeps it to be inspected. */
export default class CleanupReporter implements Reporter {
  onEnd(result: FullResult) {
    const dir = process.env.E2E_DATA_DIR;
    if (result.status === "passed" && dir?.includes("english-companion-e2e-")) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
