// Primary navigation — spec.md §13. Path-based, so links (not Radix Tabs,
// which is state-controlled) mirror the router's own notion of "active".
//
// F201/T021: each destination gets an icon (lucide-react, 16px, consistent
// stroke) alongside its label — the global-nav zone is the rail's one
// always-designed moment. The hover fill reads `--ring-weak` (the same
// accent-at-25%-alpha token the focus ring already uses) rather than
// `--muted`/`--bg-subtle` — that token IS the original defect (`#fafafa` on
// a white rail, imperceptible); `--ring-weak` is a tinted accent wash that
// reads as a distinct state from both resting (transparent) and active
// (solid `--accent-bg`).
//
// F207/T022: in the rail's collapsed (icon-only) band, the visible label
// disappears but the destination must stay identifiable and operable —
// `aria-label` carries the accessible name (the SAME name the expanded
// rail's `getByRole("link", { name })` queries already key off, so nothing
// downstream needs a second lookup) and a tooltip surfaces the label on
// hover/focus. Tooltip machinery only mounts when actually collapsed, so
// the expanded (default) tree stays exactly what it was before this ticket.
import { Files, BookOpen, Settings2 } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../lib/utils";
import { useRailCollapsed } from "./WorkspaceShell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

const TABS = [
  { to: "/applications", label: "Applications", icon: Files },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

export function NavTabs() {
  const collapsed = useRailCollapsed();

  const links = TABS.map((tab) => (
    <NavLink
      key={tab.to}
      to={tab.to}
      aria-label={collapsed ? tab.label : undefined}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 whitespace-nowrap rounded-md py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          collapsed ? "w-9 justify-center px-0" : "w-full px-3",
          isActive
            ? "bg-accent font-medium text-primary"
            : "font-normal text-muted-foreground hover:bg-[var(--ring-weak)] hover:text-foreground",
        )
      }
    >
      <tab.icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2} />
      {collapsed ? null : tab.label}
    </NavLink>
  ));

  if (!collapsed) {
    return (
      <nav className="flex flex-col gap-1" aria-label="Primary">
        {links}
      </nav>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <nav className="flex flex-col gap-1" aria-label="Primary">
        {TABS.map((tab, i) => (
          <Tooltip key={tab.to}>
            <TooltipTrigger asChild>{links[i]}</TooltipTrigger>
            <TooltipContent side="right">{tab.label}</TooltipContent>
          </Tooltip>
        ))}
      </nav>
    </TooltipProvider>
  );
}
