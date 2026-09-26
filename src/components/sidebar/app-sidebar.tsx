"use client";

import { BarChart3, GraduationCap, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NewChatButton } from "@/components/sidebar/new-chat-button";
import { SessionItem } from "@/components/sidebar/session-item";
import { ThemeToggle } from "@/components/sidebar/theme-toggle";
import type { SessionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function AppSidebar({ sessions }: { sessions: SessionSummary[] }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <GraduationCap className="size-5" />
          English Companion
        </Link>
        <ThemeToggle />
      </div>

      <div className="px-3">
        <NewChatButton className="w-full" />
      </div>

      <nav className="mt-3 flex flex-col gap-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
              pathname === href && "bg-sidebar-accent font-medium",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-4 px-5 pb-1 text-xs font-medium text-muted-foreground">Chats</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {sessions.length === 0 ? (
          <p className="px-2 py-1 text-sm text-muted-foreground">Todavía no hay chats.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {sessions.map((s) => (
              <SessionItem key={s.id} session={s} active={pathname === `/chat/${s.id}`} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
