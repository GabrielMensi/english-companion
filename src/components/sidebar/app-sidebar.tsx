"use client";

import { BarChart3, BookOpen, Dumbbell, GraduationCap, Lightbulb, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NewChatButton } from "@/components/sidebar/new-chat-button";
import { SessionItem } from "@/components/sidebar/session-item";
import { ThemeToggle } from "@/components/sidebar/theme-toggle";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import type { SessionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/practice", label: "Practice", icon: Dumbbell },
  { href: "/vocabulary", label: "Vocabulary", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({
  sessions,
  initialCollapsed,
}: {
  sessions: SessionSummary[];
  initialCollapsed: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((value) => {
      // A cookie (not localStorage) so the server renders the right width on the next load.
      document.cookie = `${SIDEBAR_COOKIE}=${value ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`;
      return !value;
    });
  }, []);

  // Ctrl/Cmd + B toggles the sidebar, like most editors.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "b" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const toggleButton = (
    <Hint label={`${collapsed ? "Expand" : "Collapse"} sidebar (Ctrl+B)`} side={collapsed ? "right" : "bottom"}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>
    </Hint>
  );

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-3 text-sidebar-foreground">
        {toggleButton}
        <Hint label="New chat" side="right">
          <NewChatButton iconOnly className="mt-2" />
        </Hint>
        <nav className="mt-2 flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Hint key={href} label={label} side="right">
              <Link
                href={href}
                aria-label={label}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md hover:bg-sidebar-accent",
                  pathname === href && "bg-sidebar-accent",
                )}
              >
                <Icon className="size-4" />
              </Link>
            </Hint>
          ))}
        </nav>
        <Hint label="Toggle theme" side="right">
          <ThemeToggle />
        </Hint>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between gap-1 py-3 pr-2 pl-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold">
          <GraduationCap className="size-5 shrink-0" />
          <span className="truncate">English Companion</span>
        </Link>
        <div className="flex items-center">
          <ThemeToggle />
          {toggleButton}
        </div>
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
          <p className="px-2 py-1 text-sm text-muted-foreground">No chats yet.</p>
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

function Hint({ label, side, children }: { label: string; side: "right" | "bottom"; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
