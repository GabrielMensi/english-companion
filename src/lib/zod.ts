// The only place that imports zod's runtime: every schema is built after this config runs.
// `jitless` skips zod's `new Function("")` probe, which the nonce CSP (no 'unsafe-eval') reports as a
// violation even though zod catches it (#153). Import `z` from "@/lib/zod", never from "zod".
// eslint-disable-next-line no-restricted-imports
import { z } from "zod";

z.config({ jitless: true });

export { z };
