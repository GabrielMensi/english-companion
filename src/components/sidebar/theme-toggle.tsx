"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle(props: React.ComponentProps<typeof Button>) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      // Extra props (e.g. from a tooltip trigger) go to the underlying button.
      {...props}
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
