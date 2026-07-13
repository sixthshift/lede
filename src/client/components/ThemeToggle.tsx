// Light/dark toggle for the app chrome. The class it flips (`dark` on <html>)
// is first set pre-paint by the inline script in index.html; this only lets the
// user override that and persists the choice. State seeds from the live class so
// the icon matches whatever the script already applied.

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useRailCollapsed } from "./WorkspaceShell";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  // v5-T001: this button renders inside RailBottomCluster (App.tsx), itself
  // inside WorkspaceShell's RailCollapseContext.Provider — so it can read
  // collapse directly and surface its own Radix tooltip (name-on-hover, no
  // native `title`) when the rail's collapsed band hides all visible text.
  // RailBottomCluster supplies the ancestor TooltipProvider only in that
  // collapsed case, matching NavTabs' established pattern.
  const collapsed = useRailCollapsed();

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  // v5-T002: the expanded footer row is labeled with the mode it switches
  // TO (not the imperative aria-label sentence) — `aria-label` still carries
  // the full "Switch to ... mode" accessible name unconditionally, so this
  // visible text never overrides what screen readers/tests key off.
  const rowLabel = dark ? "Light mode" : "Dark mode";

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "text-muted-foreground hover:bg-[var(--ring-weak)]",
        collapsed ? "w-9 justify-center px-0" : "w-full justify-start gap-2.5 px-3",
      )}
      onClick={toggle}
      aria-label={label}
    >
      {dark ? <Sun aria-hidden className="h-4 w-4" /> : <Moon aria-hidden className="h-4 w-4" />}
      {collapsed ? null : rowLabel}
    </Button>
  );

  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
