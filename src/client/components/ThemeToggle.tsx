// Light/dark toggle for the app chrome. The class it flips (`dark` on <html>)
// is first set pre-paint by the inline script in index.html; this only lets the
// user override that and persists the choice. State seeds from the live class so
// the icon matches whatever the script already applied.

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { useRailCollapsed, useRailLabelFade } from "./WorkspaceShell";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  // v5-T001: this button renders inside RailBottomCluster (App.tsx), itself
  // inside WorkspaceShell's RailCollapseContext.Provider — so it can read
  // collapse directly and surface its own Radix tooltip (name-on-hover, no
  // native `title`) when the rail's collapsed band hides all visible text.
  const collapsed = useRailCollapsed();
  // v5-T004: NOT a declared file for this ticket, but touched anyway —
  // `rowLabel` (the visible footer-row text) is only computed and rendered
  // HERE, and this component used to pick between two DIFFERENT top-level
  // return shapes (`return button` vs. `return <Tooltip>…`) depending on
  // `collapsed`, which remounted the underlying `<button>` (and rowLabel
  // with it) on every toggle — the same hard mount/unmount this ticket
  // exists to fix, just one file over from the three declared ones. Fixing
  // it without editing this file isn't possible (the conditional lives in
  // its JSX), so this is flagged here for the coordinator's review rather
  // than left broken or silently patched elsewhere. The Tooltip below now
  // wraps unconditionally (always the same top-level shape, so the button
  // never remounts), with its OWN local TooltipProvider rather than
  // borrowing RailBottomCluster's — this component also mounts standalone
  // on LoginGate's pre-auth screen, which has no rail ancestor to supply
  // one.
  const { faded, hidden } = useRailLabelFade(collapsed);

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
      {hidden ? null : (
        <span
          className={cn(
            "transition-opacity duration-200 ease-in-out motion-reduce:transition-none",
            faded ? "opacity-0" : "opacity-100",
          )}
        >
          {rowLabel}
        </span>
      )}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
