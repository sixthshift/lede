// App-wide chrome: sticky header (wordmark + nav + session) and content slot —
// spec.md §13. Renders under the router (NavLink/Link need its context).

import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuthLogout } from "../hooks/queries";
import { NavTabs } from "./NavTabs";
import { Button } from "./ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const logout = useAuthLogout();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            onClick={() => logout.mutate()}
          >
            <LogOut aria-hidden />
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
