// Primary navigation — spec.md §13. Path-based, so links (not Radix Tabs,
// which is state-controlled) mirror the router's own notion of "active".

import { NavLink } from "react-router-dom";
import { cn } from "../lib/utils";

const TABS = [
  { to: "/tailor", label: "Tailor" },
  { to: "/library", label: "Library" },
  { to: "/settings", label: "Settings" },
];

export function NavTabs() {
  return (
    <nav
      className="inline-flex h-9 items-center gap-1 rounded-md bg-muted p-1 text-muted-foreground"
      aria-label="Primary"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium transition-colors",
              isActive ? "bg-background text-foreground" : "hover:text-foreground",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
