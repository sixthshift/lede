// App-wide chrome: sticky header (wordmark + nav + session) and content slot —
// spec.md §13. Renders under the router (NavLink/Link need its context).
//
// v3-T011: `fullBleed` is the one workspace route (/applications/:id) opting
// out of the normal centered-column/document-scroll body, in favor of a
// fixed viewport-height frame the WorkspaceShell fills exactly — a co-visible
// editor+preview layout needs a real bounded height to size against, not an
// auto-growing page. Every other route is untouched: same min-h-screen
// wrapper, same centered max-w-5xl scrolling column as before.

import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "../lib/utils";
import { useAuthLogout } from "../hooks/queries";
import { NavTabs } from "./NavTabs";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";

export function AppShell({
  children,
  fullBleed = false,
}: {
  children: ReactNode;
  fullBleed?: boolean;
}) {
  const logout = useAuthLogout();

  return (
    <div
      className={cn(
        "bg-background text-foreground",
        fullBleed ? "flex h-screen flex-col overflow-hidden" : "min-h-screen",
      )}
    >
      <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-8 px-6">
          <Link
            to="/applications"
            className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden
              className="flex h-6 w-6 items-center justify-center rounded-md bg-primary pb-0.5 font-serif text-md font-medium leading-none text-primary-foreground"
            >
              L
            </span>
            <span className="font-serif text-md font-medium tracking-tight">Lede</span>
          </Link>
          <NavTabs />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => logout.mutate()}
            >
              <LogOut aria-hidden />
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main
        className={cn(fullBleed ? "min-h-0 flex-1 overflow-hidden" : "mx-auto max-w-5xl px-6 py-8")}
      >
        {children}
      </main>
    </div>
  );
}
