# README screenshots

`pnpm screenshots` builds the app, starts it with a throwaway database and the fake AI (like `pnpm test:e2e`), creates a demo account, imports the invented data of `demo-data.ts` through the app's own import, and saves one PNG per page in `docs/screenshots/`. It never touches `data/`.

Run it again when the UI changes. To show something new, add it to `demo-data.ts` (it is an export file, so it goes through the same validation as a real import) and a step to `capture.spec.ts`.
