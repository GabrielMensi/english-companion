import type { Metadata } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ThemeProvider } from "next-themes";
import { SpeechPreloader } from "@/components/audio/speech-preloader";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { listSessions } from "@/lib/chat";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
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
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  const sessions = listSessions().map(({ id, title, mode }) => ({ id, title, mode }));

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${uiFont.variable} ${readingFont.variable} h-full antialiased`}
    >
      <body className="flex h-full overflow-hidden">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <AppSidebar sessions={sessions} initialCollapsed={sidebarCollapsed} />
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
            <Toaster richColors position="top-center" />
            <SpeechPreloader />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
