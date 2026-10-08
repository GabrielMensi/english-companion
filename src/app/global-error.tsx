"use client";

/**
 * The root layout itself failed (e.g. the database couldn't open). It replaces the whole
 * document, so it can't rely on globals.css or the theme: plain, system-styled markup.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", colorScheme: "light dark" }}>
        <title>English Companion</title>
        <h1>Something went wrong</h1>
        <p>The app couldn’t start. Check the terminal running it for details, then try again.</p>
        <button onClick={() => retry()}>Try again</button>
      </body>
    </html>
  );
}
