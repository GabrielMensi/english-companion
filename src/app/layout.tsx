import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ThemeProvider } from "next-themes";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { listSessions } from "@/lib/chat";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full overflow-hidden">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <AppSidebar sessions={sessions} initialCollapsed={sidebarCollapsed} />
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
            <Toaster richColors position="top-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
