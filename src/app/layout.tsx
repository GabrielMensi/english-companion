import { Hanken_Grotesk, Newsreader } from "next/font/google";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { ThemeProvider } from "next-themes";

import { SpeechPreloader } from "@/components/audio/speech-preloader";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UnclaimedDataNotice } from "@/components/unclaimed-data-notice";
import { getUser } from "@/lib/auth/session";
import { showUnclaimedNotice } from "@/lib/auth/unclaimed";
import { listSessions } from "@/lib/chat";
import { countCardsToStudy } from "@/lib/flashcards";
import { chatLabels } from "@/lib/practice";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

import type { Metadata } from "next";
import "./globals.css";

/** The app's own voice: navigation, labels, buttons, numbers. */
const uiFont = Hanken_Grotesk({
  variable: "--font-ui",
  subsets: ["latin"],
});

/** The learner's English: messages, corrections, exercises and flashcards. */
const readingFont = Newsreader({
  variable: "--font-reading",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "English Companion",
  description: "Your AI English practice companion",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  // Signed out, only /login and /signup render (the proxy redirects the rest): no sidebar, no data.
  const user = await getUser();
  // Set by proxy.ts: the nonce that lets next-themes' inline script run under the CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  const labels = user ? chatLabels(user.userId) : new Map<string, { practice: boolean; topic: string | null }>();
  const sessions = user
    ? listSessions(user.userId).map(({ id, title, mode }) => ({
        id,
        title,
        mode,
        practice: labels.get(id)?.practice ?? false,
        topic: labels.get(id)?.topic ?? null,
      }))
    : [];

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${uiFont.variable} ${readingFont.variable} h-full antialiased`}
    >
      <body className="flex h-full overflow-hidden">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
          <TooltipProvider>
            {user && (
              <AppSidebar
                sessions={sessions}
                cardsToStudy={countCardsToStudy(user.userId)}
                initialCollapsed={sidebarCollapsed}
                userEmail={user.email}
              />
            )}
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {user && showUnclaimedNotice(user.userId) && <UnclaimedDataNotice email={user.email} />}
              {children}
            </main>
            <Toaster richColors position="top-center" />
            {user && <SpeechPreloader />}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
