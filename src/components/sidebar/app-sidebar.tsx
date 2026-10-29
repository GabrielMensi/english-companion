"use client";

import {
  AudioLines,
  BarChart3,
  BookOpen,
  Dumbbell,
  GraduationCap,
  House,
  Layers,
  Lightbulb,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Area } from "@/components/layout/page";
import { NewChatButton } from "@/components/sidebar/new-chat-button";
import { SessionItem } from "@/components/sidebar/session-item";
import { SignOutButton } from "@/components/sidebar/sign-out-button";
import { TalkAboutButton } from "@/components/sidebar/talk-about-button";
import { ThemeToggle } from "@/components/sidebar/theme-toggle";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import type { SessionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** A count shown next to the label, e.g. cards to study. */
  count?: number;
}

interface NavGroup {
  label: string;
  area: Exclude<Area, "write">;
  items: NavItem[];
}

/** Icon tint per area: the only place, besides page marks and primary buttons, where area colors appear. */
const AREA_ICON: Record<NavGroup["area"], string> = { review: "text-review", train: "text-train" };
const AREA_ACTIVE: Record<NavGroup["area"], string> = { review: "bg-review/10", train: "bg-train/10" };

function navGroups(cardsToStudy: number): NavGroup[] {
  return [
    {
      label: "Review",
      area: "review",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
        { href: "/insights", label: "Insights", icon: Lightbulb },
        { href: "/class", label: "Class", icon: GraduationCap },
      ],
    },
    {
      label: "Train",
      area: "train",
      items: [
        { href: "/practice", label: "Practice", icon: Dumbbell },
        { href: "/read-aloud", label: "Read aloud", icon: AudioLines },
        { href: "/flashcards", label: "Flashcards", icon: Layers, count: cardsToStudy },
        { href: "/vocabulary", label: "Vocabulary", icon: BookOpen },
      ],
    },
  ];
}

export function AppSidebar({
  sessions,
  cardsToStudy,
  initialCollapsed,
  userEmail,
}: {
  sessions: SessionSummary[];
  cardsToStudy: number;
  initialCollapsed: boolean;
  userEmail: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const groups = navGroups(cardsToStudy);

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

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

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
      <aside className="flex w-14 shrink-0 flex-col items-center border-r bg-sidebar py-3 text-sidebar-foreground print:hidden">
        {toggleButton}
        <div data-area="write" className="mt-3 flex flex-col gap-1">
          <Hint label="New chat" side="right">
            <NewChatButton iconOnly />
          </Hint>
          <Hint label="Talk about…" side="right">
            <TalkAboutButton iconOnly variant="ghost" />
          </Hint>
        </div>
        <Hint label="Today" side="right">
          <Link
            href="/"
            aria-label="Today"
            aria-current={pathname === "/" ? "page" : undefined}
            className={cn(
              "mt-1 flex size-8 items-center justify-center rounded-md hover:bg-sidebar-accent",
              pathname === "/" && "bg-sidebar-accent",
            )}
          >
            <House className="size-4" />
          </Link>
        </Hint>
        {groups.map((group) => (
          <nav key={group.label} aria-label={group.label} className="mt-3 flex flex-col gap-1 border-t pt-3">
            {group.items.map(({ href, label, icon: Icon, count }) => (
              <Hint key={href} label={count ? `${label} (${count} to study)` : label} side="right">
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    "relative flex size-8 items-center justify-center rounded-md hover:bg-sidebar-accent",
                    isActive(href) && AREA_ACTIVE[group.area],
                  )}
                >
                  <Icon className={cn("size-4", AREA_ICON[group.area])} />
                  {count ? <span className="absolute top-1 right-1 size-1.5 rounded-full bg-foreground" /> : null}
                </Link>
              </Hint>
            ))}
          </nav>
        ))}
        <div className="mt-auto flex flex-col items-center gap-1">
          <Hint label="Settings" side="right">
            <Link
              href="/settings"
              aria-label="Settings"
              aria-current={isActive("/settings") ? "page" : undefined}
              className={cn(
                "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                isActive("/settings") && "bg-sidebar-accent text-foreground",
              )}
            >
              <Settings className="size-4" />
            </Link>
          </Hint>
          <Hint label="Toggle theme" side="right">
            <ThemeToggle />
          </Hint>
          <Hint label={`Sign out (${userEmail})`} side="right">
            <SignOutButton />
          </Hint>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground print:hidden">
      <div className="flex items-center justify-between gap-1 py-3 pr-2 pl-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold">
          <GraduationCap className="size-5 shrink-0" />
          <span className="truncate">English Companion</span>
        </Link>
        {toggleButton}
      </div>

      <div data-area="write" className="flex gap-1 px-3">
        <NewChatButton className="flex-1" />
        <Hint label="Talk about…" side="bottom">
          <TalkAboutButton iconOnly className="size-8" />
        </Hint>
      </div>

      <div className="mt-2 px-3">
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
            pathname === "/" && "bg-sidebar-accent font-medium",
          )}
        >
          <House className="size-4" />
          Today
        </Link>
      </div>

      {groups.map((group) => (
        <nav key={group.label} aria-label={group.label} className="mt-4 px-3">
          <GroupLabel>{group.label}</GroupLabel>
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ href, label, icon: Icon, count }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
                    isActive(href) && cn("font-medium", AREA_ACTIVE[group.area]),
                  )}
                >
                  <Icon className={cn("size-4", AREA_ICON[group.area])} />
                  <span className="flex-1">{label}</span>
                  {count ? (
                    <span
                      className="rounded-full bg-sidebar-accent px-1.5 text-xs font-medium tabular-nums"
                      title={`${count} ${count === 1 ? "card" : "cards"} to study`}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}

      <div className="mt-4 px-3">
        <GroupLabel>Chats</GroupLabel>
      </div>
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

      <div className="flex items-center justify-between gap-1 border-t py-2 pr-2 pl-3">
        <Link
          href="/settings"
          aria-current={isActive("/settings") ? "page" : undefined}
          className={cn(
            "flex flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            isActive("/settings") && "bg-sidebar-accent font-medium text-foreground",
          )}
        >
          <Settings className="size-4" />
          Settings
        </Link>
        <ThemeToggle />
      </div>
      <div className="flex items-center justify-between gap-1 border-t py-2 pr-2 pl-5">
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={userEmail}>
          {userEmail}
        </span>
        <Hint label="Sign out" side="bottom">
          <SignOutButton />
        </Hint>
      </div>
    </aside>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">{children}</div>;
}

function Hint({ label, side, children }: { label: string; side: "right" | "bottom"; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
