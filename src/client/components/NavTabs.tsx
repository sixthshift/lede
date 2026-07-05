// Primary navigation — spec.md §13. Path-based, so links (not Radix Tabs,
// which is state-controlled) mirror the router's own notion of "active".

import { NavLink } from "react-router-dom";
import { cn } from "../lib/utils";

const TABS = [
  { to: "/applications", label: "Applications" },
  { to: "/library", label: "Library" },
  { to: "/settings", label: "Settings" },
];

export function NavTabs() {
  return (
    <nav className="flex items-center gap-1" aria-label="Primary">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              "inline-flex items-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-accent font-medium text-primary"
                : "font-normal text-muted-foreground hover:bg-muted hover:text-foreground",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
