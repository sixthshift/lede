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
import { Files, BookOpen, Settings2 } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../lib/utils";

const TABS = [
  { to: "/applications", label: "Applications", icon: Files },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

export function NavTabs() {
  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              "flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-accent font-medium text-primary"
                : "font-normal text-muted-foreground hover:bg-[var(--ring-weak)] hover:text-foreground",
            )
          }
        >
          <tab.icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2} />
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
